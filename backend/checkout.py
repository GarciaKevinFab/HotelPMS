"""Compra publica: catalogo, resumen del pedido y pago, SIN JavaScript.

EL PROBLEMA, TAL Y COMO SE VE DESDE FUERA

  ZenStay tiene una landing estatica preciosa y un PMS entero detras del login.
  Entre las dos cosas no habia checkout. Peor: los precios de la landing los
  pinta un `fetch('/api/planes')` desde el navegador, asi que quien descarga
  ese HTML sin ejecutarlo ve literalmente esto:

      <div class="planes" id="lista-planes">
        <p>Cargando planes…</p>
      </div>

  Ni un importe, ni un boton de comprar, ni un total. Y los tres botones que si
  aparecian llevaban a /registro, que es un alta de prueba gratuita: un
  formulario, no una compra.

  Izipay escribio por WhatsApp: "verificamos que no cuentas con un carrito de
  compras, proceso de checkout o boton de pago". Desde su lado tenian razon.
  Es la segunda vez que pasa en esta casa -- CargoXprez, comercio 5991076 --
  y por el mismo motivo: el validador descarga el HTML y puede no ejecutar
  JavaScript.

QUE ANADE ESTE MODULO

  GET  /precios              catalogo con los cuatro planes y su precio
  GET  /comprar/{plan}       resumen del pedido con IGV desglosado y formulario
  POST /comprar              crea el hotel si hace falta y registra el pedido
  GET  /comprar/pedido/{n}   numero de pedido, total y estado

  Las cuatro se construyen ENTERAS en el servidor y los formularios se envian
  por POST. Sin una linea de JavaScript obligatorio: cargalas con el motor
  apagado y siguen mostrando el plan, el desglose, el total y el boton.

  Reutilizan /landing-assets/estilo.css -- el mismo que la landing, con la
  misma huella de version -- para que no parezcan otra web.

LAS PAGINAS SON FUNCIONES PURAS

  pagina_precios(), pagina_checkout() y pagina_pedido() reciben diccionarios y
  devuelven `str`. No tocan la base ni la request. Asi se pueden renderizar y
  fotografiar sin levantar Postgres -- que es como se han revisado a 1440 y a
  390 px, y con JavaScript desactivado -- y asi hay pruebas de la parte que
  decide que se ve, no solo de la que consulta.

LO QUE ESTAS PAGINAS **NO** HACEN, Y POR QUE NO ES UN ENGANO

  Mientras Izipay no entregue credenciales, izipay.modo() vale "simulado" y la
  pagina del pedido lo dice con todas las letras: el hotel queda creado con su
  prueba de 14 dias y el cobro con tarjeta se activa cuando la pasarela
  confirme la afiliacion.

  No se pinta un boton "Pagar con tarjeta" que en realidad no cobre. Enganar
  justo a quien viene a comprobar que el checkout es real es la forma mas
  segura de que lo rechacen otra vez -- y la unica que ademas estaria mal.
"""
import hashlib
import html
import json
import logging
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse

import db_pg
import izipay

log = logging.getLogger("zenstay.checkout")
router = APIRouter()

LANDING = Path(__file__).parent / "landing"

PERIODOS = ("mensual", "anual")

# El anual son DIEZ mensualidades, no doce. Es el mismo trato que LicitaPro
# (590 / 1190 / 1990) y sale del precio mensual de la tabla, asi que cambiar un
# precio sigue siendo un UPDATE y nada mas. Se dice en la pagina: "pagas 10
# meses, usas 12".
MESES_DEL_ANUAL = 10

IGV = Decimal("0.18")
CENTIMO = Decimal("0.01")


# ---------------------------------------------------------------------------
# Quien cobra
# ---------------------------------------------------------------------------
# Va escrito aqui y no en variables de entorno a proposito: son los mismos
# datos que ya estan en el pie de la landing y en /terminos, y tienen que
# coincidir LETRA POR LETRA con el contrato de comercio de Izipay. Un
# marcador de posicion colado en produccion es exactamente la clase de detalle
# que tumba una validacion por segunda vez; un valor que falta porque nadie
# puso la variable, tambien.
COMERCIO = {
    "razon_social": "SOLUCIONES INFORMÁTICAS MDD S.A.C.",
    "ruc": "20490042068",
    "direccion": ("Av. Madre de Dios N° 1087, Dpto. 201, A.H. Huerto Familiar, "
                  "Tambopata, Madre de Dios, Perú"),
    "email": "soporte@sisac.pe",
}


def version_css() -> str:
    """Huella del CSS de la landing, para invalidar la cache de Cloudflare.

    La misma que usa server.py para las paginas de la landing -- de hecho
    server._version_css() llama aqui -- porque estas paginas cargan ese mismo
    archivo y tienen que apuntar a la misma version. Si cada una calculara la
    suya, un despliegue dejaria el checkout con los colores viejos.
    """
    archivo = LANDING / "estilo.css"
    if not archivo.is_file():
        return "0"
    return hashlib.md5(archivo.read_bytes()).hexdigest()[:10]


def _e(valor) -> str:
    """Escapa para HTML. Todo lo que venga del cliente pasa por aqui."""
    return html.escape(str(valor if valor is not None else ""), quote=True)


def _soles(monto) -> str:
    return f"S/ {Decimal(str(monto)).quantize(CENTIMO, rounding=ROUND_HALF_UP):,.2f}"


def desglose(total) -> dict:
    """Base imponible e IGV a partir de un precio que ya lo incluye.

    En Decimal y no en float: estos tres numeros acaban en una pantalla que el
    hotel compara con el cargo de su tarjeta, y 119/1.18 en coma flotante da
    100.84745762711864, que segun por donde se redondee deja un centimo de
    descuadre entre base + IGV y el total.

    El IGV se saca RESTANDO y no multiplicando, por lo mismo: asi las tres
    cifras suman exactamente lo que se cobra, pase lo que pase con el redondeo
    de la base.
    """
    total = Decimal(str(total)).quantize(CENTIMO, rounding=ROUND_HALF_UP)
    base = (total / (1 + IGV)).quantize(CENTIMO, rounding=ROUND_HALF_UP)
    return {"base": base, "igv": total - base, "total": total}


