"""Maquina de estados de la suscripcion del hotel y lo que la mueve Mercado Pago.

Adaptado de LicitaPro (shared/suscripciones.py, sobre todo aplicar_pago_mp).
Los estados son los de db/migrations/002_suscripciones.sql:

    prueba     -> activa      pago confirmado
    prueba     -> vencida     se acabaron los dias de prueba sin pagar
    activa     -> vencida     llego la renovacion sin cobro exitoso
    vencida    -> activa      pago confirmado (reintento o manual)
    vencida    -> suspendida  pasaron los dias de gracia
    cualquiera -> cancelada   el hotel pide parar el cobro (conserva el acceso
                              hasta el fin del periodo pagado)

EL VENCIMIENTO SE EVALUA AL LEER

  `vencida` y `suspendida` no las escribe ningun proceso nocturno -- ZenStay no
  tiene cron --, las deduce estado_efectivo_de() a partir del estado guardado
  y de las fechas. Asi el estado es correcto aunque nadie haya corrido nada.

DIFERENCIAS CON LICITAPRO, Y POR QUE

  - Las fechas son `timestamptz` y se escriben con now(). LicitaPro guarda hora
    de pared de Lima en `timestamp` sin zona y necesita AHORA_SQL; aqui no.
  - El periodo se suma en MESES DE CALENDARIO (interval '1 month'), no en 30
    dias. Mercado Pago cobra el mismo dia de cada mes: con 30 dias el
    vencimiento se adelanta 5 dias por ano al cobro real, y al segundo ano un
    hotel que paga puntual caeria en `suspendida` (la gracia es de 7).
  - No hay contador de intentos fallidos. Un cobro rechazado se asienta como
    'fallido' (una vez por factura) y el corte lo deciden las fechas: vencida
    al pasar subscription_ends_at, suspendida 7 dias despues. Asi un rechazo
    nunca recorta un periodo que ya estaba pagado.
  - Un hotel en 'prueba' cuyo primer cobro rechaza Mercado Pago (que entonces
    cancela la suscripcion) sigue en 'prueba': no pierde los dias gratis.
"""
import logging
from datetime import datetime, timedelta, timezone

import db_pg

log = logging.getLogger("zenstay.suscripciones")

DIAS_GRACIA = 7
ESTADOS = ("prueba", "activa", "vencida", "suspendida", "cancelada")
#: Lo que se suma por cada cobro aprobado. Ver la cabecera: meses, no dias.
INTERVALO = {"mensual": "1 month", "anual": "12 months"}


def _ahora() -> datetime:
    return datetime.now(timezone.utc)


def _fecha(valor):
    """Acepta datetime o el ISO que devuelve db_pg.uno()."""
    if valor is None or isinstance(valor, datetime):
        return valor
    return datetime.fromisoformat(str(valor))


def vence_de(fila: dict):
    """Hasta cuando cuenta lo que tiene el hotel: lo pagado, o la prueba."""
    pagado = _fecha(fila.get("subscription_ends_at"))
    if pagado:
        return pagado
    if fila.get("subscription_status") == "prueba":
        return _fecha(fila.get("trial_ends_at"))
    return None


def estado_efectivo_de(estado: str, vence, ahora: datetime | None = None,
                       gracia_hasta=None) -> str:
    """El estado que de verdad aplica hoy, a partir del guardado y las fechas.

    Sin fecha no se deduce nada: un hotel 'activa' sin subscription_ends_at
    (los de antes de cobrar, como Confort Inn) sigue 'activa'. Es lo que
    impide que este cambio deje fuera a quien ya estaba.
    """
    ahora = ahora or _ahora()
    vence = _fecha(vence)
    if estado in ("prueba", "activa") and vence and vence < ahora:
        estado = "vencida"
    if estado == "vencida" and vence:
        limite = _fecha(gracia_hasta) or vence + timedelta(days=DIAS_GRACIA)
        if limite < ahora:
            estado = "suspendida"
    return estado


def tiene_acceso(estado_efectivo: str, vence, ahora: datetime | None = None,
                 con_acceso=("prueba", "activa", "vencida")) -> bool:
    """Si un estado ya resuelto deja operar.

    `con_acceso` es server.ESTADOS_CON_ACCESO. La unica regla que se anade es
    la de LicitaPro: `cancelada` con el periodo pagado por delante sigue
    dentro. "Cancelas cuando quieras y el servicio sigue activo hasta el fin
    del periodo ya pagado" lo dicen los terminos; cortar al instante seria
    incumplirlo.
    """
    if estado_efectivo in con_acceso:
        return True
    if estado_efectivo == "cancelada":
        vence = _fecha(vence)
        return bool(vence and vence >= (ahora or _ahora()))
    return False


