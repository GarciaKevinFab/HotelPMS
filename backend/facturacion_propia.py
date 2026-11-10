"""Enganche con el motor propio de facturacion electronica (facturacion-sunat).

POR QUE EXISTE

  ZenStay ya no usa un proveedor externo (se retiro en la migracion 007). Los comprobantes
  electronicos los va a emitir el motor propio de la empresa, un servicio
  aparte (repositorio facturacion-sunat) que firma y envia a SUNAT sin PSE ni
  OSE. Su API: POST /comprobantes con Authorization: Bearer <token>.

QUE HACE HOY EL MOTOR Y QUE NO

  Hoy (fase 1) solo emite FACTURAS (01) a RUC, de UN SOLO emisor fijado por
  sus variables de entorno, y sin PDF. Un hotel necesita ademas:
    - boletas (resumen diario): fase 2 del motor;
    - PDF con QR: fase 3;
    - emitir con el RUC de cada hotel: fase 4, pendiente de validar con un
      asesor tributario.
  Por eso este enganche esta APAGADO por defecto y, aun encendido, no promete
  nada que el motor no haga: lo que no soporta devuelve "no disponible
  todavia" SIN salir a la red.

COMO SE ENCIENDE

  Solo si estan las dos variables:
      FACTURACION_URL     p. ej. http://127.0.0.1:8090 (el motor escucha en
                          localhost detras del tunel)
      FACTURACION_TOKEN   el token de servicio del motor
  y, para que una factura salga de verdad, ademas:
      FACTURACION_EMISOR_RUC  el RUC con cuyas credenciales esta configurado
                              el motor. Un hotel con otro RUC recibe "no
                              disponible todavia": el motor firmaria con las
                              credenciales de otra empresa.

  Sin URL y token, el comprobante queda como INTERNO (estado DRAFT, que la UI
  muestra como "Borrador"): sin enlaces de PDF/XML/CDR y sin validez
  tributaria hasta activar la facturacion electronica.
"""

from __future__ import annotations

import logging
import os
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

TIMEOUT = httpx.Timeout(15.0, connect=5.0)

# Resultados posibles de emitir(). El llamador los traduce a InvoiceStatus.
INTERNO = "interno"                # motor sin configurar: comprobante interno
NO_DISPONIBLE = "no_disponible"    # configurado, pero el motor aun no lo soporta
ACEPTADO = "aceptado"              # SUNAT lo acepto (o lo acepto con observaciones)
RECHAZADO = "rechazado"            # SUNAT o el motor lo rechazaron: no existe
PENDIENTE = "pendiente"            # no se sabe si llego: el motor lo reenvia

MENSAJE_INTERNO = ("Comprobante interno — sin validez tributaria hasta activar "
                   "la facturación electrónica")


@dataclass
class Configuracion:
    url: str
    token: str
    emisor_ruc: str = ""


@dataclass
class Resultado:
    estado: str
    mensaje: str
    solicitud: Optional[dict] = None
    respuesta: dict = field(default_factory=dict)
    motor_comprobante_id: Optional[str] = None
    hash: Optional[str] = None


def configuracion() -> Optional[Configuracion]:
    """La configuracion del motor, o None si el enganche esta apagado.

    Se lee en cada emision y no al importar: igual que DATABASE_URL en
    db_pg.py, el .env se carga despues de los imports.
    """
    url = os.environ.get("FACTURACION_URL", "").strip().rstrip("/")
    token = os.environ.get("FACTURACION_TOKEN", "").strip()
    if not url or not token:
        return None
    return Configuracion(url=url, token=token,
                         emisor_ruc=os.environ.get("FACTURACION_EMISOR_RUC", "").strip())


def motivo_no_soportado(cfg: Configuracion, tipo: str, emisor_ruc: str) -> Optional[str]:
    """Por que el motor todavia no puede emitir este comprobante, o None."""
    if tipo != "FACTURA":
        return ("La emisión electrónica de boletas no está disponible todavía "
                "(el motor propio solo emite facturas por ahora).")
    if not cfg.emisor_ruc or cfg.emisor_ruc != (emisor_ruc or "").strip():
        return ("La emisión electrónica con el RUC de este hotel no está disponible "
                "todavía (el motor propio emite con un solo RUC configurado).")
    return None


def _decimal(valor) -> str:
    # format "f" y no str(): Decimal("100.00").normalize() se imprime "1E+2".
    return format(Decimal(str(valor)).normalize(), "f") if valor is not None else "0"


