"""
Hablar con una persona antes de pagar: WhatsApp de ventas y el bloque de confianza.

POR QUE EXISTE

  En el Peru el gerente de un hotel no mete la tarjeta en la web de alguien que
  no conoce. Antes de contratar quiere saber quien esta detras (razon social y
  RUC), que le van a dar comprobante, que puede pagar con orden de compra o
  transferencia si su empresa trabaja asi, y sobre todo hablar con alguien.
  Este modulo pone esas cuatro cosas junto a los precios. El checkout de
  Mercado Pago no se toca: esto es solo contacto.

EL NUMERO NO VA EN EL CODIGO

  Sale de la variable de entorno WHATSAPP_VENTAS (formato 51XXXXXXXXX: el 51
  del Peru y los nueve digitos del celular, sin + ni espacios). Si no esta
  definida -- o esta mal escrita -- no se pinta NINGUN boton de WhatsApp: un
  enlace a wa.me con un numero vacio o equivocado es peor que no tener enlace.
  En ese caso la demo y la cotizacion caen al correo de soporte.

  Se lee en cada peticion y no al importar: cambiar el numero es reiniciar el
  contenedor con otro .env, y en las pruebas basta con monkeypatch.setenv.

TODO ES HTML SIN JAVASCRIPT

  Son enlaces normales. Las paginas del checkout tienen una prueba que se cae
  si aparece un <script> o un manejador de evento (ver
  tests/test_checkout_paginas.py), y estos trozos se pintan tambien ahi.
"""
import html
import logging
import os
import re
from urllib.parse import quote

log = logging.getLogger("zenstay.contacto")

# 51 + nueve digitos que empiezan por 9: los celulares del Peru.
_NUMERO_VALIDO = re.compile(r"519\d{8}")

CORREO_VENTAS = "soporte@sisac.pe"

# Lo que llega escrito al chat segun desde donde se pulsa. Quien contesta sabe
# de entrada que miraba la persona, sin tener que preguntarlo.
MENSAJES = {
    "inicio": "Hola, quiero información sobre ZenStay para mi hospedaje.",
    "precios": "Hola, estoy viendo los planes de ZenStay y tengo una consulta.",
    "cotizacion": ("Hola, mi empresa paga con orden de compra o transferencia. "
                   "¿Me pueden enviar una cotización de ZenStay?"),
    "demo": "Hola, quiero agendar una demo de 20 minutos de ZenStay.",
}


def mensaje_plan(nombre: str, precio_txt: str = "") -> str:
    """Mensaje para el chat desde la pagina de contratar un plan."""
    precio = f" ({precio_txt})" if precio_txt else ""
    return f"Hola, me interesa contratar ZenStay {nombre}{precio}. Tengo una consulta antes de pagar."


def _e(valor) -> str:
    return html.escape(str(valor if valor is not None else ""), quote=True)


def whatsapp_ventas() -> str | None:
    """El numero de ventas, o None si no hay uno valido configurado."""
    numero = (os.getenv("WHATSAPP_VENTAS") or "").strip()
    if not numero:
        return None
    if not _NUMERO_VALIDO.fullmatch(numero):
        # Se avisa en el log y no se pinta nada: un numero mal escrito
        # mandaria a los clientes a hablar con un desconocido.
        log.warning("WHATSAPP_VENTAS no tiene el formato 51XXXXXXXXX; no se muestra WhatsApp")
        return None
    return numero


def enlace_whatsapp(mensaje: str) -> str | None:
    """https://wa.me/<numero>?text=<mensaje>, o None si no hay numero."""
    numero = whatsapp_ventas()
    if not numero:
        return None
    return f"https://wa.me/{numero}?text={quote(mensaje)}"


def _mailto(asunto: str) -> str:
    return f"mailto:{CORREO_VENTAS}?subject={quote(asunto)}"


# Icono de WhatsApp en SVG en linea (sin peticiones extra ni fuentes de iconos).
_ICONO = (
    '<svg class="wa-icono" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" '
    'focusable="false"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 '
    '10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 '
    '20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 '
    '1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 '
    '3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 '
    '1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>'
)


def boton_whatsapp(mensaje: str, texto: str = "Escríbenos por WhatsApp",
                   clase: str = "boton boton-linea boton-wa") -> str:
    """Enlace a WhatsApp con el mensaje ya escrito. Cadena vacia si no hay numero."""
    url = enlace_whatsapp(mensaje)
    if not url:
        return ""
    return (f'<a href="{_e(url)}" class="{_e(clase)}" target="_blank" '
            f'rel="noopener">{_ICONO}<span>{_e(texto)}</span></a>')


def flotante_whatsapp(mensaje: str) -> str:
    """Boton flotante y discreto en la esquina. Cadena vacia si no hay numero."""
    url = enlace_whatsapp(mensaje)
    if not url:
        return ""
    return (f'<a href="{_e(url)}" class="wa-flotante" target="_blank" rel="noopener" '
            f'aria-label="Escríbenos por WhatsApp (se abre en una pestaña nueva)">'
            f'{_ICONO}<span class="wa-flotante-texto">WhatsApp</span></a>')


def bloque_confianza(comercio: dict, mensaje: str) -> str:
    """Quien vende, que comprobante da y como hablar con una persona.

    Va junto a los precios. `mensaje` es el texto del boton principal de
    WhatsApp (depende de la pagina). Sin WHATSAPP_VENTAS el bloque sigue
    saliendo -- la razon social, el RUC y el comprobante no dependen de ningun
    numero -- pero la cotizacion y la demo van por correo.
    """
    hay_whatsapp = whatsapp_ventas() is not None
    if hay_whatsapp:
        cotizacion = enlace_whatsapp(MENSAJES["cotizacion"])
        demo = enlace_whatsapp(MENSAJES["demo"])
        destino = ' target="_blank" rel="noopener"'
    else:
        cotizacion = _mailto("Cotización de ZenStay para mi empresa")
        demo = _mailto("Quiero agendar una demo de ZenStay")
        destino = ""

    principal = boton_whatsapp(mensaje)
    if not principal:
        principal = (f'<a href="mailto:{_e(comercio["email"])}" class="boton boton-linea">'
                     f'Escríbenos a {_e(comercio["email"])}</a>')

    return f"""
    <aside class="confianza" aria-labelledby="confianza-titulo">
      <h2 id="confianza-titulo" class="confianza-titulo">¿Prefieres hablar con una persona antes de contratar?</h2>
      <ul class="confianza-lista">
        <li><strong>Empresa peruana:</strong> {_e(comercio['razon_social'])}, RUC {_e(comercio['ruc'])}.</li>
        <li><strong>Emitimos boleta o factura electrónica</strong> por tu suscripción.</li>
        <li>¿Tu empresa paga con orden de compra o transferencia?
            <a href="{_e(cotizacion)}"{destino}>Escríbenos y te enviamos una cotización</a>.</li>
        <li><a href="{_e(demo)}"{destino}>Agenda una demo de 20 minutos</a> y te mostramos el sistema funcionando.</li>
      </ul>
      <div class="confianza-acciones">{principal}</div>
    </aside>"""
