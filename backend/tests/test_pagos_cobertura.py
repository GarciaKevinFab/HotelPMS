"""Huecos de cobertura del cobro: checkout de quien ya tiene cuenta, avisos de
Mercado Pago que no deben aplicar nada y recordatorios con el SMTP caido.

Complementa a tests/test_mercadopago.py y tests/test_pago_adelantado.py, y
reutiliza sus piezas: el falso de Mercado Pago, la firma de los avisos y el
_correr que levanta base, app y cliente en un solo bucle. Se lanzan igual
(ver la cabecera de test_mercadopago.py).
"""
import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("JWT_SECRET", "solo-para-pruebas-no-firma-nada-real-0123456789")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")

from fastapi.testclient import TestClient  # noqa: E402

import recordatorios  # noqa: E402
import server  # noqa: E402
import test_mercadopago as base  # noqa: E402
from test_mercadopago import (  # noqa: E402,F401 -- fixtures
    RUC_A, RUC_B, SECRETO, TOKEN, _correr, _firmar, _hotel, _hotel_con_suscripcion,
    _webhook, con_base, mp_apagado, mp_produccion, puro,
)
from test_pago_adelantado import Buzon, _con_preferencia, falso  # noqa: E402,F401

CLAVE = "clave-de-pruebas"


# ===========================================================================
# checkout.confirmar con "Ya tengo cuenta"
# ===========================================================================

async def _contratar(cliente, email, password):
    return await cliente.post("/comprar", data={
        "plan": "pro", "periodo": "mensual", "modo": "existente",
        "email": email, "password": password})


@con_base
def test_checkout_rechaza_contrasena_mala_cuenta_o_hotel_desactivados(mp_produccion, falso,
                                                                     monkeypatch):
    async def cuerpo(conn, cliente):
        tid, uid = await _hotel(conn, RUC_A, "Hotel A")
        email = f"admin-{RUC_A}@mp-pruebas.test"

        r = await _contratar(cliente, email, "no-es-la-clave")
        assert "Correo o contraseña incorrectos" in r.text
        # El mismo mensaje para un correo que no existe: no es un comprobador.
        r = await _contratar(cliente, "nadie@mp-pruebas.test", CLAVE)
        assert "Correo o contraseña incorrectos" in r.text

        await conn.execute("update users set is_active = false where id = $1", uid)
        r = await _contratar(cliente, email, CLAVE)
        assert "Esa cuenta está desactivada" in r.text

        await conn.execute("update users set is_active = true where id = $1", uid)
        await conn.execute("update tenants set is_active = false where id = $1", tid)
        r = await _contratar(cliente, email, CLAVE)
        assert "Este hotel está desactivado" in r.text

        # En ningun caso se abrio nada en Mercado Pago.
        assert falso.llamadas == []
        assert await conn.fetchval("select count(*) from pagos_suscripcion where tenant_id = $1",
                                   tid) == 0
    _correr(cuerpo, monkeypatch)


# ===========================================================================
# Avisos de Mercado Pago que no deben aplicar nada
# ===========================================================================

def _aviso_sin_base(cuerpo: bytes, data_id="123", tipo=None, contenido="text/plain"):
    consulta = f"data.id={data_id}" + (f"&type={tipo}" if tipo else "")
    return TestClient(server.app).post(
        f"/webhooks/mercadopago?{consulta}", content=cuerpo,
        headers={**_firmar(data_id), "content-type": contenido})


@puro
def test_aviso_con_cuerpo_que_no_es_json_no_aplica_nada(mp_produccion, falso):
    r = _aviso_sin_base(b"esto no es json {")
    assert r.status_code == 200
    assert r.json()["aplicado"] is False
    assert falso.llamadas == []


@puro
def test_aviso_con_json_que_no_es_objeto_no_aplica_nada(mp_produccion, falso):
    r = _aviso_sin_base(b"[1, 2, 3]", contenido="application/json")
    assert r.json()["aplicado"] is False
    assert falso.llamadas == []


