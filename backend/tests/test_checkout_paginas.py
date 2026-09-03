"""Las paginas de la compra publica, comprobadas sin base de datos.

POR QUE ESTAS PRUEBAS Y NO UNAS DE INTEGRACION

  Lo que Izipay rechazo no fue una consulta SQL: fue lo que se ve al descargar
  el HTML. Por eso lo que se prueba aqui es exactamente eso -- la cadena de
  texto que sale del servidor -- y por eso las funciones de backend/checkout.py
  reciben diccionarios en vez de ir a buscar los datos ellas mismas.

  Corren sin Postgres, sin servidor y sin red:

      cd backend && python -m pytest tests/test_checkout_paginas.py -q

  El resto de la bateria (tests/test_hotel_pms_api.py y
  tests/test_multitenant_admin.py) sigue necesitando una instancia levantada;
  estas no, y por eso llevan la marca `no_necesita_servidor`.

LA PRUEBA QUE IMPORTA

  test_ninguna_pagina_lleva_javascript. Si alguien mete un <script> en una de
  estas paginas, se cae. Es la unica forma de que la razon por la que existe
  este modulo no se pierda en seis meses.
"""
import re
import sys
from decimal import Decimal
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import checkout as co  # noqa: E402

pytestmark = pytest.mark.no_necesita_servidor


PLANES = [
    {"codigo": "prueba", "nombre": "Prueba",
     "descripcion": "Todo el sistema durante 14 días, sin tarjeta.",
     "precio_mensual": 0.0, "max_habitaciones": None,
     "facturacion_sunat": True, "reportes_avanzados": True},
    {"codigo": "basico", "nombre": "Básico",
     "descripcion": "Para hospedajes y hostales pequeños.",
     "precio_mensual": 59.0, "max_habitaciones": 12,
     "facturacion_sunat": False, "reportes_avanzados": False},
    {"codigo": "pro", "nombre": "Pro",
     "descripcion": "Para hoteles con facturación electrónica.",
     "precio_mensual": 119.0, "max_habitaciones": 35,
     "facturacion_sunat": True, "reportes_avanzados": True},
    {"codigo": "empresa", "nombre": "Empresa",
     "descripcion": "Sin límite de habitaciones.",
     "precio_mensual": 199.0, "max_habitaciones": None,
     "facturacion_sunat": True, "reportes_avanzados": True},
]
PRO = PLANES[2]


def _checkout(periodo="mensual", error="", valores=None):
    return co.pagina_checkout(
        PRO, periodo, co.desglose(co.precio_de(PRO, periodo)),
        error, co.COMERCIO, valores)


def _todas_las_paginas():
    return {
        "precios": co.pagina_precios(PLANES, co.COMERCIO),
        "checkout": _checkout(),
        "checkout_error": _checkout(error="No pudimos crear tu hotel."),
        "checkout_anual": _checkout("anual"),
        "pedido": co.pagina_pedido(
            {"numero": "ZS2609031422AAA111", "estado": "pendiente",
             "monto": 119.00, "periodo": "mensual"},
            PRO, co.COMERCIO, "simulado"),
    }


# --- El desglose del IGV ---------------------------------------------------

@pytest.mark.parametrize("total", ["59.00", "119.00", "199.00", "590.00",
                                   "1190.00", "1990.00"])
def test_base_mas_igv_suman_exactamente_el_total(total):
    """Sin esto, el hotel ve tres cifras que no cuadran con su cargo.

    Es el motivo de que desglose() reste el IGV en vez de multiplicarlo: 119
    entre 1.18 no es exacto, y con float el redondeo deja un centimo suelto.
    """
    d = co.desglose(total)
    assert d["base"] + d["igv"] == Decimal(total)
    assert d["igv"] > 0


def test_el_igv_ronda_el_18_por_ciento_de_la_base():
    d = co.desglose("119.00")
    assert d["base"] == Decimal("100.85")
    assert d["igv"] == Decimal("18.15")


