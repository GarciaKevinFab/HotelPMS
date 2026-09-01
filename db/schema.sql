-- ============================================================================
-- ZenStay - Esquema Postgres (autoalojado en el VPS, contenedor zenstay-postgres)
-- ============================================================================
-- Traduccion 1:1 de las 22 colecciones reales de MongoDB, extraidas del codigo
-- de backend/server.py (los insert_one y los modelos Pydantic, no solo las
-- clases *Create -- varias colecciones se insertan con **data.dict() y tienen
-- mas campos de los que declara el modelo).
-- Orden de aplicacion: schema.sql -> indexes.sql -> rls.sql.
--
-- No hay migracion de datos que hacer: el cluster de Atlas que usaba este
-- sistema (cluster0.scrhhjx.mongodb.net) ya no resuelve por DNS, ni desde el
-- VPS ni desde fuera. La base arranca vacia y se puebla con /api/setup.
--
-- Decisiones de diseno:
--
-- 1. IDs: Mongo usaba ObjectId y el codigo hacia ObjectId(id) / str(_id) por
--    todos lados. Aca son uuid con gen_random_uuid(). Es un cambio real de
--    tipo, y se puede hacer sin costo justamente porque no hay datos viejos
--    que arrastrar.
--
-- 2. Multi-tenancy: TODA tabla de negocio lleva tenant_id, que es la base del
--    Row Level Security. Las politicas viven en db/rls.sql y los indices que
--    necesitan, en db/indexes.sql. `users` lleva tenant_id nullable porque el
--    SUPER_ADMIN no pertenece a ningun hotel.
--
-- 3. Dinero: numeric(12,2), NUNCA double precision. En Mongo todo importe era
--    float de Python, y este sistema emite boletas y facturas con IGV y hace
--    cuadre de caja: los centavos que se pierden en binario terminan siendo un
--    arqueo que no cuadra. Es el cambio de tipo mas importante de la migracion.
--
-- 4. Fechas: en Mongo se guardaban como strings ISO
--    (datetime.now(timezone.utc).isoformat()), lo que hacia imposible ordenar
--    o comparar rangos en la base. Aca son timestamptz y date nativos.
--
-- 5. Enums: los Enum de Python que ya tenian valores cerrados pasan a enum
--    nativo de Postgres. Los campos que en el codigo son texto libre con
--    valores convenidos por costumbre (status de folio, categoria de cargo,
--    prioridad de ticket) se dejan como text con CHECK, para no romper cuando
--    aparezca un valor nuevo. Ver notas inline.
--
-- 6. JSONB: solo para lo genuinamente variable -- settings del hotel, el
--    request/response crudo de NubeFact (que es de un tercero y cambia sin
--    avisar), los totales por metodo de pago del cierre de caja, y el
--    before/after de la auditoria. `amenities` es un array homogeneo de texto,
--    asi que usa text[] nativo y no JSONB.
--
-- 7. Nombres de tabla: se preservan los nombres de coleccion REALES de Mongo
--    (confirmados por grep, no por la clase Pydantic) para que la reescritura
--    de las 177 consultas de server.py sea un mapeo 1:1 sin sorpresas.
--
-- 8. tenants tenia campos duplicados por historia: address/direccion,
--    phone/telefono, y la config de facturacion existia dos veces (plana en
--    boleta_series/factura_series/igv_rate y anidada en invoicing_config).
--    Aca se normaliza a UNA sola forma -- la plana, que es la que consulta el
--    codigo de facturacion -- y se documenta el descarte. Ver notas inline.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type user_role          as enum ('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPING', 'SECURITY');
create type occupancy_status   as enum ('VACANT', 'OCCUPIED', 'DUE_OUT');
create type housekeeping_state as enum ('DIRTY', 'CLEANING', 'CLEAN', 'INSPECT', 'OUT_OF_ORDER');
create type reservation_status as enum ('PREBOOK', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW', 'CANCELLED');
create type invoice_type       as enum ('BOLETA', 'FACTURA');
create type invoice_status     as enum ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'VOIDED', 'PENDING');
create type alert_severity     as enum ('INFO', 'WARN', 'CRITICAL');
create type doc_type           as enum ('DNI', 'CE', 'PASAPORTE', 'RUC');

-- Los valores son los de PaymentMethod en server.py, que ya estaban en
-- espanol ("EFECTIVO", "TARJETA", ...) aunque los nombres de miembro del Enum
-- de Python estuvieran en ingles (CASH, CARD). Manda el valor, que es lo que
-- se guardo siempre en la base.
create type payment_method     as enum ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'YAPE_PLIN', 'OTRO');

