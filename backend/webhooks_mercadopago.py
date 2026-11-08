"""Webhook de Mercado Pago: POST /webhooks/mercadopago.

Adaptado de LicitaPro (web/webhooks_mercadopago.py).

DOS DEFENSAS, Y LA SEGUNDA ES LA QUE MANDA

  La firma `x-signature` rechaza el ruido (401 sin tocar nada). Pero del aviso
  solo se usa el id: el estado, el importe y el hotel salen de consultar la API
  con nuestro token. Un aviso no puede afirmar nada que Mercado Pago no
  confirme.

EL PERIODO SE CONCEDE CON EL PAGO, NO CON LA SUSCRIPCION

  `authorized` solo dice que el hotel dejo su tarjeta. Ese aviso vincula la
  suscripcion y nada mas; el acceso llega con cada pago aprobado, el primero
  incluido. Hay un solo camino que extiende subscription_ends_at.

ES IDEMPOTENTE

  Mercado Pago reenvia lo que no recibe 200 (cada 15 minutos, segun su
  documentacion). El indice unico de pagos_suscripcion.mp_payment_id hace que
  la segunda vez no encuentre nada que aplicar.

NO PASA POR EL LIMITADOR

  Vive fuera de /api y ademas esta en limites.EXENTAS: un 429 aqui es un cobro
  que se queda sin registrar hasta el siguiente reintento.

QUE SE RESPONDE

  200  procesado, tambien si no habia nada que aplicar.
  401  la firma no vale.
  503  Mercado Pago no respondio: que reintente, o el pago se pierde.
"""
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

import mercadopago
import suscripciones

log = logging.getLogger("zenstay.webhooks_mercadopago")
router = APIRouter()

RUTA = "/webhooks/mercadopago"

#: Estados de pago rechazado que cuentan como intento fallido.
RECHAZADOS = ("rejected", "cancelled")
#: Estados de un cobro que ya estaba aprobado y cuyo dinero se fue.
DEVUELTOS = ("refunded", "charged_back")


def _ok(**datos) -> JSONResponse:
    return JSONResponse({"ok": True, **datos})


async def _duplicada(preapproval_id: str, tenant_id) -> None:
    """El hotel ya tiene otra suscripcion: esta sobra y no debe seguir cobrando."""
    log.error("Suscripcion %s sobrante para el hotel %s: se cancela en Mercado "
              "Pago. Si ya cobro, hay que devolverlo a mano.", preapproval_id, tenant_id)
    await mercadopago.cancelar(preapproval_id)


async def _suscripcion(data_id: str) -> JSONResponse:
    pre = await mercadopago.leer_preapproval(data_id)
    ref = mercadopago.leer_referencia(pre.get("external_reference"))
    if not ref:
        log.info("Suscripcion %s no es de ZenStay", data_id)
        return _ok(aplicado=False, motivo="referencia ajena")

    estado = pre.get("status")
    if estado == "authorized":
        if not await suscripciones.vincular_preapproval(ref["tenant_id"], data_id):
            await _duplicada(data_id, ref["tenant_id"])
            return _ok(aplicado=False, motivo="suscripcion duplicada")
        return _ok(aplicado=True, estado=estado)
    if estado in ("cancelled", "canceled"):
        hotel = await suscripciones.olvidar_preapproval(data_id)
        cancelado = False
        if hotel:
            cancelado = await suscripciones.marcar_cancelada(hotel["id"])
        return _ok(aplicado=cancelado, estado=estado)
    return _ok(aplicado=False, estado=estado)


