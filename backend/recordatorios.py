"""Recordatorio de renovacion del pago adelantado: a 7 dias y a 1 dia del vencimiento.

A QUIEN

  Solo a los hoteles cuyo ULTIMO pago aprobado fue un pago adelantado
  (periodo 'adelantado-N') y que no tienen suscripcion con tarjeta viva
  (mp_preapproval_id nulo): a esos nadie les va a cobrar solo, y si no se
  enteran pasan a 'vencida'. Quien tiene cobro automatico no lo necesita, y
  quien cancelo ('cancelada') ya dijo que no quiere renovar.

  Va al correo del ADMIN activo mas antiguo del hotel (el que contrato), o al
  correo del hotel si no hay ninguno.

QUE LLEVA

  Un enlace a la pagina de pago, /comprar/{plan}?periodo=adelantado-N, con el
  mismo plan y el mismo periodo que pago la ultima vez. NO una preferencia de
  Mercado Pago ya creada: vencen a los 3 dias, y el precio tiene que salir del
  catalogo del dia en que se paga, no del dia en que se mando el correo.

POR QUE NO SE REPITE

  tenants.aviso_renovacion_7d_para y aviso_renovacion_1d_para guardan el
  `subscription_ends_at` para el que ya salio cada aviso (migracion 006). El
  aviso se RESERVA antes de mandar el correo -- un UPDATE condicionado, que
  solo gana una vez -- y se suelta si el correo no sale, para que la pasada
  siguiente lo reintente. Cuando el hotel paga otro periodo el vencimiento
  cambia y los dos avisos vuelven a tocar, una vez cada uno.

  Si el sistema estuvo caido toda la ventana de 7 dias y el hotel ya esta a
  menos de un dia, sale solo el de 1 dia: dos correos seguidos no ayudan.

QUIEN LO CORRE

  El mismo bucle del backend que avisa de los comprobantes pendientes
  (server._bucle_avisos_comprobantes, cada AVISOS_CADA_SEGUNDOS = 10 minutos).
  No hace falta cron. COMPROBANTES_AVISOS=0 apaga los dos.
"""
import logging
from datetime import timezone

import db_pg

log = logging.getLogger("zenstay.recordatorios")

#: (columna, dias antes del vencimiento). El orden importa: se mira primero el
#: aviso mas cercano.
AVISOS = (("aviso_renovacion_1d_para", 1), ("aviso_renovacion_7d_para", 7))


def _meses_texto(periodo: str) -> str:
    meses = periodo.split("-", 1)[1]
    return "1 mes" if meses == "1" else f"{meses} meses"


async def pendientes(conn) -> list[dict]:
    """Hoteles a menos de 7 dias de vencer cuyo ultimo pago fue adelantado."""
    filas = await conn.fetch(
        """with ultimo as (
               select distinct on (ps.tenant_id)
                      ps.tenant_id, ps.periodo, ps.plan_codigo
                 from pagos_suscripcion ps
                where ps.estado = 'pagado'
                order by ps.tenant_id, coalesce(ps.confirmado_en, ps.created_at) desc
           )
           select t.id, t.name as hotel, t.subscription_ends_at as vence,
                  t.plan_codigo, u.periodo, pl.nombre as plan_nombre,
                  t.aviso_renovacion_7d_para, t.aviso_renovacion_1d_para,
                  coalesce((select us.email from users us
                             where us.tenant_id = t.id and us.role = 'ADMIN'
                               and us.is_active
                             order by us.created_at limit 1), t.email) as correo,
                  extract(epoch from t.subscription_ends_at - now()) / 86400.0 as dias
             from tenants t
             join ultimo u on u.tenant_id = t.id
             join planes pl on pl.codigo = t.plan_codigo
            where u.periodo like 'adelantado-%'
              and t.mp_preapproval_id is null
              and t.subscription_status = 'activa'
              and t.is_active
              and t.subscription_ends_at > now()
              and t.subscription_ends_at <= now() + interval '7 days'
            order by t.subscription_ends_at""")
    return [dict(f) for f in filas]


