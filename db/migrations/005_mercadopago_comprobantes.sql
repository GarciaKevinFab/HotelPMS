-- ============================================================================
-- 005 - Mercado Pago Suscripciones y comprobantes emitidos a mano
-- ============================================================================
-- Se aplica despues de 004_auditoria_jsonb_doble_serializado.sql y ANTES de
-- desplegar el backend que la usa: el codigo nuevo lee columnas que solo
-- existen desde aqui (ver docs/MERCADOPAGO.md, "Orden de despliegue").
--
--     /opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos
--     docker exec -i zenstay-postgres psql -v ON_ERROR_STOP=1 -U postgres \
--       -d zenstay < db/migrations/005_mercadopago_comprobantes.sql
--
-- Es idempotente y va en UNA transaccion: o entra entera o no entra nada.
-- Solo anade tablas, columnas nulables (o con default), indices y un
-- disparador. No borra ni reescribe datos.
--
-- ---------------------------------------------------------------------------
-- POR QUE MERCADO PAGO Y NO IZIPAY
-- ---------------------------------------------------------------------------
-- El adaptador de Izipay (backend/izipay.py) nunca se verifico contra la API
-- real: los nombres de campo, la firma del IPN y la URL del formulario seguian
-- marcados POR_CONFIRMAR. LicitaPro -- la misma empresa, SOLUCIONES
-- INFORMATICAS MDD S.A.C., RUC 20490042068, y la misma cuenta de Mercado Pago
-- -- ya cobra con Mercado Pago Suscripciones en produccion (pago real del
-- 6-nov-2026). ZenStay adapta ese diseno y retira Izipay.
--
-- Las columnas izipay_order_number / izipay_transaction_id se CONSERVAN: el
-- numero de pedido del checkout simulado sigue viviendo en la primera, y
-- renombrar una columna con indice unico solo por estetica es el tipo de
-- cambio que rompe un despliegue a medias.
--
-- ---------------------------------------------------------------------------
-- QUE CREA
-- ---------------------------------------------------------------------------
--   tenants.mp_preapproval_id        la suscripcion viva en Mercado Pago
--   tenants.cancelada_en             cuando el hotel pidio parar el cobro
--   pagos_suscripcion.mp_payment_id  la factura (authorized_payment) del periodo
--   pagos_suscripcion.estado         admite 'devuelto'
--   datos_facturacion                boleta o factura, DNI o RUC, por hotel
--   pagos_suscripcion.comp_*         la foto de esos datos y el comprobante
--   marcar_comprobante()             el disparador que lo pide
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Identificadores de Mercado Pago
-- ---------------------------------------------------------------------------
-- El indice unico de mp_payment_id es la idempotencia del webhook: un aviso
-- repetido no puede conceder dos veces un periodo, lo diga el codigo o no. El
-- de mp_preapproval_id impide que dos hoteles reclamen la misma suscripcion.
alter table tenants add column if not exists mp_preapproval_id text;
alter table tenants add column if not exists cancelada_en timestamptz;
create unique index if not exists tenants_mp_preapproval_idx
    on tenants (mp_preapproval_id) where mp_preapproval_id is not null;

alter table pagos_suscripcion add column if not exists mp_payment_id text;
create unique index if not exists pagos_mp_payment_idx
    on pagos_suscripcion (mp_payment_id) where mp_payment_id is not null;

-- 'devuelto': el dinero volvio al cliente (devolucion total o contracargo).
-- Es distinto de 'anulado' -- que nunca llego a cobrarse -- y dejarlo en
-- 'pagado' haria que el cobro siguiera sumando en los ingresos.
alter table pagos_suscripcion drop constraint if exists pagos_suscripcion_estado_check;
alter table pagos_suscripcion add constraint pagos_suscripcion_estado_check
    check (estado in ('pendiente', 'pagado', 'fallido', 'anulado', 'devuelto'));

comment on column tenants.mp_preapproval_id is
    'Suscripcion (preapproval) viva de Mercado Pago. La ata el webhook al '
    'autorizarse y la suelta al cancelarse. NULL = sin cobro automatico.';

-- ---------------------------------------------------------------------------
-- 2. Datos de facturacion del hotel
-- ---------------------------------------------------------------------------
-- Uno por hotel: lo que se vende es el hotel (mismo criterio que la 002).
-- Boleta: documento opcional (DNI de 8 o RUC de 11). Factura: RUC de 11.
create table if not exists datos_facturacion (
    tenant_id      uuid primary key references tenants(id) on delete cascade,
    tipo           text not null check (tipo in ('boleta', 'factura')),
    documento      text,
    nombre         text,
    direccion      text,
    actualizado_en timestamptz not null default now(),
    check (tipo = 'boleta' or documento ~ '^[0-9]{11}$'),
    check (documento is null or documento ~ '^([0-9]{8}|[0-9]{11})$')
);

-- Misma politica que el resto de tablas con tenant_id (ver db/rls.sql y la
-- 003): sin esto, entre aplicar esta migracion y volver a correr rls.sql, un
-- hotel podria leer el RUC y la direccion de los demas.
alter table datos_facturacion enable row level security;
alter table datos_facturacion force  row level security;
drop policy if exists aislamiento_por_hotel on datos_facturacion;
create policy aislamiento_por_hotel on datos_facturacion
    for all to app_backend
    using      (app_is_superadmin() or tenant_id = app_current_tenant_id())
    with check (app_is_superadmin() or tenant_id = app_current_tenant_id());
