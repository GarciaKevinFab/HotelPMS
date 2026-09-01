-- ============================================================================
-- ZenStay - Row Level Security
-- ============================================================================
-- Requiere db/schema.sql y db/indexes.sql aplicados, EN ESE ORDEN.
--
-- Se aplica pasando la contrasena como variable de psql; nunca vive en el repo:
--   psql -v app_backend_password="$APP_BACKEND_PASSWORD" -f db/rls.sql
--
-- ---------------------------------------------------------------------------
-- Modelo de confianza (leer antes de tocar nada de esto)
-- ---------------------------------------------------------------------------
-- El backend (FastAPI) es el UNICO cliente que habla con Postgres. No hay
-- PostgREST ni API auto-generada sobre la base, y el contenedor de Postgres no
-- publica puerto al host: solo es alcanzable desde la red interna de Docker
-- (`zenstay_default`). El frontend solo habla con el backend.
--
-- La autorizacion primaria la sigue haciendo server.py con get_current_user()
-- y require_roles(), igual que en la epoca de Mongo. RLS aca es defensa en
-- profundidad contra un bug del backend -- una consulta a la que se le olvide
-- el `where tenant_id = ...` -- y NO el mecanismo principal. El filtro
-- explicito por tenant_id se sigue escribiendo en cada query.
--
-- Mecanismo:
--
-- 1. Un rol dedicado `app_backend` (login, SIN bypassrls) es con el que se
--    conecta el backend. NUNCA con `postgres`: el superusuario evade RLS, y
--    por eso queda reservado para aplicar migraciones y nada mas.
--
-- 2. En cada request el backend ya valido el JWT y sabe tenant_id/role. Antes
--    de correr cualquier query de ese request hace, dentro de la MISMA
--    transaccion:
--        select set_config('app.current_tenant_id', $1, true);
--        select set_config('app.is_superadmin',     $2, true);
--    El tercer argumento en true = SET LOCAL: el valor muere al cerrar la
--    transaccion. Es lo que impide que una conexion reciclada por el pool para
--    otro request -- de otro hotel -- herede el contexto anterior.
--
-- 3. Toda tabla con tenant_id lleva RLS forzado y una politica que exige
--    tenant_id = app_current_tenant_id(), salvo que is_superadmin sea true.
--
-- 4. EXCEPCION UNICA -- el login. server.py:462 busca al usuario por email sin
--    saber todavia a que hotel pertenece (es precisamente lo que esta por
--    averiguar). Bajo RLS esa consulta devolveria cero filas y nadie podria
--    entrar. En vez de dejar `users` fuera de RLS -- que abriria la tabla
--    entera, incluidos los hashes de todos los hoteles -- se expone UNA sola
--    funcion SECURITY DEFINER, `app_autenticar(email)`, que devuelve como
--    maximo una fila y solo las columnas que el login necesita. Es la unica
--    puerta que evade RLS, es explicita, y se puede auditar de un vistazo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Rol dedicado para el backend
-- ---------------------------------------------------------------------------
-- Ojo con la forma rara: psql NO interpola :'variables' dentro de bloques
-- dollar-quoted ($$ ... $$), asi que el "create role si no existe" no puede ir
-- en un DO block. Se arma con \gexec, que ejecuta el SQL devuelto por el
-- select (cero filas si el rol ya existe = no hace nada).
select 'create role app_backend login'
where not exists (select 1 from pg_roles where rolname = 'app_backend')
\gexec

-- Idempotente, y ademas rota la contrasena si cambio en el .env del VPS.
alter role app_backend with login password :'app_backend_password';

grant usage on schema public to app_backend;
grant select, insert, update, delete on all tables in schema public to app_backend;
grant usage, select on all sequences in schema public to app_backend;
alter default privileges in schema public
    grant select, insert, update, delete on tables to app_backend;

-- ---------------------------------------------------------------------------
-- Helpers: leen las variables de sesion que pone el backend en cada
-- transaccion. current_setting(..., true) con el 2do argumento en true no
-- lanza error si la variable no esta seteada (devuelve NULL), asi una conexion
-- sin contexto -- por ejemplo una migracion corrida como postgres -- no rompe.
-- ---------------------------------------------------------------------------
create or replace function app_current_tenant_id() returns uuid
language sql stable as $$
    select nullif(current_setting('app.current_tenant_id', true), '')::uuid;
$$;

create or replace function app_is_superadmin() returns boolean
language sql stable as $$
    select coalesce(nullif(current_setting('app.is_superadmin', true), '')::boolean, false);
$$;

