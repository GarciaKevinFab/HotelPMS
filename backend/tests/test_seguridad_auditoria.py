"""Los arreglos de la auditoria de seguridad y SEO del 2026-11-09, uno por uno.

QUE CUBRE

  Seguridad
    1. SSRF en la ruta de NubeFact y envio asincrono con timeout corto.
    2. Tokens que se pueden revocar: rol, hotel e is_active salen de la base.
    3. Roles en cobros, caja y comprobantes; importes negativos -> 422.
    4. Correos solo a gente del propio hotel, con tope por hotel.
    5. El token de NubeFact no se guarda en claro en la bitacora.
    6. /docs, /redoc y /openapi.json apagados por defecto.
    7. Cabeceras de seguridad en todas las respuestas.
  SEO
    9. 404 de verdad, 301 de la barra final y noindex en la SPA privada.
   10. Logotipo optimizado y h1 de la portada visible sin animacion.
   11. og:image 1200x630 con summary_large_image.
   12. Sitemap sin /comprar y con lastmod.
  Ademas
    - Aislamiento entre hoteles en comprobantes, cobros y reservas.
    - Alta publica con RUC o correo repetido.
    - Esquema + RLS + migraciones en una base vacia: toda tabla con
      tenant_id tiene RLS forzado.
    - ZENSTAY_LIMITES_PRUEBAS, la forma de elevar el limitador en pruebas.

COMO SE LANZAN

  Las puras corren siempre:

      cd backend && python -m pytest tests/test_seguridad_auditoria.py -q

  Las que llevan `necesita_base` piden un Postgres EFIMERO con el esquema, rls
  y las migraciones aplicadas (igual que tests/test_mercadopago.py):

      ZENSTAY_TEST_DATABASE_URL=postgresql://postgres:...@127.0.0.1:PUERTO/zenstay
      ZENSTAY_TEST_APP_DATABASE_URL=postgresql://app_backend:...@127.0.0.1:PUERTO/zenstay

  Hablan con server.app en proceso (httpx.ASGITransport), sin uvicorn. Cada
  prueba crea sus hoteles con RUC propios y los borra al terminar.
"""
import asyncio
import itertools
import os
import re
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
REPO = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

os.environ.setdefault("JWT_SECRET", "solo-para-pruebas-no-firma-nada-real-0123456789")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")

import asyncpg  # noqa: E402
import httpx  # noqa: E402
import jwt  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from pydantic import ValidationError  # noqa: E402

import db_pg  # noqa: E402
import limites  # noqa: E402
import seo  # noqa: E402
import server  # noqa: E402

puro = pytest.mark.no_necesita_servidor
con_base = pytest.mark.necesita_base

DSN = os.environ.get("ZENSTAY_TEST_DATABASE_URL", "")
DSN_APP = os.environ.get("ZENSTAY_TEST_APP_DATABASE_URL", "") or DSN

DOMINIO = "seg-pruebas.pe"
RUC_A = "20888777001"
RUC_B = "20888777002"
RUC_REG = "20888777003"
RUCS = (RUC_A, RUC_B, RUC_REG)


def _cliente_sin_base():
    # Sin `with`: no corre el ciclo de vida (ni el bucle de avisos ni el pool).
    return TestClient(server.app, follow_redirects=False)


# ===========================================================================
# 1. NubeFact: que rutas se aceptan
# ===========================================================================

BUENAS = [
    "https://api.nubefact.com/api/v1/03989d1a-6c8c-4b71-b1cd-7d37001deaa0",
    "https://API.NUBEFACT.COM/api/v1/abc",
    "https://demo.nubefact.com/api/v1/abc",
]
MALAS = [
    "http://api.nubefact.com/api/v1/abc",           # sin TLS
    "https://169.254.169.254/latest/meta-data",     # metadatos de la nube
    "https://127.0.0.1/api/v1/x",                   # IP literal
    "https://[::1]/api/v1/x",
    "https://localhost/api/v1/x",
    "https://postgres:5432/api/v1/x",               # contenedor vecino
    "https://api.nubefact.com.evil.pe/api/v1/x",    # sufijo enganoso
    "https://evilnubefact.com/api/v1/x",
    "https://api.nubefact.com:8443/api/v1/x",       # otro puerto
    "https://user:clave@api.nubefact.com/api/v1/x",
    "https://api.nubefact.com/otra-cosa",           # no es la API
    "file:///etc/passwd",
    "gopher://api.nubefact.com/api/v1/x",
    "no es una url",
]


@puro
@pytest.mark.parametrize("ruta", BUENAS)
def test_ruta_nubefact_valida_se_acepta(ruta):
    assert server.validar_ruta_nubefact(ruta) == ruta


@puro
@pytest.mark.parametrize("ruta", MALAS)
def test_ruta_nubefact_no_permitida_se_rechaza(ruta):
    with pytest.raises(ValueError):
        server.validar_ruta_nubefact(ruta)
    with pytest.raises(ValidationError):
        server.TenantInvoicingConfig(nubefact_ruta=ruta)


@puro
def test_ruta_vacia_no_cambia_nada():
    assert server.TenantInvoicingConfig(nubefact_ruta="  ").nubefact_ruta is None


