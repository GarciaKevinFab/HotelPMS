"""
Lo que leen los buscadores y los asistentes de IA: metadatos, JSON-LD,
sitemap.xml, robots.txt y llms.txt.

FUNCIONES PURAS

  Todo recibe diccionarios (los planes de la tabla `planes`, los datos del
  comercio) y devuelve texto. Ni base de datos ni red: asi se prueba sin
  levantar nada (tests/test_seo.py) y las rutas de backend/checkout.py solo
  tienen que ir a buscar los planes y llamar aqui.

LOS PRECIOS SALEN DE LA BASE, NUNCA DE AQUI

  El JSON-LD (offers), el llms.txt y el "desde S/ X" de las descripciones se
  construyen con los planes que devuelve la base en ese momento. Si la base no
  responde, se omiten los precios en vez de inventarlos: un precio viejo en
  un resultado de Google o en la respuesta de un asistente es peor que ninguno.
  Tampoco hay reseñas ni valoraciones: no tenemos un sistema de reseñas, asi
  que no se declara ninguna (Google lo trata como marcado engañoso).
"""
import html
import json
import os
import re
from decimal import Decimal
from xml.sax.saxutils import escape as xml_escape

import dudas
import suscripciones


# Paginas publicas que se pueden indexar, con su ruta (sin barra inicial).
PAGINAS_ESTATICAS = ("", "precios", "terminos", "privacidad", "reclamaciones")

# La vista previa al compartir un enlace (WhatsApp, Facebook, X, LinkedIn).
# 1200x630 es la proporcion que todas pintan grande; antes era el logotipo
# cuadrado de 512 px y las redes lo mostraban como una miniatura. La genera
# tools/generar_imagenes_marca.py: solo marca y lema, sin cifras.
IMAGEN_SOCIAL = "/landing-assets/og-zenstay.png"
IMAGEN_SOCIAL_ANCHO = 1200
IMAGEN_SOCIAL_ALTO = 630
# El logotipo de la Organization del JSON-LD sigue siendo el cuadrado.
LOGO = "/logo512.png"

# <lastmod> del sitemap: la fecha en que cambio el CONTENIDO de cada pagina,
# no la del despliegue. Se mantiene a mano al editar la pagina; poner la
# fecha de hoy en todas cada vez le ensena a Google a ignorar el campo.
ULTIMA_REVISION = {
    "": "2026-11-09",
    "precios": "2026-11-09",
    "terminos": "2026-09-01",
    "privacidad": "2026-09-01",
    "reclamaciones": "2026-09-01",
}


def url_publica() -> str:
    """Origen publico del sitio (sin barra final)."""
    return os.getenv("ZENSTAY_URL_PUBLICA", "https://zenstay.sisac.pe").rstrip("/")


def url_de(ruta: str) -> str:
    ruta = ruta.strip("/")
    return f"{url_publica()}/{ruta}" if ruta else f"{url_publica()}/"


def _e(valor) -> str:
    return html.escape(str(valor if valor is not None else ""), quote=True)


def _precio(plan: dict) -> Decimal:
    return Decimal(str(plan.get("precio_mensual") or 0))


def planes_de_pago(planes: list) -> list:
    return [p for p in planes or [] if _precio(p) > 0]


def precio_desde(planes: list) -> Decimal | None:
    """El precio mensual mas bajo de pago, o None si no hay planes."""
    precios = [_precio(p) for p in planes_de_pago(planes)]
    return min(precios) if precios else None


def soles(monto: Decimal) -> str:
    """S/ 59 o S/ 59.50: sin decimales cuando son cero."""
    monto = Decimal(str(monto))
    return f"S/ {monto:,.0f}" if monto == monto.to_integral() else f"S/ {monto:,.2f}"


# ---------------------------------------------------------------------------
# <head>: canonical, Open Graph y Twitter
# ---------------------------------------------------------------------------