def _toca(fila: dict) -> tuple[str, int] | None:
    """Que aviso le corresponde hoy, o None si ya salio."""
    for columna, dias in AVISOS:
        if float(fila["dias"]) <= dias:
            if fila[columna] != fila["vence"]:
                return columna, dias
            return None
    return None


def _correo(fila: dict, dias: int, origen: str) -> tuple[str, str, str]:
    """(asunto, html, texto) del recordatorio."""
    import plantillas_correo

    vence = fila["vence"].astimezone(timezone.utc)
    cuando = "mañana" if dias == 1 else "en 7 días"
    enlace = f"{origen}/comprar/{fila['plan_codigo']}?periodo={fila['periodo']}"
    asunto = f"Tu plan de ZenStay vence {cuando}: renueva con Yape o banca móvil"
    texto, cuerpo = plantillas_correo.componer(
        titulo=f"Tu plan vence {cuando}",
        preencabezado=f"Renueva el plan {fila['plan_nombre']} antes del "
                      f"{vence:%d/%m/%Y}",
        intro=[f"El plan {fila['plan_nombre']} de {fila['hotel']} está pagado hasta "
               f"el {vence:%d/%m/%Y}. Como lo pagaste por adelantado, no se renueva "
               f"solo.",
               "Paga con Yape, desde tu banca móvil (BCP, BBVA y otros) o con tarjeta. "
               "Lo que pagues se suma a lo que te queda: no pierdes ningún día."],
        filas=[("Plan", fila["plan_nombre"]),
               ("Vence", f"{vence:%d/%m/%Y}"),
               ("Último periodo pagado", _meses_texto(fila["periodo"]))],
        boton={"texto": "Renovar ahora", "url": enlace},
        aviso="Si no renuevas, tienes 7 días más con el sistema completo. Después ya "
              "no se pueden registrar reservas ni cobros, pero tus datos se conservan.",
    )
    return asunto, cuerpo, texto


async def recordar_renovaciones(enviar, origen: str | None = None) -> int:
    """Manda los recordatorios que tocan. Devuelve cuantos salieron.

    `enviar(destino, asunto, html, texto)` es server.send_email_async; se pasa
    por parametro para que las pruebas no hablen con ningun SMTP.
    """
    import seo

    origen = (origen or seo.url_publica()).rstrip("/")
    async with db_pg.tx_global("recordatorios: hoteles con pago adelantado por vencer") as conn:
        filas = await pendientes(conn)

    enviados = 0
    for fila in filas:
        toca = _toca(fila)
        if not toca or not fila.get("correo"):
            continue
        columna, dias = toca
        previo = fila[columna]
        # Reservar el aviso ANTES de mandarlo: si otra pasada llega a la vez,
        # el UPDATE solo lo gana una.
        async with db_pg.tx_global("recordatorios: reservar el aviso") as conn:
            reservado = await conn.fetchval(
                f"""update tenants set {columna} = $2
                     where id = $1 and subscription_ends_at = $2
                       and {columna} is distinct from $2
                 returning id""",
                fila["id"], fila["vence"])
        if not reservado:
            continue

        asunto, cuerpo, texto = _correo(fila, dias, origen)
        try:
            resultado = await enviar(fila["correo"], asunto, cuerpo, texto)
        except Exception:  # noqa: BLE001 -- un SMTP caido no corta la pasada
            log.exception("Fallo el recordatorio de renovacion del hotel %s", fila["id"])
            resultado = None
        if (resultado or {}).get("status") != "sent":
            # Se suelta para que la siguiente pasada lo reintente.
            async with db_pg.tx_global("recordatorios: soltar un aviso que no salio") as conn:
                await conn.execute(
                    f"update tenants set {columna} = $2 where id = $1 and {columna} = $3",
                    fila["id"], previo, fila["vence"])
            log.warning("No salio el recordatorio de %s dias del hotel %s", dias, fila["id"])
            continue
        enviados += 1
        log.info("Recordatorio de renovacion (%s dias) enviado al hotel %s", dias, fila["id"])
    return enviados