class _ClienteQueNoDebeUsarse:
    def __init__(self, *a, **k):
        raise AssertionError("no se debia salir a la red")


@puro
def test_ruta_guardada_antes_de_la_validacion_no_sale_a_la_red(monkeypatch):
    monkeypatch.setattr(server.httpx, "AsyncClient", _ClienteQueNoDebeUsarse)
    r = asyncio.run(server.NubeFactService._live_request(
        {"nubefact_ruta": "http://10.0.0.5/x", "nubefact_token": "t"}, {}))
    assert r["success"] is False and "no permitida" in r["error"]


@puro
def test_envio_asincrono_con_timeout_corto_y_sin_redirecciones(monkeypatch):
    visto = {}

    class Respuesta:
        def json(self):
            return {"aceptada_por_sunat": True, "enlace_del_pdf": "x"}

    class Cliente:
        def __init__(self, timeout, follow_redirects):
            visto.update(timeout=timeout, follow_redirects=follow_redirects)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, json, headers):
            visto["url"] = url
            return Respuesta()

    async def publica(host):
        visto["host"] = host

    monkeypatch.setattr(server.httpx, "AsyncClient", Cliente)
    monkeypatch.setattr(server, "_host_resuelve_a_publica", publica)
    r = asyncio.run(server.NubeFactService._live_request(
        {"nubefact_ruta": BUENAS[0], "nubefact_token": "t"}, {"x": 1}))
    assert r["success"] is True
    assert visto["follow_redirects"] is False
    assert visto["timeout"].read <= 10 and visto["timeout"].connect <= 5
    assert visto["host"] == "api.nubefact.com"


@puro
def test_host_que_resuelve_a_red_privada_se_rechaza(monkeypatch):
    async def falso_dns(self, host, puerto, **k):
        return [(2, 1, 6, "", ("10.0.0.5", 443))]
    monkeypatch.setattr(asyncio.BaseEventLoop, "getaddrinfo", falso_dns)
    with pytest.raises(ValueError):
        asyncio.run(server._host_resuelve_a_publica("api.nubefact.com"))


@puro
def test_send_invoice_ya_no_usa_requests():
    fuente = (BACKEND / "server.py").read_text(encoding="utf-8")
    codigo = [linea.split("#", 1)[0] for linea in fuente.splitlines()]
    assert not any("requests.post(" in linea for linea in codigo)
    assert "import requests" not in fuente


# ===========================================================================
# 5. Bitacora sin el token
# ===========================================================================

@puro
def test_bitacora_redacta_el_token_de_nubefact():
    datos = server._config_facturacion_para_bitacora(
        server.TenantInvoicingConfig(nubefact_ruta=BUENAS[0], nubefact_token="secreto-123"))
    assert datos["nubefact_token"] == "***redactado***"
    assert datos["nubefact_ruta"] == BUENAS[0]
    assert "secreto-123" not in str(datos)


# ===========================================================================
# 3. Importes
# ===========================================================================

@puro
@pytest.mark.parametrize("modelo,campos", [
    (server.PaymentCreate, {"method": "EFECTIVO", "amount": -10}),
    (server.PaymentCreate, {"method": "EFECTIVO", "amount": 0}),
    (server.CashShiftClose, {"counted_cash": -1}),
    (server.CashShiftOpen, {"opening_amount": -5}),
    (server.CashMovementCreate, {"type": "OUT", "amount": 0, "reason": "x"}),
    (server.ChargeCreate, {"concept": "x", "unit_price": -5}),
    (server.ChargeCreate, {"concept": "x", "unit_price": 5, "quantity": 0}),
])
def test_importes_negativos_o_cero_no_validan(modelo, campos):
    with pytest.raises(ValidationError):
        modelo(**campos)


@puro
def test_arqueo_en_cero_si_es_valido():
    assert server.CashShiftClose(counted_cash=0).counted_cash == 0


# ===========================================================================
# 6. Documentacion de la API
# ===========================================================================

@puro
def test_docs_ocultos_por_defecto():
    assert not server._docs_activos() or os.environ.get("ZENSTAY_DOCS")
    cliente = _cliente_sin_base()
    for ruta in ("/docs", "/redoc", "/openapi.json"):
        assert cliente.get(ruta).status_code == 404, ruta


@puro
def test_docs_se_encienden_solo_con_la_variable(monkeypatch):
    monkeypatch.delenv("ZENSTAY_DOCS", raising=False)
    assert server._docs_activos() is False
    monkeypatch.setenv("ZENSTAY_DOCS", "1")
    assert server._docs_activos() is True


# ===========================================================================
# 7. Cabeceras de seguridad
# ===========================================================================

ESPERADAS = {
    "strict-transport-security": "max-age=31536000",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=()",
    "content-security-policy-report-only": "frame-ancestors 'none'",
}


@puro
@pytest.mark.parametrize("ruta", ["/api/health", "/no-existe-xyz", "/terminos", "/robots.txt"])
def test_cabeceras_de_seguridad_presentes(ruta):
    r = _cliente_sin_base().get(ruta)
    for nombre, contiene in ESPERADAS.items():
        assert contiene in r.headers.get(nombre, ""), (ruta, nombre)


