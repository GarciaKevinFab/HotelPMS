"""
Preparacion de datos para la bateria de pruebas de la API.

POR QUE EXISTE ESTE ARCHIVO

  Los tests de TestMultiTenantIsolation y TestTenantsAPI daban por hecho que
  ya existian DOS hoteles: el demo que crea /api/seed y otro llamado "Hotel
  Test" con su propio administrador. Nadie lo creaba nunca, asi que esos tests
  fallaban con KeyError: 'access_token' -- el login del segundo hotel devolvia
  401 y el test leia un token que no estaba.

  Son justamente los tests mas valiosos de la bateria: comprueban que un hotel
  no ve los datos de otro. Se quedaban sin correr.

  Este conftest los deja ejecutables creando el escenario completo una vez por
  sesion de pruebas.

COMO SE LANZA

  REACT_APP_BACKEND_URL=http://127.0.0.1:8002 \
  SETUP_EMAIL=superadmin@sistema.com \
  SETUP_PASSWORD=... \
  SEED_DEMO_PASSWORD=... \
  pytest tests/ -q

  Contra una instancia EFIMERA, nunca contra produccion: la preparacion crea
  hoteles y usuarios de prueba.
"""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

SETUP_EMAIL = os.environ.get("SETUP_EMAIL", "superadmin@sistema.com")
SETUP_PASSWORD = os.environ.get("SETUP_PASSWORD", "")

HOTEL_TEST_RUC = "20999888777"
HOTEL_TEST_ADMIN_EMAIL = "admin@hoteltest.com"
HOTEL_TEST_ADMIN_PASSWORD = "admin123test"


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "no_necesita_servidor: prueba que corre sin instancia levantada ni base "
        "de datos (las paginas puras de backend/checkout.py).",
    )


def pytest_collection_modifyitems(config, items):
    """Sin instancia levantada se salta lo que la necesita, y solo eso.

    Antes el fixture de abajo llamaba a pytest.skip() y, por ser autouse de
    sesion, se llevaba por delante TODA la bateria. Las pruebas de las paginas
    del checkout no tocan red ni base: no hay motivo para saltarselas cuando lo
    unico que falta es REACT_APP_BACKEND_URL, y saltarselas significaria que en
    la practica nunca corren.
    """
    if BASE_URL:
        return
    saltar = pytest.mark.skip(
        reason="REACT_APP_BACKEND_URL sin definir: hace falta una instancia "
               "efimera levantada (nunca produccion).")
    for item in items:
        if "no_necesita_servidor" not in item.keywords:
            item.add_marker(saltar)


@pytest.fixture(scope="session", autouse=True)
def preparar_escenario():
    """Deja el sistema con un superadmin, el hotel demo y un segundo hotel."""
    if not BASE_URL:
        # Las que necesitan servidor ya quedaron saltadas en la coleccion.
        yield
        return

    # 1. El superadmin. Si ya existe, /setup responde 400 y seguimos: es
    #    idempotente a proposito.
    requests.post(f"{BASE_URL}/api/setup", timeout=30)

    respuesta = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": SETUP_EMAIL, "password": SETUP_PASSWORD},
        timeout=30,
    )
    if respuesta.status_code != 200:
        pytest.skip(
            "No se pudo entrar como SUPER_ADMIN. Define SETUP_PASSWORD con la "
            "misma clave con la que se inicializo la instancia de pruebas."
        )
    cabeceras = {"Authorization": f"Bearer {respuesta.json()['access_token']}"}

    # 2. El hotel demo con sus habitaciones y productos.
    requests.post(f"{BASE_URL}/api/seed", headers=cabeceras, timeout=60)

    # 3. El SEGUNDO hotel: es la pieza que faltaba. Sin el, "un hotel no ve lo
    #    del otro" no se puede comprobar, porque no hay otro.
    requests.post(
        f"{BASE_URL}/api/tenants",
        headers=cabeceras,
        json={
            "name": "Hotel Test",
            "ruc": HOTEL_TEST_RUC,
            "admin_email": HOTEL_TEST_ADMIN_EMAIL,
            "admin_password": HOTEL_TEST_ADMIN_PASSWORD,
            "admin_name": "Admin Hotel Test",
        },
        timeout=30,
    )
    # Si ya existia devuelve 400 por el RUC repetido, y esta bien: lo que
    # importa es que al llegar aqui el hotel exista.

    yield
