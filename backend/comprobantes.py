"""Comprobantes de los cobros de suscripcion, emitidos a mano.

Adaptado de LicitaPro (shared/comprobantes.py y la migracion 0029).

COMO FUNCIONA

  1. Al contratar, el hotel elige boleta o factura y da su DNI o RUC
     (`guardar_datos`). Con RUC, la razon social y la direccion salen del
     padron de SUNAT (backend/sunat.py).
  2. Cuando un cobro pasa a 'pagado', el disparador de la base (migracion 005)
     lo marca 'pendiente' con la foto de esos datos.
  3. `avisar` -- cada 10 minutos, desde server.py -- manda al dueno un correo
     con lo que tiene que copiar en BSNegocios, y le recuerda cada 24 h los que
     sigan pendientes.
  4. El dueno (SUPER_ADMIN) registra serie, numero y PDF en la consola
     (/comprobantes), y el hotel lo descarga desde Configuracion > Suscripcion.

ZenStay no emite nada ante SUNAT por la suscripcion: solo ordena el trabajo
manual. (Los comprobantes que el HOTEL emite a SUS huespedes van por el motor propio
y no tienen nada que ver con esto.)

DIFERENCIAS CON LICITAPRO

  - El cliente es el HOTEL (tenant_id uuid), no un usuario.
  - El PDF se guarda en la base (bytea), no en disco: el contenedor no tiene
    volumen y se reconstruye en cada despliegue. Ver la migracion 005.
  - Todas las consultas pasan por db_pg.tx(user): con RLS, un hotel no puede
    ver ni por error el cobro de otro, y ademas se filtra por tenant_id.
"""
import logging
import os
import re
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

import db_pg
import sunat

log = logging.getLogger("zenstay.comprobantes")

TIPOS = ("boleta", "factura")
MAX_PDF = 5 * 1024 * 1024
RECORDAR_CADA_HORAS = 24

_SERIE = re.compile(r"^[FB][A-Z0-9]{3}$")
_NUMERO = re.compile(r"^[0-9]{1,8}$")


def desglose(total) -> dict:
    """Base e IGV de un precio con IGV incluido. Igual que checkout.desglose."""
    centimo = Decimal("0.01")
    total = Decimal(str(total)).quantize(centimo, rounding=ROUND_HALF_UP)
    base = (total / Decimal("1.18")).quantize(centimo, rounding=ROUND_HALF_UP)
    return {"base": base, "igv": total - base, "total": total}


# ─── Datos del cliente ───────────────────────────────────

def validar(tipo: str, documento: str) -> tuple[dict | None, str | None]:
    """Los datos limpios, o el mensaje de error para el formulario.

    Boleta: el documento es opcional (SUNAT admite boletas sin documento por
    debajo de S/ 700, y ningun cobro llega). Si se escribe, tiene que ser un
    DNI de 8 digitos o un RUC valido. Factura: RUC valido, sin excepcion.
    """
    tipo = (tipo or "boleta").strip().lower()
    if tipo not in TIPOS:
        tipo = "boleta"
    documento = re.sub(r"\D", "", documento or "")
    if tipo == "factura":
        if not sunat.ruc_valido(documento):
            return None, "Para factura escribe un RUC válido de 11 dígitos."
    elif documento and len(documento) != 8 and not sunat.ruc_valido(documento):
        return None, "El DNI tiene 8 dígitos. Si no quieres poner documento, déjalo vacío."
    return {"tipo": tipo, "documento": documento or None}, None


async def _razon_y_direccion(documento: str | None, nombre: str | None):
    razon, direccion = (nombre or "").strip() or None, None
    if documento and len(documento) == 11:
        try:
            info = await sunat.consultar_ruc(documento)
        except Exception:  # noqa: BLE001
            log.warning("Consulta RUC fallida al guardar datos de facturacion")
            info = None
        if info:
            razon = info.get("razon_social") or razon
            direccion = info.get("direccion")
    return razon, direccion