def etiquetas_cabecera(ruta: str, titulo: str, descripcion: str,
                       indexable: bool = True) -> str:
    """Etiquetas para el <head>. El <title> y la description ya van aparte."""
    url = url_de(ruta)
    imagen = url_publica() + IMAGEN_SOCIAL
    lineas = []
    if indexable:
        lineas.append(f'<link rel="canonical" href="{_e(url)}">')
    else:
        # Pedidos y demas paginas de un solo cliente: fuera del indice.
        lineas.append('<meta name="robots" content="noindex, nofollow">')
    lineas += [
        '<meta property="og:type" content="website">',
        '<meta property="og:site_name" content="ZenStay">',
        '<meta property="og:locale" content="es_PE">',
        f'<meta property="og:title" content="{_e(titulo)}">',
        f'<meta property="og:description" content="{_e(descripcion)}">',
        f'<meta property="og:url" content="{_e(url)}">',
        f'<meta property="og:image" content="{_e(imagen)}">',
        f'<meta property="og:image:width" content="{IMAGEN_SOCIAL_ANCHO}">',
        f'<meta property="og:image:height" content="{IMAGEN_SOCIAL_ALTO}">',
        '<meta property="og:image:alt" content="ZenStay, gestión para hoteles, hostales y hospedajes del Perú">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:title" content="{_e(titulo)}">',
        f'<meta name="twitter:description" content="{_e(descripcion)}">',
        f'<meta name="twitter:image" content="{_e(imagen)}">',
    ]
    return "\n".join(lineas)


# ---------------------------------------------------------------------------
# JSON-LD
# ---------------------------------------------------------------------------

def bloque_jsonld(datos: dict) -> str:
    """<script type="application/ld+json">. Es datos, no codigo: no se ejecuta.

    `<`, `>` y `&` van como escapes de JSON (\\u003c y compania) para que
    ningun texto -- una descripcion de la base, por ejemplo -- pueda cerrar la
    etiqueta antes de tiempo ni abrir otra. El JSON que se lee es el mismo.
    """
    cuerpo = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    cuerpo = (cuerpo.replace("<", "\\u003c").replace(">", "\\u003e")
              .replace("&", "\\u0026"))
    return f'<script type="application/ld+json">{cuerpo}</script>'


def _id(fragmento: str) -> str:
    return f"{url_publica()}/#{fragmento}"


def organizacion(comercio: dict) -> dict:
    punto = {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": comercio["email"],
        "areaServed": "PE",
        "availableLanguage": "es",
    }
    return {
        "@type": "Organization",
        "@id": _id("organizacion"),
        "name": "ZenStay",
        "legalName": comercio["razon_social"],
        "taxID": comercio["ruc"],
        "url": url_de(""),
        "logo": url_publica() + LOGO,
        "email": comercio["email"],
        "address": {
            "@type": "PostalAddress",
            "streetAddress": "Av. Madre de Dios N° 1087, Dpto. 201, A.H. Huerto Familiar",
            "addressLocality": "Tambopata",
            "addressRegion": "Madre de Dios",
            "addressCountry": "PE",
        },
        "contactPoint": [punto],
    }


def _oferta(plan: dict) -> dict:
    precio = _precio(plan)
    codigo = plan.get("codigo", "")
    if precio <= 0:
        return {
            "@type": "Offer",
            "name": f"ZenStay {plan.get('nombre', 'Prueba')}: 14 días gratis",
            "price": "0",
            "priceCurrency": "PEN",
            "url": url_de("registro"),
            "availability": "https://schema.org/InStock",
        }
    return {
        "@type": "Offer",
        "name": f"ZenStay {plan.get('nombre', '')}",
        "description": plan.get("descripcion") or "",
        "price": f"{precio:.2f}",
        "priceCurrency": "PEN",
        "url": url_de(f"comprar/{codigo}"),
        "availability": "https://schema.org/InStock",
        "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": f"{precio:.2f}",
            "priceCurrency": "PEN",
            "valueAddedTaxIncluded": True,
            "referenceQuantity": {"@type": "QuantitativeValue", "value": 1, "unitCode": "MON"},
        },
    }