def precio_de(plan: dict, periodo: str) -> Decimal:
    """Lo que se cobra hoy por ese plan y esa periodicidad."""
    mensual = Decimal(str(plan.get("precio_mensual") or 0))
    if periodo == "anual":
        return mensual * MESES_DEL_ANUAL
    return mensual


def incluye(plan: dict) -> list:
    """Que trae el plan, con las mismas frases que la landing.

    Se repiten aqui y no se leen de la tabla porque la tabla guarda banderas
    (facturacion_sunat, reportes_avanzados), no textos de venta. Cambiar la
    frase no deberia ser una migracion.
    """
    tope = plan.get("max_habitaciones")
    return [
        f"Hasta {tope} habitaciones" if tope else "Habitaciones ilimitadas",
        "Reservas, check-in y check-out",
        "Caja y arqueo por turno",
        "Limpieza y mantenimiento",
        "Boletas y facturas SUNAT" if plan.get("facturacion_sunat") else "Comprobantes internos",
        ("Reportes de ocupación, ADR y RevPAR" if plan.get("reportes_avanzados")
         else "Reportes básicos"),
    ]


# ---------------------------------------------------------------------------
# La cascara: cabecera, estilos y pie iguales que la landing
# ---------------------------------------------------------------------------
# Los estilos propios van EN LA PAGINA y no en estilo.css: son siete reglas que
# solo existen aqui (el desglose del pedido y la rejilla del checkout), y
# meterlas en el archivo de la landing obligaria a volver a descargarlo entero
# a quien solo viene a leer la portada. Todo lo demas -- botones, tarjetas,
# tipografia, colores -- sale tal cual de estilo.css.
_ESTILOS = """
<style>
.co-rejilla { display: grid; grid-template-columns: 1fr; gap: 22px; align-items: start; }
.co-caja {
  border: 1px solid var(--borde); border-radius: var(--radio-tarjeta);
  background: linear-gradient(180deg, var(--superficie-alta), var(--superficie));
  padding: clamp(22px, 3vw, 30px);
}
.co-caja h2 {
  font-size: .74rem; letter-spacing: .15em; text-transform: uppercase;
  color: var(--turquesa); font-family: var(--sans); font-weight: 700;
  margin: 0 0 16px; line-height: 1.4;
}
.co-fila {
  display: flex; justify-content: space-between; gap: 16px;
  padding: 9px 0; border-bottom: 1px solid var(--borde);
  font-size: .95rem; color: var(--texto-suave);
}
.co-fila:last-of-type { border-bottom: 0; }
.co-fila strong { color: var(--texto); font-weight: 600; }
.co-fila .cifra { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--texto); }
.co-total {
  display: flex; justify-content: space-between; gap: 16px; align-items: baseline;
  border-top: 2px solid var(--turquesa); margin-top: 10px; padding-top: 16px;
}
.co-total span { font-weight: 700; font-size: 1rem; }
.co-total .cifra {
  font-family: var(--display); font-size: clamp(1.9rem, 3.4vw, 2.4rem);
  font-weight: 700; letter-spacing: -.03em; line-height: 1;
  font-variant-numeric: tabular-nums; color: var(--texto);
}
.co-nota { font-size: .84rem; color: var(--texto-suave); margin: 14px 0 0; line-height: 1.6; }
.co-caja ul.co-incluye { list-style: none; padding: 0; margin: 4px 0 0; }
.co-caja ul.co-incluye li {
  padding: 6px 0 6px 22px; position: relative; font-size: .9rem; color: var(--texto-suave);
}
.co-caja ul.co-incluye li::before {
  content: "·"; position: absolute; left: 5px; color: var(--turquesa);
  font-weight: 700; font-size: 1.4rem; line-height: .9;
}
.co-periodo { display: flex; gap: 8px; margin: 0 0 20px; flex-wrap: wrap; }
.co-periodo a {
  display: inline-flex; align-items: center; min-height: 44px; padding: 0 18px;
  border: 1px solid var(--borde); border-radius: var(--radio-pastilla);
  color: var(--texto-suave); text-decoration: none; font-size: .92rem; font-weight: 600;
}
.co-periodo a[aria-current="true"] {
  border-color: var(--turquesa); color: var(--turquesa); background: rgba(0,192,168,.10);
}
.co-formulario button {
  width: 100%; margin-top: 6px; font-family: var(--sans);
  -webkit-appearance: none; appearance: none;
}
.co-marcas { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 12px; }
.co-marcas span {
  border: 1px solid var(--borde); border-radius: 8px; padding: 5px 11px;
  font-size: .76rem; font-weight: 700; letter-spacing: .06em; color: var(--texto-suave);
  background: var(--superficie);
}
.co-legal { font-size: .84rem; color: var(--texto-suave); line-height: 1.75; margin: 0; }
.co-legal a { color: var(--turquesa); }
.co-migas { font-size: .9rem; margin: 0 0 18px; }
.co-migas a { color: var(--turquesa); text-decoration: none; }
/* Las cuatro tarjetas, todas de la misma altura y con el boton abajo del todo.
   Con `align-items: start` (lo que hace .planes en la landing, donde son tres
   de contenido parecido) los botones quedaban a cuatro alturas distintas y la
   fila se leia como un escalon. */
.co-planes {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; align-items: stretch;
}
.co-planes .plan { display: flex; flex-direction: column; }
.co-planes .plan ul { flex: 1 0 auto; }
/* Menos aire a los lados que un boton suelto: "Contratar · S/ 119/mes" no cabe
   en 211 px con los 30 px de serie y partia justo detras del "S/". */
.co-planes .plan .boton { padding-left: 14px; padding-right: 14px; font-size: .95rem; }
.co-plan-gratis .precio small {
  /* .precio aprieta el tracking a -.04em para un numero de 3 rem; heredado por
     una linea de 0.9 rem dejaba las palabras pegadas ("14dias,sintarjeta"). */
  display: block; margin-top: 8px; letter-spacing: normal; line-height: 1.5;
}
.co-segundo {
  display: block; text-align: center; margin-top: 12px; font-size: .88rem;
  color: var(--texto-suave); text-decoration: none; padding: 11px 4px; min-height: 44px;
}
.co-segundo:hover { color: var(--turquesa); }
@media (min-width: 900px) {
  .co-rejilla { grid-template-columns: 1.1fr .9fr; }
  /* El resumen va PRIMERO en el HTML -- para que quien lea la pagina sin
     estilos, o en el telefono, vea el total antes que el formulario -- y se
     coloca a la derecha solo cuando hay sitio. */
  .co-resumen { grid-column: 2; grid-row: 1; }
  .co-accion  { grid-column: 1; grid-row: 1; }
}
@media (min-width: 1080px) { .co-planes { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 620px) { .co-planes { grid-template-columns: 1fr; } }
/* estilo.css esconde "Precios" de la barra a 560 px por el href="#planes" de
   la portada; aqui el enlace es /precios y necesita la misma regla o la
   cabecera se desborda en un telefono. */
@media (max-width: 560px) { .cabecera nav a[href="/precios"] { display: none; } }
</style>
"""


