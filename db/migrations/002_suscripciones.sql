-- ============================================================================
-- 002 - Suscripciones: planes, estado y prueba gratuita por hotel
-- ============================================================================
-- Se aplica despues de 001_evitar_overbooking.sql.
--
-- Hasta ahora un hotel solo existia si el SUPER_ADMIN lo creaba a mano
-- (POST /tenants exige ese rol). Para vender por suscripcion hace falta que un
-- hotel pueda darse de alta solo desde la landing y empezar una prueba.
--
-- La suscripcion va en `tenants` porque el inquilino ES el hotel: se le vende
-- al hotel, no al usuario. Un hotel con cuatro recepcionistas paga una vez.
--
-- ---------------------------------------------------------------------------
-- ESTADOS Y COMO SE PASA DE UNO A OTRO
-- ---------------------------------------------------------------------------
--     prueba     -> activa      pago confirmado
--     prueba     -> vencida     se acabaron los dias sin pagar
--     activa     -> vencida     llego la renovacion sin cobro exitoso
--     vencida    -> activa      pago confirmado (reintento o manual)
--     vencida    -> suspendida  pasaron los dias de gracia
--     cualquiera -> cancelada   el hotel se da de baja
--
-- Por que gracia y no corte inmediato: una tarjeta rebota por mil motivos
-- (limite, vencimiento, el banco), y cortarle el sistema a un hotel que si
-- quiere pagar -- con huespedes dentro y la recepcion sin poder cobrar -- es la
-- forma mas cara de perder un cliente. `vencida` conserva el acceso;
-- `suspendida` lo corta.
--
-- ---------------------------------------------------------------------------
-- LO QUE NO PUEDE PASAR: dejar fuera a quien ya estaba
-- ---------------------------------------------------------------------------
-- Confort Inn ya esta operando. Si heredara el default 'prueba' con fecha de
-- fin, el dia que venciera se quedaria bloqueado por una funcionalidad que
-- nadie le vendio. El UPDATE de mas abajo marca 'activa' a los hoteles que ya
-- existen; el default solo rige para las altas nuevas desde la web.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Catalogo de planes
-- ---------------------------------------------------------------------------
-- Vive en la base y no en el codigo para poder cambiar precios sin desplegar.
-- El limite natural de un PMS es la cantidad de habitaciones: es lo que el
-- hotel entiende y lo que escala con su tamano.
create table if not exists planes (
    codigo             text primary key,
    nombre             text not null,
    descripcion        text,
    precio_mensual     numeric(10,2) not null,

    -- NULL = sin limite. Se prefiere NULL a un numero enorme para que la
    -- consulta diga "sin limite" y no "menos de 99999".
    max_habitaciones   integer,

    -- Que desbloquea cada plan. Se comprueban al ACTUAR, no al mostrar:
    -- ocultar un boton no impide que alguien mande el formulario igual.
    facturacion_sunat  boolean not null default false,
    reportes_avanzados boolean not null default false,

    activo             boolean not null default true,
    orden              integer not null default 0
);

-- Los precios son el punto de partida y se cambian con un UPDATE, sin tocar
-- codigo ni desplegar nada.
insert into planes (codigo, nombre, descripcion, precio_mensual, max_habitaciones,
                    facturacion_sunat, reportes_avanzados, orden)
values
  ('prueba',  'Prueba',  'Todo el sistema durante 14 dias, sin tarjeta.',
   0.00,   NULL, true,  true,  0),
  ('basico',  'Basico',  'Para hospedajes y hostales pequenos.',
   59.00,  12,   false, false, 1),
  ('pro',     'Pro',     'Para hoteles con facturacion electronica.',
   119.00, 35,   true,  true,  2),
  ('empresa', 'Empresa', 'Sin limite de habitaciones.',
   199.00, NULL, true,  true,  3)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- La suscripcion de cada hotel
-- ---------------------------------------------------------------------------
alter table tenants add column if not exists plan_codigo text not null default 'prueba'
    references planes(codigo);
alter table tenants add column if not exists subscription_status text not null default 'prueba'
    check (subscription_status in ('prueba', 'activa', 'vencida', 'suspendida', 'cancelada'));
alter table tenants add column if not exists trial_ends_at timestamptz;
alter table tenants add column if not exists grace_ends_at timestamptz;

-- Los hoteles que ya estaban: activos y sin vencimiento. Se filtra por
-- trial_ends_at is null para que reaplicar la migracion no pise una prueba en
-- curso.
update tenants
   set subscription_status = 'activa',
       plan_codigo = 'empresa'
 where trial_ends_at is null
   and subscription_status = 'prueba';

-- El estado se consulta en CADA peticion autenticada para saber si el hotel
-- sigue al dia: es la lectura mas caliente que va a tener esta tabla.
create index if not exists idx_tenants_suscripcion
    on tenants (subscription_status, trial_ends_at);

-- ---------------------------------------------------------------------------
-- RLS sobre `planes`
-- ---------------------------------------------------------------------------
-- El catalogo es publico: la landing lo muestra sin que nadie haya entrado, y
-- un hotel tiene que poder ver a que plan puede subir. No lleva tenant_id, asi
-- que el generador de db/rls.sql no lo toca; se le da lectura explicita y NADA
-- de escritura -- los precios se cambian con psql, no desde la aplicacion.
grant select on planes to app_backend;
revoke insert, update, delete on planes from app_backend;

-- ============================================================================
-- NOTA - por que no hay tabla de pagos todavia
--
-- Esto habilita el alta y la prueba, que es lo que hace falta para que la
-- landing tenga un boton que funcione de verdad. El cobro es otra cosa: exige
-- pasarela (Izipay, como en LicitaPro), y con ella una tabla de pagos, el
-- webhook de confirmacion y la conciliacion. Meter aqui una tabla vacia que
-- nadie escribe solo daria la impresion de que el cobro existe.
--
-- Cuando llegue, subscription_status ya es el sitio donde apoyarse: el webhook
-- lo pasa a 'activa' y la renovacion lo mantiene.
-- ============================================================================