def armar_solicitud(*, emisor_ruc: str, serie: str, numero: int, cliente_ruc: str,
                    cliente_nombre: str, cliente_direccion: Optional[str],
                    cargos: list, total, clave_idempotencia: str) -> dict:
    """El cuerpo de POST /comprobantes para una factura (ver README del motor).

    valor_unitario va SIN IGV: en ZenStay `unit_price` ya es la base imponible
    (el IGV de cada cargo se calcula aparte sobre el subtotal). total_esperado
    hace que el motor rechace con 422 si su calculo no cuadra al centimo con el
    nuestro, en vez de emitir un importe distinto del que se cobro.
    """
    cliente = {"tipo_documento": "6", "numero_documento": cliente_ruc,
               "razon_social": cliente_nombre}
    if cliente_direccion:
        cliente["direccion"] = cliente_direccion
    return {
        "emisor_ruc": emisor_ruc,
        "tipo_documento": "01",
        "serie": serie,
        "numero": numero,
        "cliente": cliente,
        "items": [{"descripcion": (c.get("concept") or "Servicio de hospedaje")[:500],
                   "cantidad": _decimal(c.get("quantity", 1)),
                   "unidad": "ZZ",
                   "valor_unitario": _decimal(c.get("unit_price", 0))}
                  for c in cargos],
        "total_esperado": _decimal(total),
        "clave_idempotencia": clave_idempotencia,
    }


def _cliente_http() -> httpx.AsyncClient:
    """El unico punto por el que este modulo sale a la red.

    Timeout corto (el motor esta en la misma maquina) y sin seguir
    redirecciones: un 30x no tiene por que llevar el token a otro sitio. Las
    pruebas lo sustituyen para comprobar que NO se llama.
    """
    return httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False)


def _uuid_o_none(valor) -> Optional[str]:
    """El id del motor va a una columna uuid: algo que no lo sea no debe
    tumbar el guardado de un comprobante que ya se emitio."""
    try:
        return str(uuid.UUID(str(valor)))
    except (ValueError, TypeError):
        return None


def _estado_del_motor(estado: str) -> str:
    if estado in ("aceptado", "observado"):
        return ACEPTADO
    if estado == "rechazado":
        return RECHAZADO
    return PENDIENTE  # pendiente / enviado: el motor lo puede reenviar


async def emitir(*, tipo: str, emisor_ruc: str, solicitud_factura: dict) -> Resultado:
    """Emite el comprobante con el motor, o explica por que no.

    No lanza excepciones: cualquier fallo de red o respuesta rara vuelve como
    PENDIENTE (no se sabe si llego) o RECHAZADO (el motor dijo que no).
    """
    cfg = configuracion()
    if cfg is None:
        return Resultado(estado=INTERNO, mensaje=MENSAJE_INTERNO)

    motivo = motivo_no_soportado(cfg, tipo, emisor_ruc)
    if motivo:
        # Sin llamada de red: el motor no lo soporta y lo sabemos de antemano.
        return Resultado(estado=NO_DISPONIBLE, mensaje=motivo,
                         respuesta={"no_disponible": motivo})

    solicitud = solicitud_factura
    try:
        async with _cliente_http() as cliente:
            r = await cliente.post(f"{cfg.url}/comprobantes", json=solicitud,
                                   headers={"Authorization": f"Bearer {cfg.token}"})
    except httpx.HTTPError as e:
        logger.warning("Motor de facturacion sin respuesta: %s", e)
        return Resultado(estado=PENDIENTE, solicitud=solicitud,
                         mensaje="El motor de facturación no respondió; queda pendiente.",
                         respuesta={"error": f"sin respuesta del motor: {type(e).__name__}"})

    try:
        cuerpo = r.json()
    except ValueError:
        cuerpo = None
    if not isinstance(cuerpo, dict):
        cuerpo = {"texto": r.text[:500]}

    if r.status_code in (200, 201):
        estado = _estado_del_motor(str(cuerpo.get("estado", "")))
        cdr = cuerpo.get("cdr") or {}
        # El ZIP del CDR no se copia: lo conserva el motor, que es el que
        # guarda el comprobante legal.
        if isinstance(cdr, dict):
            cdr.pop("zip_base64", None)
        descripcion = (cdr.get("descripcion") if isinstance(cdr, dict) else None) \
            or cuerpo.get("ultimo_error") or cuerpo.get("estado")
        return Resultado(estado=estado, solicitud=solicitud, respuesta=cuerpo,
                         mensaje=str(descripcion or ""),
                         motor_comprobante_id=_uuid_o_none(cuerpo.get("id")),
                         hash=cuerpo.get("digest_value"))

    if 400 <= r.status_code < 500 and r.status_code not in (401, 403, 408, 429):
        # 422 validacion, 404 emisor, 409 conflicto: el comprobante no existe
        # en SUNAT. Se guarda como rechazado con el detalle del motor.
        return Resultado(estado=RECHAZADO, solicitud=solicitud,
                         respuesta={"http": r.status_code, **cuerpo},
                         mensaje=f"El motor rechazó el comprobante (HTTP {r.status_code}).")

    # 401/403 (token mal puesto), 5xx, etc.: no se emitio, pero se puede reintentar
    # con la misma clave de idempotencia sin riesgo de duplicar.
    return Resultado(estado=PENDIENTE, solicitud=solicitud,
                     respuesta={"http": r.status_code, **cuerpo},
                     mensaje=f"El motor de facturación respondió HTTP {r.status_code}; queda pendiente.")
