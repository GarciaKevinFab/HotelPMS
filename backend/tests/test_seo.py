"""sitemap.xml, robots.txt, llms.txt, JSON-LD y el WhatsApp de ventas.

Corren sin Postgres, sin servidor y sin red:

    cd backend && python -m pytest tests/test_seo.py -q

Las rutas se prueban montando solo checkout.router en una aplicacion de
FastAPI aparte, con la lectura de planes sustituida por la lista de abajo.

LA PRUEBA QUE IMPORTA

  test_sin_whatsapp_ventas_no_aparece_ningun_whatsapp. Sin la variable de
  entorno no puede salir un enlace a wa.me en ninguna pagina: un boton con un
  numero vacio o inventado manda a los clientes a ninguna parte.
"""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import checkout as co  # noqa: E402
import contacto  # noqa: E402
import seo  # noqa: E402
from test_checkout_paginas import PLANES, PRO  # noqa: E402

pytestmark = pytest.mark.no_necesita_servidor

LANDING = Path(__file__).resolve().parent.parent / "landing"
NUMERO = "51987654321"


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    monkeypatch.delenv("WHATSAPP_VENTAS", raising=False)
    monkeypatch.setenv("ZENSTAY_URL_PUBLICA", "https://zenstay.sisac.pe")


@pytest.fixture
def cliente(monkeypatch):
    async def planes():
        return PLANES
    monkeypatch.setattr(co, "_planes", planes)
    app = FastAPI()
    app.include_router(co.router)
    return TestClient(app)


def _paginas():
    """Todas las paginas publicas tal como salen del servidor."""
    paginas = {
        "precios": co.pagina_precios(PLANES, co.COMERCIO),
        "checkout": co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                       "", co.COMERCIO),
    }
    for ruta, archivo in (("", "index.html"), ("terminos", "terminos.html"),
                          ("privacidad", "privacidad.html")):
        paginas[archivo] = seo.preparar_landing(
            (LANDING / archivo).read_text(encoding="utf-8"), ruta, PLANES, co.COMERCIO)
    return paginas


def _jsonld(pagina):
    return [json.loads(b) for b in re.findall(
        r'<script type="application/ld\+json">(.*?)</script>', pagina, re.S)]


# --- robots.txt, sitemap.xml y llms.txt ------------------------------------

def test_robots_apunta_al_sitemap_y_deja_fuera_la_api(cliente):
    r = cliente.get("/robots.txt")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "Sitemap: https://zenstay.sisac.pe/sitemap.xml" in r.text
    assert "Disallow: /api/" in r.text
    assert "Disallow: /comprar/pedido/" in r.text
    assert cliente.head("/robots.txt").status_code == 200


def test_sitemap_es_xml_valido_con_las_paginas_publicas(cliente):
    r = cliente.get("/sitemap.xml")
    assert r.status_code == 200
    assert "xml" in r.headers["content-type"]
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    locs = [e.text for e in ElementTree.fromstring(r.content).findall("s:url/s:loc", ns)]
    base = "https://zenstay.sisac.pe"
    for ruta in ("/", "/precios", "/terminos", "/privacidad", "/reclamaciones",
                 "/comprar/basico", "/comprar/pro", "/comprar/empresa"):
        assert base + ruta in locs, ruta
    # El plan gratuito no se compra, y los pedidos son de un solo cliente.
    assert base + "/comprar/prueba" not in locs
    assert not any("/pedido/" in u or "/api/" in u for u in locs)


def test_sitemap_sin_base_sigue_respondiendo(monkeypatch):
    async def caida():
        raise RuntimeError("sin base")
    monkeypatch.setattr(co, "_planes", caida)
    app = FastAPI()
    app.include_router(co.router)
    r = TestClient(app).get("/sitemap.xml")
    assert r.status_code == 200
    assert "https://zenstay.sisac.pe/precios" in r.text
    assert "/comprar/" not in r.text


