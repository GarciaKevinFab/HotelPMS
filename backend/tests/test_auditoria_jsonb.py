"""
La bitacora se tiene que poder CONSULTAR, no solo leer.

POR QUE EXISTE ESTE ARCHIVO

  backend/db_pg.py registra un codec de asyncpg para jsonb con
  encoder=json.dumps: la capa de acceso serializa sola. create_audit_log y
  compania pasaban ademas el valor ya serializado, asi que json.dumps se
  aplicaba DOS veces y la columna acababa con un jsonb de tipo 'string' -- el
  texto del JSON -- en vez de un objeto.

  Nada fallaba. El insert no protestaba, la bitacora se veia bien al leerla
  entera y el bug solo aparecia al intentar consultarla:

      select after_json ? 'plan_codigo' from audit_logs;  -- false
      select after_json->>'plan_codigo' from audit_logs;  -- null

  Un bug que no rompe nada visible es el que se queda anos. Estas pruebas lo
  convierten en rojo.

COMO SE LANZAN

  Hace falta un Postgres EFIMERO, nunca produccion: estas pruebas escriben.

      docker run -d --name zenstay-test-pg -e POSTGRES_DB=zenstay \
        -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=test \
        -p 55432:5432 postgres:16-alpine

      ZENSTAY_TEST_DATABASE_URL=postgresql://postgres:test@127.0.0.1:55432/zenstay \
      JWT_SECRET=solo-para-pruebas \
      CORS_ORIGINS=http://localhost \
      pytest tests/test_auditoria_jsonb.py -q

  El esquema lo aplica la propia prueba si la base esta vacia (lee
  db/schema.sql), asi que no hay que prepararla a mano. Sin la variable, todo
  el archivo se salta -- lo decide el marcador `necesita_base` en conftest.py.

  Se limpia solo lo suyo: crea un hotel con un RUC propio y lo borra al final,
  y el `on delete cascade` se lleva sus filas. Aun apuntando por error a una
  base con datos, no toca nada ajeno.
"""
import asyncio
import json
import os
import sys
from pathlib import Path

import pytest

# server.py y db_pg.py viven en backend/, un nivel por encima de tests/, y se
# importan como modulos sueltos (asi los arranca uvicorn en el contenedor). Sin
# esto, `import server` depende de desde donde se lance pytest.
BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# server.py se niega a importarse sin estas dos, y hace bien: son el secreto de
# firma de los tokens y la lista de origenes de CORS. Para las pruebas valen
# valores de mentira, pero tienen que existir ANTES del import.
os.environ.setdefault("JWT_SECRET", "solo-para-pruebas-no-firma-nada-real")
os.environ.setdefault("CORS_ORIGINS", "http://localhost")

import asyncpg  # noqa: E402

import db_pg  # noqa: E402
import server  # noqa: E402

pytestmark = pytest.mark.necesita_base

DSN = os.environ.get("ZENSTAY_TEST_DATABASE_URL", "")

RUC_PRUEBAS = "20111222333"
EMAIL_PRUEBAS = "auditoria@pruebas.test"

# La forma que tienen de verdad los payloads de la bitacora: los arma
# db_pg.uno(), que ya paso por _valor() y dejo las fechas en ISO y los importes
# en float. Si algun dia entrara un Decimal o un date crudo, json.dumps
# reventaria -- lo llame el codec o lo llame server.py, da igual.
PAYLOAD = {
    "plan_codigo": "PRO",
    "estado": "activa",
    "vence": "2026-12-31",
    "monto": 149.0,
}


async def _conectar():
    """Una conexion con el MISMO codec que usa el backend en produccion.

    Se llama a db_pg._init_connection en vez de repetir el set_type_codec aqui:
    si alguien cambia el codec, estas pruebas tienen que enterarse.
    """
    conn = await asyncpg.connect(DSN)
    await db_pg._init_connection(conn)
    return conn


