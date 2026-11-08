"""Adaptador de Mercado Pago Suscripciones. Lo especifico del proveedor vive aqui.

DE DONDE SALE

  Es el diseno que LicitaPro (shared/mercadopago.py) ya usa en produccion: la
  misma empresa -- SOLUCIONES INFORMATICAS MDD S.A.C., RUC 20490042068 -- y la
  misma cuenta de Mercado Pago, con un pago real aprobado el 6-nov-2026. Se
  adapta, no se reinventa. Lo que cambia esta anotado donde cambia.

COMO COBRA

  Suscripcion sin plan asociado y con pago pendiente: se crea un `preapproval`
  con `status=pending` y el hotel termina en el `init_point`, en el sitio de
  Mercado Pago. La tarjeta nunca pasa por este servidor. Desde ahi Mercado Pago
  cobra solo cada periodo y avisa por webhook (POST /webhooks/mercadopago).

  Una preapproval POR HOTEL, sin `preapproval_plan`: el enlace de un plan es
  comun a todos los clientes y no lleva `external_reference`, asi que el aviso
  no diria de que hotel es el pago.

Y EL PAGO ADELANTADO (CHECKOUT PRO, NOVIEMBRE DE 2026)

  Yape y PagoEfectivo no existen en /preapproval: solo en pagos unicos. Para
  ellos, crear_preferencia() abre una preferencia de Checkout Pro por 1, 3, 6
  o 12 meses (external_reference `...|adelantado-N`) y el hotel paga en su
  `init_point`. Lo aplica el aviso `payment` (webhooks_mercadopago._adelantado).

QUE ESTA APAGADO POR DEFECTO, Y POR QUE

  `MERCADOPAGO_MODO` vacio es `simulado`: el sitio ignora las llaves aunque
  esten en el .env. Tener llaves no es decidir cobrar.

    prueba      solo lo ven los correos de MERCADOPAGO_CORREOS_PRUEBA. Se prueba
                en el sitio real -- el unico con una URL publica para el
                webhook -- sin ensenarle a un visitante un pago que no cobra.
    produccion  lo ve todo el mundo, y el checkout dice que se renueva solo.

  Falta una pieza -- token o clave del webhook -- y se queda en `simulado`. Sin
  la clave del webhook se cobraria sin poder activar el hotel.

LAS LLAVES NO SALEN DE AQUI

  Se leen del entorno en cada uso y solo viajan en la cabecera Authorization
  hacia api.mercadopago.com. Ningun log ni ningun mensaje de error las
  incluye: ErrorMercadoPago lleva metodo, ruta, codigo HTTP y el `message` de
  la API, nada mas. Tampoco el cuerpo de la respuesta, que puede traer el
  correo del pagador.

LO QUE SE VIO EN LA API REAL (LicitaPro, noviembre de 2026)

  - El estado cancelado es `cancelled`, y `end_date` es opcional (la
    documentacion lo marca obligatorio; la API no lo exige).
  - /authorized_payments/{id} trae `preapproval_id`, `transaction_amount`,
    `currency_id` y `payment` ({id, status, status_detail} cuando hay cobro).
  - Con el primer cobro rechazado, Mercado Pago cancela la suscripcion al
    momento: reintentar es volver a contratar, que crea otra.
  - Las devoluciones llegan por el aviso `payment` (en el panel, "Pagos").
"""
import hashlib
import hmac
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlsplit

import httpx

log = logging.getLogger("zenstay.mercadopago")

API = "https://api.mercadopago.com"
MONEDA = "PEN"
CANCELADO = "cancelled"
#: Meses por periodo. El anual es UN cobro cada 12 meses.
MESES = {"mensual": 1, "anual": 12}
#: Periodos del pago adelantado (Checkout Pro), un solo cobro cada uno.
ADELANTADO = {f"adelantado-{m}": m for m in (1, 3, 6, 12)}
#: Lo que dura abierta una preferencia: el codigo de PagoEfectivo (CIP) vence.
DIAS_PREFERENCIA = 3
#: Lo que sale en el extracto de la tarjeta. Corto y sin tildes.
DESCRIPTOR = "ZENSTAY"
#: Por encima de esto Mercado Pago no ofrece Yape (limite por operacion).
TOPE_YAPE = Decimal("2000")
#: Hosts admitidos para mandar al hotel a pagar.
HOSTS_PAGO = ("www.mercadopago.com.pe", "sandbox.mercadopago.com.pe")
_PREFIJO_REFERENCIA = "zenstay"


class ErrorMercadoPago(Exception):
    """La API rechazo la operacion. `http` None es que ni siquiera respondio."""

    def __init__(self, mensaje: str, http: int | None = None):
        super().__init__(mensaje)
        self.http = http

    @property
    def transitorio(self) -> bool:
        """Si vale la pena que Mercado Pago reintente el aviso."""
        return self.http is None or self.http >= 500 or self.http == 429