def _cabecera() -> str:
    """La misma barra de la landing, con las mismas clases."""
    return """
<div class="barra">
  <div class="envoltorio">
    <header class="cabecera">
      <a class="marca" href="/">
        <img src="/logo-zenstay.png" alt="ZenStay" width="40" height="40" onerror="this.style.display='none'">
        <span>ZenStay</span>
      </a>
      <nav>
        <a href="/precios">Precios</a>
        <a href="/login">Entrar</a>
        <a href="/registro" class="boton boton-lleno">Probar gratis</a>
      </nav>
    </header>
  </div>
</div>"""


def _pie(comercio: dict) -> str:
    """El pie de la landing, con la identidad de quien cobra."""
    return f"""
<div class="envoltorio">
  <footer class="pie">
    <div class="pie-rejilla">
      <div>
        <div class="pie-marca">
          <img src="/logo-zenstay.png" alt="">
          <span>ZenStay</span>
        </div>
        <p class="pie-lema">Gestión para hoteles, hostales y hospedajes del Perú.
           Reservas, recepción, caja y comprobantes SUNAT en un solo sitio.</p>
      </div>
      <nav aria-label="Producto">
        <h3>Producto</h3>
        <ul>
          <li><a href="/#como-funciona">Cómo funciona</a></li>
          <li><a href="/precios">Precios</a></li>
        </ul>
      </nav>
      <nav aria-label="Tu cuenta">
        <h3>Tu cuenta</h3>
        <ul>
          <li><a href="/login">Entrar</a></li>
          <li><a href="/registro">Crear cuenta</a></li>
        </ul>
      </nav>
      <nav aria-label="Legal y contacto">
        <h3>Legal y contacto</h3>
        <ul>
          <li><a href="/privacidad">Privacidad</a></li>
          <li><a href="/terminos">Términos del servicio</a></li>
          <li><a href="/reclamaciones">Libro de Reclamaciones</a></li>
          <li><a href="mailto:{_e(comercio['email'])}">{_e(comercio['email'])}</a></li>
        </ul>
      </nav>
    </div>
    <div class="pie-legal">
      <p>
        &copy; 2026 {_e(comercio['razon_social'])} — RUC {_e(comercio['ruc'])}<br>
        {_e(comercio['direccion'])}
      </p>
      <a class="pie-libro" href="/reclamaciones">
        <span class="icono" aria-hidden="true">&#9998;</span>
        <span>
          <span class="arriba">Libro de</span>
          <span class="abajo">Reclamaciones</span>
        </span>
      </a>
    </div>
  </footer>
</div>"""


def _documento(titulo: str, descripcion: str, interior: str, comercio: dict) -> str:
    """Pagina completa. Nada de esto depende de JavaScript."""
    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_e(titulo)}</title>
<meta name="description" content="{_e(descripcion)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Karla:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/landing-assets/estilo.css?v={version_css()}">
{_ESTILOS}
</head>
<body>
{_cabecera()}
<div class="envoltorio">
{interior}
</div>
{_pie(comercio)}
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Las paginas (funciones puras: dicts -> str)
# ---------------------------------------------------------------------------