async def _preparar():
    conn = await _conectar()

    # Base recien levantada: se le pone el esquema. Si ya lo tiene, no se toca.
    if await conn.fetchval("select to_regclass('public.audit_logs')") is None:
        esquema = (BACKEND.parent / "db" / "schema.sql").read_text(encoding="utf-8")
        await conn.execute(esquema)

    await conn.execute("delete from tenants where ruc = $1", RUC_PRUEBAS)
    tenant_id = await conn.fetchval(
        "insert into tenants (name, ruc, address) values ($1, $2, $3) returning id",
        "Hotel Auditoria Pruebas", RUC_PRUEBAS, "Calle de Pruebas 123")
    user_id = await conn.fetchval(
        "insert into users (tenant_id, email, password_hash, full_name, role) "
        "values ($1, $2, 'no-es-un-hash', 'Auditoria Pruebas', 'ADMIN') returning id",
        tenant_id, EMAIL_PRUEBAS)
    return conn, tenant_id, user_id


async def _limpiar(conn):
    # El on delete cascade de tenants se lleva users, audit_logs y alerts.
    await conn.execute("delete from tenants where ruc = $1", RUC_PRUEBAS)
    await conn.close()


def _correr(cuerpo):
    """Ejecuta una corrutina que recibe (conn, tenant_id, user_id).

    Con asyncio.run y no con pytest-asyncio a proposito: ni pytest ni
    pytest-asyncio estan en backend/requirements.txt, y esto no necesita mas.
    """
    async def envoltorio():
        conn, tenant_id, user_id = await _preparar()
        try:
            return await cuerpo(conn, tenant_id, user_id)
        finally:
            await _limpiar(conn)

    return asyncio.run(envoltorio())


# ---------------------------------------------------------------------------
# Lo que pidio el arreglo: que la bitacora quede consultable
# ---------------------------------------------------------------------------
def test_auditoria_guarda_un_objeto_y_no_una_cadena():
    """El caso exacto que estaba roto: jsonb_typeof(after_json) = 'object'."""
    async def cuerpo(conn, tenant_id, user_id):
        await server.create_audit_log(
            conn, tenant_id, user_id, "tenant_suscripcion", "update",
            before={"plan_codigo": "BASICO"}, after=PAYLOAD)
        return await conn.fetchrow(
            "select jsonb_typeof(before_json) tipo_before, "
            "       jsonb_typeof(after_json)  tipo_after, "
            "       after_json ? 'plan_codigo' tiene_clave, "
            "       after_json->>'plan_codigo' valor, "
            "       after_json @> '{\"estado\": \"activa\"}'::jsonb contiene "
            "  from audit_logs where entity = 'tenant_suscripcion'")

    fila = _correr(cuerpo)

    # Antes del arreglo esto era 'string' en las dos columnas.
    assert fila["tipo_after"] == "object"
    assert fila["tipo_before"] == "object"

    # Y esto era lo que de verdad se perdia: poder preguntarle algo a la
    # bitacora. Los tres operadores fallaban en silencio, devolviendo false y
    # null en vez de un error.
    assert fila["tiene_clave"] is True
    assert fila["valor"] == "PRO"
    assert fila["contiene"] is True


def test_la_auditoria_se_lee_igual_que_se_escribio():
    """Ida y vuelta: lo que entra como dict sale como dict, con los mismos tipos."""
    async def cuerpo(conn, tenant_id, user_id):
        await server.create_audit_log(
            conn, tenant_id, user_id, "invoice", "CREATE", None, PAYLOAD)
        return await conn.fetchval(
            "select after_json from audit_logs where entity = 'invoice'")

    # El decoder del codec devuelve el dict ya deserializado. Con el bug
    # llegaba una str (el JSON sin parsear), que es la otra cara del problema.
    leido = _correr(cuerpo)
    assert isinstance(leido, dict)
    assert leido == PAYLOAD