grant select, insert, update, delete on datos_facturacion to app_backend;

-- ---------------------------------------------------------------------------
-- 3. El comprobante de cada cobro
-- ---------------------------------------------------------------------------
-- comp_estado:
--     NULL        cobro anterior a esta migracion, o de importe cero
--     pendiente   cobrado; el dueno tiene que emitirlo en BSNegocios
--     emitido     registrado con serie, numero y (normalmente) el PDF
--     no_aplica   no lleva comprobante (devuelto antes de emitir, cortesia...)
--
-- POR QUE EL PDF VA EN LA BASE Y NO EN DISCO
--
--   LicitaPro lo guarda en un directorio. Aqui el contenedor del backend se
--   reconstruye entero en cada despliegue (tools/desplegar.sh) y no tiene
--   ningun volumen: un archivo escrito en su disco desaparece en el siguiente
--   `docker compose up --build`. El unico almacenamiento que sobrevive es el
--   volumen de Postgres, que ademas es lo que respalda tools/respaldar.sh.
--   Son pocos PDF de pocos cientos de KB (tope de 5 MB en el backend).
alter table pagos_suscripcion add column if not exists comp_estado       text;
alter table pagos_suscripcion add column if not exists comp_tipo         text;
alter table pagos_suscripcion add column if not exists comp_documento    text;
alter table pagos_suscripcion add column if not exists comp_nombre       text;
alter table pagos_suscripcion add column if not exists comp_direccion    text;
alter table pagos_suscripcion add column if not exists comp_serie        text;
alter table pagos_suscripcion add column if not exists comp_numero       text;
alter table pagos_suscripcion add column if not exists comp_pdf          bytea;
alter table pagos_suscripcion add column if not exists comp_nota         text;
alter table pagos_suscripcion add column if not exists comp_emitido_en   timestamptz;
alter table pagos_suscripcion add column if not exists comp_avisado_en   timestamptz;
alter table pagos_suscripcion add column if not exists comp_recordado_en timestamptz;

alter table pagos_suscripcion drop constraint if exists pagos_comp_estado_valido;
alter table pagos_suscripcion add constraint pagos_comp_estado_valido
    check (comp_estado is null or comp_estado in ('pendiente', 'emitido', 'no_aplica'));

-- Una misma serie y numero no puede ir en dos cobros.
create unique index if not exists pagos_comp_numero_idx
    on pagos_suscripcion (comp_serie, comp_numero) where comp_numero is not null;
create index if not exists pagos_comp_pendiente_idx
    on pagos_suscripcion (comp_estado) where comp_estado = 'pendiente';

-- POR QUE UN DISPARADOR Y NO CODIGO EN CADA CAMINO DE COBRO
--
--   Un cobro llega a 'pagado' por mas de un camino (el webhook de Mercado
--   Pago hoy; un pago manual o una pasarela nueva manana). Si cada uno tuviera
--   que acordarse de pedir el comprobante, el que se olvidara dejaria un cobro
--   sin comprobante y sin aviso. El disparador lo hace en la misma transaccion
--   que el cobro, venga de donde venga, y toma la foto de los datos de
--   facturacion EN ESE MOMENTO: cambiarlos despues no altera un cobro viejo.
--
-- SECURITY DEFINER porque datos_facturacion tiene RLS forzado: el webhook
-- escribe con app.is_superadmin=true y lo veria igual, pero el disparador no
-- puede depender de que quien escribe tenga el contexto bien puesto.
create or replace function marcar_comprobante() returns trigger
language plpgsql security definer set search_path = public as $$
declare
    d datos_facturacion%rowtype;
begin
    if new.estado = 'pagado' and new.comp_estado is null and new.monto > 0
       and (tg_op = 'INSERT' or old.estado is distinct from 'pagado') then
        select * into d from datos_facturacion where tenant_id = new.tenant_id;
        new.comp_estado    := 'pendiente';
        new.comp_tipo      := coalesce(d.tipo, 'boleta');
        new.comp_documento := d.documento;
        new.comp_nombre    := d.nombre;
        new.comp_direccion := d.direccion;
    elsif tg_op = 'UPDATE' and new.estado = 'devuelto' and old.estado = 'pagado'
          and new.comp_estado = 'pendiente' then
        -- Devuelto antes de emitir: ya no hay venta que facturar.
        new.comp_estado := 'no_aplica';
        new.comp_nota   := 'Devuelto antes de emitir el comprobante';
    end if;
    return new;
end $$;

drop trigger if exists pagos_marcar_comprobante on pagos_suscripcion;
create trigger pagos_marcar_comprobante
    before insert or update of estado on pagos_suscripcion
    for each row execute function marcar_comprobante();

commit;

-- ============================================================================
-- LOS COBROS ANTERIORES
--
-- Los pagos que ya estaban en 'pagado' quedan con comp_estado NULL: no se
-- piden comprobantes de lo cobrado antes de esto. Al revisar el VPS el
-- 2026-11-07 la tabla pagos_suscripcion estaba vacia.
-- ============================================================================
