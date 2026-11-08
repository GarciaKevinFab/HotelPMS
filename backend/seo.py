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

import contacto

MESES_DEL_ANUAL = 10  # el mismo trato que checkout.MESES_DEL_ANUAL

# Paginas publicas que se pueden indexar, con su ruta (sin barra inicial).
PAGINAS_ESTATICAS = ("", "precios", "terminos", "privacidad", "reclamaciones")

IMAGEN_SOCIAL = "/logo512.png"


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
        '<meta property="og:image:alt" content="Logotipo de ZenStay">',
        '<meta name="twitter:card" content="summary">',
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
        "contactType": "sales",
        "email": comercio["email"],
        "areaServed": "PE",
        "availableLanguage": "es",
    }
    numero = contacto.whatsapp_ventas()
    if numero:
        punto["telephone"] = f"+{numero}"
    return {
        "@type": "Organization",
        "@id": _id("organizacion"),
        "name": "ZenStay",
        "legalName": comercio["razon_social"],
        "taxID": comercio["ruc"],
        "url": url_de(""),
        "logo": url_publica() + IMAGEN_SOCIAL,
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
                        "reservas, recepción, caja y arqueo, limpieza y comprobantes SUNAT."),
        "publisher": {"@id": _id("organizacion")},
    }
    ofertas = [_oferta(p) for p in planes or []]
    if ofertas:
        datos["offers"] = ofertas
    return datos


def grafo(planes: list, comercio: dict) -> dict:
    return {"@context": "https://schema.org",
            "@graph": [organizacion(comercio), aplicacion(planes)]}


# ---------------------------------------------------------------------------
# Las paginas estaticas de backend/landing
# ---------------------------------------------------------------------------

_TITULO = re.compile(r"<title>(.*?)</title>", re.S)
_DESCRIPCION = re.compile(r'<meta name="description" content="([^"]*)"')


def preparar_landing(pagina: str, ruta: str, planes: list, comercio: dict) -> str:
    """Completa una pagina de backend/landing al servirla.

    - lang="es-PE", canonical, Open Graph y Twitter (titulo y descripcion
      salen de los que ya tiene la pagina, para que no puedan separarse).
    - En la portada: JSON-LD con los planes de la base, el bloque de confianza
      y el WhatsApp flotante (solo si hay WHATSAPP_VENTAS).
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

    mensaje = contacto.MENSAJES["inicio"]
    pagina = pagina.replace("<!-- zs:confianza -->",
                            contacto.bloque_confianza(comercio, mensaje))
    flotante = contacto.flotante_whatsapp(mensaje) if ruta == "" else ""
    if flotante:
        # El credito de SISAC ocupa la misma esquina: se pasa a la izquierda
        # (para eso existe .sb-izquierda).
        pagina = pagina.replace('class="sb-credito sb-oscuro"',
                                'class="sb-credito sb-oscuro sb-izquierda"')
    pagina = pagina.replace("<!-- zs:whatsapp-flotante -->", flotante)
    return pagina


# ---------------------------------------------------------------------------
# sitemap.xml, robots.txt y llms.txt
# ---------------------------------------------------------------------------

def sitemap(planes: list) -> str:
    rutas = list(PAGINAS_ESTATICAS)
    rutas += [f"comprar/{p['codigo']}" for p in planes_de_pago(planes)]
    urls = "\n".join(f"  <url><loc>{xml_escape(url_de(r))}</loc></url>" for r in rutas)
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
    partes.append("boletas y facturas electrónicas SUNAT" if plan.get("facturacion_sunat")
                  else "comprobantes internos")
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
            f"- Pago anual: se pagan {MESES_DEL_ANUAL} mensualidades y se usan 12 meses.")
    else:
        lineas_planes = [f"- Precios actualizados en {sitio}/precios"]

    return "\n".join([
        "# ZenStay",
        "",
        "> ZenStay es un software de gestión hotelera (PMS) en la web para hoteles, "
        "hostales y hospedajes del Perú: reservas, recepción, caja, limpieza y "
        "comprobantes SUNAT en un solo sistema. Precios en soles con IGV incluido.",
        "",
        "## Qué hace",
        "",
        "- Tablero de habitaciones con su estado: ocupada, libre, por limpiar o fuera de servicio.",
        "- Reservas, check-in y check-out; el sistema no deja vender dos veces la misma noche.",
        "- Caja por turno: apertura, cobros por método de pago, salidas de caja y arqueo al cierre.",
        "- Limpieza y mantenimiento de habitaciones.",
        "- Boletas y facturas electrónicas SUNAT (según el plan).",
        "- Reportes de ocupación, ingreso por habitación, ADR y RevPAR (según el plan).",
        "- Varios hoteles en una misma cuenta, con los datos de cada uno aislados.",
        "- Hecho para el Perú: soles, IGV al 18 %, DNI, RUC, ubigeo y hora de Lima.",
        "",
        "## Planes y precios",
        "",
        "- Prueba gratuita de 14 días, sin tarjeta.",
        *lineas_planes,
        "- Sin costo de instalación ni permanencia.",
        "",
        "## Cómo se contrata y se paga",
        "",
        "- En línea con tarjeta, como suscripción procesada por Mercado Pago.",
        "- Por la suscripción se emite boleta o factura electrónica.",
        "- Empresas que pagan con orden de compra o transferencia: escribir a ventas "
        f"para recibir una cotización ({comercio['email']}).",
        "- Se puede pedir una demo de 20 minutos.",
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
        f"- [Términos del servicio]({sitio}/terminos)",
        f"- [Política de privacidad]({sitio}/privacidad)",
        f"- [Libro de Reclamaciones]({sitio}/reclamaciones)",
        "",
    ])