-- ============================================================================
-- TENANTS -- un hotel. Es la raiz de todo el multi-tenancy.
-- ============================================================================
create table tenants (
    id                  uuid primary key default gen_random_uuid(),
    name                text        not null,
    ruc                 text        not null unique,
    razon_social        text,
    nombre_comercial    text,

    -- Antes existian address+direccion y phone+telefono como pares duplicados,
    -- escritos de forma inconsistente segun el endpoint. Se queda una sola
    -- columna de cada uno; la reescritura de server.py unifica los accesos.
    address             text,
    phone               text,
    email               text,
    ubigeo              text,

    -- Config de facturacion electronica (NubeFact). Antes vivia duplicada:
    -- plana en la raiz del documento Y anidada en invoicing_config. Se queda
    -- solo la plana. invoicing_mode MOCK no llama al proveedor real.
    nubefact_ruta       text,
    nubefact_token      text,
    invoicing_mode      text        not null default 'MOCK'
                                    check (invoicing_mode in ('MOCK', 'LIVE')),
    boleta_series       text        not null default 'B001',
    boleta_correlative  integer     not null default 1,
    factura_series      text        not null default 'F001',
    factura_correlative integer     not null default 1,
    igv_rate            numeric(5,2) not null default 18.00,

    currency            text        not null default 'PEN',
    timezone            text        not null default 'America/Lima',
    checkin_time        text        not null default '14:00',
    checkout_time       text        not null default '12:00',

    -- Preferencias sueltas de la UI. Genuinamente variable -> JSONB.
    settings            jsonb       not null default '{}'::jsonb,

    is_active           boolean     not null default true,
    created_at          timestamptz not null default now()
);

-- ============================================================================
-- USERS -- tenant_id nullable a proposito: el SUPER_ADMIN es global.
-- ============================================================================
create table users (
    id            uuid primary key default gen_random_uuid(),
    tenant_id     uuid references tenants(id) on delete cascade,
    email         text        not null unique,
    password_hash text        not null,
    full_name     text        not null,
    role          user_role   not null,
    is_active     boolean     not null default true,
    created_at    timestamptz not null default now(),

    -- Un usuario o pertenece a un hotel, o es SUPER_ADMIN. Cualquier otra
    -- combinacion es un bug: un ADMIN sin tenant no puede ver nada, y un
    -- SUPER_ADMIN atado a un tenant deja de ser global sin que nadie lo note.
    constraint users_tenant_coherente check (
        (role = 'SUPER_ADMIN' and tenant_id is null)
        or (role <> 'SUPER_ADMIN' and tenant_id is not null)
    )
);

-- ============================================================================
-- INVENTARIO DE HABITACIONES
-- ============================================================================
create table room_types (
    id         uuid primary key default gen_random_uuid(),
    tenant_id  uuid        not null references tenants(id) on delete cascade,
    name       text        not null,
    capacity   integer     not null check (capacity > 0),
    amenities  text[]      not null default '{}',
    base_price numeric(12,2) not null check (base_price >= 0),
    is_active  boolean     not null default true,
    created_at timestamptz not null default now()
);

create table rooms (
    id                  uuid primary key default gen_random_uuid(),
    tenant_id           uuid not null references tenants(id) on delete cascade,
    room_type_id        uuid not null references room_types(id),
    number              text not null,
    floor               integer not null,
    notes               text,
    occupancy_status    occupancy_status   not null default 'VACANT',
    housekeeping_status housekeeping_state not null default 'CLEAN',
    is_active           boolean     not null default true,
    created_at          timestamptz not null default now(),

    -- El numero de habitacion es unico dentro del hotel, no globalmente:
    -- dos hoteles distintos pueden tener ambos una habitacion "101".
    constraint rooms_numero_unico_por_hotel unique (tenant_id, number)
);

-- Tarifas por temporada. Se superponen a room_types.base_price en el rango
-- [date_from, date_to]. No hay constraint de solapamiento: el negocio permite
-- varias tarifas activas para el mismo rango y la aplicacion elige.
create table rates (
    id           uuid primary key default gen_random_uuid(),
    tenant_id    uuid not null references tenants(id) on delete cascade,
    room_type_id uuid not null references room_types(id),
    name         text,
    date_from    date not null,
    date_to      date not null,
    price        numeric(12,2) not null check (price >= 0),
    min_stay     integer     not null default 1 check (min_stay >= 1),
    is_active    boolean     not null default true,
    created_at   timestamptz not null default now(),

    constraint rates_rango_valido check (date_to >= date_from)
);