async def _auditar(conn, tenant_id, accion: str, despues: dict):
    # user_id NULL: no lo hizo una persona de este sistema, lo hizo Mercado
    # Pago. Mismo criterio que tenia el IPN de Izipay.
    await conn.execute(
        """insert into audit_logs (tenant_id, user_id, entity, action, before_json, after_json)
           values ($1, null, 'suscripcion_mercadopago', $2, null, $3)""",
        tenant_id, accion, despues)


# ─── La suscripcion viva ─────────────────────────────────

async def preapproval_de(tenant_id) -> str | None:
    async with db_pg.tx_global("mercadopago: leer la suscripcion viva de un hotel") as conn:
        return await conn.fetchval(
            "select mp_preapproval_id from tenants where id = $1", db_pg.a_uuid(tenant_id))


async def vincular_preapproval(tenant_id, preapproval_id: str) -> bool:
    """Ata la suscripcion al hotel. False si el hotel ya tiene otra.

    La condicion va en el UPDATE y no en un SELECT previo: dos suscripciones
    pagadas casi a la vez no pueden pasar las dos.
    """
    async with db_pg.tx_global("webhook de Mercado Pago: vincular suscripcion") as conn:
        fila = await conn.fetchval(
            """update tenants set mp_preapproval_id = $2
                where id = $1
                  and (mp_preapproval_id is null or mp_preapproval_id = $2)
            returning id""",
            db_pg.a_uuid(tenant_id), preapproval_id)
    return fila is not None


async def olvidar_preapproval(preapproval_id: str) -> dict | None:
    """Suelta una suscripcion cancelada. Devuelve {id, estado} del hotel, o None."""
    async with db_pg.tx_global("webhook de Mercado Pago: soltar suscripcion cancelada") as conn:
        return await db_pg.uno(
            conn,
            """update tenants set mp_preapproval_id = null
                where mp_preapproval_id = $1
            returning id, subscription_status""",
            preapproval_id)


async def marcar_cancelada(tenant_id, conn=None) -> bool:
    """El hotel deja de renovar. NO toca subscription_ends_at: es la fecha hasta
    la que tiene_acceso() le sigue dejando entrar.

    Solo cancela a quien paga ('activa' o 'vencida'). Un hotel en 'prueba' que
    nunca llego a pagar se queda en 'prueba' con sus dias gratis; uno ya
    suspendido o cancelado, como esta.
    """
    if conn is None:
        async with db_pg.tx_global("suscripcion: marcar cancelada") as propia:
            return await marcar_cancelada(tenant_id, propia)
    tid = db_pg.a_uuid(tenant_id)
    hecho = await conn.fetchval(
        """update tenants
              set subscription_status = 'cancelada', cancelada_en = now(),
                  mp_preapproval_id = null
            where id = $1 and subscription_status in ('activa', 'vencida')
        returning id""", tid)
    if not hecho:
        await conn.execute("update tenants set mp_preapproval_id = null where id = $1", tid)
    else:
        await _auditar(conn, tid, "cancel", {"subscription_status": "cancelada"})
    return bool(hecho)


# ─── Los cobros ──────────────────────────────────────────

