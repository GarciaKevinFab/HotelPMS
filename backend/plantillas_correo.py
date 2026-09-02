"""
Plantillas de correo de ZenStay.
================================
Un solo sitio donde se decide como se ve un correo del sistema. Antes cada
plantilla traia su HTML a mano dentro de generate_email_template, con azul
#1E3A5F -un color que no esta en la marca-, sin logotipo y sin version en
texto plano.

POR QUE ESTA ESCRITO ASI Y NO COMO UNA PAGINA NORMAL

El correo se pinta en clientes que van veinte anos por detras del navegador:
Outlook de escritorio usa el motor de Word. De ahi las tres reglas que
gobiernan el archivo entero.

1. TABLAS, NO DIVS. Ni flex ni grid: no existen. Maquetacion con tablas
   anidadas y role="presentation", para que los lectores de pantalla no las
   anuncien como si fueran datos.

2. ESTILOS EN LINEA. Varios clientes de Gmail descartan el <style> del <head>.
   Lo que no vaya en el atributo style de cada etiqueta, no existe.

3. FONDOS EXPLICITOS EN CADA CELDA. Sin ellos el modo oscuro de algunos
   clientes invierte los colores por su cuenta y deja texto ilegible.

LAS IMAGENES SE BLOQUEAN, Y EL CORREO TIENE QUE AGUANTARLO

Outlook y buena parte de Gmail no cargan imagenes remotas sin permiso. El
logotipo no es la unica marca del mensaje: va sobre la banda crema con la
franja terracota debajo, lleva alt con el nombre, y ningun dato vive solo
dentro de una imagen.

EL HOTEL MANDA, NO ZENSTAY

Estos correos los recibe el HUESPED de un hotel, no el cliente de ZenStay. El
nombre que preside el mensaje es el del hotel; ZenStay firma abajo, en letra
pequena. Al reves seria confuso: el huesped no sabe -ni tiene por que- que
software usa el hotel donde durmio.
"""
import html as _html

MARCA = "ZenStay"
SITIO = "https://zenstay.sisac.pe"
LOGO = SITIO + "/correo-zenstay.png"
LOGO_ANCHO = 132

TERRACOTA = "#B84A2B"     # el acento de la marca
CREMA = "#F7F3EB"         # el mismo fondo del archivo del logotipo
TINTA = "#2A2320"
TEXTO = "#4A423C"
TENUE = "#8A7F76"
LINEA = "#E8E1D7"
LIENZO = "#F2EEE7"
PIE = "#FAF7F2"

TIPO = ("-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,"
        "sans-serif")


class Marcado(str):
    """Texto que YA es HTML y no debe escaparse."""


def _e(v):
    return _html.escape(str(v if v is not None else ""), quote=True)


def _t(v):
    return str(v) if isinstance(v, Marcado) else _e(v)


def _filas(filas):
    """Etiqueta arriba en versalitas, valor debajo en grande.

    En dos columnas, a 320 px -que es un movil- el valor se parte en tres
    lineas o hay que encogerlo hasta lo ilegible.
    """
    if not filas:
        return ""
    trozos = []
    for i, (etiqueta, valor) in enumerate(filas):
        borde = "" if i == 0 else "border-top:1px solid %s;" % LINEA
        trozos.append(
            '<tr><td style="%spadding:14px 0 12px;">'
            '<div style="font:600 11px/1.2 %s;letter-spacing:.08em;'
            'text-transform:uppercase;color:%s;padding-bottom:5px;">%s</div>'
            '<div style="font:500 16px/1.45 %s;color:%s;">%s</div></td></tr>'
            % (borde, TIPO, TENUE, _e(etiqueta), TIPO, TINTA, _t(valor)))
    return ('<table role="presentation" width="100%" cellpadding="0" '
            'cellspacing="0" border="0" style="margin:26px 0 6px;">'
            + "".join(trozos) + "</table>")


def _boton(boton):
    """Boton a prueba de Outlook: el area pulsable la da la celda, no el <a>."""
    if not boton:
        return ""
    return ('<table role="presentation" cellpadding="0" cellspacing="0" '
            'border="0" style="margin:30px 0 8px;"><tr>'
            '<td bgcolor="%s" style="border-radius:8px;">'
            '<a href="%s" style="display:inline-block;padding:15px 32px;'
            'font:600 15px/1 %s;color:#FFFFFF;text-decoration:none;'
            'border-radius:8px;">%s</a></td></tr></table>'
            % (TERRACOTA, _e(boton["url"]), TIPO, _e(boton["texto"])))


def _parrafos(lineas, color=TEXTO, tam=15):
    return "".join(
        '<p style="margin:0 0 14px;font:400 %dpx/1.65 %s;color:%s;">%s</p>'
        % (tam, TIPO, color, _t(l)) for l in lineas)