def pagina_precios(planes: list, comercio: dict) -> str:
    """El catalogo, con el precio y un boton de contratar por plan.

    Existe como direccion propia y no como el ancla /#planes de la portada
    porque una URL se puede mandar por WhatsApp, meter en el sitemap y darle a
    la pasarela como "aqui esta el catalogo". Un ancla dentro de una portada
    con scroll animado -- y con los precios pintados por fetch -- no sirve para
    ninguna de las tres cosas.
    """
    tarjetas = []
    for plan in planes:
        precio = Decimal(str(plan.get("precio_mensual") or 0))
        gratis = precio <= 0
        codigo = plan.get("codigo", "")
        puntos = "".join(f"<li>{_e(p)}</li>" for p in incluye(plan))
        recomendado = " recomendado" if codigo == "pro" else ""

        if gratis:
            importe = ('<div class="precio">Gratis<small>14 días, sin tarjeta</small></div>')
            botones = (f'<a href="/registro" class="boton boton-linea">Empezar los 14 días</a>')
            extra = " co-plan-gratis"
        else:
            importe = (f'<div class="precio">S/ {precio:,.0f}<small> /mes</small></div>')
            # El espacio de "S/ 119" va duro: sin el, el boton parte la linea
            # justo detras del simbolo y deja "S/" solo arriba.
            botones = (
                f'<a href="/comprar/{_e(codigo)}" class="boton '
                f'{"boton-lleno" if recomendado else "boton-linea"}">'
                f'Contratar · S/&nbsp;{precio:,.0f}/mes</a>'
                f'<a href="/registro?plan={_e(codigo)}" class="co-segundo">'
                f'Probar 14 días gratis</a>'
            )
            extra = ""

        tarjetas.append(
            f'<div class="plan{recomendado}{extra}">'
            f'<p class="apunte">{_e(plan.get("nombre"))}</p>'
            f'{importe}'
            f'<p style="font-size:.9rem;color:var(--texto-suave);margin:0">'
            f'{_e(plan.get("descripcion"))}</p>'
            f'<ul>{puntos}</ul>'
            f'{botones}'
            f'</div>'
        )

    if not tarjetas:
        tarjetas.append(
            '<p style="color:var(--texto-suave)">No pudimos cargar los precios ahora. '
            f'<a href="mailto:{_e(comercio["email"])}" style="color:var(--turquesa)">'
            'Escríbenos</a> y te los pasamos.</p>'
        )

    interior = f"""
  <section class="seccion" style="border-top:0">
    <div class="seccion-titulo">
      <h2>Precios claros, en soles</h2>
      <p>Con IGV incluido. Sin costo de instalación ni permanencia. Cancelas cuando quieras.</p>
    </div>
    <div class="co-planes">
      {"".join(tarjetas)}
    </div>
    <p class="co-nota" style="margin-top:28px">
      Todos los precios son mensuales y en soles, con IGV incluido. Al contratar
      puedes elegir pago anual: pagas {MESES_DEL_ANUAL} meses y usas 12.
      ¿Más de un hotel o necesitas algo a medida?
      <a href="mailto:{_e(comercio['email'])}" style="color:var(--turquesa)">Escríbenos</a>.
    </p>
  </section>"""

    return _documento(
        "Precios · ZenStay",
        "Planes y precios de ZenStay en soles, con IGV incluido. Desde S/ 59 al mes.",
        interior, comercio,
    )