# --- Precio y periodo ------------------------------------------------------

def test_el_anual_son_diez_mensualidades():
    """Pagas 10 y usas 12. Si esto cambia, la pagina lo dice y hay que tocarla."""
    assert co.precio_de(PRO, "anual") == co.precio_de(PRO, "mensual") * 10
    assert co.precio_de(PRO, "anual") == Decimal("1190.0")


def test_el_plan_gratuito_no_tiene_precio():
    assert co.precio_de(PLANES[0], "mensual") == 0
    assert co.precio_de(PLANES[0], "anual") == 0


# --- LA prueba: nada de esto depende de JavaScript --------------------------

def test_ninguna_pagina_lleva_javascript():
    """El validador de Izipay descarga el HTML y puede no ejecutarlo.

    Es literalmente por lo que existe backend/checkout.py: la portada pinta sus
    precios con fetch() y desde fuera se ve "Cargando planes…". Si alguien
    vuelve a meter un <script> aqui, esta prueba lo para.
    """
    for nombre, pagina in _todas_las_paginas().items():
        assert "<script" not in pagina.lower(), f"{nombre} lleva un <script>"
        # onerror del logotipo es la unica excepcion, y es puramente cosmetica:
        # esconde una imagen que no cargo. Nada del pedido depende de ella.
        atributos = re.findall(r'\son(?!error=")[a-z]+\s*=', pagina)
        assert not atributos, f"{nombre} lleva manejadores de evento: {atributos}"


def test_el_checkout_ensena_pedido_total_y_boton_sin_javascript():
    """Las tres cosas que Izipay dijo que no encontraba."""
    pagina = _checkout()
    assert "Tu pedido" in pagina
    assert "Total a pagar" in pagina
    assert "S/ 119.00" in pagina
    assert "Valor de venta" in pagina and "IGV (18%)" in pagina
    assert pagina.count('<form class="co-caja co-formulario" method="post" action="/comprar"') == 2
    assert pagina.count("Pagar S/ 119.00") == 2


def test_el_catalogo_ofrece_contratar_solo_los_planes_de_pago():
    pagina = co.pagina_precios(PLANES, co.COMERCIO)
    assert '/comprar/prueba' not in pagina
    for codigo in ("basico", "pro", "empresa"):
        assert f'href="/comprar/{codigo}"' in pagina
    assert "Contratar · S/&nbsp;119/mes" in pagina
    assert "Probar 14 días gratis" in pagina


def test_el_checkout_identifica_a_quien_cobra():
    """La pasarela exige poder identificar al comercio en la propia pagina."""
    pagina = _checkout()
    assert "SOLUCIONES INFORM" in pagina
    assert "20490042068" in pagina
    assert "Tambopata" in pagina
    assert "soporte@sisac.pe" in pagina
    for enlace in ("/terminos", "/privacidad", "/reclamaciones"):
        assert f'href="{enlace}"' in pagina
    for marca in ("VISA", "Mastercard", "American Express", "Diners Club", "PEN"):
        assert f">{marca}<" in pagina
    assert "Izipay" in pagina


# --- Errores en linea ------------------------------------------------------

def test_el_error_vuelve_en_linea_y_conserva_lo_escrito():
    valores = {"hotel_name": "Hotel Los Andes", "ruc": "20490042068",
               "admin_name": "Kevin García", "admin_email": "kevin@losandes.pe"}
    pagina = _checkout(error="Ya existe un hotel con este RUC.", valores=valores)
    assert "Ya existe un hotel con este RUC." in pagina
    assert 'class="aviso error"' in pagina
    for valor in valores.values():
        assert valor in pagina


