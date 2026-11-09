"""Pago adelantado sin tarjeta: Checkout Pro con Yape, PagoEfectivo y tarjeta.

Mismo esquema que tests/test_mercadopago.py, del que se reutilizan las
utilidades: Mercado Pago no se llama nunca (`mercadopago._pedir` lo sustituye
un falso en memoria que ahora tambien sabe de POST /checkout/preferences), y
las pruebas `necesita_base` corren de punta a punta por HTTP en proceso contra
un Postgres con las migraciones 001-006.

  ZENSTAY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5436/zenstay \\
  ZENSTAY_TEST_APP_DATABASE_URL=postgresql://app_backend:pruebas@127.0.0.1:5436/zenstay \\
  pytest tests/test_pago_adelantado.py -q

Lo que exige la especificacion (pago_adelantado_spec.md, 2026-11-08), y donde:

  monto del catalogo 1/3/6/12 ........ test_precio_*, test_el_navegador_no_cambia_*
  firma invalida -> 401 .............. test_firma_invalida_401_*
  aprobado -> extiende ............... test_aprobado_extiende_*
  repetido -> no duplica ............. test_aprobado_extiende_* (tres avisos)
  monto distinto -> no activa ........ test_importe_distinto_*
  pending -> no activa ............... test_pendiente_y_rechazado_*
  refunded -> quita el periodo ....... test_devolucion_quita_*
  MP caido -> 503 .................... test_mercadopago_caido_*
  bloqueo con tarjeta activa ......... test_con_cobro_automatico_*
  recordatorios 7 y 1 dias, sin duplicar  test_recordatorios_*
  sin credenciales en el repo ........ test_no_hay_credenciales_en_el_repo
"""
import asyncio
import re
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest

import test_mercadopago as base
from test_mercadopago import (  # noqa: F401 -- fixtures
    RUC_A, RUC_B, _cabecera, _correr, _hotel_con_suscripcion, _token_admin,
    _webhook, con_base, mp_apagado, mp_produccion, puro,
)

import checkout  # noqa: E402
import comprobantes  # noqa: E402
import dudas  # noqa: E402
import mercadopago  # noqa: E402
import recordatorios  # noqa: E402
import suscripciones  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
PAGAR = "https://www.mercadopago.com.pe/checkout/v1/redirect?pref-id="
FRASE = "Paga con Yape, desde tu banca móvil (BCP, BBVA y otros) o con tarjeta"


class FalsoCheckoutPro(base.FalsoMercadoPago):
    """El falso de siempre, mas las preferencias de Checkout Pro."""

    def __init__(self):
        super().__init__()
        self.preferencias: dict[str, dict] = {}

    async def pedir(self, metodo, ruta, cuerpo=None):
        if metodo == "POST" and ruta == "/checkout/preferences":
            self.llamadas.append((metodo, ruta, cuerpo))
            if self.caido:
                raise mercadopago.ErrorMercadoPago(f"{metodo} {ruta}: ConnectError")
            pid = f"3805084608-{uuid.uuid4()}"
            pref = {**cuerpo, "id": pid, "init_point": PAGAR + pid,
                    "sandbox_init_point": PAGAR.replace("www", "sandbox") + pid}
            self.preferencias[pid] = pref
            return dict(pref)
        return await super().pedir(metodo, ruta, cuerpo)

    def pagar(self, pref_id, estado="approved", monto=None, moneda="PEN",
              cobro_id=None) -> str:
        """Lo que haria Mercado Pago cuando el cliente paga la preferencia."""
        pref = self.preferencias[pref_id]
        cobro_id = cobro_id or str(9500000000 + len(self.cobros) + 1)
        self.cobros[cobro_id] = {
            "id": int(cobro_id), "status": estado,
            "transaction_amount": monto if monto is not None else pref["items"][0]["unit_price"],
            "currency_id": moneda,
            "external_reference": pref["external_reference"],
            "payment_type_id": "account_money", "payment_method_id": "yape",
        }
        return cobro_id


@pytest.fixture
def falso(monkeypatch):
    f = FalsoCheckoutPro()
    monkeypatch.setattr(mercadopago, "_pedir", f.pedir)

    async def sin_sunat(ruc):
        return {"ruc": ruc, "razon_social": "HOTEL DE PRUEBAS S.A.C.",
                "direccion": "AV. DE PRUEBA 123", "fuente": "falsa"}
    monkeypatch.setattr(comprobantes.sunat, "consultar_ruc", sin_sunat)
    return f