def pagina_checkout(plan: dict, periodo: str, importe: dict, error: str,
                    comercio: dict, valores: dict | None = None) -> str:
    """Resumen del pedido y formulario de pago. Publica: no exige sesion.

    LOS DOS MODOS SON DOS FORMULARIOS DE VERDAD, NO UNA PESTANA

      "Es la primera vez" y "Ya tengo cuenta" podrian ser un conmutador, pero
      un conmutador es JavaScript o es CSS escondiendo campos con `required`
      dentro -- y un campo obligatorio invisible bloquea el envio sin decir por
      que. Dos <form> separados funcionan con el motor apagado, cada uno con su
      boton de pagar, y quien llega ve de un vistazo cual es su caso.

    El resumen va ANTES en el HTML que el formulario. En el telefono se lee
    primero el total, que es lo que la gente viene a mirar; en el escritorio se
    coloca a la derecha con una regla de rejilla.
    """
    v = valores or {}
    codigo = plan.get("codigo", "")
    nombre = plan.get("nombre", "")
    cada = "año" if periodo == "anual" else "mes"
    aviso = f'<div class="aviso error" role="alert">{_e(error)}</div>' if error else ""
    puntos = "".join(f"<li>{_e(p)}</li>" for p in incluye(plan))
    total_txt = _soles(importe["total"])

    ahorro = ""
    if periodo == "anual":
        ahorro = (f'<p class="co-nota">Pagas {MESES_DEL_ANUAL} meses y usas 12: '
                  f'dos meses sin costo frente al pago mensual.</p>')

    # El resumen y el "quien cobra" comparten columna: son las dos cosas que
    # se miran antes de teclear nada, y juntas dejan de dejar media pagina
    # vacia a la derecha en una pantalla ancha.
    resumen = f"""
    <div class="co-resumen">
      <section class="co-caja" aria-labelledby="co-pedido">
        <h2 id="co-pedido">Tu pedido</h2>
        <div class="co-fila">
          <span><strong>ZenStay {_e(nombre)}</strong><br>Suscripción {_e(periodo)}</span>
          <span class="cifra">{_soles(importe['total'])}</span>
        </div>
        <div class="co-fila"><span>Cantidad</span><span class="cifra">1</span></div>
        <div class="co-fila"><span>Valor de venta</span><span class="cifra">{_soles(importe['base'])}</span></div>
        <div class="co-fila"><span>IGV (18%)</span><span class="cifra">{_soles(importe['igv'])}</span></div>
        <div class="co-total">
          <span>Total a pagar</span>
          <span class="cifra">{_e(total_txt)}</span>
        </div>
        <p class="co-nota">Precio en soles con IGV incluido. Se renueva cada {_e(cada)}
           y puedes cancelar cuando quieras.</p>
        {ahorro}
        <h2 style="margin-top:24px">Qué incluye</h2>
        <ul class="co-incluye">{puntos}</ul>
      </section>

      <section class="co-caja" style="margin-top:22px">
        <h2>Pago seguro</h2>
        <div class="co-marcas" aria-label="Tarjetas aceptadas">
          <span>VISA</span><span>Mastercard</span><span>American Express</span>
          <span>Diners Club</span><span>PEN</span>
        </div>
        <p class="co-legal">
          El cobro con tarjeta lo procesa <strong>Izipay</strong> sobre conexión
          cifrada. Los datos de tu tarjeta viajan directos a la pasarela:
          ZenStay nunca los ve ni los guarda.<br>
          <a href="/terminos">Términos del servicio</a> ·
          <a href="/privacidad">Política de privacidad</a> ·
          <a href="/reclamaciones">Libro de Reclamaciones</a>
        </p>
        <p class="co-legal" style="margin-top:14px">
          Contratas con <strong>{_e(comercio['razon_social'])}</strong> —
          RUC {_e(comercio['ruc'])}.<br>
          {_e(comercio['direccion'])}<br>
          <a href="mailto:{_e(comercio['email'])}">{_e(comercio['email'])}</a>
        </p>
      </section>
    </div>"""

    accion = f"""
    <div class="co-accion">
      {aviso}
      <div class="co-periodo">
        <a href="/comprar/{_e(codigo)}?periodo=mensual"
           aria-current="{'true' if periodo == 'mensual' else 'false'}">Pago mensual</a>
        <a href="/comprar/{_e(codigo)}?periodo=anual"
           aria-current="{'true' if periodo == 'anual' else 'false'}">Pago anual · 2 meses gratis</a>
      </div>

      <form class="co-caja co-formulario" method="post" action="/comprar">
        <h2>Es la primera vez</h2>
        <input type="hidden" name="plan" value="{_e(codigo)}">
        <input type="hidden" name="periodo" value="{_e(periodo)}">
        <input type="hidden" name="modo" value="nuevo">
        <div class="campo">
          <label for="hotel_name">Nombre del hotel</label>
          <input id="hotel_name" name="hotel_name" required minlength="2" maxlength="120"
                 autocomplete="organization" value="{_e(v.get('hotel_name'))}">
        </div>
        <div class="campo">
          <label for="ruc">RUC</label>
          <input id="ruc" name="ruc" required inputmode="numeric" pattern="[0-9]{{11}}"
                 maxlength="11" value="{_e(v.get('ruc'))}">
          <p class="ayuda">11 dígitos, el del hotel.</p>
        </div>
        <div class="campo">
          <label for="admin_name">Tu nombre</label>
          <input id="admin_name" name="admin_name" required minlength="2" maxlength="120"
                 autocomplete="name" value="{_e(v.get('admin_name'))}">
        </div>
        <div class="campo">
          <label for="admin_email">Tu correo</label>
          <input id="admin_email" name="admin_email" type="email" required
                 autocomplete="email" value="{_e(v.get('admin_email'))}">
        </div>
        <div class="campo">
          <label for="admin_password">Contraseña</label>
          <input id="admin_password" name="admin_password" type="password" required
                 minlength="8" autocomplete="new-password">
          <p class="ayuda">Mínimo 8 caracteres. Con ella entras al sistema.</p>
        </div>
        <button type="submit" class="boton boton-lleno">Pagar {_e(total_txt)}</button>
      </form>

      <form class="co-caja co-formulario" method="post" action="/comprar" style="margin-top:22px">
        <h2>Ya tengo cuenta</h2>
        <input type="hidden" name="plan" value="{_e(codigo)}">
        <input type="hidden" name="periodo" value="{_e(periodo)}">
        <input type="hidden" name="modo" value="existente">
        <div class="campo">
          <label for="email">Correo</label>
          <input id="email" name="email" type="email" required autocomplete="email"
                 value="{_e(v.get('email'))}">
        </div>
        <div class="campo">
          <label for="password">Contraseña</label>
          <input id="password" name="password" type="password" required
                 autocomplete="current-password">
        </div>
        <button type="submit" class="boton boton-linea">Pagar {_e(total_txt)}</button>
      </form>
    </div>"""

    interior = f"""
  <section class="seccion" style="border-top:0">
    <p class="co-migas"><a href="/precios">&larr; Volver a los planes</a></p>
    <div class="seccion-titulo" style="margin-bottom:28px">
      <h2>Contratar {_e(nombre)}</h2>
      <p>{_e(total_txt)} al {_e(cada)}, con IGV incluido.</p>
    </div>
    <div class="co-rejilla">
      {resumen}
      {accion}
    </div>
  </section>"""

    return _documento(
        f"Contratar {nombre} · ZenStay",
        f"Contrata ZenStay {nombre} por {total_txt} al {cada}, con IGV incluido.",
        interior, comercio,
    )


