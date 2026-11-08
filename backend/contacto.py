"""
El bloque de confianza junto a los precios y el enlace de WhatsApp de ventas.

POR QUE EXISTE

  El dueño de un hostal no mete la tarjeta en la web de alguien que no conoce.
  Antes de pagar se pregunta, en este orden: ¿puedo probarlo sin pagar?, ¿y
  cuando termine como pago?, ¿me dan comprobante?, ¿me amarran a un contrato?,
  ¿y si no pago, pierdo lo que cargue? Este bloque responde eso, con el boton
  "Empieza gratis" al registro, y la razon social y el RUC como respaldo.

  No hay procesos manuales: ni demos agendadas ni cotizaciones por correo. La
  prueba de 14 dias es la demo, y el pago es el checkout de Mercado Pago.

CADA FRASE SALE DEL CODIGO, NO DE UN DESEO

  - 14 dias y sin tarjeta: suscripciones.DIAS_PRUEBA; POST /api/registro crea
    el hotel en 'prueba' sin pedir ningun medio de pago.
  - Cancelar desde la cuenta: POST /api/suscripcion/cancelar, boton "Cancelar
    suscripcion" en Configuracion (frontend SuscripcionHotel.jsx).
  - Al terminar la prueba sin pagar: el hotel pasa a 'vencida' y sigue con
    acceso DIAS_GRACIA dias; despues 'suspendida', que bloquea crear reservas,
    hacer check-in y registrar cargos y cobros (server.exigir_suscripcion),
    pero no la lectura. Nada se borra.
  Si cambia alguna de esas reglas, cambia esta frase.

EL NUMERO DE WHATSAPP NO VA EN EL CODIGO

  Sale de WHATSAPP_VENTAS (formato 51XXXXXXXXX). Sin la variable -- o mal
  escrita -- no se pinta ningun enlace de WhatsApp. Se lee en cada peticion.
  Solo aparece como un enlace pequeño en /precios y /comprar.

TODO ES HTML SIN JAVASCRIPT

  Las paginas del checkout tienen una prueba que se cae si aparece un <script>
  o un manejador de evento (tests/test_checkout_paginas.py).
"""
import html
import logging
import os
import re
from urllib.parse import quote

import suscripciones

log = logging.getLogger("zenstay.contacto")

# 51 + nueve digitos que empiezan por 9: los celulares del Peru.
_NUMERO_VALIDO = re.compile(r"519\d{8}")

# Lo que llega escrito al chat. Quien contesta sabe de entrada que miraba la
# persona, sin tener que preguntarlo.
MENSAJE_PRECIOS = "Hola, estoy viendo los planes de ZenStay y tengo una duda."


def mensaje_plan(nombre: str, precio_txt: str = "") -> str:
    """Mensaje para el chat desde la pagina de contratar un plan."""
    precio = f" ({precio_txt})" if precio_txt else ""
    return f"Hola, estoy por contratar ZenStay {nombre}{precio} y tengo una duda."


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


def enlace_dudas(mensaje: str) -> str:
    """El enlace pequeño "¿Dudas? Escríbenos por WhatsApp". Vacio sin numero."""
    url = enlace_whatsapp(mensaje)
    if not url:
        return ""
    return (f'<p class="confianza-dudas">¿Dudas? <a href="{_e(url)}" target="_blank" '
            f'rel="noopener">Escríbenos por WhatsApp</a></p>')


def bloque_confianza(comercio: dict, registro: str = "/registro",
                     mensaje_whatsapp: str | None = None) -> str:
    """Las dudas de quien compra, en orden, y el boton "Empieza gratis".

    `registro` es a donde lleva el boton (con ?plan= desde /comprar).
    `mensaje_whatsapp`: si se da y hay WHATSAPP_VENTAS, se añade el enlace
    pequeño de dudas. La portada no lo pasa.
    """
    dias = suscripciones.DIAS_PRUEBA
    gracia = suscripciones.DIAS_GRACIA
    dudas = enlace_dudas(mensaje_whatsapp) if mensaje_whatsapp else ""
    return f"""
    <aside class="confianza" aria-labelledby="confianza-titulo">
      <h2 id="confianza-titulo" class="confianza-titulo">Pruébalo {dias} días gratis, sin tarjeta</h2>
      <ul class="confianza-lista">
        <li><strong>Al terminar eliges tu plan y pagas en línea.</strong></li>
        <li><strong>Factura electrónica a tu RUC</strong>, o boleta si la prefieres.</li>
        <li><strong>Sin contrato:</strong> cancelas cuando quieras desde tu cuenta.</li>
        <li><strong>Si no contratas, no pierdes lo que cargaste:</strong> tienes {gracia} días
            más con el sistema completo; después ya no puedes registrar reservas ni cobros,
            pero tus datos siguen ahí para consultarlos.</li>
      </ul>
      <div class="confianza-acciones">
        <a href="{_e(registro)}" class="boton boton-lleno">Empieza gratis</a>
      </div>
      {dudas}
      <p class="confianza-respaldo">{_e(comercio['razon_social'])} · RUC {_e(comercio['ruc'])}</p>
    </aside>"""
