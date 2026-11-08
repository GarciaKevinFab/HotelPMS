"""Mercado Pago Suscripciones y comprobantes manuales, sin red.

QUE SE PRUEBA Y COMO

  Dos clases de prueba en este archivo:

    - Puras (`no_necesita_servidor`): modos, referencia, firma x-signature,
      host del init_point, estado efectivo y exencion del limitador. Corren
      siempre.
    - Contra Postgres (`necesita_base`): el checkout, el webhook, la cuenta del
      hotel y la consola del dueno, de punta a punta por HTTP en proceso
      (httpx.ASGITransport sobre server.app, sin uvicorn). Necesitan
      ZENSTAY_TEST_DATABASE_URL con el esquema y las migraciones 001-005.

  Mercado Pago NO se llama nunca: `mercadopago._pedir` se sustituye por
  `FalsoMercadoPago`, que guarda en memoria las suscripciones, facturas y
  cobros como los devolveria la API. Asi se ejercita todo nuestro codigo --
  crear_preapproval con su control del host, cancelar, leer_* -- y solo se
  finge el otro lado. SUNAT tampoco: sunat.consultar_ruc se sustituye.

COMO SE LANZAN

      initdb + pg_ctl en un directorio temporal (puerto libre, p. ej. 5436)
      psql -f db/schema.sql; -f db/indexes.sql;
      psql -v app_backend_password=pruebas -f db/rls.sql; migraciones 001..005

      ZENSTAY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5436/zenstay \
      ZENSTAY_TEST_APP_DATABASE_URL=postgresql://app_backend:pruebas@127.0.0.1:5436/zenstay \
      pytest tests/test_mercadopago.py -q

  ZENSTAY_TEST_APP_DATABASE_URL es opcional: si se da, el backend habla con
  Postgres como `app_backend` (el rol de produccion, sujeto a RLS) y la prueba
  de aislamiento entre hoteles la cubre tambien la politica de la base, no
  solo el filtro explicito de la consulta.

  Cada prueba crea sus hoteles con RUC propios y los borra al terminar.
"""
import asyncio
import hashlib
import hmac
import itertools
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("JWT_SECRET", "solo-para-pruebas-no-firma-nada-real")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")

import asyncpg  # noqa: E402
import httpx  # noqa: E402

import comprobantes  # noqa: E402
import db_pg  # noqa: E402
import limites  # noqa: E402
import mercadopago  # noqa: E402
import server  # noqa: E402
import suscripciones  # noqa: E402

DSN = os.environ.get("ZENSTAY_TEST_DATABASE_URL", "")
DSN_APP = os.environ.get("ZENSTAY_TEST_APP_DATABASE_URL", "") or DSN

TOKEN = "TEST-token-de-mentira"
SECRETO = "clave-de-webhook-de-mentira"
INIT_POINT = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_id="

puro = pytest.mark.no_necesita_servidor
con_base = pytest.mark.necesita_base


def _ruc(base10: str) -> str:
    """Un RUC con su digito verificador correcto (los de prueba no son de nadie)."""
    pesos = (5, 4, 3, 2, 7, 6, 5, 4, 3, 2)
    suma = sum(int(d) * p for d, p in zip(base10, pesos))
    return base10 + str((11 - suma % 11) % 10)


RUC_A = _ruc("2099911100")
RUC_B = _ruc("2099911200")
RUC_C = _ruc("2099911300")
RUCS = (RUC_A, RUC_B, RUC_C)


def _firmar(data_id: str, request_id: str = "req-1", ts: str = "1730000000000",
            clave: str = SECRETO) -> dict:
    """Las cabeceras que mandaria Mercado Pago, calculadas aparte del codigo."""
    manifiesto = f"id:{data_id.lower()};request-id:{request_id};ts:{ts};"
    v1 = hmac.new(clave.encode(), manifiesto.encode(), hashlib.sha256).hexdigest()
    return {"x-signature": f"ts={ts},v1={v1}", "x-request-id": request_id}


@pytest.fixture
def mp_produccion(monkeypatch):
    monkeypatch.setenv("MERCADOPAGO_MODO", "produccion")
    monkeypatch.setenv("MERCADOPAGO_ACCESS_TOKEN", TOKEN)
    monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO)
    monkeypatch.delenv("MERCADOPAGO_CORREOS_PRUEBA", raising=False)


@pytest.fixture
def mp_apagado(monkeypatch):
    for v in ("MERCADOPAGO_MODO", "MERCADOPAGO_ACCESS_TOKEN",
              "MERCADOPAGO_WEBHOOK_SECRET", "MERCADOPAGO_CORREOS_PRUEBA"):
        monkeypatch.delenv(v, raising=False)


# ===========================================================================
# El otro lado, de mentira
# ===========================================================================