def pagina_pedido(pedido: dict, plan: dict, comercio: dict, modo: str) -> str:
    """Numero de pedido, total y estado. Lo que ve el hotel tras confirmar.

    AQUI ES DONDE SE DICE LA VERDAD SOBRE EL COBRO

      Con `modo == "simulado"` no hay pasarela detras. La pagina lo escribe con
      todas las letras y ofrece lo unico que si es cierto: el hotel ya existe,
      con su prueba de 14 dias, y se puede entrar ahora mismo.

      La alternativa -- un boton "Pagar con tarjeta" que no lleva a ningun
      cobro -- seria mentir justo a quien viene a comprobar que el checkout
      funciona. Y a un cliente de verdad le dejaria creyendo que pago.
    """
    estados = {
        "pendiente": "Pendiente de pago",
        "pagado": "Pagado",
        "fallido": "Rechazado por la pasarela",
        "anulado": "Anulado",
    }
    etiqueta = estados.get(pedido.get("estado", ""), "Pendiente de pago")
    periodo = pedido.get("periodo") or "mensual"

    if pedido.get("estado") == "pagado":
        bloque_pago = f"""
      <div class="co-caja co-accion">
        <h2>Pago confirmado</h2>
        <div class="aviso bien" role="status" style="margin-bottom:16px">
          Izipay confirmó el cobro. El plan {_e(plan.get('nombre'))} ya está
          activo en tu hotel.
        </div>
        <a href="/login" class="boton boton-lleno" style="width:100%;text-align:center">
          Entrar al sistema</a>
      </div>"""
    elif modo == "simulado":
        bloque_pago = f"""
      <div class="co-caja co-accion">
        <h2>Sobre el cobro</h2>
        <div class="aviso bien" role="status" style="margin-bottom:16px">
          El cobro con tarjeta se activa cuando la pasarela confirme la
          afiliación. Tu hotel ya quedó creado con la prueba de 14 días y
          puedes entrar ahora.
        </div>
        <p class="co-nota" style="margin-top:0">
          Guardamos este pedido con el número de arriba. Cuando Izipay habilite
          el cobro te escribimos a tu correo con el enlace para pagarlo, y el
          plan {_e(plan.get('nombre'))} queda activo sin que pierdas nada de lo
          que hayas cargado durante la prueba.
        </p>
        <a href="/login" class="boton boton-lleno" style="width:100%;text-align:center;margin-top:8px">
          Entrar al sistema</a>
        <a href="/precios" class="co-segundo">Ver los otros planes</a>
      </div>"""
    elif pedido.get("token_pasarela") and pedido.get("url_pasarela"):
        # Hay credenciales, token de sesion y destino confirmado: el boton
        # lleva a un cobro de verdad.
        #
        # POR_CONFIRMAR: el nombre del campo del token y la URL de destino. El
        # formulario de tarjeta lo sirve Izipay dentro de un iframe suyo -- es
        # lo que mantiene los datos de tarjeta fuera de este servidor -- y su
        # montaje SI necesita JavaScript, por diseno de la pasarela.
        bloque_pago = f"""
      <div class="co-caja co-accion">
        <h2>Pagar con tarjeta</h2>
        <p class="co-nota" style="margin-top:0">
          El formulario de tarjeta lo sirve <strong>Izipay</strong> en su propio
          iframe: es lo que mantiene los datos de tu tarjeta fuera de nuestros
          servidores, y necesita JavaScript activado.
        </p>
        <form method="post" action="{_e(pedido['url_pasarela'])}">
          <input type="hidden" name="formToken" value="{_e(pedido['token_pasarela'])}">
          <button type="submit" class="boton boton-lleno" style="width:100%">
            Continuar a Izipay · {_soles(pedido.get('monto') or 0)}</button>
        </form>
        <a href="/login" class="co-segundo">Entrar al sistema</a>
      </div>"""
    else:
        # Hay credenciales pero la pasarela no dio token, o todavia falta
        # confirmar a que URL se manda. NO se pinta un boton de pagar: uno que
        # no lleva a ningun cobro es peor que decir que ahora mismo no se
        # puede.
        bloque_pago = f"""
      <div class="co-caja co-accion">
        <h2>Sobre el cobro</h2>
        <div class="aviso error" role="status" style="margin-bottom:16px">
          Ahora mismo no podemos abrir el formulario de tarjeta. Tu pedido
          quedó guardado con el número de arriba.
        </div>
        <p class="co-nota" style="margin-top:0">
          Escríbenos a <a href="mailto:{_e(comercio['email'])}" style="color:var(--turquesa)">{_e(comercio['email'])}</a>
          con ese número y lo resolvemos. Si tu hotel está en prueba, sigue
          funcionando con normalidad.
        </p>
        <a href="/login" class="boton boton-linea" style="width:100%;text-align:center">
          Entrar al sistema</a>
      </div>"""

    resumen = f"""
    <section class="co-caja co-resumen" aria-labelledby="co-pedido">
      <h2 id="co-pedido">Pedido {_e(pedido.get('numero'))}</h2>
      <div class="co-fila">
        <span><strong>ZenStay {_e(plan.get('nombre'))}</strong><br>Suscripción {_e(periodo)}</span>
        <span class="cifra">{_soles(pedido.get('monto') or 0)}</span>
      </div>
      <div class="co-fila"><span>Estado</span><span class="cifra">{_e(etiqueta)}</span></div>
      <div class="co-total">
        <span>Total</span>
        <span class="cifra">{_soles(pedido.get('monto') or 0)}</span>
      </div>
      <p class="co-nota">Con IGV incluido. Cobra
         {_e(comercio['razon_social'])}, RUC {_e(comercio['ruc'])}.</p>
    </section>"""

    interior = f"""
  <section class="seccion" style="border-top:0">
    <div class="seccion-titulo" style="margin-bottom:28px">
      <h2>Pedido registrado</h2>
      <p>Guarda este número: <strong>{_e(pedido.get('numero'))}</strong></p>
    </div>
    <div class="co-rejilla">
      {resumen}
      {bloque_pago}
    </div>
  </section>"""

    return _documento(
        f"Pedido {pedido.get('numero')} · ZenStay",
        "Detalle de tu pedido de suscripción a ZenStay.",
        interior, comercio,
    )


# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------
# Todas por tx_global: estas paginas son PUBLICAS, no hay sesion ni hotel del
# que heredar contexto, y el catalogo de planes no pertenece a ninguno.

_COLUMNAS_PLAN = """codigo, nombre, descripcion, precio_mensual, max_habitaciones,
                    facturacion_sunat, reportes_avanzados"""


async def _planes() -> list:
    async with db_pg.tx_global("catalogo publico de planes, no depende de ningun hotel") as conn:
        return await db_pg.varias(
            conn, f"select {_COLUMNAS_PLAN} from planes where activo order by orden")


async def _plan(codigo: str) -> dict | None:
    async with db_pg.tx_global("catalogo publico de planes, no depende de ningun hotel") as conn:
        return await db_pg.uno(
            conn, f"select {_COLUMNAS_PLAN} from planes where codigo = $1 and activo", codigo)