async def aplicar_pago_mp(tenant_id, plan_codigo: str, periodo: str, pago_id: str,
                          monto, respuesta: dict | None = None) -> str:
    """Asienta una factura aprobada. 'aplicado', 'repetido' o 'sin_fila'.

    La idempotencia la da el indice unico de `mp_payment_id`. Una factura que
    antes entro rechazada y ahora viene aprobada es la MISMA fila: Mercado Pago
    reintenta el cobro sobre la misma factura.

    El periodo se suma desde el vencimiento si aun no paso -- o desde el fin de
    la prueba, si esta en prueba --: lo que quedaba no se pierde. Si ya paso,
    desde hoy.
    """
    if periodo not in INTERVALO:
        return "sin_fila"
    tid = db_pg.a_uuid(tenant_id)
    async with db_pg.tx_global("webhook de Mercado Pago: aplicar un cobro aprobado") as conn:
        hotel = await conn.fetchrow(
            "select id from tenants where id = $1 for update", tid)
        if not hotel:
            return "sin_fila"
        previo = await conn.fetchrow(
            "select id, estado from pagos_suscripcion where mp_payment_id = $1", pago_id)
        if previo and previo["estado"] in ("pagado", "devuelto"):
            return "repetido"
        if previo:
            await conn.execute(
                """update pagos_suscripcion
                      set estado = 'pagado', monto = $2, plan_codigo = $3, periodo = $4,
                          respuesta = $5, confirmado_en = now()
                    where id = $1""",
                previo["id"], monto, plan_codigo, periodo, respuesta)
        else:
            nuevo = await conn.fetchval(
                """insert into pagos_suscripcion
                       (tenant_id, plan_codigo, periodo, monto, moneda, estado, metodo,
                        mp_payment_id, respuesta, confirmado_en)
                   values ($1, $2, $3, $4, 'PEN', 'pagado', 'mercadopago', $5, $6, now())
                   -- Mismo predicado que el indice parcial: sin el, Postgres no
                   -- lo reconoce como arbitro del ON CONFLICT.
                   on conflict (mp_payment_id) where mp_payment_id is not null
                   do nothing
                   returning id""",
                tid, plan_codigo, periodo, monto, pago_id, respuesta)
            if not nuevo:
                return "repetido"

        despues = await db_pg.uno(
            conn,
            f"""update tenants
                   set plan_codigo = $2,
                       subscription_status = 'activa',
                       cancelada_en = null,
                       subscription_ends_at =
                           greatest(coalesce(subscription_ends_at,
                                             case when subscription_status = 'prueba'
                                                  then trial_ends_at end,
                                             now()),
                                    now()) + interval '{INTERVALO[periodo]}',
                       grace_ends_at =
                           greatest(coalesce(subscription_ends_at,
                                             case when subscription_status = 'prueba'
                                                  then trial_ends_at end,
                                             now()),
                                    now()) + interval '{INTERVALO[periodo]}'
                           + interval '{DIAS_GRACIA} days'
                 where id = $1
             returning plan_codigo, subscription_status, subscription_ends_at""",
            tid, plan_codigo)
        await _auditar(conn, tid, "pago", {**despues, "mp_payment_id": pago_id,
                                           "monto": float(monto), "periodo": periodo})
    log.info("Factura %s de Mercado Pago aplicada al hotel %s", pago_id, tid)
    return "aplicado"


async def registrar_rechazo_mp(tenant_id, plan_codigo: str, periodo: str, pago_id: str,
                               monto, respuesta: dict | None = None) -> bool:
    """Asienta un cobro rechazado una sola vez por factura. No cambia el estado.

    Ver la cabecera: el corte lo deciden las fechas, no un contador.
    """
    if periodo not in INTERVALO:
        return False
    async with db_pg.tx_global("webhook de Mercado Pago: asentar un rechazo") as conn:
        nuevo = await conn.fetchval(
            """insert into pagos_suscripcion
                   (tenant_id, plan_codigo, periodo, monto, moneda, estado, metodo,
                    mp_payment_id, respuesta, confirmado_en)
               select t.id, $2, $3, $4, 'PEN', 'fallido', 'mercadopago', $5, $6, now()
                 from tenants t where t.id = $1
               on conflict (mp_payment_id) where mp_payment_id is not null
               do nothing
               returning id""",
            db_pg.a_uuid(tenant_id), plan_codigo, periodo,
            monto if monto is not None else 0, pago_id, respuesta)
    return nuevo is not None


async def devolver_pago_mp(cobro_id: str) -> str:
    """Deshace un cobro devuelto. 'devuelto' o 'sin_efecto'.

    `cobro_id` es el id del pago (/v1/payments), no el de la factura, y por eso
    se busca dentro de `respuesta`. El estado 'devuelto' hace que un aviso
    repetido no quite el periodo dos veces. Si el comprobante seguia
    pendiente, el disparador lo pasa a 'no_aplica'; si ya estaba emitido, el
    panel del dueno lo lista para la nota de credito.
    """
    async with db_pg.tx_global("webhook de Mercado Pago: aplicar una devolucion") as conn:
        fila = await conn.fetchrow(
            """update pagos_suscripcion
                  set estado = 'devuelto'
                where metodo = 'mercadopago' and estado = 'pagado'
                  and respuesta->'payment'->>'id' = $1
            returning tenant_id, periodo""",
            str(cobro_id))
        if not fila:
            return "sin_efecto"
        intervalo = INTERVALO.get(fila["periodo"], "1 month")
        # Nunca antes de hoy: el hotel pasa a vencida, no a una fecha pasada
        # que le quitaria tambien los dias de gracia.
        await conn.execute(
            f"""update tenants
                   set subscription_ends_at =
                           greatest(subscription_ends_at - interval '{intervalo}', now()),
                       grace_ends_at =
                           greatest(subscription_ends_at - interval '{intervalo}', now())
                           + interval '{DIAS_GRACIA} days'
                 where id = $1""",
            fila["tenant_id"])
        await _auditar(conn, fila["tenant_id"], "devolucion", {"cobro_id": str(cobro_id)})
    log.info("Cobro %s de Mercado Pago devuelto: se quita su periodo al hotel %s",
             cobro_id, fila["tenant_id"])
    return "devuelto"