class FalsoMercadoPago:
    """La API de Mercado Pago en memoria. Responde como la real a lo que usamos."""

    def __init__(self):
        self.preapprovals: dict[str, dict] = {}
        self.facturas: dict[str, dict] = {}
        self.cobros: dict[str, dict] = {}
        self.llamadas: list[tuple[str, str, dict | None]] = []
        self.fallar_cancelacion = False
        self.caido = False

    async def pedir(self, metodo, ruta, cuerpo=None):
        self.llamadas.append((metodo, ruta, cuerpo))
        if self.caido:
            raise mercadopago.ErrorMercadoPago(f"{metodo} {ruta}: ConnectError")
        if metodo == "POST" and ruta == "/preapproval":
            pid = f"2c938084{uuid.uuid4().hex[:24]}"
            pre = {**cuerpo, "id": pid, "init_point": INIT_POINT + pid}
            self.preapprovals[pid] = pre
            return dict(pre)
        if ruta.startswith("/preapproval/"):
            pid = ruta.rsplit("/", 1)[1]
            if pid not in self.preapprovals:
                raise mercadopago.ErrorMercadoPago("404", http=404)
            if metodo == "PUT":
                if self.fallar_cancelacion:
                    raise mercadopago.ErrorMercadoPago("PUT: 500", http=500)
                self.preapprovals[pid].update(cuerpo or {})
            return dict(self.preapprovals[pid])
        if ruta.startswith("/authorized_payments/"):
            fid = ruta.rsplit("/", 1)[1]
            if fid not in self.facturas:
                raise mercadopago.ErrorMercadoPago("404", http=404)
            return dict(self.facturas[fid])
        if ruta.startswith("/v1/payments/"):
            cid = ruta.rsplit("/", 1)[1]
            if cid not in self.cobros:
                raise mercadopago.ErrorMercadoPago("404", http=404)
            return dict(self.cobros[cid])
        raise AssertionError(f"ruta no esperada: {metodo} {ruta}")

    # Lo que haria Mercado Pago al pasar el tiempo
    def autorizar(self, pid):
        self.preapprovals[pid]["status"] = "authorized"

    def facturar(self, pid, estado="approved", monto=None, cobro_id=None) -> str:
        fid = str(7000000000 + len(self.facturas) + 1)
        cobro_id = cobro_id or str(9000000000 + len(self.facturas) + 1)
        pre = self.preapprovals[pid]
        self.facturas[fid] = {
            "id": int(fid), "preapproval_id": pid, "status": "processed",
            "transaction_amount": monto if monto is not None
            else pre["auto_recurring"]["transaction_amount"],
            "currency_id": "PEN",
            "payment": {"id": int(cobro_id), "status": estado},
        }
        self.cobros[cobro_id] = {"id": int(cobro_id), "status": estado,
                                 "external_reference": pre["external_reference"]}
        return fid


@pytest.fixture
def falso(monkeypatch):
    f = FalsoMercadoPago()
    monkeypatch.setattr(mercadopago, "_pedir", f.pedir)

    async def sin_sunat(ruc):
        return {"ruc": ruc, "razon_social": "HOTEL DE PRUEBAS S.A.C.",
                "direccion": "AV. DE PRUEBA 123", "fuente": "falsa"}
    monkeypatch.setattr(comprobantes.sunat, "consultar_ruc", sin_sunat)
    return f


# ===========================================================================
# Puras
# ===========================================================================

@puro
def test_sin_credenciales_es_simulado(mp_apagado, monkeypatch):
    assert mercadopago.modo() == "simulado"
    monkeypatch.setenv("MERCADOPAGO_MODO", "produccion")
    # Pedir produccion sin token ni clave de webhook no enciende nada.
    assert mercadopago.modo() == "simulado"
    monkeypatch.setenv("MERCADOPAGO_ACCESS_TOKEN", TOKEN)
    assert mercadopago.modo() == "simulado", "sin clave de webhook no hay como verificar avisos"
    monkeypatch.setenv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO)
    assert mercadopago.modo() == "produccion"
    monkeypatch.setenv("MERCADOPAGO_MODO", "cualquier-cosa")
    assert mercadopago.modo() == "simulado"


@puro
def test_en_prueba_solo_se_ofrece_a_los_correos_de_prueba(mp_produccion, monkeypatch):
    monkeypatch.setenv("MERCADOPAGO_MODO", "prueba")
    monkeypatch.setenv("MERCADOPAGO_CORREOS_PRUEBA", " Comprador@Test.com ,otro@test.com")
    assert mercadopago.disponible_para("comprador@test.com")
    assert mercadopago.disponible_para("OTRO@test.com")
    assert not mercadopago.disponible_para("cliente@hotel.pe")
    assert not mercadopago.disponible_para(None)
    assert not mercadopago.cobro_recurrente()


@puro
def test_la_referencia_va_y_vuelve_y_rechaza_lo_ajeno():
    tid = uuid.uuid4()
    ref = mercadopago.referencia(tid, "pro", "anual")
    assert mercadopago.leer_referencia(ref) == {"tenant_id": tid, "plan": "pro", "periodo": "anual"}
    for ajena in (None, "", "licitapro|12|pro|mensual", "zenstay|no-uuid|pro|mensual",
                  f"zenstay|{tid}|pro|semanal", f"zenstay|{tid}||mensual"):
        assert mercadopago.leer_referencia(ajena) is None