@puro
def test_aviso_con_la_pasarela_apagada_no_llama_a_la_api(mp_apagado, falso, monkeypatch):
    # Clave de webhook (la firma es buena) pero sin MERCADOPAGO_MODO.
    monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO)
    r = _aviso_sin_base(b"{}", tipo="subscription_preapproval", contenido="application/json")
    assert r.json() == {"ok": True, "aplicado": False, "motivo": "pasarela apagada"}
    assert falso.llamadas == []


@puro
def test_aviso_con_token_vacio_no_llama_a_la_api(mp_produccion, falso, monkeypatch):
    monkeypatch.setenv("MERCADOPAGO_ACCESS_TOKEN", "   ")
    r = _aviso_sin_base(b"{}", tipo="payment", contenido="application/json")
    assert r.json()["aplicado"] is False
    assert r.json()["motivo"] == "pasarela apagada"
    assert falso.llamadas == []


@con_base
def test_segunda_suscripcion_autorizada_del_mismo_hotel_se_cancela(mp_produccion, falso,
                                                                  monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        r = await _webhook(cliente, "subscription_preapproval", pid)
        assert r.json()["aplicado"] is True

        # Mercado Pago autoriza OTRA suscripcion con la misma referencia (un
        # doble clic, un segundo checkout abierto en otra pestana...).
        otra = f"2c938084{'f' * 24}"
        falso.preapprovals[otra] = {**falso.preapprovals[pid], "id": otra}
        falso.autorizar(otra)
        r = await _webhook(cliente, "subscription_preapproval", otra)
        assert r.json() == {"ok": True, "aplicado": False, "motivo": "suscripcion duplicada"}

        # Queda UNA vigente, la primera, y la sobrante se cancelo en MP.
        assert await conn.fetchval("select mp_preapproval_id from tenants where id = $1",
                                   tid) == pid
        assert ("PUT", f"/preapproval/{otra}") in [(m, r_) for m, r_, _ in falso.llamadas]
        assert falso.preapprovals[otra]["status"] == "cancelled"
        assert falso.preapprovals[pid]["status"] == "authorized"
    _correr(cuerpo, monkeypatch)


# ===========================================================================
# Recordatorios con el SMTP caido
# ===========================================================================

class BuzonQueRevientaCon(Buzon):
    """Lanza excepcion (SMTP caido) para un destinatario; al resto, entrega."""

    def __init__(self, caido_para):
        super().__init__()
        self.caido_para = caido_para

    async def __call__(self, destino, asunto, html_, texto):
        if destino == self.caido_para:
            raise ConnectionError("SMTP caido")
        return await super().__call__(destino, asunto, html_, texto)


@con_base
def test_recordatorio_con_smtp_caido_para_un_hotel_sigue_con_los_demas(mp_produccion, falso,
                                                                       monkeypatch):
    async def cuerpo(conn, cliente):
        tid_a, pref_a = await _con_preferencia(conn, cliente, falso, ruc=RUC_A)
        await _webhook(cliente, "payment", falso.pagar(pref_a))
        tid_b, pref_b = await _con_preferencia(conn, cliente, falso, ruc=RUC_B)
        await _webhook(cliente, "payment", falso.pagar(pref_b))
        await conn.execute("update tenants set subscription_ends_at = now() + interval '6 days' "
                           "where id = any($1::uuid[])", [tid_a, tid_b])

        buzon = BuzonQueRevientaCon(f"admin-{RUC_A}@mp-pruebas.test")
        assert await recordatorios.recordar_renovaciones(buzon) == 1
        assert [d for d, *_ in buzon.enviados] == [f"admin-{RUC_B}@mp-pruebas.test"]
        # Al que no le llego no se le marca: la siguiente pasada lo reintenta.
        assert await conn.fetchval("select aviso_renovacion_7d_para from tenants where id = $1",
                                   tid_a) is None
        assert await recordatorios.recordar_renovaciones(Buzon()) == 1
    _correr(cuerpo, monkeypatch)