async def guardar_datos(tenant_id, datos: dict, nombre: str | None = None,
                        user: dict | None = None) -> None:
    """Guarda boleta o factura y el documento. Con RUC, busca la razon social.

    Con `user` va por tx(user) (Configuracion del hotel); sin el, por
    tx_global (el checkout publico, que aun no tiene sesion). Nunca bloquea
    una compra: si la consulta del RUC falla se guarda igual.
    """
    razon, direccion = await _razon_y_direccion(datos["documento"], nombre)
    sql = """insert into datos_facturacion (tenant_id, tipo, documento, nombre, direccion)
             values ($1, $2, $3, $4, $5)
             on conflict (tenant_id) do update
                set tipo = $2, documento = $3, nombre = $4, direccion = $5,
                    actualizado_en = now()"""
    args = (db_pg.a_uuid(tenant_id), datos["tipo"], datos["documento"], razon, direccion)
    if user is not None:
        async with db_pg.tx(user) as conn:
            await conn.execute(sql, *args)
    else:
        async with db_pg.tx_global("checkout publico: datos de facturacion del hotel") as conn:
            await conn.execute(sql, *args)


async def datos_de(user: dict) -> dict | None:
    async with db_pg.tx(user) as conn:
        return await db_pg.uno(
            conn,
            "select tipo, documento, nombre, direccion from datos_facturacion "
            "where tenant_id = $1", db_pg.a_uuid(user["tenant_id"]))


# ─── Lado del hotel ──────────────────────────────────────

_COLUMNAS_CLIENTE = """id, plan_codigo, periodo, monto, moneda, estado, metodo,
                       created_at, confirmado_en, comp_estado, comp_tipo,
                       comp_serie, comp_numero, comp_emitido_en,
                       (comp_pdf is not null) as comp_tiene_pdf"""


async def pagos_del_hotel(user: dict, limite: int = 50) -> list[dict]:
    """Los cobros del hotel con su comprobante, sin el PDF en si."""
    async with db_pg.tx(user) as conn:
        return await db_pg.varias(
            conn,
            f"""select {_COLUMNAS_CLIENTE} from pagos_suscripcion
                 where tenant_id = $1 and estado in ('pagado', 'devuelto', 'fallido')
                 order by coalesce(confirmado_en, created_at) desc limit $2""",
            db_pg.a_uuid(user["tenant_id"]), limite)


async def pdf_del_cliente(user: dict, pago_id) -> bytes | None:
    """El PDF de un comprobante, SOLO si el cobro es del hotel de quien pide.

    Doble cerrojo: el `tenant_id = $2` explicito y la politica de RLS de
    pagos_suscripcion. Un id de otro hotel devuelve None -> 404, igual que un
    id que no existe: no se distingue "no es tuyo" de "no existe".
    """
    async with db_pg.tx(user) as conn:
        return await conn.fetchval(
            """select comp_pdf from pagos_suscripcion
                where id = $1 and tenant_id = $2 and comp_estado = 'emitido'""",
            db_pg.a_uuid(pago_id), db_pg.a_uuid(user["tenant_id"]))


# ─── Panel del dueno ─────────────────────────────────────

_COLUMNAS = """ps.id, ps.monto, ps.estado, ps.metodo, ps.created_at, ps.confirmado_en,
               ps.izipay_order_number, ps.mp_payment_id, ps.plan_codigo, ps.periodo,
               ps.comp_estado, ps.comp_tipo, ps.comp_documento, ps.comp_nombre,
               ps.comp_direccion, ps.comp_serie, ps.comp_numero,
               (ps.comp_pdf is not null) as comp_tiene_pdf,
               ps.comp_nota, ps.comp_emitido_en,
               t.id as tenant_id, t.name as hotel, t.email, t.ruc as hotel_ruc"""
_DESDE = """from pagos_suscripcion ps join tenants t on t.id = ps.tenant_id"""


def _con_desglose(fila: dict) -> dict:
    p = dict(fila)
    partes = desglose(p["monto"])
    p["base"], p["igv"] = float(partes["base"]), float(partes["igv"])
    p["referencia"] = referencia(p)
    return p