def _token() -> str:
    return os.getenv("MERCADOPAGO_ACCESS_TOKEN", "").strip()


def _clave_webhook() -> str:
    return os.getenv("MERCADOPAGO_WEBHOOK_SECRET", "").strip()


def modo() -> str:
    """'prueba', 'produccion' o 'simulado'. Ver la cabecera del modulo."""
    pedido = os.getenv("MERCADOPAGO_MODO", "").strip().lower()
    if pedido not in ("prueba", "produccion"):
        return "simulado"
    if not (_token() and _clave_webhook()):
        log.warning("MERCADOPAGO_MODO=%s sin token o sin clave de webhook: "
                    "sigue en modo simulado.", pedido)
        return "simulado"
    return pedido


def activo() -> bool:
    return modo() != "simulado"


def cobro_recurrente() -> bool:
    """Si la renovacion automatica es lo que le pasa HOY a cualquier hotel."""
    return modo() == "produccion"


def disponible_para(correo: str | None) -> bool:
    """Si a esta persona se le ofrece pagar con Mercado Pago."""
    actual = modo()
    if actual == "produccion":
        return True
    if actual != "prueba" or not correo:
        return False
    permitidos = os.getenv("MERCADOPAGO_CORREOS_PRUEBA", "").lower().split(",")
    return correo.strip().lower() in {c.strip() for c in permitidos if c.strip()}


# ─── La referencia que une un pago con un hotel ──────────
#
# DIFERENCIA CON LICITAPRO: alli se cobra a un usuario con id entero; aqui al
# HOTEL, cuyo id es un uuid. Se valida como uuid al leerla.

def referencia(tenant_id, plan: str, periodo: str) -> str:
    return f"{_PREFIJO_REFERENCIA}|{tenant_id}|{plan}|{periodo}"


def leer_referencia(texto: str | None) -> dict | None:
    """Hotel, plan y periodo de una referencia, o None si no es de ZenStay.

    Solo se llama con lo que devolvio la API con nuestro token: quien manda un
    aviso falso no puede elegir este texto.
    """
    partes = (texto or "").split("|")
    if len(partes) != 4 or partes[0] != _PREFIJO_REFERENCIA:
        return None
    try:
        tenant_id = uuid.UUID(partes[1])
    except ValueError:
        return None
    if (partes[3] not in MESES and partes[3] not in ADELANTADO) or not partes[2]:
        return None
    return {"tenant_id": tenant_id, "plan": partes[2], "periodo": partes[3]}


# ─── La API ──────────────────────────────────────────────

async def _pedir(metodo: str, ruta: str, cuerpo: dict | None = None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=15) as cliente:
            r = await cliente.request(
                metodo, f"{API}{ruta}", json=cuerpo,
                headers={"Authorization": f"Bearer {_token()}"})
    except httpx.HTTPError as e:
        # Solo el tipo de error: str(e) de httpx puede llevar la peticion.
        raise ErrorMercadoPago(f"{metodo} {ruta}: {type(e).__name__}") from None
    if r.status_code >= 400:
        try:
            datos = r.json()
        except ValueError:
            datos = None
        motivo = datos.get("message") if isinstance(datos, dict) else None
        raise ErrorMercadoPago(f"{metodo} {ruta}: {r.status_code} {motivo}",
                               http=r.status_code)
    return r.json()


async def crear_preapproval(tenant_id, correo: str, plan: str, nombre_plan: str,
                            periodo: str, monto, volver_a: str) -> dict:
    """Crea la suscripcion pendiente. Todavia no cobra: cobra el `init_point`.

    `monto` lo calcula quien llama a partir de la tabla `planes`, en el
    servidor. Nada que venga del formulario llega aqui como importe.
    """
    if periodo not in MESES:
        raise ErrorMercadoPago(f"periodo desconocido: {periodo}")
    respuesta = await _pedir("POST", "/preapproval", {
        # Sin tildes: acaba en el extracto de la tarjeta.
        "reason": f"ZenStay - Plan {_sin_tildes(nombre_plan)} {periodo}",
        "external_reference": referencia(tenant_id, plan, periodo),
        "payer_email": correo,
        "auto_recurring": {
            "frequency": MESES[periodo],
            "frequency_type": "months",
            "transaction_amount": float(monto),
            "currency_id": MONEDA,
        },
        "back_url": volver_a,
        "status": "pending",
    })
    enlace = respuesta.get("init_point") or ""
    if urlsplit(enlace).hostname not in HOSTS_PAGO:
        raise ErrorMercadoPago(f"init_point en un host inesperado: "
                               f"{urlsplit(enlace).hostname}")
    return respuesta


