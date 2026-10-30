"""El limite de peticiones por IP, comprobado sin servidor ni base de datos.

    cd backend && python -m pytest tests/test_limites.py -q

POR QUE SE LLAMA AL MIDDLEWARE A PELO

  backend/limites.py es un middleware ASGI puro, asi que se le puede pasar un
  `scope` a mano y recoger lo que manda por `send`. No hace falta levantar
  uvicorn, ni Postgres, ni cliente HTTP: la prueba corre en milisegundos y no
  depende de que haya una instancia viva.

  Se usa asyncio.run() y no pytest-asyncio a proposito: el proyecto fija sus
  dependencias para que el build sea reproducible (ver backend/requirements.txt)
  y no merece la pena anadir un plugin de pytest para diez lineas de prueba.

LAS DOS QUE IMPORTAN

  test_cada_ip_tiene_su_propio_cubo. Si esto se rompe, el limite deja de ser
  por IP y pasa a ser global: el primer atacante deja fuera a todos los
  hoteles a la vez. Es el fallo que ya se dio una vez en CargoXprez, con
  key_func=get_remote_address devolviendo siempre la puerta de Docker.

  test_los_estaticos_de_la_spa_no_cuentan. Una primera carga de la SPA pide
  decenas de ficheros; si contaran contra el cubo de la API, abrir el PMS dos
  veces seguidas empezaria a devolver 429 a un usuario que no ha hecho nada.
"""
import asyncio
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import limites  # noqa: E402

pytestmark = pytest.mark.no_necesita_servidor

# Rango reservado para documentacion (RFC 5737): nunca es de nadie.
IP_A = b"203.0.113.7"
IP_B = b"203.0.113.8"


async def _app_ok(scope, receive, send):
    """La aplicacion que hay detras. Siempre responde 200."""
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"ok"})


def pedir(middleware, ruta, metodo="GET", ip=IP_A):
    """Una peticion. Devuelve (codigo, cabeceras como dict)."""

    async def correr():
        recogido = {}

        async def send(mensaje):
            if mensaje["type"] == "http.response.start":
                recogido["status"] = mensaje["status"]
                recogido["headers"] = dict(mensaje.get("headers") or [])

        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}

        scope = {
            "type": "http",
            "method": metodo,
            "path": ruta,
            "headers": [(b"cf-connecting-ip", ip)],
        }
        await middleware(scope, receive, send)
        return recogido["status"], recogido.get("headers", {})

    return asyncio.run(correr())


def _middleware(reglas):
    return limites.LimitePeticiones(_app_ok, reglas=reglas)


def test_deja_pasar_hasta_el_limite_y_luego_corta():
    m = _middleware([(None, "/api", 3, 60)])
    codigos = [pedir(m, "/api/rooms")[0] for _ in range(5)]
    assert codigos == [200, 200, 200, 429, 429]


def test_cada_ip_tiene_su_propio_cubo():
    """El fallo mas caro posible: que el limite sea global en vez de por IP."""
    m = _middleware([(None, "/api", 2, 60)])
    for _ in range(3):
        pedir(m, "/api/rooms", ip=IP_A)
    # La primera IP ya esta bloqueada; la segunda no se ha enterado de nada.
    assert pedir(m, "/api/rooms", ip=IP_B)[0] == 200


def test_el_429_dice_cuanto_esperar():
    """Sin Retry-After, reintentar en bucle es lo razonable desde fuera."""
    m = _middleware([(None, "/api", 1, 60)])
    pedir(m, "/api/rooms")
    codigo, cabeceras = pedir(m, "/api/rooms")
    assert codigo == 429
    assert 1 <= int(cabeceras[b"retry-after"]) <= 61


def test_gana_la_primera_regla_que_encaja():
    """El login se agota a los 2 aunque el techo general permita 100."""
    m = _middleware([("POST", "/api/auth/login", 2, 60), (None, "/api", 100, 60)])
    codigos = [pedir(m, "/api/auth/login", "POST")[0] for _ in range(3)]
    assert codigos == [200, 200, 429]
    # Y agotar el login no toca el cubo del resto de la API.
    assert pedir(m, "/api/rooms")[0] == 200


def test_los_estaticos_de_la_spa_no_cuentan():
    m = _middleware([(None, "/api", 1, 60)])
    for _ in range(50):
        assert pedir(m, "/static/js/main.abc123.js")[0] == 200
    # El cubo de la API sigue intacto.
    assert pedir(m, "/api/rooms")[0] == 200


def test_el_healthcheck_esta_exento():
    """El compose lo golpea cada 30 s; no puede competir con nadie."""
    m = _middleware([(None, "/api", 2, 60)])
    for _ in range(20):
        assert pedir(m, "/api/health")[0] == 200
    assert pedir(m, "/api/rooms")[0] == 200


def test_la_ventana_se_desliza():
    """Pasada la ventana, el cubo vuelve a admitir."""
    m = _middleware([(None, "/api", 2, 60)])
    pedir(m, "/api/rooms")
    pedir(m, "/api/rooms")
    assert pedir(m, "/api/rooms")[0] == 429

    # Se envejecen las marcas 61 segundos en lugar de esperar de verdad.
    for marcas in m._marcas.values():
        for i in range(len(marcas)):
            marcas[i] -= 61
    assert pedir(m, "/api/rooms")[0] == 200


def test_la_ip_sale_de_la_cabecera_de_cloudflare():
    """Sin esto el limite seria global: al backend solo llega el tunel."""
    assert limites.ip_del_cliente({b"cf-connecting-ip": b"198.51.100.4"}) == "198.51.100.4"
    # X-Forwarded-For puede traer una cadena; el cliente es el primero.
    assert limites.ip_del_cliente({b"x-forwarded-for": b"198.51.100.4, 10.0.0.1"}) == "198.51.100.4"
    # Cloudflare manda, aunque vengan las dos.
    assert limites.ip_del_cliente({
        b"cf-connecting-ip": b"198.51.100.4",
        b"x-forwarded-for": b"10.0.0.1",
    }) == "198.51.100.4"
    assert limites.ip_del_cliente({}) == "desconocida"


def test_las_reglas_de_produccion_terminan_en_un_techo_general():
    """La ultima regla tiene que cubrir TODO.

    Es lo que hace que un endpoint nuevo nazca protegido. Si alguien anade una
    regla especifica al final por descuido, el techo deja de aplicarse a lo que
    quede por debajo y la API vuelve a estar abierta sin que nada avise.
    """
    metodo, prefijo, cuantas, ventana = limites.REGLAS[-1]
    assert metodo is None
    assert prefijo is None
    assert cuantas > 0 and ventana > 0