def test_la_contrasena_nunca_vuelve_en_el_html():
    """Rebotarla la dejaria en el historial y en cualquier cache intermedia."""
    pagina = _checkout(error="Correo o contraseña incorrectos.",
                       valores={"admin_email": "kevin@losandes.pe"})
    assert "hunter2NoDeberiaSalir" not in pagina
    campos = re.findall(r'<input[^>]*type="password"[^>]*>', pagina)
    assert campos, "faltan los campos de contrasena"
    for campo in campos:
        assert "value=" not in campo


def test_lo_que_viene_del_cliente_se_escapa():
    """Un nombre con etiquetas dentro no puede convertirse en HTML."""
    pagina = _checkout(error='<img src=x onerror="alert(1)">',
                       valores={"hotel_name": '"><script>alert(1)</script>'})
    assert "<script>" not in pagina
    assert "<img src=x" not in pagina
    assert "&lt;script&gt;" in pagina


# --- La pagina del pedido --------------------------------------------------

def test_en_simulado_se_dice_que_todavia_no_se_cobra():
    """Un boton que aparente cobrar sin cobrar seria enganar al que valida."""
    pagina = co.pagina_pedido(
        {"numero": "ZS2609031422AAA111", "estado": "pendiente",
         "monto": 119.00, "periodo": "mensual"}, PRO, co.COMERCIO, "simulado")
    # El texto va partido en varias lineas en la plantilla: se normalizan los
    # espacios antes de buscarlo, que es como lo lee una persona.
    plano = " ".join(pagina.split())
    assert "El cobro con tarjeta se activa cuando la pasarela confirme la afiliación." in plano
    assert "prueba de 14 días" in plano
    assert "Entrar al sistema" in pagina
    assert "<form" not in pagina
    assert "Continuar a Izipay" not in pagina


def test_sin_destino_confirmado_no_se_pinta_boton_de_pagar():
    """Hay credenciales pero falta la URL de la pasarela (POR_CONFIRMAR)."""
    pagina = co.pagina_pedido(
        {"numero": "ZS2609031422AAA111", "estado": "pendiente",
         "monto": 119.00, "periodo": "mensual", "token_pasarela": "tok_x"},
        PRO, co.COMERCIO, "produccion")
    assert "Continuar a Izipay" not in pagina
    assert "<form" not in pagina
    assert "no podemos abrir el formulario de tarjeta" in pagina


def test_con_token_y_destino_si_hay_formulario_de_pago():
    pagina = co.pagina_pedido(
        {"numero": "ZS2609031422AAA111", "estado": "pendiente",
         "monto": 119.00, "periodo": "mensual",
         "token_pasarela": "tok_x", "url_pasarela": "https://pasarela.example/pago"},
        PRO, co.COMERCIO, "produccion")
    assert 'action="https://pasarela.example/pago"' in pagina
    assert 'name="formToken" value="tok_x"' in pagina
    assert "Continuar a Izipay · S/ 119.00" in pagina


def test_un_pedido_pagado_lo_dice_y_no_vuelve_a_pedir_pago():
    pagina = co.pagina_pedido(
        {"numero": "ZS2609031422AAA111", "estado": "pagado",
         "monto": 1190.00, "periodo": "anual"}, PRO, co.COMERCIO, "produccion")
    assert "Pago confirmado" in pagina
    assert "S/ 1,190.00" in pagina
    assert "Continuar a Izipay" not in pagina


# --- La cascara ------------------------------------------------------------

def test_todas_las_paginas_son_documentos_completos_con_el_css_de_la_landing():
    for nombre, pagina in _todas_las_paginas().items():
        assert pagina.startswith("<!doctype html>"), nombre
        assert '<html lang="es">' in pagina, nombre
        assert "<title>" in pagina, nombre
        assert 'name="viewport"' in pagina, nombre
        # Versionado: sin la huella, Cloudflare sirve el CSS anterior.
        assert f"/landing-assets/estilo.css?v={co.version_css()}" in pagina, nombre
        # Cabecera y pie de la landing, con las mismas clases.
        assert 'class="barra"' in pagina and 'class="pie"' in pagina, nombre
