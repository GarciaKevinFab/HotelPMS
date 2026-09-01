-- ============================================================================
-- ZenStay - Indices
-- ============================================================================
-- Requiere db/schema.sql aplicado. Se aplica ANTES de db/rls.sql.
--
-- Dos bloques con proposito distinto:
--
-- BLOQUE 1 - Soporte de RLS (generado dinamicamente).
--   La politica de db/rls.sql agrega `tenant_id = app_current_tenant_id()` a
--   TODA consulta de TODA tabla. Sin un indice que empiece por tenant_id, esa
--   condicion se resuelve con seq scan en cada query, y el costo pasa a crecer
--   con el total de filas de TODOS los hoteles juntos en vez de con las del
--   hotel que consulta -- exactamente lo que un sistema multi-tenant no puede
--   permitirse.
--
--   Se genera dinamicamente y no como una lista a mano de 22 tablas que se
--   desincroniza al agregar la 23a. Se saltan las tablas que ya tienen un
--   indice cuya PRIMERA columna es tenant_id: un indice compuesto
--   (tenant_id, X) ya sirve para filtrar solo por tenant_id, asi que uno
--   adicional de una columna seria peso muerto en cada INSERT/UPDATE.
--
-- BLOQUE 2 - Consultas calientes del negocio hotelero (a mano).
--   Estas no las puede adivinar un generador: salen de leer que hace de
--   verdad server.py. Cada una lleva anotado el endpoint que la necesita.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BLOQUE 1: un indice por tenant_id donde haga falta
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and tb.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    -- ¿ya existe un indice cuya PRIMERA columna sea tenant_id?
    if exists (
      select 1
      from pg_index i
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
      join pg_attribute a on a.attrelid = tc.oid and a.attnum = i.indkey[0]
      where n.nspname = 'public'
        and tc.relname = t.table_name
        and a.attname = 'tenant_id'
    ) then
      raise notice 'saltando %: ya tiene indice que empieza por tenant_id', t.table_name;
    else
      execute format('create index if not exists idx_%s_tenant on %I (tenant_id)',
                     t.table_name, t.table_name);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- BLOQUE 2: consultas calientes del negocio
-- ---------------------------------------------------------------------------

-- Calendario y busqueda de disponibilidad. Es LA consulta mas cara del
-- sistema: "que habitaciones estan libres entre estas dos fechas". Se pega en
-- cada carga del calendario y en cada intento de reserva. Sin este indice,
-- cada consulta recorre el historico completo de reservas del hotel.
-- Endpoints: GET /calendar, GET /reservations, POST /reservations.
create index if not exists idx_reservations_disponibilidad
    on reservations (tenant_id, checkin_date, checkout_date)
    where status in ('CONFIRMED', 'CHECKED_IN', 'PREBOOK');

-- Tablero de recepcion: el mapa de habitaciones por estado, que la UI
-- refresca constantemente. Endpoints: GET /rooms, GET /dashboard.
create index if not exists idx_rooms_tablero
    on rooms (tenant_id, occupancy_status, housekeeping_status)
    where is_active;

-- Busqueda de huesped por documento en el mostrador. El recepcionista teclea
-- el DNI y espera respuesta inmediata con el cliente delante.
-- Endpoint: GET /guests/search.
create index if not exists idx_guests_documento
    on guests (tenant_id, doc_number);

-- El folio abierto de una estadia, y sus cargos y pagos. Se leen juntos cada
-- vez que se abre la cuenta de una habitacion.
-- Endpoints: GET /folios/{id}, POST /folios/{id}/charges, /payments.
create index if not exists idx_charges_folio  on charges  (folio_id) where status = 'ACTIVE';
create index if not exists idx_payments_folio on payments (folio_id) where status = 'ACTIVE';

-- Arqueo de caja: los pagos y movimientos de un turno, agrupados por metodo.
-- Endpoints: POST /cash-shifts/{id}/close, GET /cash-shifts/{id}.
create index if not exists idx_payments_turno       on payments       (cash_shift_id);
create index if not exists idx_cash_movements_turno on cash_movements (cash_shift_id);

-- El turno de caja ABIERTO del hotel. Se consulta en cada cobro para saber a
-- que turno imputarlo. Parcial: solo hay uno abierto a la vez, asi que el
-- indice se mantiene diminuto por mas anos de historial que se acumulen.
--
-- Es UNIQUE, y eso lo convierte ademas en una regla de negocio: un hotel no
-- puede tener dos cajas abiertas. Antes se comprobaba consultando primero y
-- creando despues, asi que dos recepcionistas abriendo turno a la vez creaban
-- dos cajas y los cobros se repartian entre ambas sin que nadie lo notara
-- hasta el arqueo.
create unique index if not exists idx_cash_shifts_abierto
    on cash_shifts (tenant_id) where status = 'OPEN';

-- Reservas de un huesped (su historial) y de un grupo.
create index if not exists idx_reservations_huesped on reservations (guest_id);
create index if not exists idx_reservations_grupo   on reservations (group_id) where group_id is not null;

-- Tareas de limpieza y tickets pendientes: las pantallas de housekeeping y
-- mantenimiento solo miran lo que NO esta cerrado.
create index if not exists idx_hk_tasks_pendientes
    on housekeeping_tasks (tenant_id, status) where status <> 'DONE';
create index if not exists idx_tickets_pendientes
    on maintenance_tickets (tenant_id, status) where status in ('OPEN', 'IN_PROGRESS');

-- Alertas sin resolver: el badge del header las cuenta en cada carga.
create index if not exists idx_alerts_abiertas
    on alerts (tenant_id, created_at desc) where status = 'OPEN';

-- Login: se busca por email en cada autenticacion, pero el unique(email)
-- global de schema.sql ya crea el indice que hace falta. No se agrega nada
-- aca; queda anotado para que nadie "optimice" agregando uno redundante.

-- Comprobantes por folio (para no re-emitir) y reportes por rango de fecha.
create index if not exists idx_invoices_folio on invoices (folio_id);
create index if not exists idx_invoices_fecha on invoices (tenant_id, issued_at desc);

-- Auditoria: siempre se lee por entidad y en orden cronologico inverso.
create index if not exists idx_audit_entidad on audit_logs (tenant_id, entity, created_at desc);
