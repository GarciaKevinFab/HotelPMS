"""Razon social y direccion de un RUC, para el comprobante de la suscripcion.

Adaptado de LicitaPro (shared/sunat.py), sin la parte de ubigeo, que aqui no
se usa.

POR QUE NO SE PREGUNTA A SUNAT DIRECTAMENTE

  La consulta RUC de SUNAT exige resolver un captcha, y saltarse un control
  anti-bot de un sistema del Estado no es una opcion. Se usan dos servicios que
  republican el padron (informacion publica) en JSON, en este orden:

    1. OpenRUC (openruc.com/api/ruc/{ruc}): sin clave.
    2. apis.net.pe (api.apis.net.pe/v1/ruc?numero=): sin clave, limita por IP.

NO ES VERDAD ABSOLUTA, Y NUNCA BLOQUEA

  Es un dato de terceros sobre un padron que cambia. Si las dos fuentes fallan
  se devuelve None y el dueno completa la razon social al emitir el
  comprobante. Una consulta caida no puede impedir una compra.
"""
from __future__ import annotations

import logging
import re
import time

import httpx

log = logging.getLogger("zenstay.sunat")

OPENRUC = "https://openruc.com/api/ruc/{ruc}"
APISNET = "https://api.apis.net.pe/v1/ruc"
TIEMPO_MAXIMO = 8.0
HEADERS = {"User-Agent": "ZenStay/1.0 (+https://zenstay.sisac.pe)",
           "Accept": "application/json"}

_TTL = 24 * 3600
_cache: dict[str, tuple[float, dict | None]] = {}

_RE_RUC = re.compile(r"^(10|15|16|17|20)\d{9}$")


def ruc_valido(ruc: str | None) -> bool:
    """11 digitos con prefijo de SUNAT y digito verificador correcto."""
    if not ruc or not _RE_RUC.match(ruc):
        return False
    pesos = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    suma = sum(int(d) * p for d, p in zip(ruc[:10], pesos))
    verificador = (11 - suma % 11) % 10
    return verificador == int(ruc[10])


def _limpiar(valor) -> str | None:
    if valor is None:
        return None
    texto = re.sub(r"\s+", " ", str(valor)).strip(" -")
    return texto or None


def _normalizar(ruc: str, crudo: dict, fuente: str) -> dict:
    razon = crudo.get("razon_social") or crudo.get("razonSocial") or crudo.get("nombre")
    return {
        "ruc": ruc,
        "razon_social": _limpiar(razon),
        "estado": _limpiar(crudo.get("estado")),
        "condicion": _limpiar(crudo.get("condicion")),
        "direccion": _limpiar(crudo.get("direccion")),
        "fuente": fuente,
    }


async def _openruc(cliente: httpx.AsyncClient, ruc: str) -> dict | None:
    r = await cliente.get(OPENRUC.format(ruc=ruc))
    if r.status_code == 404:
        return None
    r.raise_for_status()
    datos = r.json()
    return _normalizar(ruc, datos, "openruc") if datos.get("razon_social") else None


async def _apisnet(cliente: httpx.AsyncClient, ruc: str) -> dict | None:
    r = await cliente.get(APISNET, params={"numero": ruc})
    if r.status_code == 404:
        return None
    r.raise_for_status()
    datos = r.json()
    return _normalizar(ruc, datos, "apis.net.pe") if datos.get("nombre") else None


async def consultar_ruc(ruc: str) -> dict | None:
    """Datos del RUC, o None si no existe o ninguna fuente respondio."""
    ruc = (ruc or "").strip()
    if not ruc_valido(ruc):
        return None
    ahora = time.monotonic()
    guardado = _cache.get(ruc)
    if guardado and ahora - guardado[0] < _TTL:
        return guardado[1]

    resultado, respondio = None, False
    async with httpx.AsyncClient(timeout=TIEMPO_MAXIMO, headers=HEADERS) as cliente:
        for fuente in (_openruc, _apisnet):
            try:
                resultado = await fuente(cliente, ruc)
                respondio = True
                break
            except Exception as e:  # noqa: BLE001
                log.warning("Consulta RUC %s por %s fallo: %s", ruc, fuente.__name__, e)
    # Se cachea el None de "no existe", pero no el de "todo fallo".
    if respondio:
        _cache[ruc] = (ahora, resultado)
    return resultado
