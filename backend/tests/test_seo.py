"""sitemap.xml, robots.txt, llms.txt, JSON-LD, preguntas frecuentes y el bloque de confianza.

Corren sin Postgres, sin servidor y sin red:

    cd backend && python -m pytest tests/test_seo.py -q

Las rutas se prueban montando solo checkout.router en una aplicacion de
FastAPI aparte, con la lectura de planes sustituida por la lista de abajo.

LAS PRUEBAS QUE IMPORTAN

  test_el_faqpage_repite_exactamente_las_preguntas_visibles: Google trata como
  enganoso un FAQPage que no coincide con lo que se ve.
  test_no_queda_rastro_de_whatsapp: el flujo es automatico, sin hablar con
  nadie.
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
import dudas  # noqa: E402
import seo  # noqa: E402
from test_checkout_paginas import PLANES, PRO  # noqa: E402

pytestmark = pytest.mark.no_necesita_servidor

LANDING = Path(__file__).resolve().parent.parent / "landing"


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
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
    for ruta in ("/", "/precios", "/terminos", "/privacidad", "/reclamaciones"):
        assert base + ruta in locs, ruta
    # Auditoria 2026-11-09: los formularios de /comprar/* ya no van al
    # sitemap (se llega desde /precios); los pedidos nunca fueron.
    assert not any("/comprar/" in u or "/pedido/" in u or "/api/" in u for u in locs)
    # Cada URL lleva su <lastmod> en formato W3C (AAAA-MM-DD).
    fechas = [e.text for e in ElementTree.fromstring(r.content).findall("s:url/s:lastmod", ns)]
    assert len(fechas) == len(locs)
    assert all(re.fullmatch(r"\d{4}-\d{2}-\d{2}", f) for f in fechas)


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
    assert "SUNAT" not in texto
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


# --- Preguntas frecuentes --------------------------------------------------

def _visibles(pagina):
    import html as h
    seccion = pagina[pagina.index('<section class="faq"'):]
    seccion = seccion[:seccion.index("</section>")]
    pares = re.findall(r'<div class="faq-item"><h3>(.*?)</h3><p>(.*?)</p></div>', seccion)
    return [(h.unescape(p), h.unescape(r)) for p, r in pares]


def test_el_faqpage_repite_exactamente_las_preguntas_visibles():
    pagina = co.pagina_precios(PLANES, co.COMERCIO)
    visibles = _visibles(pagina)
    assert 6 <= len(visibles) <= 8
    (datos,) = _jsonld(pagina)
    (faq,) = [n for n in datos["@graph"] if n["@type"] == "FAQPage"]
    en_jsonld = [(q["name"], q["acceptedAnswer"]["text"]) for q in faq["mainEntity"]]
    assert en_jsonld == visibles


def test_las_preguntas_son_las_del_dueno_de_un_hostal():
    preguntas = [p for p, _ in dudas.preguntas()]
    for tema in ("tarjeta", "14 días", "pago", "factura", "cancelar", "datos", "celular"):
        assert any(tema in p for p in preguntas), tema
    respuestas = " ".join(r for _, r in dudas.preguntas())
    # Lo que no esta aprobado o no esta verificado no se promete. Yape y la
    # banca movil si (pago adelantado, aprobado por Kevin el 2026-11-08).
    for fuera in ("transferencia", "WhatsApp", "demo", "NubeFact", "huésped"):
        assert fuera not in respuestas, fuera


def test_como_pago_dice_exactamente_los_medios_del_pago_adelantado():
    """La frase de la especificacion, letra por letra, en la FAQ y en su FAQPage."""
    frase = "Paga con Yape, desde tu banca móvil (BCP, BBVA y otros) o con tarjeta"
    (respuesta,) = [r for p, r in dudas.preguntas() if p == "¿Cómo pago?"]
    assert respuesta.startswith(frase)
    assert "1, 3, 6 o 12 meses" in respuesta
    faq = dudas.faqpage()
    (entrada,) = [q for q in faq["mainEntity"] if q["name"] == "¿Cómo pago?"]
    assert entrada["acceptedAnswer"]["text"] == respuesta


def test_el_faqpage_solo_va_donde_se_ven_las_preguntas():
    paginas = _paginas()
    for nombre, pagina in paginas.items():
        tiene = any(n.get("@type") == "FAQPage"
                    for d in _jsonld(pagina) for n in d.get("@graph", []))
        assert tiene == (nombre == "precios"), nombre
    assert 'href="/precios#preguntas"' in paginas["index.html"]


def test_las_respuestas_leen_los_plazos_del_codigo(monkeypatch):
    import suscripciones
    monkeypatch.setattr(suscripciones, "DIAS_PRUEBA", 30)
    monkeypatch.setattr(suscripciones, "DIAS_GRACIA", 5)
    texto = " ".join(p + " " + r for p, r in dudas.preguntas())
    assert "30 días" in texto and "5 días" in texto and "14 días" not in texto


# --- El bloque de confianza ------------------------------------------------

def test_el_bloque_responde_las_dudas_en_orden_con_empieza_gratis():
    for nombre, pagina in _paginas().items():
        if nombre in ("terminos.html", "privacidad.html", "precios"):
            # En /precios no va el bloque: van las preguntas frecuentes enteras.
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
    pagina = co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                "", co.COMERCIO)
    assert "30 días gratis" in pagina and "5 días" in pagina


def test_empieza_gratis_desde_contratar_lleva_el_plan():
    pagina = co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                "", co.COMERCIO)
    assert '<a href="/registro?plan=pro" class="boton boton-lleno">Empieza gratis</a>' in pagina


# --- Sin WhatsApp ----------------------------------------------------------

def test_no_queda_rastro_de_whatsapp(monkeypatch):
    # Aunque alguien deje la variable vieja en el .env, no sale nada.
    monkeypatch.setenv("WHATSAPP_VENTAS", "51987654321")
    textos = list(_paginas().values())
    textos.append(seo.llms(PLANES, co.COMERCIO))
    textos.append((LANDING / "estilo.css").read_text(encoding="utf-8"))
    for texto in textos:
        assert "wa.me" not in texto
        assert "whatsapp" not in texto.lower()
        assert "51987654321" not in texto
        assert "<!-- zs:" not in texto
    raiz = Path(__file__).resolve().parent.parent
    for py in raiz.glob("*.py"):
        assert "wa.me" not in py.read_text(encoding="utf-8"), py.name
        assert "WHATSAPP_VENTAS" not in py.read_text(encoding="utf-8"), py.name


def test_el_checkout_de_mercado_pago_sigue_igual():
    pagina = co.pagina_checkout(PRO, "mensual", co.desglose(co.precio_de(PRO, "mensual")),
                                "", co.COMERCIO)
    assert pagina.count('<form class="co-caja co-formulario" method="post" action="/comprar"') == 2
    assert "Pagar S/ 119.00" in pagina