async def crear_preferencia(tenant_id, correo: str, plan: str, nombre_plan: str,
                            meses: int, monto, volver_a: dict, avisar_a: str) -> dict:
    """Pago UNICO por `meses` meses (Checkout Pro). Devuelve la preferencia.

    Es el unico producto de Mercado Pago que ofrece Yape y PagoEfectivo (banca
    movil BCP/BBVA o agente); /preapproval solo acepta tarjeta. No se excluye
    ningun medio: Mercado Pago decide cuales caben (Yape, hasta S/ 2.000).

    `monto` lo calcula quien llama con suscripciones.precio_adelantado() a
    partir de `planes`. `volver_a` son las back_urls {success, pending,
    failure}; `avisar_a`, la URL publica del webhook (notification_url).

    Campos segun la referencia de POST /checkout/preferences (revisada con
    context7 en noviembre de 2026): `expires` + `expiration_date_from/to`
    cierran la preferencia; `date_of_expiration` es el vencimiento del codigo
    de pago en efectivo. Los dos a DIAS_PREFERENCIA: un CIP de PagoEfectivo
    pagado tarde activaria un periodo con un precio ya viejo.
    """
    periodo = f"adelantado-{meses}"
    if periodo not in ADELANTADO:
        raise ErrorMercadoPago(f"periodo desconocido: {periodo}")
    ahora = datetime.now(timezone.utc).replace(microsecond=0)
    hasta = ahora + timedelta(days=DIAS_PREFERENCIA)
    texto = "1 mes" if meses == 1 else f"{meses} meses"
    respuesta = await _pedir("POST", "/checkout/preferences", {
        "items": [{
            "id": f"zenstay-{plan}-{periodo}",
            "title": f"ZenStay - Plan {_sin_tildes(nombre_plan)} - {texto}",
            "quantity": 1,
            "unit_price": float(monto),
            "currency_id": MONEDA,
        }],
        "external_reference": referencia(tenant_id, plan, periodo),
        "payer": {"email": correo},
        "back_urls": volver_a,
        "auto_return": "approved",
        "notification_url": avisar_a,
        "payment_methods": {"installments": 1},
        "statement_descriptor": DESCRIPTOR,
        "expires": True,
        "expiration_date_from": ahora.isoformat(timespec="milliseconds"),
        "expiration_date_to": hasta.isoformat(timespec="milliseconds"),
        "date_of_expiration": hasta.isoformat(timespec="milliseconds"),
    })
    enlace = respuesta.get("init_point") or ""
    if urlsplit(enlace).hostname not in HOSTS_PAGO:
        raise ErrorMercadoPago(f"init_point en un host inesperado: "
                               f"{urlsplit(enlace).hostname}")
    return respuesta


async def leer_preapproval(preapproval_id: str) -> dict:
    return await _pedir("GET", f"/preapproval/{preapproval_id}")


async def leer_pago_autorizado(pago_id: str) -> dict:
    return await _pedir("GET", f"/authorized_payments/{pago_id}")


async def leer_pago(pago_id: str) -> dict:
    """El cobro en si. Distinto de la factura: tiene otro id y otra ruta."""
    return await _pedir("GET", f"/v1/payments/{pago_id}")


async def cancelar(preapproval_id: str) -> dict:
    return await _pedir("PUT", f"/preapproval/{preapproval_id}", {"status": CANCELADO})


# ─── El aviso ────────────────────────────────────────────

def verificar_firma(firma: str | None, request_id: str | None,
                    data_id: str | None) -> bool:
    """Si `x-signature` lo firmo quien tiene nuestra clave. Falla cerrado.

    Manifiesto documentado: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
    omitiendo los pares que no vengan. El id va en minusculas (la regla de
    Mercado Pago para ids alfanumericos; los numericos no cambian).
    HMAC-SHA256 en hexadecimal con la clave secreta del webhook.

    Sin clave, sin cabecera o con la cabecera mal formada: False. Un aviso sin
    verificar es una orden de "activale el plan a este hotel" que podria mandar
    cualquiera desde internet.
    """
    clave = _clave_webhook()
    if not (clave and firma):
        return False
    partes = dict(p.strip().split("=", 1) for p in firma.split(",") if "=" in p)
    marca, recibido = partes.get("ts"), partes.get("v1")
    if not (marca and recibido):
        return False
    manifiesto = ""
    if data_id:
        manifiesto += f"id:{data_id.lower()};"
    if request_id:
        manifiesto += f"request-id:{request_id};"
    manifiesto += f"ts:{marca};"
    calculado = hmac.new(clave.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(calculado, recibido.strip().lower())


def importe(valor) -> Decimal | None:
    """Un importe de la API como Decimal, sin pasar por el error de float."""
    if valor in (None, ""):
        return None
    return Decimal(str(valor)).quantize(Decimal("0.01"))


def _sin_tildes(texto: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFKD", texto or "")
                   if not unicodedata.combining(c))
