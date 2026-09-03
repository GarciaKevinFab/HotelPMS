-- ============================================================================
-- 004 - La bitacora guardaba cadenas JSON donde tenia que haber objetos
-- ============================================================================
-- Se aplica despues de 003_pagos_suscripcion.sql.
--
-- Como aplicarla en el VPS (no hay alembic, esto se corre a mano):
--
--     docker exec -i zenstay-postgres \
--       psql -U postgres -d zenstay < db/migrations/004_auditoria_jsonb_doble_serializado.sql
--
-- Es idempotente: solo toca filas que siguen en el formato viejo, asi que
-- volver a correrla no hace nada. No borra ni pisa datos -- reinterpreta los
-- que ya estan.
--
-- ---------------------------------------------------------------------------
-- QUE PASABA
-- ---------------------------------------------------------------------------
-- backend/db_pg.py registra un codec de asyncpg para jsonb con
-- encoder=json.dumps: la capa de acceso serializa sola. Pero create_audit_log
-- y compania en backend/server.py pasaban el valor YA serializado:
--
--     json.dumps(after) if after is not None else None,
--
-- Resultado: json.dumps aplicado DOS veces. La columna terminaba con un jsonb
-- perfectamente valido pero de tipo 'string' -- el texto del JSON entre
-- comillas -- en vez de un objeto:
--
--     select jsonb_typeof(after_json) from audit_logs;   -- 'string'
--     select after_json ? 'plan_codigo' from audit_logs; -- false
--
-- Es decir: `after_json->>'campo'`, `?`, `@>` y cualquier indice GIN sobre
-- estas columnas no encontraban nada. La bitacora se podia leer a ojo, pero no
-- consultar, que es justo para lo que existe una bitacora.
--
-- El cast explicito no salvaba a nadie: update_tenant_suscripcion pasaba
-- json.dumps(manual) a un parametro `$5::jsonb` y caia igual. Postgres
-- describe ese parametro como jsonb de todos modos, asi que el codec se
-- aplicaba lo mismo. Comprobado contra Postgres 16 con st.get_parameters().
--
-- El arreglo del codigo (pasar dicts y dejar que serialice el codec) va en el
-- mismo commit que esta migracion. Sin ella, una consulta escrita para el
-- formato nuevo seguiria sin ver las filas viejas: por eso se convierten en
-- vez de convivir con dos formatos.
--
-- ---------------------------------------------------------------------------
-- QUE SE CONVIERTE Y POR QUE ESTAS COLUMNAS
-- ---------------------------------------------------------------------------
-- Las seis columnas jsonb que escribia server.py con json.dumps, mas la clave
-- anidada settings.suscripcion_manual. Se dejan fuera a proposito:
--
--   pagos_suscripcion.respuesta  lo escriben backend/checkout.py y el IPN, que
--                                ya pasan dicts desde 4daa754.
--   tenants.settings (la raiz)   nunca se escribio con json.dumps.
--
-- Al revisar el VPS el 2026-09-03 habia UNA fila en formato viejo en toda la
-- base (audit_logs.after_json) y el resto de tablas estaban vacias: el sistema
-- es nuevo. Se escribe igual para las seis columnas porque el mismo bug las
-- alcanzaba a todas y los entornos de prueba si tienen datos.
--
-- ---------------------------------------------------------------------------
-- LA GUARDA `IS JSON OBJECT`
-- ---------------------------------------------------------------------------
-- `col #>> '{}'` saca el texto que hay dentro del jsonb-cadena, y el cast lo
-- reinterpreta. Si ese texto no fuera un objeto JSON el cast abortaria la
-- migracion entera, asi que solo se convierte lo que se puede convertir. Un
-- jsonb que sea una cadena a proposito (hoy no hay ninguno en estas columnas)
-- se queda como esta en vez de romperse.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- La bitacora: el motivo de todo esto
-- ---------------------------------------------------------------------------
update audit_logs
   set before_json = (before_json #>> '{}')::jsonb
 where jsonb_typeof(before_json) = 'string'
   and (before_json #>> '{}') is json object;

update audit_logs
   set after_json = (after_json #>> '{}')::jsonb
 where jsonb_typeof(after_json) = 'string'
   and (after_json #>> '{}') is json object;

-- ---------------------------------------------------------------------------
-- La referencia {entity, id} de las alertas: sin esto no se sabe a que apunta
-- ---------------------------------------------------------------------------
update alerts
   set entity_ref = (entity_ref #>> '{}')::jsonb
 where jsonb_typeof(entity_ref) = 'string'
   and (entity_ref #>> '{}') is json object;

-- ---------------------------------------------------------------------------
-- El arqueo por metodo de pago del cierre de caja
-- ---------------------------------------------------------------------------
update cash_shifts
   set totals = (totals #>> '{}')::jsonb
 where jsonb_typeof(totals) = 'string'
   and (totals #>> '{}') is json object;

-- ---------------------------------------------------------------------------
-- La conversacion con SUNAT: la unica copia que queda de lo enviado y lo
-- respondido cuando un comprobante se rechaza
-- ---------------------------------------------------------------------------
update invoices
   set nubefact_request = (nubefact_request #>> '{}')::jsonb
 where jsonb_typeof(nubefact_request) = 'string'
   and (nubefact_request #>> '{}') is json object;

update invoices
   set nubefact_response = (nubefact_response #>> '{}')::jsonb
 where jsonb_typeof(nubefact_response) = 'string'
   and (nubefact_response #>> '{}') is json object;

-- ---------------------------------------------------------------------------
-- La nota del plan activado a mano, que va anidada dentro de settings
-- ---------------------------------------------------------------------------
update tenants
   set settings = jsonb_set(settings, '{suscripcion_manual}',
                            ((settings -> 'suscripcion_manual') #>> '{}')::jsonb)
 where jsonb_typeof(settings -> 'suscripcion_manual') = 'string'
   and ((settings -> 'suscripcion_manual') #>> '{}') is json object;

-- ---------------------------------------------------------------------------
-- Que no quede nada a medias
-- ---------------------------------------------------------------------------
-- Si sobrevive alguna fila en formato viejo, la migracion falla en vez de
-- terminar en verde: seria una cadena que no es un objeto JSON, y eso hay que
-- mirarlo a mano antes de dar la bitacora por consultable.
do $$
declare
    quedan bigint;
begin
    select (select count(*) from audit_logs
             where jsonb_typeof(before_json) = 'string'
                or jsonb_typeof(after_json) = 'string')
         + (select count(*) from alerts      where jsonb_typeof(entity_ref) = 'string')
         + (select count(*) from cash_shifts where jsonb_typeof(totals) = 'string')
         + (select count(*) from invoices
             where jsonb_typeof(nubefact_request) = 'string'
                or jsonb_typeof(nubefact_response) = 'string')
         + (select count(*) from tenants
             where jsonb_typeof(settings -> 'suscripcion_manual') = 'string')
    into quedan;

    if quedan > 0 then
        raise exception
            'Quedan % valores jsonb de tipo string que no son objetos JSON. '
            'Revisarlos a mano: la conversion automatica no se atreve con ellos.',
            quedan;
    end if;

    raise notice 'Migracion 004: no queda ningun jsonb serializado dos veces.';
end $$;

commit;