def aplicacion(planes: list) -> dict:
    datos = {
        "@type": "SoftwareApplication",
        "@id": _id("software"),
        "name": "ZenStay",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Software de gestión hotelera (PMS)",
        "operatingSystem": "Web (navegador)",
        "inLanguage": "es-PE",
        "url": url_de(""),
        "description": ("Sistema de gestión para hoteles, hostales y hospedajes del Perú: "
                        "reservas, recepción, caja y arqueo, limpieza y mantenimiento."),
        "publisher": {"@id": _id("organizacion")},
    }
    ofertas = [_oferta(p) for p in planes or []]
    if ofertas:
        datos["offers"] = ofertas
    return datos


def grafo(planes: list, comercio: dict, preguntas: bool = False) -> dict:
    """Organization + SoftwareApplication y, en /precios, el FAQPage.

    `preguntas` solo va a True en la pagina que MUESTRA las preguntas: el
    FAQPage tiene que repetir exactamente lo visible.
    """
    nodos = [organizacion(comercio), aplicacion(planes)]
    if preguntas:
        nodos.append(dudas.faqpage())
    return {"@context": "https://schema.org", "@graph": nodos}


# ---------------------------------------------------------------------------
# Las paginas estaticas de backend/landing
# ---------------------------------------------------------------------------

_TITULO = re.compile(r"<title>(.*?)</title>", re.S)
_DESCRIPCION = re.compile(r'<meta name="description" content="([^"]*)"')


def preparar_landing(pagina: str, ruta: str, planes: list, comercio: dict) -> str:
    """Completa una pagina de backend/landing al servirla.

    - lang="es-PE", canonical, Open Graph y Twitter (titulo y descripcion
      salen de los que ya tiene la pagina, para que no puedan separarse).
    - En la portada: JSON-LD con los planes de la base y el bloque de
      confianza (las preguntas frecuentes completas estan en /precios).
    """
    pagina = pagina.replace('<html lang="es">', '<html lang="es-PE">', 1)

    titulo = _TITULO.search(pagina)
    descripcion = _DESCRIPCION.search(pagina)
    cabecera = etiquetas_cabecera(
        ruta,
        html.unescape(titulo.group(1).strip()) if titulo else "ZenStay",
        html.unescape(descripcion.group(1)) if descripcion else "",
    )
    if ruta == "":
        cabecera += "\n" + bloque_jsonld(grafo(planes, comercio))
    pagina = pagina.replace("</head>", cabecera + "\n</head>", 1)

    pagina = pagina.replace("<!-- zs:confianza -->", dudas.bloque_confianza(comercio))
    return pagina


# ---------------------------------------------------------------------------
# sitemap.xml, robots.txt y llms.txt
# ---------------------------------------------------------------------------

def sitemap(planes: list) -> str:
    """Solo las paginas de contenido, con su <lastmod>.

    Las de /comprar/* salieron en la auditoria 2026-11-09: son formularios de
    pago, una por plan, casi iguales entre si y sin nada que buscar. Se llega
    a ellas desde /precios, que si esta. `planes` se sigue recibiendo para no
    cambiar la firma que usa backend/checkout.py.
    """
    def url(ruta):
        lastmod = ULTIMA_REVISION.get(ruta)
        extra = f"<lastmod>{lastmod}</lastmod>" if lastmod else ""
        return f"  <url><loc>{xml_escape(url_de(ruta))}</loc>{extra}</url>"
    urls = "\n".join(url(r) for r in PAGINAS_ESTATICAS)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}\n</urlset>\n")


def robots() -> str:
    return ("User-agent: *\n"
            "Allow: /\n"
            "Disallow: /api/\n"
            "Disallow: /comprar/pedido/\n"
            "\n"
            f"Sitemap: {url_publica()}/sitemap.xml\n")