async def _pago(data_id: str) -> JSONResponse:
    factura = await mercadopago.leer_pago_autorizado(data_id)
    preapproval_id = factura.get("preapproval_id")
    if not preapproval_id:
        log.error("Factura %s sin preapproval_id: revisar la forma de la respuesta",
                  data_id)
        return _ok(aplicado=False, motivo="factura sin suscripcion")

    pre = await mercadopago.leer_preapproval(preapproval_id)
    ref = mercadopago.leer_referencia(pre.get("external_reference"))
    if not ref:
        return _ok(aplicado=False, motivo="referencia ajena")

    estado = (factura.get("payment") or {}).get("status")
    monto = mercadopago.importe(factura.get("transaction_amount"))
    if estado in RECHAZADOS:
        contado = await suscripciones.registrar_rechazo_mp(
            ref["tenant_id"], ref["plan"], ref["periodo"], data_id, monto, factura)
        return _ok(aplicado=False, cobrado=False, contado=contado)
    if estado != "approved":
        return _ok(aplicado=False, estado=estado)

    # El importe tiene que ser el que se pacto al crear la suscripcion, que a
    # su vez salio de la tabla `planes` en el servidor.
    pactado = pre.get("auto_recurring") or {}
    moneda = factura.get("currency_id") or pactado.get("currency_id")
    if (monto is None or monto != mercadopago.importe(pactado.get("transaction_amount"))
            or moneda != mercadopago.MONEDA):
        log.error("Factura %s de %s %s y la suscripcion %s pacta otra cosa. No se "
                  "aplica; conciliar a mano.", data_id, moneda, monto, preapproval_id)
        return _ok(aplicado=False, motivo="importe no coincide")

    if not await suscripciones.vincular_preapproval(ref["tenant_id"], preapproval_id):
        await _duplicada(preapproval_id, ref["tenant_id"])
        return _ok(aplicado=False, motivo="suscripcion duplicada")

    resultado = await suscripciones.aplicar_pago_mp(
        ref["tenant_id"], ref["plan"], ref["periodo"], data_id, monto, factura)
    if resultado == "sin_fila":
        log.error("Factura %s aprobada y el hotel %s no existe aqui: hay un pago "
                  "sin aplicar.", data_id, ref["tenant_id"])
    return _ok(aplicado=resultado == "aplicado", resultado=resultado)


async def _cobro(data_id: str) -> JSONResponse:
    """Solo interesan las devoluciones: lo demas ya lo dice la factura."""
    cobro = await mercadopago.leer_pago(data_id)
    estado = cobro.get("status")
    if estado not in DEVUELTOS:
        return _ok(aplicado=False, estado=estado)
    # Con referencia, tiene que ser la nuestra (la cuenta de Mercado Pago es la
    # misma que la de LicitaPro). Sin ella no se descarta: no esta documentado
    # que el cobro de una suscripcion herede el external_reference, y
    # devolver_pago_mp solo toca un cobro que ESTE guardado en nuestra tabla,
    # asi que un id ajeno no encuentra nada. Diferencia con LicitaPro, que
    # exige la referencia y perderia esa devolucion.
    referencia = cobro.get("external_reference")
    if referencia and not mercadopago.leer_referencia(referencia):
        return _ok(aplicado=False, motivo="referencia ajena")
    resultado = await suscripciones.devolver_pago_mp(data_id)
    return _ok(aplicado=resultado == "devuelto", resultado=resultado)


@router.post(RUTA)
async def recibir(request: Request):
    """Aviso de Mercado Pago. Sin sesion: la autenticidad la dan la firma y la API."""
    try:
        cuerpo = await request.json()
    except ValueError:
        cuerpo = {}
    if not isinstance(cuerpo, dict):
        cuerpo = {}

    consulta = request.query_params
    data = cuerpo.get("data") if isinstance(cuerpo.get("data"), dict) else {}
    # La firma se calcula sobre el data.id de la URL; el del cuerpo es respaldo.
    data_id = consulta.get("data.id") or str(data.get("id") or "")
    tipo = consulta.get("type") or cuerpo.get("type") or ""

    if not mercadopago.verificar_firma(request.headers.get("x-signature"),
                                       request.headers.get("x-request-id"), data_id):
        log.warning("Aviso de Mercado Pago con firma invalida (%s)", tipo)
        return JSONResponse({"ok": False, "motivo": "firma invalida"}, status_code=401)

    if not mercadopago.activo():
        return _ok(aplicado=False, motivo="pasarela apagada")

    try:
        if tipo == "subscription_preapproval":
            return await _suscripcion(data_id)
        if tipo == "subscription_authorized_payment":
            return await _pago(data_id)
        if tipo == "payment":
            return await _cobro(data_id)
    except mercadopago.ErrorMercadoPago as e:
        if e.transitorio:
            log.warning("Mercado Pago no respondio al aviso %s %s: %s", tipo, data_id, e)
            return JSONResponse({"ok": False, "motivo": "reintentar"}, status_code=503)
        # 404 y similares: Mercado Pago no reconoce ese id, no hay nada que aplicar.
        log.warning("Aviso %s %s no confirmado: %s", tipo, data_id, e)
        return _ok(aplicado=False, motivo="no confirmado")

    return _ok(aplicado=False, motivo="tema ignorado")