PLAN_PRO = {"codigo": "pro", "nombre": "Pro", "precio_mensual": Decimal("119.00"),
            "max_habitaciones": 30, "facturacion_sunat": True, "reportes_avanzados": True}


# ===========================================================================
# Puras
# ===========================================================================

@puro
def test_precio_del_catalogo_para_1_3_6_y_12_meses():
    precio = suscripciones.precio_adelantado
    assert precio(Decimal("119"), 1) == Decimal("119")
    assert precio(Decimal("119"), 3) == Decimal("357")
    assert precio(Decimal("119"), 6) == Decimal("714")
    # 12 meses = el anual que ya existe: 10 mensualidades, no 12.
    assert precio(Decimal("119"), 12) == Decimal("1190")
    assert suscripciones.MESES_DEL_ANUAL == 10
    assert checkout.precio_de(PLAN_PRO, "adelantado-12") == checkout.precio_de(PLAN_PRO, "anual")
    assert checkout.precio_de(PLAN_PRO, "adelantado-3") == Decimal("357")
    # La tarjeta sigue igual.
    assert checkout.precio_de(PLAN_PRO, "mensual") == Decimal("119")
    for raro in (0, 2, 24):
        with pytest.raises(ValueError):
            precio(Decimal("119"), raro)
    assert suscripciones.meses_adelantado("adelantado-6") == 6
    assert suscripciones.meses_adelantado("adelantado-2") is None
    assert suscripciones.meses_adelantado("mensual") is None


@puro
def test_la_referencia_del_pago_adelantado_va_y_vuelve():
    tid = uuid.uuid4()
    for meses in (1, 3, 6, 12):
        ref = mercadopago.referencia(tid, "pro", f"adelantado-{meses}")
        assert ref == f"zenstay|{tid}|pro|adelantado-{meses}"
        assert mercadopago.leer_referencia(ref)["periodo"] == f"adelantado-{meses}"
    for ajena in (f"zenstay|{tid}|pro|adelantado-2", f"zenstay|{tid}|pro|adelantado-",
                  f"licitapro|{tid}|pro|adelantado-3"):
        assert mercadopago.leer_referencia(ajena) is None


@puro
def test_la_preferencia_lleva_lo_que_pide_la_especificacion(mp_produccion, falso):
    tid = uuid.uuid4()
    antes = datetime.now(timezone.utc)
    pref = asyncio.run(mercadopago.crear_preferencia(
        tid, "dueno@hotel.pe", "pro", "Pro", 3, Decimal("357.00"),
        volver_a={"success": "https://z/ok", "pending": "https://z/pend",
                  "failure": "https://z/mal"},
        avisar_a="https://zenstay.sisac.pe/webhooks/mercadopago"))
    assert pref["init_point"].startswith(PAGAR)
    (_, ruta, enviado), = falso.llamadas
    assert ruta == "/checkout/preferences"
    (item,) = enviado["items"]
    assert (item["unit_price"], item["currency_id"], item["quantity"]) == (357.0, "PEN", 1)
    assert enviado["external_reference"] == f"zenstay|{tid}|pro|adelantado-3"
    assert enviado["payer"] == {"email": "dueno@hotel.pe"}
    assert set(enviado["back_urls"]) == {"success", "pending", "failure"}
    assert enviado["auto_return"] == "approved"
    assert enviado["notification_url"] == "https://zenstay.sisac.pe/webhooks/mercadopago"
    # Una sola cuota, y NO se excluye ningun medio: Yape y PagoEfectivo quedan.
    assert enviado["payment_methods"] == {"installments": 1}
    assert enviado["statement_descriptor"] == "ZENSTAY"
    assert enviado["expires"] is True
    vence = datetime.fromisoformat(enviado["date_of_expiration"])
    assert enviado["expiration_date_to"] == enviado["date_of_expiration"]
    assert timedelta(days=2, hours=23) < vence - antes < timedelta(days=3, minutes=1)