def test_llms_resume_el_producto_con_los_precios_de_la_base(cliente):
    r = cliente.get("/llms.txt")
    assert r.status_code == 200
    texto = r.text
    assert texto.startswith("# ZenStay\n")
    assert "\n> " in texto
    for plan in PLANES[1:]:
        assert f"{plan['nombre']}: S/ {plan['precio_mensual']:.0f} al mes" in texto
    assert "SOLUCIONES INFORMÁTICAS MDD S.A.C." in texto and "20490042068" in texto
    assert "factura electrónica al RUC" in texto
    assert "14 días, sin tarjeta" in texto
    assert "cancela desde la propia cuenta" in texto
    for fuera in ("demo", "cotización", "orden de compra"):
        assert fuera not in texto


def test_llms_sin_base_no_inventa_precios():
    texto = seo.llms([], co.COMERCIO)
    assert "S/" not in texto
    assert "https://zenstay.sisac.pe/precios" in texto


# --- JSON-LD ---------------------------------------------------------------

def test_jsonld_de_precios_lleva_los_precios_reales_y_nada_inventado():
    pagina = co.pagina_precios(PLANES, co.COMERCIO)
    (datos,) = _jsonld(pagina)
    tipos = {n["@type"]: n for n in datos["@graph"]}
    org, app = tipos["Organization"], tipos["SoftwareApplication"]
    assert org["taxID"] == "20490042068"
    assert org["legalName"] == "SOLUCIONES INFORMÁTICAS MDD S.A.C."
    precios = sorted(o["price"] for o in app["offers"])
    assert precios == ["0", "119.00", "199.00", "59.00"]
    assert all(o["priceCurrency"] == "PEN" for o in app["offers"])
    texto = json.dumps(datos)
    for prohibido in ("aggregateRating", "review", "ratingValue"):
        assert prohibido not in texto
    # No hay preguntas frecuentes visibles en ninguna pagina: no hay FAQPage.
    assert "FAQPage" not in texto


def test_la_portada_lleva_jsonld_y_las_legales_no():
    paginas = _paginas()
    assert _jsonld(paginas["index.html"])
    assert not _jsonld(paginas["terminos.html"])
    sin_planes = seo.preparar_landing(
        (LANDING / "index.html").read_text(encoding="utf-8"), "", [], co.COMERCIO)
    (datos,) = _jsonld(sin_planes)
    assert "offers" not in json.dumps(datos)


def test_jsonld_no_se_deja_cerrar_desde_un_texto():
    planes = [dict(PRO, descripcion="</script><script>alert(1)</script>")]
    pagina = co.pagina_precios(planes, co.COMERCIO)
    assert "<script>alert" not in pagina


# --- Metadatos por pagina --------------------------------------------------

def test_cada_pagina_publica_tiene_canonical_og_y_titulo_propio():
    titulos = set()
    canonicos = {
        "precios": "https://zenstay.sisac.pe/precios",
        "checkout": "https://zenstay.sisac.pe/comprar/pro",
        "index.html": "https://zenstay.sisac.pe/",
        "terminos.html": "https://zenstay.sisac.pe/terminos",
        "privacidad.html": "https://zenstay.sisac.pe/privacidad",
    }
    for nombre, pagina in _paginas().items():
        assert '<html lang="es-PE">' in pagina, nombre
        assert f'<link rel="canonical" href="{canonicos[nombre]}">' in pagina, nombre
        assert 'property="og:title"' in pagina and 'name="twitter:card"' in pagina, nombre
        assert len(re.findall(r"<h1[\s>]", pagina)) == 1, f"{nombre}: un solo h1"
        for img in re.findall(r"<img\b[^>]*>", pagina):
            assert "alt=" in img, f"{nombre}: imagen sin alt"
        titulo = re.search(r"<title>(.*?)</title>", pagina).group(1)
        assert titulo not in titulos, f"{nombre}: titulo repetido"
        titulos.add(titulo)


def test_el_pedido_no_se_indexa():
    pagina = co.pagina_pedido(
        {"numero": "ZS2609031422AAA111", "estado": "pendiente", "monto": 119.0,
         "periodo": "mensual"}, PRO, co.COMERCIO, "simulado")
    assert 'content="noindex, nofollow"' in pagina
    assert 'rel="canonical"' not in pagina


def test_el_precio_desde_sale_de_la_base():
    planes = [dict(p) for p in PLANES]
    planes[1]["precio_mensual"] = 65.0
    pagina = co.pagina_precios(planes, co.COMERCIO)
    titulo = re.search(r"<title>(.*?)</title>", pagina).group(1)
    assert "S/ 65" in titulo