@puro
def test_la_firma_buena_pasa_y_cualquier_cambio_la_rompe(mp_produccion, monkeypatch):
    h = _firmar("123456")
    assert mercadopago.verificar_firma(h["x-signature"], h["x-request-id"], "123456")
    # Otro id, otro request-id, otra clave, cabecera rota o ausente: no.
    assert not mercadopago.verificar_firma(h["x-signature"], h["x-request-id"], "123457")
    assert not mercadopago.verificar_firma(h["x-signature"], "req-2", "123456")
    assert not mercadopago.verificar_firma(_firmar("123456", clave="otra")["x-signature"],
                                           h["x-request-id"], "123456")
    assert not mercadopago.verificar_firma("ts=1,v1=", h["x-request-id"], "123456")
    assert not mercadopago.verificar_firma("basura", h["x-request-id"], "123456")
    assert not mercadopago.verificar_firma(None, h["x-request-id"], "123456")
    # Ids alfanumericos: la regla de Mercado Pago es firmarlos en minusculas.
    h2 = _firmar("2c938084ABC")
    assert mercadopago.verificar_firma(h2["x-signature"], h2["x-request-id"], "2c938084ABC")
    # Sin clave configurada, falla cerrado aunque la firma "cuadre".
    monkeypatch.delenv("MERCADOPAGO_WEBHOOK_SECRET")
    assert not mercadopago.verificar_firma(h["x-signature"], h["x-request-id"], "123456")


@puro
def test_un_init_point_fuera_de_mercadopago_no_se_sigue(mp_produccion, monkeypatch):
    async def respuesta_rara(metodo, ruta, cuerpo=None):
        return {"id": "x", "init_point": "https://mercadopago.com.pe.evil.example/pagar"}
    monkeypatch.setattr(mercadopago, "_pedir", respuesta_rara)
    with pytest.raises(mercadopago.ErrorMercadoPago):
        asyncio.run(mercadopago.crear_preapproval(
            uuid.uuid4(), "a@b.pe", "pro", "Pro", "mensual", Decimal(119), "https://x/y"))


@puro
def test_un_error_de_red_no_filtra_el_token(mp_produccion, monkeypatch):
    class ClienteQueFalla:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def request(self, metodo, url, json=None, headers=None):
            raise httpx.ConnectError(f"fallo con {headers}")
    monkeypatch.setattr(mercadopago.httpx, "AsyncClient", ClienteQueFalla)
    with pytest.raises(mercadopago.ErrorMercadoPago) as e:
        asyncio.run(mercadopago.leer_preapproval("abc"))
    assert TOKEN not in str(e.value)
    assert e.value.transitorio


@puro
def test_estado_efectivo_por_fechas():
    ahora = datetime(2026, 11, 7, 12, tzinfo=timezone.utc)
    dia = timedelta(days=1)
    ef = suscripciones.estado_efectivo_de
    assert ef("activa", ahora + dia, ahora) == "activa"
    assert ef("activa", ahora - dia, ahora) == "vencida"          # en gracia
    assert ef("activa", ahora - 8 * dia, ahora) == "suspendida"   # gracia agotada
    assert ef("prueba", ahora - dia, ahora) == "vencida"
    assert ef("activa", None, ahora) == "activa"  # hoteles de antes de cobrar
    acceso = suscripciones.tiene_acceso
    assert acceso("vencida", ahora - dia, ahora)
    assert not acceso("suspendida", ahora - 8 * dia, ahora)
    # Cancelada conserva el acceso hasta el fin de lo pagado, y luego no.
    assert acceso("cancelada", ahora + dia, ahora)
    assert not acceso("cancelada", ahora - dia, ahora)