@puro
def test_una_preferencia_con_init_point_ajeno_no_se_sigue(mp_produccion, monkeypatch):
    async def rara(metodo, ruta, cuerpo=None):
        return {"id": "x", "init_point": "https://mercadopago.com.pe.evil.example/pagar"}
    monkeypatch.setattr(mercadopago, "_pedir", rara)
    with pytest.raises(mercadopago.ErrorMercadoPago):
        asyncio.run(mercadopago.crear_preferencia(
            uuid.uuid4(), "a@b.pe", "pro", "Pro", 1, Decimal(119), {}, "https://x/w"))
    with pytest.raises(mercadopago.ErrorMercadoPago):
        asyncio.run(mercadopago.crear_preferencia(
            uuid.uuid4(), "a@b.pe", "pro", "Pro", 2, Decimal(238), {}, "https://x/w"))


def _texto(html_: str) -> str:
    return " ".join(re.sub(r"<[^>]+>", " ", html_).split())


@puro
def test_la_pagina_de_compra_ofrece_los_periodos_y_dice_los_medios():
    pagina = checkout.pagina_checkout(
        PLAN_PRO, "adelantado-3", checkout.desglose(Decimal("357")), "", checkout.COMERCIO)
    texto = _texto(pagina)
    assert FRASE in texto
    assert "S/ 357.00 por 3 meses" in texto
    assert "Pago adelantado · 3 meses" in texto
    for periodo in ("mensual", "anual", "adelantado-1", "adelantado-3",
                    "adelantado-6", "adelantado-12"):
        assert f'/comprar/pro?periodo={periodo}"' in pagina
    assert 'periodo=adelantado-3" aria-current="true"' in pagina
    assert 'name="periodo" value="adelantado-3"' in pagina
    assert "Yape" in texto and "PagoEfectivo" in texto
    # Por debajo de S/ 2.000 no hace falta avisar del tope de Yape.
    assert "no ofrece Yape" not in texto
    # Nada de lo que Kevin rechazo, y sin JavaScript.
    for fuera in ("WhatsApp", "wa.me", "demo", "cotiza", "<script"):
        assert fuera.lower() not in pagina.lower(), fuera
    # El importe nunca viaja en el formulario.
    assert 'name="monto"' not in pagina and 'name="unit_price"' not in pagina


@puro
def test_por_encima_de_2000_soles_se_avisa_que_no_hay_yape():
    caro = {**PLAN_PRO, "precio_mensual": Decimal("250")}
    total = checkout.precio_de(caro, "adelantado-12")
    assert total == Decimal("2500")
    texto = _texto(checkout.pagina_checkout(
        caro, "adelantado-12", checkout.desglose(total), "", checkout.COMERCIO))
    assert "Por más de S/ 2,000.00 Mercado Pago no ofrece Yape" in texto
    # Con tarjeta (suscripcion) no aplica: Yape no esta en /preapproval.
    texto = _texto(checkout.pagina_checkout(
        caro, "anual", checkout.desglose(total), "", checkout.COMERCIO))
    assert "no ofrece Yape" not in texto


@puro
def test_la_suscripcion_con_tarjeta_no_cambia_de_texto():
    texto = _texto(checkout.pagina_checkout(
        PLAN_PRO, "mensual", checkout.desglose(Decimal("119")), "", checkout.COMERCIO,
        recurrente=True))
    assert "S/ 119.00 al mes" in texto
    assert "Mercado Pago la cobra sola cada mes" in texto
    assert "Suscripción mensual" in texto


@puro
def test_la_vuelta_de_mercado_pago_no_promete_lo_que_no_paso():
    pend = _texto(checkout.pagina_resultado("pendiente", checkout.COMERCIO))
    assert "Te llegó el código de pago" in pend
    ok = checkout.pagina_resultado("aprobado", checkout.COMERCIO)
    assert "En unos minutos tu plan queda activo" in _texto(ok)
    assert 'name="robots" content="noindex' in ok
    # Cualquier otra cosa en la URL es el texto de error, no un "aprobado".
    assert "No se completó el pago" in _texto(
        checkout.pagina_resultado("<script>", checkout.COMERCIO))


@puro
def test_como_pago_en_la_faq_y_en_su_faqpage():
    (respuesta,) = [r for p, r in dudas.preguntas() if p == "¿Cómo pago?"]
    assert respuesta.startswith(FRASE)
    assert checkout.MEDIOS_ADELANTADO == FRASE
    (entrada,) = [q for q in dudas.faqpage()["mainEntity"] if q["name"] == "¿Cómo pago?"]
    assert entrada["acceptedAnswer"]["text"] == respuesta


