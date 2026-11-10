-- ============================================================================
-- 007 - Se retira NubeFact; enganche (apagado) hacia el motor propio
-- ============================================================================
-- Se aplica despues de 006_pago_adelantado.sql y JUNTO con el despliegue del
-- backend que la usa (backend/facturacion_propia.py), en este orden:
--
--     /opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos
--     docker exec -i zenstay-postgres psql -v ON_ERROR_STOP=1 -U postgres \
--       -d zenstay < db/migrations/007_quitar_nubefact.sql
--     (y enseguida el despliegue del backend)
--
-- Entre la migracion y el despliegue, el backend viejo no puede emitir
-- comprobantes (lee columnas que ya no existen). Hoy nadie emite: la tabla
-- invoices tenia 0 filas al escribir esto.
--
-- Es idempotente (se puede correr dos veces) y va en UNA transaccion.
--
-- ---------------------------------------------------------------------------
-- POR QUE
-- ---------------------------------------------------------------------------
-- Kevin decidio no usar NubeFact: la facturacion electronica la hara el motor
-- propio de la empresa (repositorio facturacion-sunat), que firma y envia a
-- SUNAT sin PSE ni OSE. Ese motor no tiene credenciales por hotel guardadas en
-- ZenStay: se configura con variables de entorno del servidor
-- (FACTURACION_URL, FACTURACION_TOKEN, FACTURACION_EMISOR_RUC).
--
-- Comprobado en produccion antes de escribirla: 1 hotel, ningun token de
-- NubeFact guardado, ninguno en modo LIVE y 0 comprobantes. Por eso se borra
-- sin migrar datos.
--
-- ---------------------------------------------------------------------------
-- QUE CAMBIA
-- ---------------------------------------------------------------------------
--   tenants.nubefact_ruta, tenants.nubefact_token   se borran
--   tenants.invoicing_mode                          se borra: MOCK/LIVE solo
--                                                   decidia si se llamaba a
--                                                   NubeFact de verdad
--   invoices.nubefact_request  -> solicitud_envio   lo que se mando al motor
--   invoices.nubefact_response -> respuesta_envio   lo que contesto
--   invoices.motor_comprobante_id (uuid, nulable)   el id del comprobante en
--                                                   el motor, donde viven el
--                                                   XML firmado y el CDR
--
-- Los renombres van dentro de un bloque DO porque `alter table ... rename
-- column` no admite IF EXISTS: solo se renombra si la columna vieja existe y
-- la nueva no.
-- ============================================================================

begin;

alter table tenants drop column if exists nubefact_ruta;
alter table tenants drop column if exists nubefact_token;
alter table tenants drop column if exists invoicing_mode;

do $$
begin
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'invoices'
                  and column_name = 'nubefact_request')
       and not exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'invoices'
                          and column_name = 'solicitud_envio') then
        alter table invoices rename column nubefact_request to solicitud_envio;
    end if;

    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'invoices'
                  and column_name = 'nubefact_response')
       and not exists (select 1 from information_schema.columns
                        where table_schema = 'public' and table_name = 'invoices'
                          and column_name = 'respuesta_envio') then
        alter table invoices rename column nubefact_response to respuesta_envio;
    end if;
end $$;

-- Si alguna base llegara con las dos (vieja y nueva), la vieja sobra: la
-- tabla estaba vacia y el codigo nuevo solo escribe en la nueva.
alter table invoices drop column if exists nubefact_request;
alter table invoices drop column if exists nubefact_response;

alter table invoices add column if not exists solicitud_envio jsonb;
alter table invoices add column if not exists respuesta_envio jsonb;
alter table invoices add column if not exists motor_comprobante_id uuid;

comment on column invoices.solicitud_envio is
    'Lo que ZenStay mando al motor propio de facturacion (POST /comprobantes). '
    'NULL si el comprobante es interno o el motor aun no soporta su tipo.';
comment on column invoices.respuesta_envio is
    'Lo que contesto el motor, o por que no se envio (interno / no disponible).';
comment on column invoices.motor_comprobante_id is
    'Id del comprobante en el motor facturacion-sunat (XML firmado y CDR). '
    'NULL = comprobante interno, sin validez tributaria.';

commit;