async def panel(user: dict) -> dict:
    """Lo que ve el dueno: pendientes, devueltos con comprobante y recientes."""
    async with db_pg.tx(user) as conn:
        pendientes = await db_pg.varias(
            conn, f"select {_COLUMNAS} {_DESDE} where ps.comp_estado = 'pendiente' "
                  "order by coalesce(ps.confirmado_en, ps.created_at)")
        devueltos = await db_pg.varias(
            conn, f"select {_COLUMNAS} {_DESDE} where ps.estado = 'devuelto' "
                  "and ps.comp_estado = 'emitido' order by ps.confirmado_en desc")
        recientes = await db_pg.varias(
            conn, f"select {_COLUMNAS} {_DESDE} "
                  "where ps.comp_estado in ('emitido', 'no_aplica') "
                  "order by coalesce(ps.comp_emitido_en, ps.created_at) desc limit 30")
    return {"pendientes": [_con_desglose(p) for p in pendientes],
            "devueltos": [_con_desglose(p) for p in devueltos],
            "recientes": [_con_desglose(p) for p in recientes]}


def numero_valido(serie: str, numero: str) -> tuple[str, str] | None:
    serie, numero = (serie or "").strip().upper(), (numero or "").strip()
    if not _SERIE.match(serie) or not _NUMERO.match(numero):
        return None
    return serie, str(int(numero))


def es_pdf(contenido: bytes) -> bool:
    return contenido[:5] == b"%PDF-"


async def registrar(user: dict, pago_id, serie: str, numero: str,
                    emitido: date | None, pdf: bytes | None) -> str | None:
    """Anota el comprobante emitido. None si salio bien; si no, el motivo."""
    limpio = numero_valido(serie, numero)
    if not limpio:
        return ("Serie de 4 caracteres que empiece por F o B (por ejemplo F002) "
                "y número de hasta 8 dígitos.")
    serie, numero = limpio
    if pdf is not None:
        if len(pdf) > MAX_PDF:
            return "El PDF pesa más de 5 MB."
        if not es_pdf(pdf):
            return "El archivo no es un PDF."

    async with db_pg.tx(user) as conn:
        fila = await conn.fetchrow(
            "select comp_estado, comp_tipo from pagos_suscripcion where id = $1 for update",
            db_pg.a_uuid(pago_id))
        if not fila or fila["comp_estado"] != "pendiente":
            return "Ese cobro no tiene un comprobante pendiente."
        if (fila["comp_tipo"] == "factura") != serie.startswith("F"):
            return ("La serie no corresponde: las facturas van con serie F y las "
                    "boletas con serie B.")
        ya = await conn.fetchval(
            "select id from pagos_suscripcion where comp_serie = $1 and comp_numero = $2",
            serie, numero)
        if ya:
            return f"{serie}-{numero} ya está registrado en otro cobro."
        await conn.execute(
            """update pagos_suscripcion
                  set comp_estado = 'emitido', comp_serie = $2, comp_numero = $3,
                      comp_pdf = $4,
                      comp_emitido_en = coalesce($5::date::timestamptz, now())
                where id = $1""",
            db_pg.a_uuid(pago_id), serie, numero, pdf, emitido)
    log.info("Comprobante %s-%s registrado para el cobro %s", serie, numero, pago_id)
    return None


async def no_aplica(user: dict, pago_id, nota: str) -> str | None:
    nota = (nota or "").strip()
    if not nota:
        return "Escribe por qué no lleva comprobante."
    async with db_pg.tx(user) as conn:
        hecho = await conn.fetchval(
            """update pagos_suscripcion set comp_estado = 'no_aplica', comp_nota = $2
                where id = $1 and comp_estado = 'pendiente' returning id""",
            db_pg.a_uuid(pago_id), nota[:300])
    return None if hecho else "Ese cobro no tiene un comprobante pendiente."


async def pdf_para_el_dueno(user: dict, pago_id) -> bytes | None:
    async with db_pg.tx(user) as conn:
        return await conn.fetchval(
            "select comp_pdf from pagos_suscripcion where id = $1",
            db_pg.a_uuid(pago_id))


# ─── Avisos al dueno ─────────────────────────────────────

def referencia(p: dict) -> str:
    return p.get("mp_payment_id") or p.get("izipay_order_number") or str(p.get("id"))


def concepto(plan_codigo: str, periodo: str) -> str:
    """Lo que va en el comprobante: 'Suscripción ZenStay plan pro (mensual)' o
    'ZenStay plan pro, pago adelantado de 3 meses'."""
    if (periodo or "").startswith("adelantado-"):
        meses = periodo.split("-", 1)[1]
        return (f"ZenStay plan {plan_codigo}, pago adelantado de "
                f"{'1 mes' if meses == '1' else meses + ' meses'}")
    return f"Suscripción ZenStay plan {plan_codigo} ({periodo})"