@puro
def test_el_comprobante_dice_que_fue_un_pago_adelantado():
    assert comprobantes.concepto("pro", "adelantado-3") == \
        "ZenStay plan pro, pago adelantado de 3 meses"
    assert comprobantes.concepto("pro", "adelantado-1").endswith("de 1 mes")
    assert comprobantes.concepto("pro", "mensual") == "Suscripción ZenStay plan pro (mensual)"


@puro
def test_que_recordatorio_toca_segun_los_dias():
    vence = datetime(2026, 12, 1, tzinfo=timezone.utc)
    fila = {"vence": vence, "aviso_renovacion_7d_para": None, "aviso_renovacion_1d_para": None}
    assert recordatorios._toca({**fila, "dias": 6.5}) == ("aviso_renovacion_7d_para", 7)
    assert recordatorios._toca({**fila, "dias": 0.8}) == ("aviso_renovacion_1d_para", 1)
    # Ya salio para este vencimiento: no se repite.
    assert recordatorios._toca({**fila, "dias": 6.5, "aviso_renovacion_7d_para": vence}) is None
    assert recordatorios._toca({**fila, "dias": 0.5, "aviso_renovacion_1d_para": vence}) is None
    # Salio para el vencimiento ANTERIOR: el nuevo si toca.
    viejo = vence - timedelta(days=90)
    assert recordatorios._toca({**fila, "dias": 6.5, "aviso_renovacion_7d_para": viejo})


@puro
def test_no_hay_credenciales_en_el_repo():
    """GitGuardian corre en el PR; esto es lo mismo, antes, y sin red."""
    try:
        archivos = subprocess.run(["git", "ls-files"], cwd=REPO, capture_output=True,
                                  text=True, check=True).stdout.split("\n")
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("sin git")
    # Un .env versionado no puede llevar ningun secreto con valor (el del
    # frontend es publico: solo REACT_APP_BACKEND_URL vacia y CI=false).
    secreto = re.compile(r"^\s*[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|KEY)[A-Z0-9_]*\s*=\s*\S",
                         re.M)
    envs = [a for a in archivos if re.search(r"(^|/)\.env(\.[^/]*)?$", a)
            and not a.endswith(".example")]
    con_secreto = [a for a in envs
                   if secreto.search((REPO / a).read_text(encoding="utf-8", errors="ignore"))]
    assert con_secreto == [], con_secreto
    # Tokens de Mercado Pago: APP_USR-<digitos>-... (produccion) y TEST-<digitos>-...
    patron = re.compile(r"\b(APP_USR|TEST)-\d{6,}-\d{6}-[0-9a-f]{20,}")
    encontrados = []
    for a in archivos:
        ruta = REPO / a
        if not a or ruta.suffix in (".png", ".jpg", ".ico", ".woff2", ".pdf", ".lock"):
            continue
        try:
            texto = ruta.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if patron.search(texto):
            encontrados.append(a)
    assert encontrados == []


# ===========================================================================
# Contra Postgres
# ===========================================================================

async def _alta(cliente, ruc, periodo="adelantado-3", **extra):
    return await cliente.post("/comprar", data={
        "plan": "pro", "periodo": periodo, "modo": "nuevo",
        "hotel_name": f"Hotel {ruc}", "ruc": ruc, "admin_name": "Admin Pruebas",
        "admin_email": f"admin-{ruc}@mp-pruebas.test", "admin_password": "clave-de-pruebas",
        "comprobante": "boleta", "documento": "", **extra})


async def _con_preferencia(conn, cliente, falso, ruc=RUC_A, periodo="adelantado-3"):
    r = await _alta(cliente, ruc, periodo)
    assert r.status_code == 303, r.text
    assert r.headers["location"].startswith(PAGAR)
    pref_id = r.headers["location"][len(PAGAR):]
    tid = await conn.fetchval("select id from tenants where ruc = $1", ruc)
    return tid, pref_id