@puro
def test_la_csp_se_aplica_solo_con_la_variable(monkeypatch):
    monkeypatch.setenv("ZENSTAY_CSP_APLICAR", "1")
    r = _cliente_sin_base().get("/api/health")
    assert "content-security-policy" in r.headers
    assert "content-security-policy-report-only" not in r.headers


@puro
def test_las_cabeceras_van_tambien_en_el_429():
    import cabeceras_seguridad

    async def app_ok(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    pila = cabeceras_seguridad.CabecerasSeguridad(
        limites.LimitePeticiones(app_ok, reglas=[(None, "/api", 1, 60)]))
    estados = []

    async def correr():
        for _ in range(2):
            recogido = {}

            async def send(m):
                if m["type"] == "http.response.start":
                    recogido.update(status=m["status"], headers=dict(m["headers"]))

            async def receive():
                return {"type": "http.request", "body": b""}

            await pila({"type": "http", "method": "GET", "path": "/api/x",
                        "headers": [(b"cf-connecting-ip", b"203.0.113.50")]}, receive, send)
            estados.append(recogido)
    asyncio.run(correr())
    assert estados[1]["status"] == 429
    assert estados[1]["headers"][b"x-content-type-options"] == b"nosniff"


# ===========================================================================
# 9. 404 de verdad, barra final y la SPA
# ===========================================================================

@puro
def test_ruta_inventada_da_404_real_y_noindex():
    r = _cliente_sin_base().get("/no-existe-xyz")
    assert r.status_code == 404
    assert "noindex" in r.headers.get("x-robots-tag", "")
    assert "noindex" in r.text


@puro
@pytest.mark.parametrize("ruta,destino", [
    ("/precios/", "/precios"),
    ("/terminos/", "/terminos"),
    ("/privacidad/?a=1", "/privacidad?a=1"),
    ("/comprar/pro/", "/comprar/pro"),
])
def test_barra_final_redirige_301_sin_barra(ruta, destino):
    r = _cliente_sin_base().get(ruta)
    assert r.status_code == 301
    assert r.headers["location"] == destino


@puro
def test_api_inexistente_es_404_json():
    r = _cliente_sin_base().get("/api/no-existe")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")


@pytest.fixture
def build_minimo(tmp_path, monkeypatch):
    """Un frontend/build de juguete: index.html con su title y un logo."""
    build = tmp_path / "build"
    (build / "static").mkdir(parents=True)
    (build / "index.html").write_text(
        "<!doctype html><html><head><title>ZenStay PMS</title></head>"
        "<body><div id=root></div></body></html>", encoding="utf-8")
    (build / "logo-zenstay.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    monkeypatch.setattr(server, "FRONTEND_BUILD", build)
    return build


@puro
def test_con_build_la_landing_sale_con_title_y_canonical(build_minimo):
    r = _cliente_sin_base().get("/privacidad")
    assert r.status_code == 200
    assert "<title>" in r.text
    assert '<link rel="canonical" href="https://zenstay.sisac.pe/privacidad">' in r.text \
        or 'rel="canonical"' in r.text


@puro
@pytest.mark.parametrize("ruta", ["/dashboard", "/reservations", "/reservations/abc",
                                  "/guests/123", "/cash-shift", "/comprobantes"])
def test_rutas_privadas_de_la_spa_200_con_noindex(build_minimo, ruta):
    r = _cliente_sin_base().get(ruta)
    assert r.status_code == 200, ruta
    assert "ZenStay PMS" in r.text
    assert "noindex" in r.headers.get("x-robots-tag", "")


@puro
@pytest.mark.parametrize("ruta", ["/login", "/registro"])
def test_login_y_registro_si_son_indexables(build_minimo, ruta):
    r = _cliente_sin_base().get(ruta)
    assert r.status_code == 200
    assert "x-robots-tag" not in r.headers


@puro
@pytest.mark.parametrize("ruta", ["/no-existe-xyz", "/dashboard/extra/mas", "/wp-admin"])
def test_con_build_lo_desconocido_sigue_siendo_404(build_minimo, ruta):
    r = _cliente_sin_base().get(ruta)
    assert r.status_code == 404
    assert "noindex" in r.headers.get("x-robots-tag", "")
    assert "ZenStay PMS" not in r.text


@puro
def test_con_build_los_archivos_se_sirven(build_minimo):
    r = _cliente_sin_base().get("/logo-zenstay.png")
    assert r.status_code == 200
    assert _cliente_sin_base().get("/no-esta.png").status_code == 404


@puro
def test_rutas_spa_coinciden_con_app_js():
    """Si se anade una pantalla en App.js y no aqui, recargarla daria 404."""
    app_js = (REPO / "frontend" / "src" / "App.js").read_text(encoding="utf-8")
    rutas = re.findall(r'<Route path="/([^"]*)"', app_js)
    rutas = [r.replace(":id", "x") for r in rutas if r and r != "*"]
    assert rutas, "no se encontraron rutas en App.js"
    for ruta in rutas:
        assert server.RUTAS_SPA.fullmatch(ruta), ruta


# ===========================================================================
# 10-12. Imagenes, portada, og:image y sitemap
# ===========================================================================

@puro
def test_logo_optimizado_y_webp():
    from PIL import Image
    png = REPO / "frontend" / "public" / "logo-zenstay.png"
    webp = BACKEND / "landing" / "logo-zenstay.webp"
    assert png.stat().st_size < 30 * 1024
    assert webp.is_file() and webp.stat().st_size < 30 * 1024
    with Image.open(png) as im:
        assert max(im.size) <= 256
    portada = (BACKEND / "landing" / "index.html").read_text(encoding="utf-8")
    assert "/landing-assets/logo-zenstay.webp" in portada


@puro
def test_h1_de_la_portada_arranca_visible():
    portada = (BACKEND / "landing" / "index.html").read_text(encoding="utf-8")
    h1 = re.search(r"<h1[^>]*>", portada).group(0)
    assert "aparece" not in h1


@puro
def test_imagen_social_1200x630_y_summary_large_image():
    from PIL import Image
    with Image.open(BACKEND / "landing" / "og-zenstay.png") as im:
        assert im.size == (1200, 630)
    cabecera = seo.etiquetas_cabecera("", "ZenStay", "x")
    assert 'content="summary_large_image"' in cabecera
    assert "og-zenstay.png" in cabecera
    assert 'og:image:width" content="1200"' in cabecera
    assert 'og:image:height" content="630"' in cabecera
    # Se sirve desde la app, sin depender del build de la SPA.
    r = _cliente_sin_base().get(seo.IMAGEN_SOCIAL)
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"


@puro
def test_sitemap_sin_comprar_y_con_lastmod():
    planes = [{"codigo": "pro", "nombre": "Pro", "precio_mensual": 119}]
    xml = seo.sitemap(planes)
    assert "/comprar/" not in xml
    assert xml.count("<lastmod>") == xml.count("<loc>") == len(seo.PAGINAS_ESTATICAS)


# ===========================================================================
# Limitador: elevarlo SOLO en pruebas
# ===========================================================================

@puro
def test_factor_de_pruebas_por_defecto_es_uno(monkeypatch):
    monkeypatch.delenv(limites.VARIABLE_PRUEBAS, raising=False)
    assert limites.factor_de_pruebas() == 1
    for basura in ("abc", "0", "-5", "1"):
        monkeypatch.setenv(limites.VARIABLE_PRUEBAS, basura)
        assert limites.factor_de_pruebas() == 1


@puro
def test_factor_de_pruebas_multiplica_las_reglas_por_defecto(monkeypatch):
    monkeypatch.setenv(limites.VARIABLE_PRUEBAS, "1000")
    m = limites.LimitePeticiones(lambda *a: None)
    login = next(r for r in m.reglas if r[1] == "/api/auth/login")
    assert login[2] == 10 * 1000
    # Unas reglas propias (las de test_limites.py) no se tocan.
    propio = limites.LimitePeticiones(lambda *a: None, reglas=[(None, "/api", 3, 60)])
    assert propio.reglas[0][2] == 3


@puro
def test_regla_de_limite_para_correos():
    assert any(m == "POST" and p == "/api/notifications/send" for m, p, *_ in limites.REGLAS)


# ===========================================================================
# Contra Postgres
# ===========================================================================

_IPS = itertools.count(1)


async def _superusuario():
    return await asyncpg.connect(DSN)


async def _limpiar(conn):
    await conn.execute("delete from tenants where ruc = any($1::text[])", list(RUCS))
    await conn.execute("delete from users where email like $1", f"%@{DOMINIO}")


def _correr(cuerpo, monkeypatch):
    """Una prueba en UN bucle: base, app y cliente (ver test_mercadopago.py)."""
    monkeypatch.setenv("DATABASE_URL", DSN_APP)
    monkeypatch.setenv("COMPROBANTES_AVISOS", "0")

    async def envoltorio():
        db_pg._pool = None
        conn = await _superusuario()
        await _limpiar(conn)
        transporte = httpx.ASGITransport(app=server.app)
        try:
            ip = f"198.51.101.{next(_IPS)}"
            async with httpx.AsyncClient(transport=transporte, base_url="http://test",
                                         headers={"cf-connecting-ip": ip},
                                         follow_redirects=False) as cliente:
                return await cuerpo(conn, cliente)
        finally:
            await _limpiar(conn)
            await conn.close()
            await db_pg.close_pool()

    return asyncio.run(envoltorio())


async def _hotel(conn, ruc):
    tid = await conn.fetchval(
        """insert into tenants (name, ruc, razon_social, nombre_comercial, email,
                                plan_codigo, subscription_status, trial_ends_at)
           values ($1, $2, $1, $1, $3, 'prueba', 'prueba', now() + interval '10 days')
           returning id""",
        f"Hotel {ruc}", ruc, f"hotel-{ruc}@{DOMINIO}")
    return tid


async def _usuario(conn, tid, nombre, rol):
    email = f"{nombre}@{DOMINIO}"
    uid = await conn.fetchval(
        """insert into users (tenant_id, email, password_hash, full_name, role)
           values ($1, $2, $3, $4, $5) returning id""",
        tid, email, server.hash_password("clave-de-pruebas"), nombre, rol)
    return uid, email


def _cab(uid, email, rol, tid, extra=None):
    token = server.create_token(str(uid), email, rol, str(tid) if tid else None, extra)
    return {"Authorization": f"Bearer {token}"}


async def _datos(conn, tid, uid, sufijo):
    """Tipo, huesped, reserva, folio, cargo y comprobante de un hotel."""
    rt = await conn.fetchval(
        "insert into room_types (tenant_id, name, capacity, base_price) "
        "values ($1, 'Doble', 2, 100) returning id", tid)
    guest = await conn.fetchval(
        "insert into guests (tenant_id, doc_type, doc_number, full_name, email) "
        "values ($1, 'DNI', $2, 'Huesped', $3) returning id",
        tid, f"4000000{sufijo}", f"huesped-{sufijo}@{DOMINIO}")
    res = await conn.fetchval(
        "insert into reservations (tenant_id, code, guest_id, room_type_id, checkin_date, "
        "checkout_date, status) values ($1, 'RES-000001', $2, $3, $4, $5, 'CONFIRMED') "
        "returning id", tid, guest, rt, date(2026, 12, 1), date(2026, 12, 3))
    folio = await conn.fetchval(
        "insert into folios (tenant_id, reservation_id, total_charges, balance) "
        "values ($1, $2, 118, 118) returning id", tid, res)
    inv = await conn.fetchval(
        "insert into invoices (tenant_id, folio_id, type, series, number, client_doc_type, "
        "client_doc_number, client_name, subtotal, igv, total, status, issued_by) "
        "values ($1, $2, 'BOLETA', 'B001', 1, 'DNI', '40000001', 'Huesped', 100, 18, 118, "
        "'ACCEPTED', $3) returning id", tid, folio, uid)
    return {"room_type": rt, "guest": guest, "reservation": res, "folio": folio,
            "invoice": inv, "guest_email": f"huesped-{sufijo}@{DOMINIO}"}


# --- 2. Tokens revocables ---------------------------------------------------

@con_base
def test_token_expirado_invalido_o_de_usuario_inexistente_401(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        uid, email = await _usuario(conn, tid, "admin-a", "ADMIN")
        expirado = jwt.encode(
            {"user_id": str(uid), "email": email, "role": "ADMIN", "tenant_id": str(tid),
             "exp": datetime.now(timezone.utc) - timedelta(minutes=1)},
            server.JWT_SECRET, algorithm="HS256")
        otra_firma = jwt.encode(
            {"user_id": str(uid), "role": "SUPER_ADMIN",
             "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "otra-clave-que-no-es-la-del-servidor-0123456789", algorithm="HS256")
        casos = [
            {"Authorization": f"Bearer {expirado}"},
            {"Authorization": f"Bearer {otra_firma}"},
            {"Authorization": "Bearer basura"},
            {},
            _cab(uuid.uuid4(), "nadie@x.pe", "SUPER_ADMIN", None),
        ]
        for cabecera in casos:
            r = await cliente.get("/api/auth/me", headers=cabecera)
            assert r.status_code == 401, (cabecera, r.text)
    _correr(cuerpo, monkeypatch)


@con_base
def test_usuario_desactivado_401_con_el_token_aun_valido(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        uid, email = await _usuario(conn, tid, "recep-a", "RECEPTIONIST")
        cab = _cab(uid, email, "RECEPTIONIST", tid)
        assert (await cliente.get("/api/auth/me", headers=cab)).status_code == 200
        await conn.execute("update users set is_active = false where id = $1", uid)
        r = await cliente.get("/api/auth/me", headers=cab)
        assert r.status_code == 401
        assert (await cliente.get("/api/rooms", headers=cab)).status_code == 401
    _correr(cuerpo, monkeypatch)


@con_base
def test_el_rol_y_el_hotel_salen_de_la_base_no_del_token(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        tid_b = await _hotel(conn, RUC_B)
        uid, email = await _usuario(conn, tid, "admin-a", "ADMIN")
        cab = _cab(uid, email, "ADMIN", tid)
        assert (await cliente.get("/api/notifications/logs", headers=cab)).status_code == 200
        # Le bajan el rol: el token sigue diciendo ADMIN, la base manda.
        await conn.execute("update users set role = 'HOUSEKEEPING' where id = $1", uid)
        assert (await cliente.get("/api/notifications/logs", headers=cab)).status_code == 403
        # Un token que dice otro hotel no le da el otro hotel.
        await conn.execute("update users set role = 'ADMIN' where id = $1", uid)
        falso = _cab(uid, email, "ADMIN", tid_b)
        yo = (await cliente.get("/api/auth/me", headers=falso)).json()
        assert yo["tenant_id"] == str(tid)
        # Ni un token que se dice SUPER_ADMIN.
        inflado = _cab(uid, email, "SUPER_ADMIN", None)
        assert (await cliente.get("/api/tenants", headers=inflado)).status_code == 403
        # Ni la marca de "visita" de un SUPER_ADMIN.
        visita = _cab(uid, email, "ADMIN", tid_b, {"en_otro_hotel": True})
        assert (await cliente.get("/api/auth/me", headers=visita)).json()["tenant_id"] == str(tid)
    _correr(cuerpo, monkeypatch)


@con_base
def test_hotel_desactivado_corta_las_sesiones_abiertas(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        uid, email = await _usuario(conn, tid, "admin-a", "ADMIN")
        cab = _cab(uid, email, "ADMIN", tid)
        assert (await cliente.get("/api/rooms", headers=cab)).status_code == 200
        await conn.execute("update tenants set is_active = false where id = $1", tid)
        assert (await cliente.get("/api/rooms", headers=cab)).status_code == 403
    _correr(cuerpo, monkeypatch)


@con_base
def test_superadmin_de_visita_funciona_y_se_corta_si_pierde_el_rol(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        sid, email = await _usuario(conn, None, "dueno", "SUPER_ADMIN")
        visita = _cab(sid, email, "ADMIN", tid, {"en_otro_hotel": True, "hotel_nombre": "X"})
        yo = (await cliente.get("/api/auth/me", headers=visita)).json()
        assert yo["role"] == "ADMIN" and yo["tenant_id"] == str(tid) and yo["en_otro_hotel"]
        assert (await cliente.get("/api/tenants", headers=_cab(sid, email, "SUPER_ADMIN", None))
                ).status_code == 200
        await conn.execute("update users set role = 'ADMIN', tenant_id = $2 where id = $1",
                           sid, await _hotel(conn, RUC_B))
        r = await cliente.get("/api/auth/me", headers=visita)
        assert r.json()["tenant_id"] != str(tid)
        assert (await cliente.get("/api/tenants", headers=_cab(sid, email, "SUPER_ADMIN", None))
                ).status_code == 403
    _correr(cuerpo, monkeypatch)


# --- 3. Roles e importes ------------------------------------------------------

@con_base
def test_roles_en_cobros_caja_y_comprobantes(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        f, c, s = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        peticiones = [
            (f"/api/folios/{f}/charges/{c}/void", {"reason": "x"}),
            (f"/api/folios/{f}/payments", {"method": "EFECTIVO", "amount": 10}),
            (f"/api/cash-shifts/{s}/close", {"counted_cash": 10}),
            ("/api/invoices", {"folio_id": str(f), "type": "BOLETA", "client_doc_type": "DNI",
                               "client_doc_number": "40000001", "client_name": "X"}),
            ("/api/cash-shifts/open", {"opening_amount": 0}),
            (f"/api/cash-shifts/{s}/movements", {"type": "OUT", "amount": 5, "reason": "x"}),
        ]
        for rol in ("HOUSEKEEPING", "SECURITY"):
            uid, email = await _usuario(conn, tid, rol.lower(), rol)
            cab = _cab(uid, email, rol, tid)
            for ruta, cuerpo_json in peticiones:
                r = await cliente.post(ruta, json=cuerpo_json, headers=cab)
                assert r.status_code == 403, (rol, ruta, r.text)
        # Recepcion pasa el control de rol (y choca con lo que no existe).
        uid, email = await _usuario(conn, tid, "recep", "RECEPTIONIST")
        cab = _cab(uid, email, "RECEPTIONIST", tid)
        for ruta, cuerpo_json in peticiones[:4]:
            r = await cliente.post(ruta, json=cuerpo_json, headers=cab)
            assert r.status_code in (400, 404), (ruta, r.status_code, r.text)
    _correr(cuerpo, monkeypatch)


@con_base
def test_importe_negativo_422_por_http(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        uid, email = await _usuario(conn, tid, "admin-a", "ADMIN")
        cab = _cab(uid, email, "ADMIN", tid)
        f, s = uuid.uuid4(), uuid.uuid4()
        for ruta, cuerpo_json in [
            (f"/api/folios/{f}/payments", {"method": "EFECTIVO", "amount": -50}),
            (f"/api/folios/{f}/payments", {"method": "EFECTIVO", "amount": 0}),
            (f"/api/cash-shifts/{s}/close", {"counted_cash": -1}),
            (f"/api/folios/{f}/charges", {"concept": "x", "unit_price": -10}),
        ]:
            r = await cliente.post(ruta, json=cuerpo_json, headers=cab)
            assert r.status_code == 422, (ruta, r.text)
    _correr(cuerpo, monkeypatch)


# --- 4. Correos ---------------------------------------------------------------

@con_base
def test_notificacion_solo_a_gente_del_propio_hotel(monkeypatch):
    enviados = []

    async def falso_smtp(destino, asunto, html, texto=""):
        enviados.append(destino)
        return {"status": "sent"}
    monkeypatch.setattr(server, "send_email_async", falso_smtp)

    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        tid_b = await _hotel(conn, RUC_B)
        uid, email = await _usuario(conn, tid, "recep-a", "RECEPTIONIST")
        uid_b, _ = await _usuario(conn, tid_b, "admin-b", "ADMIN")
        mios = await _datos(conn, tid, uid, "1")
        ajenos = await _datos(conn, tid_b, uid_b, "2")
        cab = _cab(uid, email, "RECEPTIONIST", tid)

        def pedir(destino):
            return cliente.post("/api/notifications/send", headers=cab, json={
                "template": "CHECKOUT_REMINDER", "recipient_email": destino, "data": {}})

        assert (await pedir("victima@example.com")).status_code == 403
        assert (await pedir(ajenos["guest_email"])).status_code == 403
        assert (await pedir("admin-b@" + DOMINIO)).status_code == 403
        assert enviados == []

        r = await pedir(mios["guest_email"].upper())
        assert r.status_code == 200 and r.json()["status"] == "sent"
        r = await pedir(email)  # un usuario del propio hotel
        assert r.status_code == 200
        assert len(enviados) == 2

        # Limpieza no envia correos.
        uid_h, email_h = await _usuario(conn, tid, "limpieza", "HOUSEKEEPING")
        r = await cliente.post("/api/notifications/send",
                               headers=_cab(uid_h, email_h, "HOUSEKEEPING", tid),
                               json={"template": "CHECKOUT_REMINDER",
                                     "recipient_email": mios["guest_email"], "data": {}})
        assert r.status_code == 403

        # Tope por hotel.
        monkeypatch.setattr(server, "NOTIFICACIONES_POR_HORA", 2)
        assert (await pedir(mios["guest_email"])).status_code == 429
    _correr(cuerpo, monkeypatch)


# --- 1 y 5. Ruta y token de NubeFact por HTTP ----------------------------------

@con_base
def test_guardar_ruta_nubefact_por_http(monkeypatch):
    async def cuerpo(conn, cliente):
        tid = await _hotel(conn, RUC_A)
        uid, email = await _usuario(conn, tid, "admin-a", "ADMIN")
        cab = _cab(uid, email, "ADMIN", tid)
        for mala in ("http://169.254.169.254/latest", "https://10.0.0.1/api/v1/x",
                     "https://zenstay-postgres/api/v1/x"):
            r = await cliente.put(f"/api/tenants/{tid}/invoicing", headers=cab,
                                  json={"nubefact_ruta": mala, "nubefact_token": "t"})
            assert r.status_code == 422, (mala, r.text)
        assert await conn.fetchval("select nubefact_ruta from tenants where id = $1", tid) is None

        r = await cliente.put(f"/api/tenants/{tid}/invoicing", headers=cab,
                              json={"nubefact_ruta": BUENAS[0], "nubefact_token": "secreto-xyz"})
        assert r.status_code == 200, r.text
        fila = await conn.fetchrow("select nubefact_ruta, nubefact_token from tenants where id = $1", tid)
        assert (fila["nubefact_ruta"], fila["nubefact_token"]) == (BUENAS[0], "secreto-xyz")
        bitacora = await conn.fetchval(
            "select after_json from audit_logs where tenant_id = $1 and action = 'UPDATE_INVOICING'", tid)
        assert "secreto-xyz" not in str(bitacora)
        assert '"nubefact_token": "***redactado***"' in str(bitacora) or \
            "***redactado***" in str(bitacora)
    _correr(cuerpo, monkeypatch)


# --- Aislamiento entre hoteles -------------------------------------------------

@con_base
def test_un_admin_no_toca_comprobantes_cobros_ni_reservas_de_otro_hotel(monkeypatch):
    async def cuerpo(conn, cliente):
        tid_a = await _hotel(conn, RUC_A)
        tid_b = await _hotel(conn, RUC_B)
        uid_a, email_a = await _usuario(conn, tid_a, "admin-a", "ADMIN")
        uid_b, _ = await _usuario(conn, tid_b, "admin-b", "ADMIN")
        mios = await _datos(conn, tid_a, uid_a, "1")
        b = await _datos(conn, tid_b, uid_b, "2")
        await conn.execute("insert into cash_shifts (tenant_id, opening_amount, opened_by, status) "
                           "values ($1, 0, $2, 'OPEN')", tid_a, uid_a)
        cab = _cab(uid_a, email_a, "ADMIN", tid_a)

        r = await cliente.post(f"/api/invoices/{b['invoice']}/void", headers=cab,
                               json={"reason": "intruso"})
        assert r.status_code == 404
        assert await conn.fetchval("select status::text from invoices where id = $1",
                                   b["invoice"]) == "ACCEPTED"

        r = await cliente.post(f"/api/folios/{b['folio']}/payments", headers=cab,
                               json={"method": "EFECTIVO", "amount": 50})
        assert r.status_code == 404
        assert await conn.fetchval("select count(*) from payments where folio_id = $1",
                                   b["folio"]) == 0

        assert (await cliente.get(f"/api/reservations/{b['reservation']}",
                                  headers=cab)).status_code == 404
        assert (await cliente.get(f"/api/folios/{b['folio']}", headers=cab)).status_code == 404
        lista = (await cliente.get("/api/reservations", headers=cab)).json()
        ids = {x["id"] for x in lista}
        assert str(mios["reservation"]) in ids and str(b["reservation"]) not in ids

        # Crear en A una reserva que apunte al huesped y al tipo de B.
        r = await cliente.post("/api/reservations", headers=cab, json={
            "guest_id": str(b["guest"]), "room_type_id": str(b["room_type"]),
            "checkin_date": "2026-12-10", "checkout_date": "2026-12-12",
            "total_estimated": 200})
        assert r.status_code == 400, r.text
        r = await cliente.post("/api/reservations", headers=cab, json={
            "guest_id": str(mios["guest"]), "room_type_id": str(b["room_type"]),
            "checkin_date": "2026-12-10", "checkout_date": "2026-12-12",
            "total_estimated": 200})
        assert r.status_code == 400, r.text
        assert await conn.fetchval("select count(*) from reservations where tenant_id = $1",
                                   tid_a) == 1
        # Con lo suyo, si.
        r = await cliente.post("/api/reservations", headers=cab, json={
            "guest_id": str(mios["guest"]), "room_type_id": str(mios["room_type"]),
            "checkin_date": "2026-12-10", "checkout_date": "2026-12-12",
            "total_estimated": 200})
        assert r.status_code == 200, r.text
    _correr(cuerpo, monkeypatch)


# --- Alta publica -----------------------------------------------------------------

@con_base
def test_registro_con_ruc_o_correo_repetido_400(monkeypatch):
    async def cuerpo(conn, cliente):
        alta = {"hotel_name": "Hotel Registro", "ruc": RUC_REG, "admin_name": "Ana",
                "admin_email": f"registro@{DOMINIO}", "admin_password": "clave-larga-1"}
        r = await cliente.post("/api/registro", json=alta)
        assert r.status_code == 200, r.text
        r = await cliente.post("/api/registro", json={**alta, "admin_email": f"otro@{DOMINIO}"})
        assert r.status_code == 400 and "RUC" in r.json()["detail"]
        await conn.execute("delete from tenants where ruc = $1", RUC_REG)
        await conn.execute("delete from users where email = $1", f"otro@{DOMINIO}")
        tid = await _hotel(conn, RUC_A)
        await _usuario(conn, tid, "repetido", "ADMIN")
        r = await cliente.post("/api/registro", json={**alta, "admin_email": f"repetido@{DOMINIO}"})
        assert r.status_code == 400 and "correo" in r.json()["detail"]
        assert await conn.fetchval("select count(*) from tenants where ruc = $1", RUC_REG) == 0
    _correr(cuerpo, monkeypatch)


# --- Esquema + RLS + migraciones en base vacia -------------------------------------

def _sql_de_rls(clave: str) -> str:
    """db/rls.sql sin lo que es de psql: el \\gexec y la variable de la clave."""
    texto = (REPO / "db" / "rls.sql").read_text(encoding="utf-8")
    texto = re.sub(r"select 'create role app_backend login'.*?\\gexec", "", texto, flags=re.S)
    return texto.replace(":'app_backend_password'", "'" + clave.replace("'", "''") + "'")


@con_base
def test_esquema_rls_y_migraciones_en_base_vacia_fuerzan_rls_en_toda_tabla_con_tenant():
    base = f"zs_rls_{uuid.uuid4().hex[:8]}"

    async def correr():
        admin = await asyncpg.connect(DSN)
        try:
            await admin.execute(f'create database "{base}"')
            existe = await admin.fetchval("select 1 from pg_roles where rolname = 'app_backend'")
        finally:
            await admin.close()
        partes = DSN.rsplit("/", 1)
        conn = await asyncpg.connect(partes[0] + "/" + base)
        try:
            if not existe:
                await conn.execute("create role app_backend login")
            # La clave del rol no se toca: es del cluster, y otras bases de
            # este mismo Postgres de pruebas la usan.
            texto_rls = _sql_de_rls("x")
            texto_rls = re.sub(r"alter role app_backend with login password '[^']*';", "",
                               texto_rls)
            for archivo in ("schema.sql", "indexes.sql"):
                await conn.execute((REPO / "db" / archivo).read_text(encoding="utf-8"))
            await conn.execute(texto_rls)
            for migracion in sorted((REPO / "db" / "migrations").glob("*.sql")):
                await conn.execute(migracion.read_text(encoding="utf-8"))

            tablas = await conn.fetch(
                """select c.relname, c.relrowsecurity, c.relforcerowsecurity,
                          (select count(*) from pg_policies p
                            where p.schemaname = 'public' and p.tablename = c.relname) as politicas
                     from pg_class c
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public' and c.relkind = 'r'
                      and exists (select 1 from information_schema.columns col
                                   where col.table_schema = 'public'
                                     and col.table_name = c.relname
                                     and col.column_name = 'tenant_id')""")
            return [dict(t) for t in tablas]
        finally:
            await conn.close()
            admin = await asyncpg.connect(DSN)
            try:
                await admin.execute(f'drop database if exists "{base}" with (force)')
            finally:
                await admin.close()

    tablas = asyncio.run(correr())
    assert len(tablas) >= 15, tablas
    sin_rls = [t["relname"] for t in tablas
               if not (t["relrowsecurity"] and t["relforcerowsecurity"] and t["politicas"])]
    assert sin_rls == [], f"tablas con tenant_id sin RLS forzado o sin politica: {sin_rls}"