def _filas(p: dict) -> list[tuple[str, str]]:
    partes = desglose(p["monto"])
    tipo = "Factura" if p["comp_tipo"] == "factura" else "Boleta"
    doc = p["comp_documento"] or "sin documento"
    fecha = p["confirmado_en"] or p["created_at"]
    return [
        ("Cobro", f"{referencia(p)} ({p['metodo']})"),
        ("Fecha del pago", fecha.strftime("%d/%m/%Y %H:%M UTC") if fecha else "—"),
        ("Comprobante", f"{tipo} · {doc}"),
        ("Cliente", p["comp_nombre"] or p["hotel"]),
        ("Dirección", p["comp_direccion"] or "—"),
        ("Hotel", f"{p['hotel']} (RUC {p['hotel_ruc']})"),
        ("Correo", p["email"] or "—"),
        ("Concepto", concepto(p["plan_codigo"], p["periodo"])),
        ("Valor de venta", f"S/ {partes['base']:.2f}"),
        ("IGV 18%", f"S/ {partes['igv']:.2f}"),
        ("Total", f"S/ {partes['total']:.2f}"),
    ]


async def avisar(enviar) -> int:
    """Avisa de los cobros nuevos y recuerda los atrasados. Devuelve cuantos.

    `enviar(destino, asunto, html, texto)` es server.send_email_async; se pasa
    por parametro para que las pruebas no hablen con ningun SMTP. Un correo
    por cobro nuevo; despues, uno cada 24 h mientras siga pendiente. Si el
    correo no sale, no se marca: se reintenta en la siguiente pasada.
    """
    import plantillas_correo

    destino = (os.getenv("ZENSTAY_ADMIN_EMAIL") or "").strip()
    if not destino:
        log.warning("Sin ZENSTAY_ADMIN_EMAIL: no se avisa de comprobantes pendientes")
        return 0
    panel_url = os.getenv("ZENSTAY_URL_PUBLICA", "https://zenstay.sisac.pe").rstrip("/")
    async with db_pg.tx_global("avisos de comprobantes: recorre los cobros de todos los hoteles") as conn:
        filas = await conn.fetch(
            f"""select {_COLUMNAS}, ps.comp_avisado_en is null as nuevo {_DESDE}
                 where ps.comp_estado = 'pendiente'
                   and (ps.comp_avisado_en is null
                        or coalesce(ps.comp_recordado_en, ps.comp_avisado_en)
                           < now() - interval '{RECORDAR_CADA_HORAS} hours')
                 order by ps.created_at""")
    enviados = 0
    for f in filas:
        p = dict(f)
        nuevo = p.pop("nuevo")
        tipo = "factura" if p["comp_tipo"] == "factura" else "boleta"
        asunto = (f"Emitir {tipo}: S/ {p['monto']:.2f} de {p['hotel']}" if nuevo
                  else f"Recordatorio: {tipo} pendiente de {p['hotel']}")
        texto, cuerpo = plantillas_correo.componer(
            titulo=f"Emitir {tipo} en BSNegocios" if nuevo else f"Sigue pendiente la {tipo}",
            preencabezado=f"Cobro de S/ {p['monto']:.2f} de {p['hotel']}",
            intro=["Entró un pago de ZenStay. Estos son los datos para emitir "
                   "el comprobante:" if nuevo else
                   "Este cobro todavía no tiene comprobante registrado:"],
            filas=_filas(p),
            boton={"texto": "Registrar el comprobante", "url": f"{panel_url}/comprobantes"},
            aviso="Después de emitirlo, registra la serie, el número y el PDF para "
                  "que el hotel lo descargue desde su cuenta.",
        )
        resultado = await enviar(destino, asunto, cuerpo, texto)
        if (resultado or {}).get("status") != "sent":
            log.warning("No salio el aviso del comprobante del cobro %s", p["id"])
            continue
        columna = "comp_avisado_en" if nuevo else "comp_recordado_en"
        async with db_pg.tx_global("avisos de comprobantes: marcar el aviso enviado") as conn:
            await conn.execute(
                f"update pagos_suscripcion set {columna} = now() where id = $1", p["id"])
        enviados += 1
    return enviados