def _sin_cache(cuerpo: str, codigo: int = 200) -> HTMLResponse:
    """El precio y el estado del pedido cambian: nada de esto se guarda.

    Cloudflare esta delante y cachea con su propio criterio si el origen no
    dice nada. Un checkout servido desde cache es un total equivocado o el
    pedido de otro.
    """
    return HTMLResponse(cuerpo, status_code=codigo,
                        headers={"Cache-Control": "no-store, must-revalidate"})


# ---------------------------------------------------------------------------
# Rutas
# ---------------------------------------------------------------------------

@router.get("/precios", response_class=HTMLResponse)
async def precios():
    """Catalogo publico. Sustituye al 307 que llevaba al ancla /#planes."""
    return _sin_cache(pagina_precios(await _planes(), COMERCIO))


@router.get("/comprar/{plan_codigo}", response_class=HTMLResponse)
async def checkout(plan_codigo: str, periodo: str = "mensual", error: str = ""):
    """Resumen del pedido y formulario. Publica: no exige sesion.

    Quien llega sin cuenta ve el mismo total que un cliente y la crea en el
    propio formulario al pagar. Mandarle antes a /registro es lo que hacia el
    sitio, y es exactamente lo que la pasarela no encontraba.
    """
    if periodo not in PERIODOS:
        periodo = "mensual"

    plan = await _plan(plan_codigo)
    # Un plan inexistente, desactivado o gratuito no tiene checkout. El de
    # prueba cae aqui: no hay nada que cobrar, se registra uno y ya esta.
    if not plan or precio_de(plan, periodo) <= 0:
        return RedirectResponse("/precios", status_code=303)

    return _sin_cache(pagina_checkout(
        plan, periodo, desglose(precio_de(plan, periodo)), error, COMERCIO))


def _pagina_con_error(plan: dict, periodo: str, mensaje: str, valores: dict) -> HTMLResponse:
    """Vuelve al checkout con el aviso en linea y lo escrito intacto.

    Sin la contrasena, que no se devuelve nunca: rebotarla en el HTML la
    dejaria en el historial del navegador y en cualquier cache intermedia.
    """
    return _sin_cache(pagina_checkout(
        plan, periodo, desglose(precio_de(plan, periodo)), mensaje, COMERCIO, valores))


@router.post("/comprar")
async def confirmar(
    request: Request,
    plan: str = Form(...),
    periodo: str = Form("mensual"),
    modo: str = Form("nuevo"),
    hotel_name: str = Form(""),
    ruc: str = Form(""),
    admin_name: str = Form(""),
    admin_email: str = Form(""),
    admin_password: str = Form(""),
    email: str = Form(""),
    password: str = Form(""),
):
    """Del boton de pagar al pedido, creando el hotel por el camino si falta.

    EL ORDEN NO ES EL COMODO, Y ES A PROPOSITO

      Primero se valida el plan, despues se resuelve el hotel y solo al final
      se registra el pedido. Al reves -- crear el hotel y luego descubrir que
      el plan no existe -- dejaria hoteles huerfanos cada vez que alguien
      toquetee el formulario o que un plan se desactive con un checkout abierto
      en otra pestana.

    LAS VALIDACIONES SON LAS DE POST /api/registro, NO UNAS PARECIDAS

      RUC de once digitos y unico, correo unico, contrasena de ocho. Si aqui se
      relajaran, este formulario seria la puerta trasera para crear hoteles que
      el alta normal rechaza.

    Se responde 200 con la pagina de vuelta, no un 4xx: es el mismo patron que
    el checkout sin JavaScript de CargoXprez, y evita que un intermediario
    convierta un error de formulario en su propia pagina de error.
    """
    periodo = periodo if periodo in PERIODOS else "mensual"
    modo = "existente" if modo == "existente" else "nuevo"

    elegido = await _plan(plan)
    if not elegido or precio_de(elegido, periodo) <= 0:
        return RedirectResponse("/precios", status_code=303)

    monto = precio_de(elegido, periodo)
    hotel_name = (hotel_name or "").strip()
    ruc = (ruc or "").strip()
    admin_name = (admin_name or "").strip()
    admin_email = (admin_email or "").strip().lower()
    email = (email or "").strip().lower()
    valores = {"hotel_name": hotel_name, "ruc": ruc, "admin_name": admin_name,
               "admin_email": admin_email, "email": email}

    def con_error(mensaje: str):
        return _pagina_con_error(elegido, periodo, mensaje, valores)

    # `server` se importa aqui dentro y no arriba: server.py importa este
    # modulo para montar el router, asi que hacerlo al reves en el nivel
    # superior seria un ciclo. Cuando llega una peticion, server ya esta
    # cargado del todo.
    import server

    if modo == "nuevo":
        if len(hotel_name) < 2:
            return con_error("Falta el nombre del hotel.")
        if not (ruc.isdigit() and len(ruc) == 11):
            return con_error("El RUC debe ser numérico, de 11 dígitos.")
        if len(admin_name) < 2:
            return con_error("Falta tu nombre.")
        if "@" not in admin_email or "." not in admin_email.split("@")[-1]:
            return con_error("Ese correo no parece válido.")
        if len(admin_password) < 8:
            return con_error("La contraseña debe tener al menos 8 caracteres.")

        async with db_pg.tx_global("checkout publico: el hotel todavia no existe") as conn:
            if await conn.fetchval("select 1 from tenants where ruc = $1", ruc):
                return con_error(
                    "Ya existe un hotel registrado con este RUC. Si es el tuyo, "
                    "usa «Ya tengo cuenta» para contratar el plan.")
            if await conn.fetchval("select 1 from users where email = $1", admin_email):
                return con_error(
                    "Ese correo ya está registrado. Usa «Ya tengo cuenta» más abajo.")

            # Hotel y administrador en UNA transaccion, igual que /api/registro:
            # si la segunda insercion falla no queda un hotel sin nadie que
            # pueda entrar.
            tenant_id = await conn.fetchval(
                """insert into tenants (name, ruc, razon_social, nombre_comercial, email,
                                        plan_codigo, subscription_status, trial_ends_at)
                   values ($1, $2, $1, $1, $3, 'prueba', 'prueba',
                           now() + ($4 || ' days')::interval)
                   returning id""",
                hotel_name, ruc, admin_email, str(server.DIAS_PRUEBA),
            )
            await conn.execute(
                """insert into users (tenant_id, email, password_hash, full_name, role)
                   values ($1, $2, $3, $4, 'ADMIN')""",
                tenant_id, admin_email, server.hash_password(admin_password), admin_name,
            )
        correo_pedido = admin_email
        log.info("Checkout publico: hotel creado para el plan %s (%s)", plan, periodo)

    else:
        if not email or not password:
            return con_error("Escribe tu correo y tu contraseña.")
        usuario = await db_pg.autenticar(email)
        # Mismo mensaje para "no existe" y "contrasena mala": distinguirlos
        # convierte este formulario publico en un comprobador de correos.
        if not usuario or not server.verify_password(password, usuario["password_hash"]):
            return con_error("Correo o contraseña incorrectos.")
        if not usuario.get("is_active", True):
            return con_error("Esa cuenta está desactivada. Escribe a "
                             f"{COMERCIO['email']}.")
        if not usuario.get("tenant_id"):
            return con_error("Esa cuenta no pertenece a ningún hotel.")

        async with db_pg.tx_global("checkout publico: comprobar el hotel del que ya tiene cuenta") as conn:
            activo = await conn.fetchval(
                "select is_active from tenants where id = $1",
                db_pg.a_uuid(usuario["tenant_id"], "tenant_id"))
        if activo is False:
            return con_error("Este hotel está desactivado. Escribe a "
                             f"{COMERCIO['email']} antes de contratar.")
        tenant_id = db_pg.a_uuid(usuario["tenant_id"], "tenant_id")
        correo_pedido = email

    numero = izipay.nuevo_numero_orden()
    async with db_pg.tx_global("checkout publico: registrar el pedido sin sesion") as conn:
        await conn.execute(
            """insert into pagos_suscripcion
                   (tenant_id, plan_codigo, periodo, monto, moneda, estado, metodo,
                    izipay_order_number, respuesta)
               values ($1, $2, $3, $4, 'PEN', 'pendiente', 'izipay', $5, $6::jsonb)""",
            tenant_id, elegido["codigo"], periodo, monto, numero,
            _json_pedido(correo_pedido, request),
        )
    log.info("Checkout publico: pedido %s registrado (plan %s, %s)", numero, plan, periodo)

    # 303 y no 307: despues de un POST hay que dejar una URL que se pueda
    # recargar sin reenviar el formulario.
    return RedirectResponse(f"/comprar/pedido/{quote(numero)}", status_code=303)