-- ---------------------------------------------------------------------------
-- Politicas: una por tabla con tenant_id, generadas dinamicamente.
--
-- Se usa FORCE ROW LEVEL SECURITY y no solo ENABLE: sin FORCE, el dueno de la
-- tabla queda exento de sus propias politicas, y como las tablas las crea
-- `postgres` al aplicar schema.sql, un descuido futuro que conectara con ese
-- rol pasaria por encima del aislamiento sin avisar.
--
-- La politica es FOR ALL (select/insert/update/delete) con USING y WITH CHECK:
-- USING filtra lo que se puede LEER o modificar, WITH CHECK impide ESCRIBIR
-- una fila con el tenant_id de otro hotel. Sin WITH CHECK, un backend con un
-- bug podria insertar datos dentro del hotel equivocado.
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
    execute format('alter table %I enable row level security', t.table_name);
    execute format('alter table %I force  row level security', t.table_name);
    execute format('drop policy if exists aislamiento_por_hotel on %I', t.table_name);
    execute format($f$
      create policy aislamiento_por_hotel on %I
        for all to app_backend
        using       (app_is_superadmin() or tenant_id = app_current_tenant_id())
        with check  (app_is_superadmin() or tenant_id = app_current_tenant_id())
    $f$, t.table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- `tenants` aparte: el generador de arriba recorre las tablas que tienen una
-- columna llamada tenant_id, y esta no la tiene -- su identificador ES `id`.
-- Sin esta politica la tabla queda sin proteger, y se comprobo que el hueco
-- era real: un usuario de un hotel podia hacer `select name from tenants` y
-- listar el nombre y el RUC de todos los demas clientes del sistema.
--
-- Crear hoteles nuevos (POST /tenants) sigue funcionando porque lo hace un
-- SUPER_ADMIN, y para el la politica pasa por app_is_superadmin().
-- ---------------------------------------------------------------------------
alter table tenants enable row level security;
alter table tenants force  row level security;
drop policy if exists aislamiento_por_hotel on tenants;
create policy aislamiento_por_hotel on tenants
    for all to app_backend
    using      (app_is_superadmin() or id = app_current_tenant_id())
    with check (app_is_superadmin() or id = app_current_tenant_id());

-- ---------------------------------------------------------------------------
-- La excepcion del login (ver punto 4 de la cabecera)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER = corre con los privilegios de quien la creo (postgres),
-- que si evade RLS. Por eso esta acotada al minimo posible:
--   - devuelve como maximo UNA fila (email es unique),
--   - no devuelve columnas de mas: solo lo que el login necesita,
--   - no acepta filtros arbitrarios, solo un email exacto.
-- Deliberadamente NO filtra por is_active: server.py distingue "no existe" de
-- "esta desactivado" para dar un mensaje distinto, y esa decision se queda en
-- la aplicacion.
--
-- search_path fijo: sin esto, quien pueda crear objetos en un esquema que
-- venga antes en el search_path del llamador podria secuestrar la resolucion
-- del nombre `users` dentro de una funcion que corre como superusuario.
create or replace function app_autenticar(p_email text)
returns table (
    id            uuid,
    tenant_id     uuid,
    email         text,
    password_hash text,
    full_name     text,
    role          user_role,
    is_active     boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select u.id, u.tenant_id, u.email, u.password_hash, u.full_name, u.role, u.is_active
    from users u
    where u.email = p_email;
$$;

revoke all on function app_autenticar(text) from public;
grant execute on function app_autenticar(text) to app_backend;

-- ---------------------------------------------------------------------------
-- Arranque en frio: POST /api/setup crea el primer SUPER_ADMIN cuando la base
-- esta vacia. Ese insert no tiene tenant_id (el SUPER_ADMIN es global) ni
-- contexto de sesion, asi que la politica lo rechazaria.
--
-- Se resuelve igual que el login: una funcion acotada, no un agujero. Crea el
-- superadmin SOLO si no hay ningun usuario; si ya existe alguno devuelve null
-- y el backend responde el 400 de "sistema ya inicializado". La condicion vive
-- dentro de la funcion y no en el backend, asi que dos llamadas simultaneas no
-- pueden crear dos superadmins.
-- ---------------------------------------------------------------------------
create or replace function app_setup_inicial(
    p_email text, p_password_hash text, p_full_name text
) returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
    v_id uuid;
begin
    -- Bloqueo de tabla: sin esto, dos POST /api/setup concurrentes contra una
    -- base vacia pasan los dos el chequeo de "no hay usuarios" y crean dos
    -- superadmins.
    lock table users in exclusive mode;

    if exists (select 1 from users) then
        return null;
    end if;

    insert into users (tenant_id, email, password_hash, full_name, role)
    values (null, p_email, p_password_hash, p_full_name, 'SUPER_ADMIN')
    returning id into v_id;

    return v_id;
end;
$$;

revoke all on function app_setup_inicial(text, text, text) from public;
grant execute on function app_setup_inicial(text, text, text) to app_backend;
