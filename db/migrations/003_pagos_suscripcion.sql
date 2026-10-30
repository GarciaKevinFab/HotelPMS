-- ============================================================================
-- 003 - Pagos de suscripcion: la tabla que faltaba para cobrar de verdad
-- ============================================================================
-- Se aplica despues de 002_suscripciones.sql.
--
-- Como aplicarla en el VPS (no hay alembic, esto se corre a mano):
--
--     docker exec -i zenstay-postgres \
--       psql -U postgres -d zenstay < db/migrations/003_pagos_suscripcion.sql
--
-- Es idempotente: se puede volver a correr sin romper nada ni pisar datos.
--
-- ---------------------------------------------------------------------------
-- POR QUE AHORA
-- ---------------------------------------------------------------------------
-- La 002 termina diciendo por que NO habia tabla de pagos: "meter aqui una
-- tabla vacia que nadie escribe solo daria la impresion de que el cobro
-- existe". Ahora si la escribe alguien -- backend/checkout.py crea la fila al
-- confirmar el pedido y POST /api/checkout/izipay/ipn la marca pagada -- asi
-- que la tabla deja de ser decorado.
--
-- El detonante es concreto: Izipay rechazo la afiliacion porque la web "no
-- cuenta con un carrito de compras, proceso de checkout o boton de pago". El
-- checkout publico ya existe; esto es donde aterriza lo que registra.
--
-- ---------------------------------------------------------------------------
-- LA IDEMPOTENCIA DEL COBRO VIVE EN UNA RESTRICCION, NO EN CODIGO PYTHON
-- ---------------------------------------------------------------------------
-- izipay_order_number es UNIQUE. Esa unica palabra es lo que impide que:
--   - un doble clic en "Pagar" cree dos pagos del mismo pedido,
--   - un IPN reenviado por la pasarela (lo hacen, y varias veces) extienda la
--     suscripcion dos veces.
-- El backend se apoya en ella con `update ... where estado <> 'pagado'`: la
-- segunda notificacion no encuentra fila que actualizar y no hace nada. Si
-- esta restriccion se cayera, el bug seria "a algunos hoteles se les regalan
-- meses" y nadie lo reportaria.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Los pagos
-- ---------------------------------------------------------------------------
-- Cuelga de tenants y no de users porque lo que se vende es el hotel: un hotel
-- con cuatro recepcionistas paga una vez (mismo criterio que la 002).
--
-- on delete cascade: cuando el SUPER_ADMIN elimina un hotel se borra todo lo
-- suyo (DELETE /api/tenants/{id} ya lo hace explicitamente tabla por tabla).
-- Conservar pagos de un hotel que ya no existe dejaria filas apuntando a la
-- nada, y el historico contable de verdad esta en Izipay, no aqui.
create table if not exists pagos_suscripcion (
    id                    uuid primary key default gen_random_uuid(),
    tenant_id             uuid not null references tenants(id) on delete cascade,

    -- Que se compro. Referencia al catalogo para que un pago no pueda apuntar
    -- a un plan inventado.
    plan_codigo           text not null references planes(codigo),
    periodo               text not null default 'mensual'
                          check (periodo in ('mensual', 'anual')),

    -- El importe se guarda AQUI y no se lee de planes al mirarlo: los precios
    -- cambian con un UPDATE (la 002 lo dice), y un pago tiene que seguir
    -- diciendo lo que se cobro ese dia, no lo que costaria hoy.
    monto                 numeric(10,2) not null,
    moneda                text not null default 'PEN',

    --     pendiente  se creo el pedido, la pasarela aun no confirmo
    --     pagado     Izipay confirmo el cobro (via IPN)
    --     fallido    la pasarela rechazo la tarjeta
    --     anulado    se dio de baja o se devolvio
    estado                text not null
                          check (estado in ('pendiente', 'pagado', 'fallido', 'anulado')),

    -- 'izipay' o 'manual'. El manual existe porque hay hoteles que pagan en
    -- efectivo, por Yape o por transferencia (ver TenantSuscripcion en
    -- server.py): sin este valor, honrar un pago recibido fuera de la pasarela
    -- obligaria a mentir en el metodo.
    metodo                text,

    -- La llave de idempotencia. Ver la cabecera.
    izipay_order_number   text unique,
    izipay_transaction_id text,

    -- La respuesta cruda de la pasarela, tal cual llego. Es lo unico que
    -- permite reconstruir que paso cuando un cobro se discute meses despues.
    respuesta             jsonb,

    created_at            timestamptz not null default now(),
    confirmado_en         timestamptz
);