def documento(titulo, hotel="", intro=(), filas=(), boton=None, aviso=None,
              cierre=(), preencabezado=""):
    oculto = ""
    if preencabezado:
        oculto = ('<div style="display:none;max-height:0;overflow:hidden;'
                  'opacity:0;mso-hide:all;">%s%s</div>'
                  % (_e(preencabezado), "&#8203;&nbsp;" * 60))

    # El nombre del hotel preside el mensaje; el logotipo de ZenStay queda
    # arriba como sello del sistema, no como remitente.
    cabecera_hotel = ""
    if hotel:
        cabecera_hotel = ('<p style="margin:0 0 6px;font:600 12px/1.3 %s;'
                          'letter-spacing:.1em;text-transform:uppercase;'
                          'color:%s;">%s</p>' % (TIPO, TERRACOTA, _e(hotel)))

    caja_aviso = ""
    if aviso:
        caja_aviso = ('<table role="presentation" width="100%%" cellpadding="0" '
                      'cellspacing="0" border="0" style="margin:24px 0 0;"><tr>'
                      '<td style="background:%s;border-left:3px solid %s;'
                      'padding:14px 16px;">'
                      '<p style="margin:0;font:400 13px/1.6 %s;color:%s;">%s</p>'
                      '</td></tr></table>'
                      % (PIE, LINEA, TIPO, TENUE, _t(aviso)))

    return """<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>%(titulo)s</title></head>
<body style="margin:0;padding:0;background:%(lienzo)s;">
%(oculto)s
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0"
       border="0" style="background:%(lienzo)s;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0"
         border="0" style="width:100%%;max-width:600px;background:#FFFFFF;
         border:1px solid %(linea)s;border-radius:12px;overflow:hidden;">

    <tr><td align="center" style="background:%(crema)s;padding:26px 24px 20px;">
      <img src="%(logo)s" width="%(logo_ancho)d" alt="%(marca)s"
           style="display:block;border:0;width:%(logo_ancho)dpx;max-width:44%%;
                  height:auto;font:700 18px/1.2 %(tipo)s;color:%(tinta)s;">
    </td></tr>
    <tr><td style="background:%(terracota)s;height:4px;line-height:4px;
                   font-size:0;">&nbsp;</td></tr>

    <tr><td style="padding:34px 36px 30px;background:#FFFFFF;">
      %(hotel)s
      <h1 style="margin:0 0 18px;font:700 23px/1.3 %(tipo)s;color:%(tinta)s;
                 letter-spacing:-.01em;">%(titulo)s</h1>
      %(intro)s
      %(filas)s
      %(boton)s
      %(cierre)s
      %(aviso)s
    </td></tr>

    <tr><td style="background:%(pie)s;border-top:1px solid %(linea)s;
                   padding:22px 36px 26px;">
      <p style="margin:0 0 5px;font:600 13px/1.5 %(tipo)s;
                color:%(texto)s;">%(marca)s</p>
      <p style="margin:0 0 10px;font:400 12px/1.6 %(tipo)s;color:%(tenue)s;">
        Software de gestión hotelera &middot;
        <a href="%(sitio)s" style="color:%(tenue)s;text-decoration:underline;"
           >zenstay.sisac.pe</a>
      </p>
      <p style="margin:0;font:400 11px/1.6 %(tipo)s;color:#A79C92;">
        Correo automático, no hace falta responder.
        Un producto de Star Insights IT by SISAC.
      </p>
    </td></tr>

  </table>
</td></tr></table>
</body></html>""" % {
        "titulo": _e(titulo), "oculto": oculto, "lienzo": LIENZO,
        "linea": LINEA, "logo": LOGO, "logo_ancho": LOGO_ANCHO,
        "marca": MARCA, "tipo": TIPO, "tinta": TINTA, "crema": CREMA,
        "terracota": TERRACOTA, "texto": TEXTO, "tenue": TENUE, "pie": PIE,
        "sitio": SITIO, "hotel": cabecera_hotel, "intro": _parrafos(intro),
        "filas": _filas(filas), "boton": _boton(boton), "aviso": caja_aviso,
        "cierre": _parrafos(cierre, color=TENUE, tam=14),
    }


def version_texto(titulo, hotel="", intro=(), filas=(), boton=None, aviso=None,
                  cierre=(), preencabezado=""):
    """El correo entero en texto plano, no un resumen: hay clientes que solo
    pintan texto y los filtros penalizan lo que llega solo en HTML."""
    p = []
    if hotel:
        p += [hotel.upper(), ""]
    p += [titulo, "=" * len(titulo), ""]
    if intro:
        p += [str(l) for l in intro] + [""]
    if filas:
        p += ["%s: %s" % (e, v) for e, v in filas] + [""]
    if boton:
        p += ["%s:" % boton["texto"], boton["url"], ""]
    if cierre:
        p += [str(l) for l in cierre] + [""]
    if aviso:
        p += [str(aviso), ""]
    p += ["-" * 44, "%s — %s" % (MARCA, SITIO),
          "Correo automático, no hace falta responder.",
          "Un producto de Star Insights IT by SISAC."]
    return "\n".join(p)


def componer(**kw):
    """Devuelve (texto, html)."""
    return version_texto(**kw), documento(**kw)
