"""
ZenStay - Capa de acceso a Postgres
===================================
Reemplaza a Motor/MongoDB. El backend habla SOLO con Postgres.

Por que existe este modulo y no se usa un ORM: es el mismo patron que ya corre
en FletePro en este VPS -- asyncpg y SQL a mano. Un ORM aca solo agregaria una
capa de traduccion sobre consultas que igual hay que escribir (el calendario de
disponibilidad, el arqueo de caja por metodo de pago, los reportes agregados),
y haria mas dificil ver que indice usa cada una.

---------------------------------------------------------------------------
Las formas de abrir una transaccion
---------------------------------------------------------------------------
    async with db_pg.tx(user) as conn:           # el 99% de los casos
    async with db_pg.tx_global(motivo) as conn:  # cruza hoteles, exige motivo
    autenticar() / setup_inicial()               # las dos puertas sin contexto

`tx(user)` fija el contexto de RLS con SET LOCAL dentro de la transaccion, asi
que el valor muere al cerrarla. Eso es lo que impide que una conexion reciclada
por el pool para otro request -- de otro hotel -- herede el contexto anterior.

RLS es defensa en profundidad, NO el mecanismo principal: el filtro explicito
`where tenant_id = $1` se sigue escribiendo en cada consulta, igual que en la
epoca de Mongo. La politica solo esta ahi para que un WHERE olvidado devuelva
cero filas en vez de datos de otro cliente.
"""
import asyncio
import json
import os
import uuid as _uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal

import asyncpg

# Se reexportan para que quien use esta capa no tenga que importar asyncpg solo
# para atrapar una violacion de unicidad o de clave foranea. Las usa server.py
# para distinguir "RUC repetido" de "error inesperado".
UniqueViolationError = asyncpg.UniqueViolationError
ForeignKeyViolationError = asyncpg.ForeignKeyViolationError
CheckViolationError = asyncpg.CheckViolationError

# La lanza el constraint de db/migrations/001_evitar_overbooking.sql cuando dos
# reservas activas de la misma habitacion se solapan en fechas. server.py la
# traduce a un 409 con un mensaje que el recepcionista pueda entender.
ExclusionViolationError = asyncpg.ExclusionViolationError


class UsuarioSinHotel(Exception):
    """Un usuario que no es SUPER_ADMIN y no tiene tenant_id.

    Antes esto lo detectaba get_tenant_filter() y devolvia un 400. Se conserva
    el mismo comportamiento, pero como excepcion propia para que esta capa no
    dependa de FastAPI. server.py la traduce a HTTPException.
    """


def _database_url():
    """La cadena de conexion, leida EN CADA USO y no al importar el modulo.

    Importa el momento: server.py hace los imports arriba del todo y
    load_dotenv() despues. Leyendo la variable al importar, lo que hubiera en
    backend/.env llegaba siempre tarde y el modulo se quedaba con la cadena
    vacia para toda la vida del proceso.

    En produccion no se nota -- docker-compose inyecta el entorno con env_file
    antes de arrancar el proceso --, pero en local, que es donde se usa el
    .env, no habria forma de que funcionara.
    """
    return os.environ.get("DATABASE_URL", "")


_pool = None
_pool_lock = asyncio.Lock()


async def _init_connection(conn):
    # jsonb <-> dict automatico. Sin esto, asyncpg entrega los campos jsonb
    # (settings, entity_ref, totals, nubefact_response, before/after de la
    # auditoria) como str y habria que llamar json.loads en cada lectura.
    await conn.set_type_codec(
        "jsonb", encoder=json.dumps, decoder=json.loads, schema="pg_catalog"
    )


async def get_pool():
    """Pool perezoso: se crea en el primer uso y no en un evento de startup.

    Asi no depende del orden de importacion ni de que el contenedor de Postgres
    ya este listo en el instante exacto en que arranca uvicorn -- con
    docker-compose los dos suben a la vez.
    """
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:  # otra corrutina pudo crearlo mientras esperabamos
                dsn = _database_url()
                if not dsn:
                    raise RuntimeError(
                        "DATABASE_URL no esta configurada. El backend habla solo "
                        "con Postgres desde la migracion de Mongo y no puede "
                        "arrancar sin ella. En el VPS la inyecta docker-compose "
                        "via env_file; en local va en backend/.env"
                    )
                _pool = await asyncpg.create_pool(
                    dsn=dsn, min_size=1, max_size=10, init=_init_connection
                )
    return _pool


async def close_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def tx(user: dict):
    """Transaccion con el contexto de hotel ya fijado para RLS.

        async with db_pg.tx(user) as conn:
            filas = await conn.fetch(
                "select * from rooms where tenant_id = $1", user["tenant_id"]
            )

    Un SUPER_ADMIN entra con is_superadmin=true y ve todos los hoteles, que es
    exactamente lo que hacia get_tenant_filter() al devolver {} para ese rol.
    """
    es_superadmin = user.get("role") == "SUPER_ADMIN"
    tenant_id = user.get("tenant_id")

    if not es_superadmin and not tenant_id:
        raise UsuarioSinHotel("Usuario sin tenant asignado")

    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            # El tercer argumento en true = SET LOCAL: el valor se descarta al
            # cerrar la transaccion. Es la pieza que hace seguro reusar
            # conexiones entre requests de hoteles distintos.
            await conn.execute(
                "select set_config('app.current_tenant_id', $1, true), "
                "       set_config('app.is_superadmin', $2, true)",
                str(tenant_id) if tenant_id else "",
                "true" if es_superadmin else "false",
            )
            yield conn