-- La consulta caliente es "los pagos de este hotel, del mas nuevo al mas
-- viejo": la pinta el detalle del hotel en la consola del SUPER_ADMIN.
create index if not exists idx_pagos_suscripcion_tenant
    on pagos_suscripcion (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Hasta cuando esta pagado
-- ---------------------------------------------------------------------------
-- POR QUE ES COLUMNA Y NO UN CAMPO DENTRO DE settings
--
--   settings es jsonb y ahi ya vive `suscripcion_manual`, que es una NOTA: lo
--   que el SUPER_ADMIN escribio y cuando. Sirve para leerlo, no para decidir.
--
--   subscription_ends_at es lo contrario: es un dato que el sistema tiene que
--   COMPARAR. "Que hoteles vencen esta semana", "avisar al que le quedan tres
--   dias", "no renovar al que ya pago hasta marzo". Eso son consultas con
--   `where subscription_ends_at < now() + interval '7 days'` y con indice.
--
--   Metido en jsonb, cada una de esas consultas seria
--   `(settings->'suscripcion_manual'->>'vence')::date`, es decir: un cast por
--   fila, sin indice, y sin que la base garantice que ahi dentro hay una fecha
--   -- porque jsonb acepta "proximo mes" igual de bien que "2026-03-01". El
--   dia que alguien escriba basura, el fallo no salta al escribir sino meses
--   despues, al comparar, y en forma de excepcion de casteo en produccion.
--
--   La regla que se sigue en toda la base: si el sistema lo compara, ordena o
--   filtra, es columna con tipo. Si solo lo muestra, puede vivir en settings.
--
-- Nullable a proposito: NULL significa "nunca pago" (esta en prueba, o es un
-- hotel de los de antes). No es lo mismo que una fecha en el pasado, que
-- significa "pago y se le acabo".
alter table tenants add column if not exists subscription_ends_at timestamptz;

comment on column tenants.subscription_ends_at is
    'Hasta cuando esta pagada la suscripcion. NULL = nunca pago. La escribe el '
    'IPN de Izipay y tambien PUT /api/tenants/{id}/suscripcion, para que las '
    'dos vias dejen el hotel en el mismo estado.';

-- ---------------------------------------------------------------------------
-- RLS sobre la tabla nueva
-- ---------------------------------------------------------------------------
-- db/rls.sql genera la politica de aislamiento recorriendo las tablas que
-- tienen columna tenant_id, pero se aplica a mano y no forma parte de esta
-- migracion. Sin esto, entre aplicar la 003 y volver a correr rls.sql, la
-- tabla quedaria SIN RLS y cualquier hotel podria leer los pagos de los demas.
--
-- Se repite aqui la MISMA politica, con el mismo nombre, de forma idempotente:
-- volver a correr rls.sql despues la reemplaza por una identica.
alter table pagos_suscripcion enable row level security;
alter table pagos_suscripcion force  row level security;
drop policy if exists aislamiento_por_hotel on pagos_suscripcion;
create policy aislamiento_por_hotel on pagos_suscripcion
    for all to app_backend
    using      (app_is_superadmin() or tenant_id = app_current_tenant_id())
    with check (app_is_superadmin() or tenant_id = app_current_tenant_id());

grant select, insert, update, delete on pagos_suscripcion to app_backend;

-- ============================================================================
-- LO QUE ESTA MIGRACION **NO** HABILITA
--
-- Tener la tabla no es cobrar. El checkout crea la fila en 'pendiente' y, sin
-- credenciales de Izipay, ahi se queda: backend/izipay.py devuelve modo()
-- 'simulado' y la pagina del pedido lo dice con todas las letras en vez de
-- pintar un boton que aparente cobrar.
--
-- Para que un pago llegue a 'pagado' hacen falta, en el .env del VPS:
--     IZIPAY_MERCHANT_CODE, IZIPAY_PUBLIC_KEY, IZIPAY_API_KEY,
--     IZIPAY_HMAC_KEY  y  IZIPAY_MODO=sandbox (luego produccion)
-- y confirmar los campos marcados POR_CONFIRMAR en backend/izipay.py.
-- ============================================================================
