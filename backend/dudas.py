"""
Las dudas de quien compra: el bloque junto a los precios y las preguntas frecuentes.

POR QUE EXISTE

  El dueño de un hostal no mete la tarjeta en la web de alguien que no conoce.
  Antes de pagar se pregunta: ¿necesito tarjeta para probar?, ¿qué pasa cuando
  termina la prueba?, ¿cómo pago?, ¿me dan factura?, ¿puedo cancelar?, ¿pierdo
  mis datos si no pago?, ¿lo puedo usar en el celular? Aquí se responde todo
  eso por escrito, para que contrate solo, rápido y sin hablar con nadie: no
  hay WhatsApp, ni demos agendadas, ni cotizaciones. La prueba gratis es la
  demo y el pago es el checkout de Mercado Pago.

CADA RESPUESTA SALE DEL CODIGO, NO DE UN DESEO

  - Prueba sin tarjeta: POST /api/registro crea el hotel en 'prueba' con
    suscripciones.DIAS_PRUEBA dias y no pide ningun medio de pago.
  - Al terminar: el hotel pasa a 'vencida' y sigue con acceso DIAS_GRACIA
    dias; despues 'suspendida', que bloquea crear reservas, hacer check-in y
    registrar cargos y cobros (server.exigir_suscripcion), pero no la lectura.
    Ningun proceso borra datos por falta de pago.
  - Pago: por Mercado Pago. Pago adelantado de 1, 3, 6 o 12 meses con Yape,
    PagoEfectivo (banca movil BCP/BBVA o agente) o tarjeta, via Checkout Pro
    (checkout._a_checkout_pro; 12 meses = MESES_DEL_ANUAL mensualidades), con
    recordatorio por correo a 7 y a 1 dia (backend/recordatorios.py). O
    suscripcion con tarjeta, mensual o anual (/preapproval). Contratar con
    "Ya tengo cuenta" no crea otro hotel.
  - Comprobante: el checkout pide boleta (DNI o vacio) o factura (RUC, con la
    razon social del padron de SUNAT).
  - Cancelar: POST /api/suscripcion/cancelar, solo el administrador del hotel,
    boton en Configuracion; el acceso sigue hasta el fin del periodo pagado
    (suscripciones.tiene_acceso).
  - Celular: la aplicacion es web y tiene menu para pantallas pequeñas
    (frontend AppLayout.jsx); no se instala nada.

  NO se pregunta "¿emite boletas a mis huespedes?": la emision electronica
  propia a SUNAT esta en preparacion (backend/facturacion_propia.py), asi que
  no se promete aqui. Si cambia alguna de estas reglas, cambia su respuesta.

TODO ES HTML SIN JAVASCRIPT

  Las paginas del checkout tienen una prueba que se cae si aparece un <script>
  o un manejador de evento (tests/test_checkout_paginas.py).
"""
import html

import suscripciones

#: Los medios del pago adelantado, con estas palabras exactas. Lo usan la
#: pregunta "¿Cómo pago?" y la pagina de compra (checkout.MEDIOS_ADELANTADO).
MEDIOS_PAGO = "Paga con Yape, desde tu banca móvil (BCP, BBVA y otros) o con tarjeta"


def _e(valor) -> str:
    return html.escape(str(valor if valor is not None else ""), quote=True)


def preguntas() -> list[tuple[str, str]]:
    """(pregunta, respuesta) en el orden en que se las hace quien compra.

    Texto plano: lo mismo se pinta en /precios y va al FAQPage del JSON-LD,
    que tiene que repetir exactamente lo visible.
    """
    dias = suscripciones.DIAS_PRUEBA
    gracia = suscripciones.DIAS_GRACIA
    anual = suscripciones.MESES_DEL_ANUAL
    return [
        ("¿Necesito tarjeta para probar ZenStay?",
         f"No. Te registras con el nombre del hotel, su RUC, tu nombre, tu correo y una "
         f"contraseña, y tienes {dias} días para usar todo el sistema. No te pedimos "
         f"ningún medio de pago para la prueba."),
        (f"¿Qué pasa cuando terminan los {dias} días?",
         f"Eliges un plan y lo pagas en línea con la opción «Ya tengo cuenta»: sigues "
         f"con el mismo hotel y todo lo que cargaste. Si todavía no contratas, tienes "
         f"{gracia} días más con el sistema completo."),
        ("¿Cómo pago?",
         f"{MEDIOS_PAGO}, en línea, a través de Mercado Pago. Pagas por adelantado 1, 3, "
         f"6 o 12 meses (los 12 meses cuestan {anual} mensualidades) y te avisamos por "
         f"correo antes de que venza para que renueves. Si prefieres no pensar en eso, "
         f"con tarjeta también puedes suscribirte mes a mes o por año: Mercado Pago lo "
         f"cobra solo hasta que lo canceles. ZenStay no ve ni guarda los datos de tu "
         f"tarjeta."),
        ("¿Me dan factura?",
         "Sí. Al contratar eliges factura o boleta electrónica. Para la factura pones el "
         "RUC y tomamos la razón social del padrón de SUNAT. Te la emitimos por cada cobro."),
        ("¿Puedo cancelar cuando quiera?",
         "Sí, no hay contrato ni permanencia. El administrador del hotel cancela la "
         "suscripción desde su cuenta, en Configuración, y se detienen los cobros "
         "siguientes. Sigues usando el sistema hasta el final del periodo que ya pagaste."),
        ("¿Se borran mis datos si no pago?",
         f"No. Pasados los {gracia} días después del vencimiento ya no puedes registrar "
         f"reservas, check-in ni cobros, pero tus datos siguen ahí y puedes consultarlos. "
         f"Cuando contratas, vuelves a operar con todo como lo dejaste."),
        ("¿Funciona en el celular?",
         "Sí. ZenStay funciona en el navegador: en la computadora de recepción, en una "
         "tablet o en el celular. No hay que instalar nada."),
    ]


def bloque_confianza(comercio: dict, registro: str = "/registro") -> str:
    """Lo esencial, en cuatro lineas, con el boton "Empieza gratis".

    Va junto a los precios en la portada y en /comprar. En /precios no: ahi
    estan las preguntas frecuentes completas (seccion_preguntas).
    """
    dias = suscripciones.DIAS_PRUEBA
    gracia = suscripciones.DIAS_GRACIA
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
        <a href="/precios#preguntas" class="plan-segundo">Preguntas frecuentes</a>
      </div>
      <p class="confianza-respaldo">{_e(comercio['razon_social'])} · RUC {_e(comercio['ruc'])}</p>
    </aside>"""


def seccion_preguntas(comercio: dict, registro: str = "/registro") -> str:
    """Las preguntas frecuentes visibles de /precios, con su CTA al registro."""
    items = "".join(
        f'<div class="faq-item"><h3>{_e(p)}</h3><p>{_e(r)}</p></div>'
        for p, r in preguntas())
    return f"""
    <section class="faq" id="preguntas" aria-labelledby="faq-titulo">
      <h2 id="faq-titulo" class="faq-titulo">Preguntas frecuentes</h2>
      <div class="faq-lista">{items}</div>
      <div class="confianza-acciones">
        <a href="{_e(registro)}" class="boton boton-lleno">Empieza gratis</a>
      </div>
      <p class="confianza-respaldo">{_e(comercio['razon_social'])} · RUC {_e(comercio['ruc'])}</p>
    </section>"""


def faqpage() -> dict:
    """FAQPage para el JSON-LD: exactamente las preguntas que se ven."""
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": p,
             "acceptedAnswer": {"@type": "Answer", "text": r}}
            for p, r in preguntas()
        ],
    }