@asynccontextmanager
async def tx_global(motivo: str):
    """Transaccion que ve TODOS los hoteles. Pide un motivo a proposito.

    Hay tres situaciones donde filtrar por hotel es imposible o incorrecto:

      1. Resolver quien es un usuario antes de saber a que hotel pertenece.
      2. Operaciones de SUPER_ADMIN que cruzan hoteles por diseno: listar
         todos, crear uno nuevo, ver metricas globales.
      3. Tareas de fondo que recorren todos los hoteles y no tienen request
         ni usuario (por ejemplo generar alertas de vencimiento).

    El parametro `motivo` no se usa para nada tecnico: obliga a que cada
    llamada deje escrito por que necesita saltarse el aislamiento, y hace que
    un uso indebido salte a la vista al leer el codigo.

    Para todo lo demas va tx(), que si filtra por hotel.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("select set_config('app.is_superadmin', 'true', true)")
            yield conn


# ---------------------------------------------------------------------------
# Las dos puertas que evaden RLS, definidas en db/rls.sql
# ---------------------------------------------------------------------------
async def autenticar(email: str):
    """Busca al usuario por email para el login.

    Es la unica lectura de `users` que ocurre sin saber el hotel, porque
    averiguarlo es justamente lo que esta haciendo. Llama a la funcion
    SECURITY DEFINER app_autenticar(), que devuelve como maximo una fila y solo
    las columnas del login -- en vez de dejar toda la tabla `users` fuera de
    RLS con los hashes de todos los hoteles dentro.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        fila = await conn.fetchrow("select * from app_autenticar($1)", email)
        return to_api(fila)


async def setup_inicial(email: str, password_hash: str, full_name: str):
    """Crea el primer SUPER_ADMIN. Devuelve su id, o None si ya habia usuarios.

    La condicion "solo si la base esta vacia" vive dentro de la funcion de
    Postgres, con un lock de tabla, y no en el backend: asi dos POST /setup
    simultaneos contra una base recien creada no pueden crear dos superadmins.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        nuevo_id = await conn.fetchval(
            "select app_setup_inicial($1, $2, $3)", email, password_hash, full_name
        )
        return str(nuevo_id) if nuevo_id else None


# ---------------------------------------------------------------------------
# Conversion de tipos
# ---------------------------------------------------------------------------
# Postgres devuelve uuid/datetime/date/numeric como objetos de Python; Mongo
# devolvia strings y floats. El frontend ya esta escrito contra la forma vieja,
# asi que la respuesta de la API tiene que seguir siendo identica. Esto
# reemplaza a serialize_doc() de server.py.
#
# Una diferencia a favor: en Mongo la clave primaria era `_id` y serialize_doc
# tenia que renombrarla a `id`. En Postgres la columna ya se llama `id`, asi
# que el renombrado desaparece y la forma coincide sola.


def _valor(v):
    if isinstance(v, _uuid.UUID):
        return str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        # Los importes son numeric(12,2) en la base -- ahi viven exactos, que es
        # el motivo de haberlos migrado desde float. Al salir por JSON se
        # convierten a float para no cambiar la forma de la respuesta y no
        # romper el frontend, que ya hace aritmetica sobre numeros. La cuenta
        # de verdad (totales, IGV, arqueo) la hace Postgres en numeric; esto es
        # solo la ultima capa de presentacion.
        return float(v)
    if isinstance(v, list):
        return [_valor(x) for x in v]
    if isinstance(v, dict):
        return {k: _valor(x) for k, x in v.items()}
    return v


def to_api(record):
    """Un asyncpg.Record -> dict con la misma forma que devolvia Mongo."""
    if record is None:
        return None
    return {k: _valor(v) for k, v in dict(record).items()}


def to_api_list(records):
    """Lista de asyncpg.Record -> lista de dicts."""
    return [to_api(r) for r in records]


# ---------------------------------------------------------------------------
# Atajos de lectura
# ---------------------------------------------------------------------------
# Evitan repetir `to_api(await conn.fetchrow(...))` en 177 sitios.


async def uno(conn, sql, *args):
    """Primera fila como dict, o None."""
    return to_api(await conn.fetchrow(sql, *args))


async def varias(conn, sql, *args):
    """Todas las filas como lista de dicts."""
    return to_api_list(await conn.fetch(sql, *args))


async def valor(conn, sql, *args):
    """Un unico escalar ya convertido (count, sum, un id...)."""
    return _valor(await conn.fetchval(sql, *args))


def a_uuid(valor_id, campo="id"):
    """Valida que un id que viene del cliente sea un UUID.

    Ocupa el lugar que tenia ObjectId(id) en el codigo de Mongo, y por el mismo
    motivo: si llega basura hay que responder 400 y no dejar que reviente
    dentro de la consulta. Devuelve None si el valor es None, para los campos
    opcionales (room_id de una reserva sin habitacion asignada, por ejemplo).
    """
    if valor_id is None:
        return None
    if isinstance(valor_id, _uuid.UUID):
        return valor_id
    try:
        return _uuid.UUID(str(valor_id))
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"{campo} invalido: no es un identificador valido")