-- ============================================================================
-- HUESPEDES
-- ============================================================================
create table guests (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    doc_type    doc_type not null,
    doc_number  text not null,
    full_name   text not null,
    phone       text,
    email       text,
    nationality text default 'PE',
    address     text,
    created_at  timestamptz not null default now(),

    -- Mismo documento = misma persona, dentro de un hotel. Evita el duplicado
    -- clasico de recepcion: el mismo DNI cargado tres veces con el nombre
    -- escrito distinto, que luego rompe el historial del huesped.
    constraint guests_doc_unico_por_hotel unique (tenant_id, doc_type, doc_number)
);

-- ============================================================================
-- RESERVAS Y ESTADIAS
-- ============================================================================
create table group_reservations (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references tenants(id) on delete cascade,
    code            text not null,
    group_name      text not null,
    contact_name    text not null,
    contact_phone   text,
    contact_email   text,
    checkin_date    date not null,
    checkout_date   date not null,
    nights          integer not null check (nights > 0),
    adults          integer not null default 1,
    children        integer not null default 0,
    total_rooms     integer not null default 0,
    total_estimated numeric(12,2) not null default 0,
    deposit_amount  numeric(12,2) not null default 0,
    status          text not null default 'CONFIRMED',
    notes           text,
    created_by      uuid references users(id),
    created_at      timestamptz not null default now(),

    constraint group_res_codigo_unico unique (tenant_id, code),
    constraint group_res_rango_valido check (checkout_date > checkin_date)
);

create table reservations (
    id              uuid primary key default gen_random_uuid(),
    tenant_id       uuid not null references tenants(id) on delete cascade,
    code            text not null,

    -- Nullable a proposito: en una reserva de GRUPO se bloquean N habitaciones
    -- a nombre del grupo y recien al check-in se sabe que huesped ocupa cual.
    -- Una reserva individual siempre lleva huesped; eso lo garantiza el CHECK
    -- de mas abajo, que exige guest_id salvo cuando la reserva pertenece a un
    -- grupo.
    guest_id        uuid references guests(id),
    room_type_id    uuid not null references room_types(id),

    -- Nullable a proposito: una reserva puede existir sin habitacion asignada
    -- (se pidio "una matrimonial" y recepcion asigna cual recien al check-in).
    room_id         uuid references rooms(id),

    -- El documento de Mongo no tenia este vinculo; las reservas de grupo se
    -- rastreaban por el array `reservations` embebido en group_reservations.
    -- Aca la relacion va en el lado hijo, que es donde Postgres la puede
    -- garantizar con una FK.
    group_id        uuid references group_reservations(id) on delete set null,

    checkin_date    date not null,
    checkout_date   date not null,
    adults          integer not null default 1,
    children        integer not null default 0,
    total_estimated numeric(12,2) not null default 0,
    deposit_amount  numeric(12,2) not null default 0,
    deposit_status  text not null default 'NA'
                    check (deposit_status in ('NA', 'PENDING', 'PAID')),
    status          reservation_status not null default 'PREBOOK',
    source          text not null default 'DIRECTO',
    notes           text,
    cancel_reason   text,
    created_by      uuid references users(id),
    created_at      timestamptz not null default now(),

    constraint reservations_codigo_unico unique (tenant_id, code),
    constraint reservations_rango_valido check (checkout_date > checkin_date),

    -- Una reserva individual tiene que tener huesped; una de grupo puede no
    -- tenerlo todavia. Sin esta regla, un bug en el alta individual dejaria
    -- reservas huerfanas que revientan en el check-in, cuando el huesped ya
    -- esta en el mostrador.
    constraint reservations_huesped_o_grupo check (
        guest_id is not null or group_id is not null
    )
);

-- La estadia real: se crea en el check-in. Una reserva que nunca llego
-- (NO_SHOW) no tiene stay.
create table stays (
    id             uuid primary key default gen_random_uuid(),
    tenant_id      uuid not null references tenants(id) on delete cascade,
    reservation_id uuid not null references reservations(id),
    guest_id       uuid not null references guests(id),
    room_id        uuid not null references rooms(id),
    checkin_at     timestamptz not null,
    checkout_at    timestamptz,
    status         text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
    created_by     uuid references users(id),

    constraint stays_una_por_reserva unique (reservation_id)
);