def test_la_alerta_conserva_a_que_apunta():
    """entity_ref es lo unico que dice a que se refiere una alerta."""
    async def cuerpo(conn, tenant_id, user_id):
        await server.create_alert(
            conn, tenant_id, "CASH_DIFFERENCE", server.AlertSeverity.WARN,
            "Diferencia en Caja", "Diferencia de S/ 20.00 al cerrar caja",
            {"cash_shift_id": "11111111-2222-3333-4444-555555555555"})
        return await conn.fetchrow(
            "select jsonb_typeof(entity_ref) tipo, "
            "       entity_ref->>'cash_shift_id' turno from alerts")

    fila = _correr(cuerpo)
    assert fila["tipo"] == "object"
    assert fila["turno"] == "11111111-2222-3333-4444-555555555555"


def test_una_alerta_sin_referencia_guarda_un_objeto_vacio():
    """El default de la columna es '{}'::jsonb; entity_ref=None no lo contradice."""
    async def cuerpo(conn, tenant_id, user_id):
        await server.create_alert(
            conn, tenant_id, "OTRA", server.AlertSeverity.INFO, "t", "m")
        return await conn.fetchval("select jsonb_typeof(entity_ref) from alerts")

    assert _correr(cuerpo) == "object"


# ---------------------------------------------------------------------------
# Las dos trampas que hicieron que el bug durara
# ---------------------------------------------------------------------------
def test_el_cast_explicito_no_protege_del_doble_serializado():
    """`$2::jsonb` NO evita que el codec serialice: es lo que engano en
    update_tenant_suscripcion.

    Ahi el json.dumps parecia justificado porque el parametro llevaba un cast a
    jsonb. Pero Postgres describe ese parametro como jsonb igualmente, asi que
    asyncpg le aplica el codec igual que a uno sin cast. Esta prueba fija ese
    comportamiento para que nadie vuelva a reintroducir el json.dumps
    razonando desde el cast.
    """
    async def cuerpo(conn, tenant_id, user_id):
        preparada = await conn.prepare(
            "update tenants set settings = coalesce(settings, '{}'::jsonb) "
            "    || jsonb_build_object('suscripcion_manual', $2::jsonb) "
            "  where id = $1")
        tipos = [p.name for p in preparada.get_parameters()]

        await preparada.fetch(tenant_id, PAYLOAD)
        fila = await conn.fetchrow(
            "select jsonb_typeof(settings->'suscripcion_manual') tipo, "
            "       settings->'suscripcion_manual'->>'plan_codigo' plan "
            "  from tenants where id = $1", tenant_id)
        return tipos, fila

    tipos, fila = _correr(cuerpo)

    # Postgres lo describe como jsonb pese al cast: por eso el codec se aplica.
    assert tipos[1] == "jsonb"
    assert fila["tipo"] == "object"
    assert fila["plan"] == "PRO"


def test_serializar_a_mano_es_lo_que_rompia_la_bitacora():
    """Deja escrito por que no se puede volver a json.dumps.

    Es el unico sitio del repo donde se escribe jsonb a mano, y esta aqui para
    documentar el bug con una comprobacion en vez de con un comentario: si
    alguien quitara el codec de db_pg pensando que sobra, esta prueba y las de
    arriba se caen a la vez y dicen por que.
    """
    async def cuerpo(conn, tenant_id, user_id):
        await conn.execute(
            "insert into audit_logs (tenant_id, user_id, entity, action, after_json) "
            "values ($1, $2, 'formato_viejo', 'update', $3)",
            tenant_id, user_id, json.dumps(PAYLOAD))
        return await conn.fetchrow(
            "select jsonb_typeof(after_json) tipo, "
            "       after_json ? 'plan_codigo' tiene_clave, "
            "       after_json->>'plan_codigo' valor "
            "  from audit_logs where entity = 'formato_viejo'")

    fila = _correr(cuerpo)

    # Un jsonb valido... que es una cadena. Ni el insert ni la lectura se
    # quejan: por eso el bug sobrevivio a la migracion entera desde Mongo.
    assert fila["tipo"] == "string"
    assert fila["tiene_clave"] is False
    assert fila["valor"] is None