def _incluye_txt(plan: dict) -> str:
    tope = plan.get("max_habitaciones")
    partes = [f"hasta {tope} habitaciones" if tope else "habitaciones ilimitadas"]
    partes.append("reportes de ocupación, ADR y RevPAR" if plan.get("reportes_avanzados")
                  else "reportes básicos")
    return ", ".join(partes)


def llms(planes: list, comercio: dict) -> str:
    """Resumen factual del producto para asistentes de IA (llmstxt.org)."""
    sitio = url_publica()
    de_pago = planes_de_pago(planes)
    if de_pago:
        lineas_planes = [
            f"- {p.get('nombre')}: {soles(_precio(p))} al mes con IGV incluido; "
            f"{_incluye_txt(p)}. Contratar: {sitio}/comprar/{p.get('codigo')}"
            for p in de_pago
        ]
        lineas_planes.append(
            f"- Pago anual: se pagan {suscripciones.MESES_DEL_ANUAL} mensualidades y se usan 12 meses.")
    else:
        lineas_planes = [f"- Precios actualizados en {sitio}/precios"]

    return "\n".join([
        "# ZenStay",
        "",
        "> ZenStay es un software de gestión hotelera (PMS) en la web para hoteles, "
        "hostales y hospedajes del Perú: reservas, recepción, caja y limpieza en un "
        "solo sistema. Precios en soles con IGV incluido.",
        "",
        "## Qué hace",
        "",
        "- Tablero de habitaciones con su estado: ocupada, libre, por limpiar o fuera de servicio.",
        "- Reservas, check-in y check-out; el sistema no deja vender dos veces la misma noche.",
        "- Caja por turno: apertura, cobros por método de pago, salidas de caja y arqueo al cierre.",
        "- Limpieza y mantenimiento de habitaciones.",
        "- Reportes de ocupación, ingreso por habitación, ADR y RevPAR (según el plan).",
        "- Varios hoteles en una misma cuenta, con los datos de cada uno aislados.",
        "- Hecho para el Perú: soles, IGV al 18 %, DNI, RUC, ubigeo y hora de Lima.",
        "- Funciona en el navegador: computadora, tablet o celular, sin instalar nada.",
        "",
        "## Planes y precios",
        "",
        f"- Prueba gratuita de {suscripciones.DIAS_PRUEBA} días, sin tarjeta.",
        *lineas_planes,
        "- Sin costo de instalación ni permanencia.",
        "",
        "## Cómo se contrata y se paga",
        "",
        "- Al terminar la prueba se elige un plan y se paga en línea por Mercado Pago: "
        "con Yape, desde la banca móvil (BCP, BBVA y otros) o con tarjeta, por "
        "adelantado (1, 3, 6 o 12 meses), o como suscripción con tarjeta mensual o anual.",
        "- Por la suscripción se emite factura electrónica al RUC, o boleta.",
        "- Sin contrato: la suscripción se cancela desde la propia cuenta.",
        f"- Si no se contrata al terminar la prueba, el sistema sigue completo "
        f"{suscripciones.DIAS_GRACIA} días más; después ya no permite registrar reservas "
        "ni cobros, pero los datos se conservan y se pueden consultar.",
        "",
        "## Empresa",
        "",
        f"- Titular: {comercio['razon_social']}, RUC {comercio['ruc']}.",
        f"- Dirección: {comercio['direccion']}",
        f"- Correo: {comercio['email']}",
        "",
        "## Páginas",
        "",
        f"- [Inicio]({sitio}/): qué es ZenStay y para quién.",
        f"- [Precios]({sitio}/precios): planes y precios en soles.",
        f"- [Preguntas frecuentes]({sitio}/precios#preguntas)",
        f"- [Términos del servicio]({sitio}/terminos)",
        f"- [Política de privacidad]({sitio}/privacidad)",
        f"- [Libro de Reclamaciones]({sitio}/reclamaciones)",
        "",
    ])