@con_base
def test_alta_con_pago_adelantado_crea_la_preferencia_y_no_activa_nada(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        pref = falso.preferencias[pref_id]
        assert pref["items"][0]["unit_price"] == 357.0
        assert pref["external_reference"] == f"zenstay|{tid}|pro|adelantado-3"
        assert pref["payer"]["email"] == f"admin-{RUC_A}@mp-pruebas.test"
        assert pref["back_urls"]["pending"].endswith("/comprar/resultado?pago=pendiente")
        # Ni suscripcion con tarjeta, ni fila, ni plan activo: espera al aviso.
        assert not [x for x in falso.llamadas if x[1] == "/preapproval"]
        assert await conn.fetchval("select count(*) from pagos_suscripcion "
                                   "where tenant_id = $1", tid) == 0
        assert await conn.fetchval("select subscription_status from tenants "
                                   "where id = $1", tid) == "prueba"
        # La vuelta se sirve aunque /comprar/{plan} este declarada antes.
        r = await cliente.get(pref["back_urls"]["pending"] + "&collection_status=pending")
        assert r.status_code == 200 and "Te llegó el código de pago" in r.text
    _correr(cuerpo, monkeypatch)


@con_base
def test_el_navegador_no_cambia_el_importe(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        for meses, esperado in ((1, 119.0), (6, 714.0), (12, 1190.0)):
            ruc = {1: RUC_A, 6: RUC_B, 12: base.RUC_C}[meses]
            r = await _alta(cliente, ruc, f"adelantado-{meses}",
                            monto="1", unit_price="1", transaction_amount="1")
            assert r.status_code == 303
            pref = falso.preferencias[r.headers["location"][len(PAGAR):]]
            assert pref["items"][0]["unit_price"] == esperado, meses
        # Un periodo inventado cae al mensual con tarjeta, nunca a un precio raro.
        r = await cliente.get("/comprar/pro?periodo=adelantado-2")
        assert "S/ 119.00 al mes" in _texto(r.text)
    _correr(cuerpo, monkeypatch)


@con_base
def test_con_cobro_automatico_no_se_ofrece_el_pago_adelantado(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_preapproval", pid)
        antes = len(falso.llamadas)
        r = await cliente.post("/comprar", data={
            "plan": "pro", "periodo": "adelantado-3", "modo": "existente",
            "email": f"admin-{RUC_A}@mp-pruebas.test", "password": "clave-de-pruebas"})
        assert r.status_code == 200
        assert ("ya tienes cobro automático con tarjeta; cancélalo primero si prefieres "
                "pagar por adelantado") in _texto(r.text).lower()
        assert not [x for x in falso.llamadas[antes:] if x[1] == "/checkout/preferences"]
    _correr(cuerpo, monkeypatch)


@con_base
def test_aprobado_extiende_la_vigencia_y_el_aviso_repetido_no_suma(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        fin_prueba = await conn.fetchval("select trial_ends_at from tenants where id = $1", tid)
        cobro = falso.pagar(pref_id)

        r = await _webhook(cliente, "payment", cobro)
        assert r.json() == {"ok": True, "aplicado": True, "resultado": "aplicado"}
        hotel = await conn.fetchrow("select * from tenants where id = $1", tid)
        assert (hotel["subscription_status"], hotel["plan_codigo"]) == ("activa", "pro")
        esperado = await conn.fetchval("select $1::timestamptz + interval '3 months'", fin_prueba)
        assert hotel["subscription_ends_at"] == esperado
        assert hotel["grace_ends_at"] == esperado + timedelta(days=7)
        assert hotel["mp_preapproval_id"] is None

        for _ in range(3):
            r = await _webhook(cliente, "payment", cobro)
            assert r.json()["resultado"] == "repetido"
        assert await conn.fetchval("select subscription_ends_at from tenants "
                                   "where id = $1", tid) == esperado
        (pago,) = await conn.fetch("select * from pagos_suscripcion where tenant_id = $1", tid)
        assert (pago["estado"], pago["periodo"], pago["monto"], pago["mp_payment_id"]) == \
            ("pagado", "adelantado-3", Decimal("357.00"), cobro)
        # Comprobante pendiente como cualquier cobro: el aviso al dueno ya existe.
        assert pago["comp_estado"] == "pendiente"

        # Pagar otro periodo antes de que venza se SUMA al que ya tiene.
        r = await cliente.post("/comprar", data={
            "plan": "pro", "periodo": "adelantado-1", "modo": "existente",
            "email": f"admin-{RUC_A}@mp-pruebas.test", "password": "clave-de-pruebas"})
        segundo = falso.pagar(r.headers["location"][len(PAGAR):])
        assert (await _webhook(cliente, "payment", segundo)).json()["aplicado"] is True
        assert await conn.fetchval("select subscription_ends_at from tenants where id = $1",
                                   tid) == await conn.fetchval(
            "select $1::timestamptz + interval '1 month'", esperado)

        estado = (await cliente.get("/api/suscripcion", headers=_cabecera(
            _token_admin(tid, (await conn.fetchval("select id from users where tenant_id = $1 and role = 'ADMIN'", tid)), RUC_A)))).json()
        assert estado["ultimo_periodo"] == "adelantado-1"
        assert estado["cobro_automatico"] is False and estado["estado_efectivo"] == "activa"
    _correr(cuerpo, monkeypatch)


@con_base
def test_importe_distinto_se_registra_y_no_activa(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        for monto, moneda in ((100.0, "PEN"), (357.0, "USD")):
            cobro = falso.pagar(pref_id, monto=monto, moneda=moneda)
            r = await _webhook(cliente, "payment", cobro)
            assert r.status_code == 200
            assert r.json() == {"ok": True, "aplicado": False, "motivo": "importe no coincide"}
            # El reintento no lo cuenta dos veces.
            assert (await _webhook(cliente, "payment", cobro)).json()["resultado"] == "repetido"
        hotel = await conn.fetchrow("select subscription_status, subscription_ends_at "
                                    "from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "prueba" and hotel["subscription_ends_at"] is None
        filas = await conn.fetch("select estado, comp_estado, monto, moneda from pagos_suscripcion "
                                 "where tenant_id = $1 order by monto", tid)
        assert [(f["estado"], f["comp_estado"]) for f in filas] == \
            [("en_revision", None), ("en_revision", None)]
        assert {f["moneda"] for f in filas} == {"PEN", "USD"}
    _correr(cuerpo, monkeypatch)


@con_base
def test_pendiente_y_rechazado_no_activan_nada(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        for estado in ("pending", "in_process", "rejected", "cancelled"):
            cobro = falso.pagar(pref_id, estado=estado)
            r = await _webhook(cliente, "payment", cobro)
            assert r.json() == {"ok": True, "aplicado": False, "estado": estado}
        assert await conn.fetchval("select count(*) from pagos_suscripcion "
                                   "where tenant_id = $1", tid) == 0
        assert await conn.fetchval("select subscription_status from tenants "
                                   "where id = $1", tid) == "prueba"
        # El CIP se paga despues: el MISMO cobro pasa a aprobado y ahora si.
        cobro = falso.pagar(pref_id, estado="pending", cobro_id="9600000001")
        await _webhook(cliente, "payment", cobro)
        falso.cobros[cobro]["status"] = "approved"
        assert (await _webhook(cliente, "payment", cobro)).json()["aplicado"] is True
    _correr(cuerpo, monkeypatch)


@con_base
def test_devolucion_quita_el_periodo_una_sola_vez(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        cobro = falso.pagar(pref_id)
        await _webhook(cliente, "payment", cobro)
        falso.cobros[cobro]["status"] = "refunded"
        for _ in range(2):
            r = await _webhook(cliente, "payment", cobro)
            assert r.status_code == 200
        pago = await conn.fetchrow("select estado, comp_estado from pagos_suscripcion "
                                   "where tenant_id = $1", tid)
        assert (pago["estado"], pago["comp_estado"]) == ("devuelto", "no_aplica")
        hotel = await conn.fetchrow("select subscription_ends_at, trial_ends_at "
                                    "from tenants where id = $1", tid)
        # Vuelve exactamente a lo que tenia antes de pagar: el fin de la prueba.
        assert hotel["subscription_ends_at"] == hotel["trial_ends_at"]
        # Un contracargo tambien cuenta como devolucion.
        _, otra = await _con_preferencia(conn, cliente, falso, ruc=RUC_B, periodo="adelantado-1")
        cobro_b = falso.pagar(otra)
        await _webhook(cliente, "payment", cobro_b)
        falso.cobros[cobro_b]["status"] = "charged_back"
        assert (await _webhook(cliente, "payment", cobro_b)).json()["resultado"] == "devuelto"
    _correr(cuerpo, monkeypatch)


@con_base
def test_firma_invalida_401_y_no_toca_nada(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        cobro = falso.pagar(pref_id)
        antes = len(falso.llamadas)
        r = await _webhook(cliente, "payment", cobro, firma=False)
        assert r.status_code == 401
        # Ni siquiera se consulta a Mercado Pago.
        assert len(falso.llamadas) == antes
        assert await conn.fetchval("select count(*) from pagos_suscripcion "
                                   "where tenant_id = $1", tid) == 0
    _correr(cuerpo, monkeypatch)


@con_base
def test_mercadopago_caido_pide_reintento(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        cobro = falso.pagar(pref_id)
        falso.caido = True
        assert (await _webhook(cliente, "payment", cobro)).status_code == 503
        assert await conn.fetchval("select count(*) from pagos_suscripcion "
                                   "where tenant_id = $1", tid) == 0
        falso.caido = False
        assert (await _webhook(cliente, "payment", cobro)).json()["aplicado"] is True
        # Y si MP no responde al crear la preferencia, no se cobra nada y se dice.
        falso.caido = True
        r = await cliente.post("/comprar", data={
            "plan": "pro", "periodo": "adelantado-3", "modo": "existente",
            "email": f"admin-{RUC_A}@mp-pruebas.test", "password": "clave-de-pruebas"})
        assert r.status_code == 200 and "No se te cobró nada" in r.text
    _correr(cuerpo, monkeypatch)


@con_base
def test_en_simulado_el_pago_adelantado_no_llama_a_nadie(mp_apagado, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        r = await _alta(cliente, RUC_A, "adelantado-6")
        assert r.status_code == 303 and r.headers["location"].startswith("/comprar/pedido/ZS")
        assert falso.llamadas == []
        fila = await conn.fetchrow(
            "select estado, metodo, monto, periodo from pagos_suscripcion ps join tenants t "
            "on t.id = ps.tenant_id where t.ruc = $1", RUC_A)
        assert (fila["estado"], fila["metodo"], fila["monto"], fila["periodo"]) == \
            ("pendiente", "simulado", Decimal("714.00"), "adelantado-6")
    _correr(cuerpo, monkeypatch)


class Buzon:
    def __init__(self, falla=False):
        self.enviados = []
        self.falla = falla

    async def __call__(self, destino, asunto, html_, texto):
        if self.falla:
            return {"status": "error"}
        self.enviados.append((destino, asunto, html_, texto))
        return {"status": "sent"}


@con_base
def test_recordatorios_a_7_y_a_1_dia_sin_duplicar(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pref_id = await _con_preferencia(conn, cliente, falso)
        await _webhook(cliente, "payment", falso.pagar(pref_id))
        # Otro hotel con suscripcion con tarjeta: a ese no se le recuerda nada.
        tid_b, pid = await _hotel_con_suscripcion(conn, cliente, falso, ruc=RUC_B)
        await _webhook(cliente, "subscription_preapproval", pid)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))

        await conn.execute("update tenants set subscription_ends_at = now() + interval '20 days' "
                           "where id = any($1::uuid[])", [tid, tid_b])
        buzon = Buzon()
        assert await recordatorios.recordar_renovaciones(buzon) == 0

        await conn.execute("update tenants set subscription_ends_at = now() + interval '6 days' "
                           "where id = any($1::uuid[])", [tid, tid_b])
        # El correo no sale: no se marca, y la pasada siguiente lo reintenta.
        assert await recordatorios.recordar_renovaciones(Buzon(falla=True)) == 0
        assert await recordatorios.recordar_renovaciones(buzon) == 1
        assert await recordatorios.recordar_renovaciones(buzon) == 0
        (destino, asunto, html_, texto), = buzon.enviados
        assert destino == f"admin-{RUC_A}@mp-pruebas.test"
        assert "en 7 días" in asunto
        assert "/comprar/pro?periodo=adelantado-3" in texto
        assert FRASE in texto
        # Ninguna preferencia pregenerada: solo la del alta.
        assert len(falso.preferencias) == 1

        await conn.execute("update tenants set subscription_ends_at = now() + interval '20 hours' "
                           "where id = any($1::uuid[])", [tid, tid_b])
        assert await recordatorios.recordar_renovaciones(buzon) == 1
        assert await recordatorios.recordar_renovaciones(buzon) == 0
        assert "mañana" in buzon.enviados[-1][1]
        assert len(buzon.enviados) == 2

        # Renueva: el vencimiento cambia y el de 7 dias vuelve a tocar, una vez.
        await conn.execute("update tenants set subscription_ends_at = now() + interval '5 days' "
                           "where id = $1", tid)
        assert await recordatorios.recordar_renovaciones(buzon) == 1
        assert await recordatorios.recordar_renovaciones(buzon) == 0
        assert all(d == f"admin-{RUC_A}@mp-pruebas.test" for d, *_ in buzon.enviados)
    _correr(cuerpo, monkeypatch)