# --- El bloque de confianza ------------------------------------------------

def test_el_bloque_responde_las_dudas_en_orden_con_empieza_gratis():
    for nombre, pagina in _paginas().items():
        if nombre in ("terminos.html", "privacidad.html"):
            assert 'class="confianza"' not in pagina, nombre
            continue
        bloque = pagina[pagina.index('<aside class="confianza"'):]
        bloque = bloque[:bloque.index("</aside>")]
        orden = ["14 días gratis, sin tarjeta",
                 "Al terminar eliges tu plan y pagas en línea",
                 "Factura electrónica a tu RUC",
                 "cancelas cuando quieras desde tu cuenta",
                 "no pierdes lo que cargaste",
                 "Empieza gratis",
                 "SOLUCIONES INFORMÁTICAS MDD S.A.C. · RUC 20490042068"]
        posiciones = [bloque.index(t) for t in orden]
        assert posiciones == sorted(posiciones), nombre
        assert "registro" in bloque, nombre
        # Lo que Kevin quito: nada de demos ni cotizaciones manuales.
        for fuera in ("demo", "cotización", "orden de compra", "Yape"):
            assert fuera not in bloque, f"{nombre}: {fuera}"


def test_los_dias_del_bloque_salen_del_codigo(monkeypatch):
    import suscripciones
    monkeypatch.setattr(suscripciones, "DIAS_PRUEBA", 30)
    monkeypatch.setattr(suscripciones, "DIAS_GRACIA", 5)
    pagina = co.pagina_precios(PLANES, co.COMERCIO)
    assert "30 días gratis" in pagina and "5 días" in pagina


def test_empieza_gratis_desde_contratar_lleva_el_plan():
    pagina = co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                "", co.COMERCIO)
    assert '<a href="/registro?plan=pro" class="boton boton-lleno">Empieza gratis</a>' in pagina


# --- WhatsApp de ventas ----------------------------------------------------

def test_sin_whatsapp_ventas_no_aparece_ningun_whatsapp():
    for nombre, pagina in _paginas().items():
        assert "wa.me" not in pagina, nombre
        assert "WhatsApp" not in pagina, nombre
        assert "<!-- zs:" not in pagina, f"{nombre}: marcador sin reemplazar"


@pytest.mark.parametrize("malo", ["987654321", "+51987654321", "51 987 654 321",
                                  "5198765432", "51187654321", "abc"])
def test_un_numero_mal_escrito_tampoco_se_muestra(monkeypatch, malo):
    monkeypatch.setenv("WHATSAPP_VENTAS", malo)
    assert contacto.whatsapp_ventas() is None
    assert "wa.me" not in co.pagina_precios(PLANES, co.COMERCIO)


def test_con_whatsapp_es_un_enlace_pequeno_solo_en_precios_y_contratar(monkeypatch):
    monkeypatch.setenv("WHATSAPP_VENTAS", NUMERO)
    paginas = _paginas()
    for nombre in ("precios", "checkout"):
        pagina = paginas[nombre]
        assert pagina.count(f"https://wa.me/{NUMERO}?text=") == 1, nombre
        assert '<p class="confianza-dudas">¿Dudas? <a href=' in pagina, nombre
        assert "Escríbenos por WhatsApp</a>" in pagina, nombre
    # El mensaje del checkout dice que plan se estaba mirando.
    assert "ZenStay%20Pro" in paginas["checkout"]
    # Ni en la portada ni en las legales, y en ningun sitio un flotante.
    for nombre in ("index.html", "terminos.html", "privacidad.html"):
        assert "wa.me" not in paginas[nombre], nombre
    for pagina in paginas.values():
        assert "wa-flotante" not in pagina
    # El JSON-LD no publica el numero.
    assert NUMERO not in json.dumps(_jsonld(paginas["precios"]))


def test_el_checkout_de_mercado_pago_sigue_igual(monkeypatch):
    monkeypatch.setenv("WHATSAPP_VENTAS", NUMERO)
    pagina = co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                "", co.COMERCIO)
    assert pagina.count('<form class="co-caja co-formulario" method="post" action="/comprar"') == 2
    assert "Pagar S/ 119.00" in pagina