@puro
def test_el_webhook_no_pasa_por_el_limitador():
    """Un 429 al webhook es un cobro sin registrar hasta el reintento."""
    async def app_ok(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    m = limites.LimitePeticiones(app_ok, reglas=[(None, "/", 2, 60)],
                                 prefijos=("/", "/api", "/webhooks"))

    async def pedir(ruta):
        estado = {}

        async def send(msg):
            if msg["type"] == "http.response.start":
                estado["s"] = msg["status"]

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        await m({"type": "http", "method": "POST", "path": ruta,
                 "headers": [(b"cf-connecting-ip", b"203.0.113.9")]}, receive, send)
        return estado["s"]

    codigos = [asyncio.run(pedir("/webhooks/mercadopago")) for _ in range(10)]
    assert set(codigos) == {200}
    # Y el control: la misma IP contra otra ruta si se corta.
    otras = [asyncio.run(pedir("/api/rooms")) for _ in range(4)]
    assert 429 in otras


# ===========================================================================
# Contra Postgres
# ===========================================================================

async def _superusuario():
    conn = await asyncpg.connect(DSN)
    await db_pg._init_connection(conn)
    return conn


async def _borrar_hoteles(conn):
    await conn.execute("delete from tenants where ruc = any($1::text[])", list(RUCS))
    await conn.execute("delete from users where email like '%@mp-pruebas.test'")


async def _hotel(conn, ruc, nombre, estado="prueba", dias_prueba=10):
    tid = await conn.fetchval(
        """insert into tenants (name, ruc, razon_social, nombre_comercial, email,
                                plan_codigo, subscription_status, trial_ends_at)
           values ($1, $2, $1, $1, $3, 'prueba', $4, now() + ($5 || ' days')::interval)
           returning id""",
        nombre, ruc, f"admin-{ruc}@mp-pruebas.test", estado, str(dias_prueba))
    uid = await conn.fetchval(
        """insert into users (tenant_id, email, password_hash, full_name, role)
           values ($1, $2, $3, 'Admin Pruebas', 'ADMIN') returning id""",
        tid, f"admin-{ruc}@mp-pruebas.test", server.hash_password("clave-de-pruebas"))
    return tid, uid


def _token_admin(tid, uid, ruc):
    return server.create_token(str(uid), f"admin-{ruc}@mp-pruebas.test", "ADMIN", str(tid))


def _token_superadmin():
    return server.create_token(str(uuid.uuid4()), "dueno@mp-pruebas.test", "SUPER_ADMIN")


def _cabecera(token):
    return {"Authorization": f"Bearer {token}"}


_IPS = itertools.count(1)


def _correr(cuerpo, monkeypatch):
    """Una prueba completa en UN bucle de eventos: base, app y cliente HTTP.

    El pool de db_pg queda atado al bucle que lo crea; por eso se suelta al
    terminar y cada prueba empieza con uno nuevo.
    """
    if not DSN:
        pytest.skip("Sin ZENSTAY_TEST_DATABASE_URL")
    monkeypatch.setenv("DATABASE_URL", DSN_APP)
    monkeypatch.setenv("COMPROBANTES_AVISOS", "0")

    async def envoltorio():
        db_pg._pool = None
        conn = await _superusuario()
        await _borrar_hoteles(conn)
        transporte = httpx.ASGITransport(app=server.app)
        try:
            # Una IP propia por prueba: el limitador de server.app vive todo el
            # proceso y POST /comprar admite 10 por hora y por IP.
            ip = f"198.51.100.{next(_IPS)}"
            async with httpx.AsyncClient(transport=transporte, base_url="http://test",
                                         headers={"cf-connecting-ip": ip},
                                         follow_redirects=False) as cliente:
                return await cuerpo(conn, cliente)
        finally:
            await _borrar_hoteles(conn)
            await conn.close()
            await db_pg.close_pool()

    return asyncio.run(envoltorio())


async def _webhook(cliente, tipo, data_id, firma=True):
    cabeceras = _firmar(str(data_id)) if firma else {"x-signature": "ts=1,v1=00",
                                                      "x-request-id": "req-1"}
    return await cliente.post(f"/webhooks/mercadopago?data.id={data_id}&type={tipo}",
                              json={"type": tipo, "data": {"id": str(data_id)}},
                              headers=cabeceras)


async def _alta_por_checkout(cliente, ruc, comprobante="boleta", documento=""):
    """El hotel nuevo llena el checkout. Devuelve la respuesta (303)."""
    return await cliente.post("/comprar", data={
        "plan": "pro", "periodo": "mensual", "modo": "nuevo",
        "hotel_name": f"Hotel {ruc}", "ruc": ruc, "admin_name": "Admin Pruebas",
        "admin_email": f"admin-{ruc}@mp-pruebas.test", "admin_password": "clave-de-pruebas",
        "comprobante": comprobante, "documento": documento,
    })


async def _hotel_con_suscripcion(conn, cliente, falso, ruc=RUC_A):
    r = await _alta_por_checkout(cliente, ruc)
    assert r.status_code == 303, r.text
    pid = urlsplit(r.headers["location"]).query.split("=", 1)[1]
    tid = await conn.fetchval("select id from tenants where ruc = $1", ruc)
    falso.autorizar(pid)
    return tid, pid


@con_base
def test_alta_crea_la_suscripcion_con_el_precio_del_servidor(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        r = await _alta_por_checkout(cliente, RUC_A, comprobante="factura")
        assert r.status_code == 303
        assert r.headers["location"].startswith(INIT_POINT)

        (metodo, _, enviado), = [x for x in falso.llamadas if x[1] == "/preapproval"]
        assert metodo == "POST"
        assert enviado["auto_recurring"] == {"frequency": 1, "frequency_type": "months",
                                             "transaction_amount": 119.0, "currency_id": "PEN"}
        assert enviado["status"] == "pending"
        assert enviado["payer_email"] == f"admin-{RUC_A}@mp-pruebas.test"
        tid = await conn.fetchval("select id from tenants where ruc = $1", RUC_A)
        assert enviado["external_reference"] == f"zenstay|{tid}|pro|mensual"
        assert enviado["back_url"].endswith("/settings?tab=suscripcion")

        # Nada se activa ni se cobra al volver del formulario: espera al webhook.
        hotel = await conn.fetchrow("select subscription_status, mp_preapproval_id "
                                    "from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "prueba"
        assert hotel["mp_preapproval_id"] is None
        assert await conn.fetchval("select count(*) from pagos_suscripcion "
                                   "where tenant_id = $1", tid) == 0
        # Factura sin documento: se usa el RUC del hotel, con la razon social de SUNAT.
        datos = await conn.fetchrow("select * from datos_facturacion where tenant_id = $1", tid)
        assert (datos["tipo"], datos["documento"], datos["nombre"]) == \
            ("factura", RUC_A, "HOTEL DE PRUEBAS S.A.C.")
    _correr(cuerpo, monkeypatch)


@con_base
def test_el_formulario_no_puede_cambiar_el_importe(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        await cliente.post("/comprar", data={
            "plan": "pro", "periodo": "anual", "modo": "nuevo", "monto": "1",
            "transaction_amount": "1", "hotel_name": "Hotel", "ruc": RUC_A,
            "admin_name": "Admin", "admin_email": f"admin-{RUC_A}@mp-pruebas.test",
            "admin_password": "clave-de-pruebas"})
        (_, _, enviado), = [x for x in falso.llamadas if x[1] == "/preapproval"]
        assert enviado["auto_recurring"]["transaction_amount"] == 1190.0
        assert enviado["auto_recurring"]["frequency"] == 12
    _correr(cuerpo, monkeypatch)


@con_base
def test_en_simulado_se_registra_el_pedido_y_no_se_llama_a_nadie(mp_apagado, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        r = await _alta_por_checkout(cliente, RUC_A)
        assert r.status_code == 303
        assert r.headers["location"].startswith("/comprar/pedido/ZS")
        assert falso.llamadas == []
        fila = await conn.fetchrow(
            "select estado, metodo, monto from pagos_suscripcion ps join tenants t "
            "on t.id = ps.tenant_id where t.ruc = $1", RUC_A)
        assert (fila["estado"], fila["metodo"], fila["monto"]) == ("pendiente", "simulado", Decimal("119.00"))
        pagina = await cliente.get(r.headers["location"])
        assert "El cobro con tarjeta todavía no está activo." in " ".join(pagina.text.split())
        # Sin clave, cualquier aviso es 401 aunque traiga algo parecido a una firma.
        assert (await _webhook(cliente, "payment", "1")).status_code == 401
    _correr(cuerpo, monkeypatch)


@con_base
def test_en_prueba_el_resto_sigue_por_el_camino_simulado(mp_produccion, falso, monkeypatch):
    monkeypatch.setenv("MERCADOPAGO_MODO", "prueba")
    monkeypatch.setenv("MERCADOPAGO_CORREOS_PRUEBA", f"admin-{RUC_B}@mp-pruebas.test")

    async def cuerpo(conn, cliente):
        r = await _alta_por_checkout(cliente, RUC_A)
        assert r.headers["location"].startswith("/comprar/pedido/")
        r = await _alta_por_checkout(cliente, RUC_B)
        assert r.headers["location"].startswith(INIT_POINT)
    _correr(cuerpo, monkeypatch)


@con_base
def test_cobro_aprobado_activa_el_plan_y_el_aviso_repetido_no_suma(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        fin_prueba = await conn.fetchval("select trial_ends_at from tenants where id = $1", tid)

        r = await _webhook(cliente, "subscription_preapproval", pid)
        assert r.status_code == 200 and r.json()["aplicado"] is True
        assert await conn.fetchval("select mp_preapproval_id from tenants where id = $1", tid) == pid

        fid = falso.facturar(pid)
        r = await _webhook(cliente, "subscription_authorized_payment", fid)
        assert r.json() == {"ok": True, "aplicado": True, "resultado": "aplicado"}
        hotel = await conn.fetchrow("select * from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "activa" and hotel["plan_codigo"] == "pro"
        # Lo que quedaba de prueba no se pierde: el mes se suma desde su fin.
        esperado = await conn.fetchval("select $1::timestamptz + interval '1 month'", fin_prueba)
        assert hotel["subscription_ends_at"] == esperado
        assert hotel["grace_ends_at"] == esperado + timedelta(days=7)

        for _ in range(2):
            r = await _webhook(cliente, "subscription_authorized_payment", fid)
            assert r.json()["resultado"] == "repetido"
        assert await conn.fetchval("select subscription_ends_at from tenants where id = $1", tid) == esperado
        pagos = await conn.fetch("select * from pagos_suscripcion where tenant_id = $1", tid)
        assert len(pagos) == 1
        assert (pagos[0]["estado"], pagos[0]["metodo"], pagos[0]["mp_payment_id"]) == \
            ("pagado", "mercadopago", fid)
        # El disparador de la 005 deja el comprobante pendiente con la foto de los datos.
        assert (pagos[0]["comp_estado"], pagos[0]["comp_tipo"]) == ("pendiente", "boleta")

        estado = (await cliente.get("/api/suscripcion",
                                    headers=_cabecera(_token_admin(tid, uuid.uuid4(), RUC_A)))).json()
        assert estado["estado_efectivo"] == "activa" and estado["tiene_acceso"]
        assert estado["cobro_automatico"] is True and estado["renovacion_automatica"] is True
    _correr(cuerpo, monkeypatch)


@con_base
def test_firma_mala_401_y_no_toca_nada(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        fid = falso.facturar(pid)
        antes = len(falso.llamadas)
        r = await _webhook(cliente, "subscription_authorized_payment", fid, firma=False)
        assert r.status_code == 401
        # Firma valida pero para OTRO id: tampoco.
        r = await cliente.post(f"/webhooks/mercadopago?data.id={fid}&type=subscription_authorized_payment",
                               json={}, headers=_firmar("999"))
        assert r.status_code == 401
        assert len(falso.llamadas) == antes, "con firma mala no se consulta la API"
        assert await conn.fetchval("select subscription_status from tenants where id = $1", tid) == "prueba"
        assert await conn.fetchval("select count(*) from pagos_suscripcion where tenant_id = $1", tid) == 0
    _correr(cuerpo, monkeypatch)


@con_base
def test_cobro_rechazado_se_asienta_una_vez_y_no_quita_la_prueba(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        fid = falso.facturar(pid, estado="rejected")
        for _ in range(2):
            r = await _webhook(cliente, "subscription_authorized_payment", fid)
            assert r.status_code == 200 and r.json()["cobrado"] is False
        hotel = await conn.fetchrow("select * from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "prueba" and hotel["subscription_ends_at"] is None
        filas = await conn.fetch("select estado, comp_estado from pagos_suscripcion where tenant_id = $1", tid)
        assert [(f["estado"], f["comp_estado"]) for f in filas] == [("fallido", None)]

        # Mercado Pago reintenta la MISMA factura y esta vez entra: es la misma fila.
        falso.facturas[fid]["payment"]["status"] = "approved"
        r = await _webhook(cliente, "subscription_authorized_payment", fid)
        assert r.json()["resultado"] == "aplicado"
        filas = await conn.fetch("select estado, comp_estado from pagos_suscripcion where tenant_id = $1", tid)
        assert [(f["estado"], f["comp_estado"]) for f in filas] == [("pagado", "pendiente")]
    _correr(cuerpo, monkeypatch)


@con_base
def test_importe_o_moneda_distintos_no_se_aplican(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        fid = falso.facturar(pid, monto=1.0)
        r = await _webhook(cliente, "subscription_authorized_payment", fid)
        assert r.json()["motivo"] == "importe no coincide"
        fid2 = falso.facturar(pid)
        falso.facturas[fid2]["currency_id"] = "USD"
        r = await _webhook(cliente, "subscription_authorized_payment", fid2)
        assert r.json()["motivo"] == "importe no coincide"
        assert await conn.fetchval("select subscription_status from tenants where id = $1", tid) == "prueba"
    _correr(cuerpo, monkeypatch)


@con_base
def test_renovacion_suma_desde_el_vencimiento(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        # Tres dias antes de vencer llega la renovacion.
        await conn.execute("update tenants set subscription_ends_at = now() + interval '3 days' "
                           "where id = $1", tid)
        vence = await conn.fetchval("select subscription_ends_at from tenants where id = $1", tid)
        r = await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        assert r.json()["resultado"] == "aplicado"
        nuevo = await conn.fetchval("select subscription_ends_at from tenants where id = $1", tid)
        assert nuevo == await conn.fetchval("select $1::timestamptz + interval '1 month'", vence)
        assert await conn.fetchval("select count(*) from pagos_suscripcion where tenant_id = $1 "
                                   "and estado = 'pagado'", tid) == 2
    _correr(cuerpo, monkeypatch)


@con_base
def test_vencimiento_gracia_y_suspension_se_ven_al_leer(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, uid = await _hotel(conn, RUC_A, "Hotel Vence", estado="activa")
        cab = _cabecera(_token_admin(tid, uid, RUC_A))
        await conn.execute("update tenants set subscription_ends_at = now() - interval '2 days', "
                           "grace_ends_at = now() + interval '5 days' where id = $1", tid)
        e = (await cliente.get("/api/suscripcion", headers=cab)).json()
        assert (e["estado_efectivo"], e["en_gracia"], e["tiene_acceso"]) == ("vencida", True, True)
        await conn.execute("update tenants set subscription_ends_at = now() - interval '9 days', "
                           "grace_ends_at = now() - interval '2 days' where id = $1", tid)
        e = (await cliente.get("/api/suscripcion", headers=cab)).json()
        assert (e["estado_efectivo"], e["tiene_acceso"]) == ("suspendida", False)
    _correr(cuerpo, monkeypatch)


@con_base
def test_cancelacion_desde_la_cuenta_para_mercadopago_y_conserva_el_acceso(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        uid = await conn.fetchval("select id from users where tenant_id = $1", tid)
        cab = _cabecera(_token_admin(tid, uid, RUC_A))

        # Si Mercado Pago falla no se toca nada: seguiria cobrando.
        falso.fallar_cancelacion = True
        r = await cliente.post("/api/suscripcion/cancelar", headers=cab)
        assert r.status_code == 502
        assert await conn.fetchval("select subscription_status from tenants where id = $1", tid) == "activa"

        falso.fallar_cancelacion = False
        r = await cliente.post("/api/suscripcion/cancelar", headers=cab)
        assert r.status_code == 200, r.text
        assert falso.preapprovals[pid]["status"] == "cancelled"
        hotel = await conn.fetchrow("select * from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "cancelada" and hotel["mp_preapproval_id"] is None
        assert hotel["cancelada_en"] is not None
        e = r.json()["suscripcion"]
        assert e["tiene_acceso"] is True, "conserva el acceso hasta el fin de lo pagado"

        # El aviso de Mercado Pago que confirma la cancelacion no rompe nada.
        r = await _webhook(cliente, "subscription_preapproval", pid)
        assert r.status_code == 200
        # Y no hay nada mas que cancelar.
        assert (await cliente.post("/api/suscripcion/cancelar", headers=cab)).status_code == 400
    _correr(cuerpo, monkeypatch)


@con_base
def test_cancelacion_desde_mercadopago_llega_por_webhook(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        falso.preapprovals[pid]["status"] = "cancelled"
        r = await _webhook(cliente, "subscription_preapproval", pid)
        assert r.json()["aplicado"] is True
        hotel = await conn.fetchrow("select * from tenants where id = $1", tid)
        assert hotel["subscription_status"] == "cancelada" and hotel["mp_preapproval_id"] is None
    _correr(cuerpo, monkeypatch)


@con_base
def test_devolucion_quita_el_periodo_una_sola_vez(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        fid = falso.facturar(pid, cobro_id="9100000001")
        await _webhook(cliente, "subscription_authorized_payment", fid)
        falso.cobros["9100000001"]["status"] = "refunded"
        for _ in range(2):
            r = await _webhook(cliente, "payment", "9100000001")
            assert r.status_code == 200
        pago = await conn.fetchrow("select estado, comp_estado, comp_nota from pagos_suscripcion "
                                   "where tenant_id = $1", tid)
        assert pago["estado"] == "devuelto"
        # El comprobante seguia pendiente: ya no hay que emitirlo.
        assert pago["comp_estado"] == "no_aplica"
        # Se quita exactamente el mes cobrado: vuelve a lo que tenia antes de
        # pagar (aqui, el resto de la prueba), ni un dia mas ni uno menos.
        hotel = await conn.fetchrow("select subscription_ends_at, trial_ends_at "
                                    "from tenants where id = $1", tid)
        assert hotel["subscription_ends_at"] == hotel["trial_ends_at"]
        # Un cobro ajeno (otra referencia) no se toca.
        falso.cobros["555"] = {"id": 555, "status": "refunded",
                               "external_reference": "licitapro|1|pro|mensual"}
        assert (await _webhook(cliente, "payment", "555")).json()["motivo"] == "referencia ajena"
    _correr(cuerpo, monkeypatch)


@con_base
def test_mercadopago_caido_pide_reintento(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        falso.caido = True
        r = await _webhook(cliente, "subscription_authorized_payment", "123")
        assert r.status_code == 503
        falso.caido = False
        r = await _webhook(cliente, "subscription_authorized_payment", "123")
        assert r.status_code == 200 and r.json()["motivo"] == "no confirmado"
    _correr(cuerpo, monkeypatch)


@con_base
def test_comprobante_de_punta_a_punta(mp_produccion, falso, monkeypatch):
    monkeypatch.setenv("ZENSTAY_ADMIN_EMAIL", "dueno@mp-pruebas.test")
    enviados = []

    async def enviar(destino, asunto, html, texto):
        enviados.append((destino, asunto))
        return {"status": "sent"}

    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        pago_id = await conn.fetchval("select id from pagos_suscripcion where tenant_id = $1", tid)
        uid = await conn.fetchval("select id from users where tenant_id = $1", tid)
        hotel = _cabecera(_token_admin(tid, uid, RUC_A))
        dueno = _cabecera(_token_superadmin())

        # Aviso al dueno, una sola vez por cobro nuevo.
        assert await comprobantes.avisar(enviar) >= 1
        mios = [a for _, a in enviados if f"Hotel {RUC_A}" in a]
        assert len(mios) == 1 and mios[0].startswith("Emitir boleta: S/ 119.00")
        await comprobantes.avisar(enviar)
        assert len([a for _, a in enviados if f"Hotel {RUC_A}" in a]) == 1

        panel = (await cliente.get("/api/admin/comprobantes", headers=dueno)).json()
        p = next(x for x in panel["pendientes"] if x["id"] == str(pago_id))
        assert (p["base"], p["igv"]) == (100.85, 18.15)

        pdf = b"%PDF-1.4 comprobante de pruebas"
        # Serie de factura para una boleta: no.
        r = await cliente.post(f"/api/admin/comprobantes/{pago_id}/emitido", headers=dueno,
                               data={"serie": "F001", "numero": "1", "emitido": "2026-11-07"},
                               files={"pdf": ("c.pdf", pdf, "application/pdf")})
        assert r.status_code == 400
        # Un archivo que no es PDF: no.
        r = await cliente.post(f"/api/admin/comprobantes/{pago_id}/emitido", headers=dueno,
                               data={"serie": "B001", "numero": "1", "emitido": "2026-11-07"},
                               files={"pdf": ("c.pdf", b"MZ ejecutable", "application/pdf")})
        assert r.status_code == 400
        r = await cliente.post(f"/api/admin/comprobantes/{pago_id}/emitido", headers=dueno,
                               data={"serie": "B001", "numero": "00042", "emitido": "2026-11-07"},
                               files={"pdf": ("c.pdf", pdf, "application/pdf")})
        assert r.status_code == 200, r.text

        pagos = (await cliente.get("/api/suscripcion/pagos", headers=hotel)).json()["pagos"]
        assert pagos[0]["comp_estado"] == "emitido" and pagos[0]["comp_serie"] == "B001"
        assert pagos[0]["comp_numero"] == "42" and pagos[0]["comp_tiene_pdf"] is True
        r = await cliente.get(f"/api/suscripcion/comprobante/{pago_id}", headers=hotel)
        assert r.status_code == 200 and r.content == pdf
        assert r.headers["content-type"] == "application/pdf"
    _correr(cuerpo, monkeypatch)


@con_base
def test_un_hotel_no_ve_ni_descarga_lo_de_otro(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid_a, pid = await _hotel_con_suscripcion(conn, cliente, falso, ruc=RUC_A)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        pago_a = await conn.fetchval("select id from pagos_suscripcion where tenant_id = $1", tid_a)
        await conn.execute("update pagos_suscripcion set comp_estado = 'emitido', comp_serie = 'B001', "
                           "comp_numero = '7', comp_pdf = $2 where id = $1", pago_a, b"%PDF-1.4 a")

        tid_b, uid_b = await _hotel(conn, RUC_B, "Hotel B")
        otro = _cabecera(_token_admin(tid_b, uid_b, RUC_B))
        r = await cliente.get(f"/api/suscripcion/comprobante/{pago_a}", headers=otro)
        assert r.status_code == 404
        assert (await cliente.get("/api/suscripcion/pagos", headers=otro)).json()["pagos"] == []

        # La consola del dueno no la abre un ADMIN, ni siquiera el SUPER_ADMIN
        # que "entro como" un hotel (su token lleva rol ADMIN).
        assert (await cliente.get("/api/admin/comprobantes", headers=otro)).status_code == 403
        dentro = _cabecera(server.create_token(str(uuid.uuid4()), "dueno@mp-pruebas.test", "ADMIN",
                                               str(tid_b), {"en_otro_hotel": True}))
        assert (await cliente.get("/api/admin/comprobantes", headers=dentro)).status_code == 403
        assert (await cliente.get(f"/api/admin/comprobantes/{pago_a}/pdf",
                                  headers=otro)).status_code == 403
        # Un recepcionista del propio hotel tampoco gestiona la suscripcion.
        recep = _cabecera(server.create_token(str(uuid.uuid4()), "r@mp-pruebas.test",
                                              "RECEPTIONIST", str(tid_a)))
        assert (await cliente.post("/api/suscripcion/cancelar", headers=recep)).status_code == 403
    _correr(cuerpo, monkeypatch)


@con_base
def test_no_se_abre_una_segunda_suscripcion_ni_se_borra_un_hotel_que_paga(mp_produccion, falso, monkeypatch):
    async def cuerpo(conn, cliente):
        tid, pid = await _hotel_con_suscripcion(conn, cliente, falso)
        await _webhook(cliente, "subscription_authorized_payment", falso.facturar(pid))
        r = await cliente.post("/comprar", data={
            "plan": "empresa", "periodo": "mensual", "modo": "existente",
            "email": f"admin-{RUC_A}@mp-pruebas.test", "password": "clave-de-pruebas"})
        assert r.status_code == 200 and "ya tiene una suscripción" in r.text
        assert len([x for x in falso.llamadas if x[1] == "/preapproval"]) == 1

        # Una recepcionista del hotel no contrata: es decision del ADMIN.
        await conn.execute(
            "insert into users (tenant_id, email, password_hash, full_name, role) "
            "values ($1, $2, $3, 'Recepcion', 'RECEPTIONIST')",
            tid, "recepcion@mp-pruebas.test", server.hash_password("clave-de-pruebas"))
        r = await cliente.post("/comprar", data={
            "plan": "pro", "periodo": "mensual", "modo": "existente",
            "email": "recepcion@mp-pruebas.test", "password": "clave-de-pruebas"})
        assert "Solo el administrador del hotel" in r.text

        r = await cliente.delete(f"/api/tenants/{tid}", headers=_cabecera(_token_superadmin()))
        assert r.status_code == 409
    _correr(cuerpo, monkeypatch)