-- ============================================================================
-- FOLIO: la cuenta corriente de una estadia (cargos y pagos)
-- ============================================================================
create table folios (
    id             uuid primary key default gen_random_uuid(),
    tenant_id      uuid not null references tenants(id) on delete cascade,
    reservation_id uuid not null references reservations(id),
    stay_id        uuid references stays(id),

    -- Denormalizados a proposito: el codigo los mantiene con $inc en cada
    -- cargo/pago y el dashboard los lee sin sumar toda la tabla. Se conservan,
    -- pero ahora los actualiza una transaccion, no dos escrituras sueltas.
    total_charges  numeric(12,2) not null default 0,
    total_payments numeric(12,2) not null default 0,
    balance        numeric(12,2) not null default 0,

    status         text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
    created_at     timestamptz not null default now(),

    constraint folios_uno_por_reserva unique (reservation_id)
);

create table charges (
    id         uuid primary key default gen_random_uuid(),
    tenant_id  uuid not null references tenants(id) on delete cascade,
    folio_id   uuid not null references folios(id) on delete cascade,
    concept    text not null,
    category   text not null default 'HABITACION',
    quantity   numeric(12,2) not null default 1 check (quantity > 0),
    unit_price numeric(12,2) not null check (unit_price >= 0),
    subtotal   numeric(12,2) not null,
    igv_amount numeric(12,2) not null default 0,
    total      numeric(12,2) not null,
    tax_type   text not null default 'IGV' check (tax_type in ('IGV', 'EXONERADO', 'INAFECTO')),

    -- Un cargo anulado no se borra: se marca. Es un sistema que factura, y el
    -- historial tiene que poder reconstruirse.
    status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'VOIDED')),
    void_reason text,
    voided_by   uuid references users(id),
    voided_at   timestamptz,
    created_by  uuid references users(id),
    created_at  timestamptz not null default now(),

    -- Anular exige motivo y deja rastro de quien y cuando. Sin esto se podia
    -- marcar un cargo como VOIDED sin explicacion, que en una cuenta que
    -- termina en boleta o factura es justo lo que no debe poder pasar.
    constraint charges_anulacion_completa check (
        (status = 'ACTIVE'  and void_reason is null and voided_by is null and voided_at is null)
        or
        (status = 'VOIDED' and void_reason is not null and voided_at is not null)
    )
);

-- ============================================================================
-- CAJA
-- ============================================================================
create table cash_shifts (
    id             uuid primary key default gen_random_uuid(),
    tenant_id      uuid not null references tenants(id) on delete cascade,
    opening_amount numeric(12,2) not null default 0,
    opened_by      uuid not null references users(id),
    opened_at      timestamptz not null default now(),
    counted_cash   numeric(12,2),
    difference     numeric(12,2),
    closed_by      uuid references users(id),
    closed_at      timestamptz,

    -- Totales por metodo de pago al cerrar. JSONB porque la lista de metodos
    -- puede crecer (hoy 5, manana Plin separado de Yape) y no queremos una
    -- migracion de columnas cada vez.
    totals         jsonb,

    notes          text,
    status         text not null default 'OPEN' check (status in ('OPEN', 'CLOSED'))
);

create table payments (
    id            uuid primary key default gen_random_uuid(),
    tenant_id     uuid not null references tenants(id) on delete cascade,
    folio_id      uuid not null references folios(id) on delete cascade,
    cash_shift_id uuid references cash_shifts(id),
    method        payment_method not null,
    amount        numeric(12,2) not null check (amount > 0),
    reference     text,
    status        text not null default 'ACTIVE' check (status in ('ACTIVE', 'VOIDED')),
    created_by    uuid references users(id),
    created_at    timestamptz not null default now()
);

-- Entradas y salidas de efectivo que no son pagos de huesped (compra de
-- suministros, cambio, deposito al banco).
create table cash_movements (
    id            uuid primary key default gen_random_uuid(),
    tenant_id     uuid not null references tenants(id) on delete cascade,
    cash_shift_id uuid not null references cash_shifts(id) on delete cascade,
    type          text not null check (type in ('IN', 'OUT')),
    amount        numeric(12,2) not null check (amount > 0),
    reason        text not null,
    created_by    uuid references users(id),
    created_at    timestamptz not null default now()
);

-- ============================================================================
-- FACTURACION ELECTRONICA (NubeFact / SUNAT)
-- ============================================================================
create table invoices (
    id                uuid primary key default gen_random_uuid(),
    tenant_id         uuid not null references tenants(id) on delete cascade,
    folio_id          uuid not null references folios(id),
    type              invoice_type not null,
    series            text not null,
    number            integer not null,

    client_doc_type   doc_type not null,
    client_doc_number text not null,
    client_name       text not null,
    client_address    text,

    subtotal          numeric(12,2) not null,
    igv               numeric(12,2) not null,
    total             numeric(12,2) not null,

    status            invoice_status not null default 'DRAFT',

    -- Lo que devuelve el proveedor. Crudo y en JSONB porque es de un tercero:
    -- si cambian el formato, no queremos que se caiga la emision.
    nubefact_request  jsonb,
    nubefact_response jsonb,
    hash              text,
    qr                text,
    pdf_url           text,
    xml_url           text,
    cdr_url           text,

    issued_by         uuid references users(id),
    issued_at         timestamptz not null default now(),
    void_reason       text,
    voided_at         timestamptz,

    -- SUNAT exige que el correlativo no se repita ni se salte dentro de una
    -- serie. En Mongo esto se cuidaba leyendo y escribiendo el correlativo en
    -- dos pasos, que bajo dos emisiones simultaneas podia repetir numero.
    -- Aca la base lo garantiza.
    constraint invoices_correlativo_unico unique (tenant_id, type, series, number)
);