def _json_pedido(correo: str, request: Request) -> str:
    """Lo que se sabe del pedido antes de que exista la pasarela.

    Se guarda en `respuesta` porque es la columna que acaba teniendo el rastro
    completo del cobro: primero lo nuestro, luego lo que conteste Izipay.
    """
    return json.dumps({
        "origen": "checkout_publico",
        "email": correo,
        "ip": request.client.host if request.client else None,
        "modo_pasarela": izipay.modo(),
    })


@router.get("/comprar/pedido/{numero}", response_class=HTMLResponse)
async def pedido(numero: str):
    """El pedido, su total y su estado.

    Es publica y se identifica solo por el numero de orden. El numero lleva
    seis bytes de aleatoriedad (ver izipay.nuevo_numero_orden) y lo unico que
    muestra es plan, importe y estado -- ni correo, ni RUC, ni nada del hotel.
    Pedir sesion aqui dejaria fuera al que acaba de crear su cuenta y todavia
    no ha entrado, que es justo el caso normal.
    """
    async with db_pg.tx_global("checkout publico: consultar un pedido sin sesion") as conn:
        fila = await db_pg.uno(
            conn,
            """select p.izipay_order_number as numero, p.estado, p.monto, p.periodo,
                      p.plan_codigo, pl.nombre as plan_nombre, pl.descripcion,
                      pl.max_habitaciones, pl.facturacion_sunat, pl.reportes_avanzados
                 from pagos_suscripcion p
                 join planes pl on pl.codigo = p.plan_codigo
                where p.izipay_order_number = $1""",
            numero)

    if not fila:
        return RedirectResponse("/precios", status_code=303)

    plan = {"codigo": fila["plan_codigo"], "nombre": fila["plan_nombre"],
            "descripcion": fila["descripcion"], "max_habitaciones": fila["max_habitaciones"],
            "facturacion_sunat": fila["facturacion_sunat"],
            "reportes_avanzados": fila["reportes_avanzados"]}

    modo = izipay.modo()
    pedido_vista = {"numero": fila["numero"], "estado": fila["estado"],
                    "monto": fila["monto"], "periodo": fila["periodo"]}

    if modo != "simulado" and fila["estado"] == "pendiente":
        # Con credenciales de verdad se pide el token de sesion aqui, al pintar
        # la pagina, y no al confirmar el formulario: si la pasarela falla, el
        # hotel ya esta creado y el pedido guardado, y basta con recargar.
        sesion = await izipay.generar_token_sesion(
            fila["numero"], float(fila["monto"]), COMERCIO["email"])
        if sesion.get("ok"):
            pedido_vista["token_pasarela"] = sesion["token"]
            # POR_CONFIRMAR: la URL a la que se envia el formToken. Sin ella
            # confirmada, el boton no puede prometer un cobro.
            pedido_vista["url_pasarela"] = ""
        else:
            log.warning("No se pudo obtener token de Izipay para %s", fila["numero"])

    return _sin_cache(pagina_pedido(pedido_vista, plan, COMERCIO, modo))