-- ============================================================================
-- HOUSEKEEPING Y MANTENIMIENTO
-- ============================================================================
create table housekeeping_tasks (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    room_id     uuid not null references rooms(id),
    stay_id     uuid references stays(id),
    priority    text not null default 'MEDIUM'
                check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status       text not null default 'OPEN'
                 check (status in ('OPEN', 'IN_PROGRESS', 'DONE')),
    assigned_to  uuid references users(id),
    completed_by uuid references users(id),
    completed_at timestamptz,
    created_at   timestamptz not null default now(),

    -- Una tarea terminada tiene que decir cuando. Es lo que permite medir el
    -- tiempo real de limpieza por habitacion, y sin la regla se podian marcar
    -- tareas como hechas sin dejar rastro de cuando ocurrio.
    constraint hk_tarea_terminada_con_fecha check (
        (status = 'DONE' and completed_at is not null)
        or (status <> 'DONE' and completed_at is null)
    )
);

-- Bitacora de cambios de estado de habitacion. Es append-only.
create table housekeeping_logs (
    id                uuid primary key default gen_random_uuid(),
    tenant_id         uuid not null references tenants(id) on delete cascade,
    room_id           uuid not null references rooms(id),
    from_occupancy    occupancy_status,
    to_occupancy      occupancy_status,
    from_housekeeping housekeeping_state,
    to_housekeeping   housekeeping_state,
    by_user           uuid references users(id),
    created_at        timestamptz not null default now()
);

create table maintenance_tickets (
    id             uuid primary key default gen_random_uuid(),
    tenant_id      uuid not null references tenants(id) on delete cascade,
    room_id        uuid not null references rooms(id),
    title          text not null,
    description    text not null,
    priority       text not null check (priority in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status         text not null default 'OPEN'
                   check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED')),
    estimated_cost numeric(12,2),
    actual_cost    numeric(12,2),
    assigned_to    uuid references users(id),
    created_by     uuid references users(id),
    created_at     timestamptz not null default now(),
    resolved_at    timestamptz
);

-- ============================================================================
-- CATALOGO DE CONSUMOS (minibar, restaurante, lavanderia)
-- ============================================================================
create table products (
    id         uuid primary key default gen_random_uuid(),
    tenant_id  uuid not null references tenants(id) on delete cascade,
    name       text not null,
    category   text not null,
    unit_price numeric(12,2) not null check (unit_price >= 0),
    tax_type   text not null default 'IGV' check (tax_type in ('IGV', 'EXONERADO', 'INAFECTO')),
    is_active  boolean not null default true,
    created_at timestamptz not null default now()
);

-- ============================================================================
-- ALERTAS, AUDITORIA Y NOTIFICACIONES
-- ============================================================================
create table alerts (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    type        text not null,
    severity    alert_severity not null,
    title       text not null,
    message     text not null,

    -- Referencia polimorfica {entity, id}: una alerta puede apuntar a una
    -- reserva, una habitacion o un turno de caja. Se queda como JSONB sin FK
    -- real, igual que en Mongo -- validar a que tabla apunta es trabajo de la
    -- aplicacion, no de la base.
    entity_ref  jsonb not null default '{}'::jsonb,

    status      text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
    resolved_by uuid references users(id),
    resolved_at timestamptz,
    notes       text,
    created_at  timestamptz not null default now()
);

create table audit_logs (
    id          uuid primary key default gen_random_uuid(),
    tenant_id   uuid not null references tenants(id) on delete cascade,
    user_id     uuid references users(id),
    entity      text not null,
    action      text not null,
    before_json jsonb,
    after_json  jsonb,
    created_at  timestamptz not null default now()
);

create table notification_logs (
    id         uuid primary key default gen_random_uuid(),
    tenant_id  uuid not null references tenants(id) on delete cascade,
    template   text not null,
    recipient  text not null,
    status     text not null,
    created_at timestamptz not null default now()
);
