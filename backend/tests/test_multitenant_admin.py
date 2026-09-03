"""
Pruebas del sistema multi-tenant: consola del SUPER_ADMIN y cuenta propia.

Cubren lo que se agrego en septiembre de 2026 tomando CargoXprez como modelo:
editar, activar/desactivar y eliminar hoteles; usuarios de un hotel desde la
consola; "entrar como" y la vuelta; cambio de la propia contrasena; y las dos
reglas de proteccion (no borrar al ultimo ADMIN, no desactivarse a uno mismo).

Se lanzan igual que el resto (ver conftest.py): contra una instancia EFIMERA,
nunca contra produccion, porque crean y BORRAN un hotel entero.
"""
import os
import uuid

import pytest
import requests

from conftest import (
    BASE_URL,
    SETUP_EMAIL,
    SETUP_PASSWORD,
    HOTEL_TEST_ADMIN_EMAIL,
    HOTEL_TEST_ADMIN_PASSWORD,
)

pytestmark = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL sin definir")


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def superadmin():
    return _login(SETUP_EMAIL, SETUP_PASSWORD)


@pytest.fixture(scope="module")
def hotel_efimero(superadmin):
    """Un hotel creado solo para esta bateria; se elimina al final."""
    sufijo = uuid.uuid4().hex[:6]
    ruc = "20" + str(abs(hash(sufijo)) % 10**9).zfill(9)
    admin_email = f"admin-{sufijo}@efimero.test"
    r = requests.post(
        f"{BASE_URL}/api/tenants", headers=superadmin,
        json={"name": f"Hotel Efímero {sufijo}", "ruc": ruc,
              "admin_email": admin_email, "admin_password": "clave-efimera-1",
              "admin_name": "Admin Efímero"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    datos = r.json()
    datos.update(ruc=ruc, admin_email=admin_email, admin_password="clave-efimera-1",
                 name=f"Hotel Efímero {sufijo}")
    yield datos
    # Si el test de borrado no llego a correr, se limpia igual.
    requests.delete(f"{BASE_URL}/api/tenants/{datos['id']}", headers=superadmin, timeout=60)


class TestEditarHotel:
    def test_superadmin_edita_datos(self, superadmin, hotel_efimero):
        r = requests.put(
            f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=superadmin,
            json={"nombre_comercial": "Efímero Suites", "checkin_time": "15:00"}, timeout=30,
        )
        assert r.status_code == 200, r.text
        detalle = requests.get(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=superadmin, timeout=30).json()
        assert detalle["nombre_comercial"] == "Efímero Suites"
        assert detalle["checkin_time"] == "15:00"

    def test_ruc_debe_ser_numerico_de_once(self, superadmin, hotel_efimero):
        r = requests.put(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=superadmin,
                         json={"ruc": "ABC"}, timeout=30)
        assert r.status_code in (400, 422)

    def test_admin_no_edita_otro_hotel(self, hotel_efimero):
        otro = _login(HOTEL_TEST_ADMIN_EMAIL, HOTEL_TEST_ADMIN_PASSWORD)
        r = requests.put(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=otro,
                         json={"name": "Robado"}, timeout=30)
        assert r.status_code == 403

    def test_lista_trae_conteos(self, superadmin, hotel_efimero):
        lista = requests.get(f"{BASE_URL}/api/tenants", headers=superadmin, timeout=30).json()
        mio = next(t for t in lista if t["id"] == hotel_efimero["id"])
        assert mio["usuarios"] == 1
        assert "habitaciones" in mio

    def test_stats(self, superadmin, hotel_efimero):
        r = requests.get(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}/stats", headers=superadmin, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["usuarios"] == 1
        assert r.json()["habitaciones"] == 0


class TestUsuariosDelHotel:
    def test_superadmin_lista_por_tenant(self, superadmin, hotel_efimero):
        r = requests.get(f"{BASE_URL}/api/users", headers=superadmin,
                         params={"tenant_id": hotel_efimero["id"]}, timeout=30)
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert emails == [hotel_efimero["admin_email"]]
        assert all("password_hash" not in u for u in r.json())

    def test_no_se_elimina_al_ultimo_admin(self, superadmin, hotel_efimero):
        admin = requests.get(f"{BASE_URL}/api/users", headers=superadmin,
                             params={"tenant_id": hotel_efimero["id"]}, timeout=30).json()[0]
        r = requests.delete(f"{BASE_URL}/api/users/{admin['id']}", headers=superadmin, timeout=30)
        assert r.status_code == 400
        assert "único administrador" in r.json()["detail"]
        r = requests.put(f"{BASE_URL}/api/users/{admin['id']}", headers=superadmin,
                         json={"is_active": False}, timeout=30)
        assert r.status_code == 400

    def test_crear_editar_restablecer_eliminar(self, superadmin, hotel_efimero):
        r = requests.post(f"{BASE_URL}/api/users", headers=superadmin, json={
            "email": f"recep-{uuid.uuid4().hex[:5]}@efimero.test", "password": "clave-larga-1",
            "full_name": "Recepción", "role": "RECEPTIONIST", "tenant_id": hotel_efimero["id"],
        }, timeout=30)
        assert r.status_code == 200, r.text
        uid = r.json()["id"]

        r = requests.put(f"{BASE_URL}/api/users/{uid}", headers=superadmin,
                         json={"full_name": "Recepción Tarde", "role": "HOUSEKEEPING"}, timeout=30)
        assert r.status_code == 200, r.text

        r = requests.put(f"{BASE_URL}/api/users/{uid}/password", headers=superadmin,
                         json={"password": "corta"}, timeout=30)
        assert r.status_code == 400
        r = requests.put(f"{BASE_URL}/api/users/{uid}/password", headers=superadmin,
                         json={"password": "otra-clave-larga"}, timeout=30)
        assert r.status_code == 200

        r = requests.delete(f"{BASE_URL}/api/users/{uid}", headers=superadmin, timeout=30)
        assert r.status_code == 200

    def test_contrasena_corta_al_crear(self, superadmin, hotel_efimero):
        r = requests.post(f"{BASE_URL}/api/users", headers=superadmin, json={
            "email": "corta@efimero.test", "password": "1234567", "full_name": "X",
            "role": "RECEPTIONIST", "tenant_id": hotel_efimero["id"],
        }, timeout=30)
        assert r.status_code == 400

    def test_admin_no_se_desactiva_a_si_mismo(self, hotel_efimero):
        admin = _login(hotel_efimero["admin_email"], hotel_efimero["admin_password"])
        yo = requests.get(f"{BASE_URL}/api/auth/me", headers=admin, timeout=30).json()
        r = requests.put(f"{BASE_URL}/api/users/{yo['id']}", headers=admin,
                         json={"is_active": False}, timeout=30)
        assert r.status_code == 400


class TestMiCuenta:
    def test_cambiar_contrasena_con_la_actual(self, hotel_efimero):
        admin = _login(hotel_efimero["admin_email"], hotel_efimero["admin_password"])
        r = requests.put(f"{BASE_URL}/api/auth/password", headers=admin,
                         json={"actual": "incorrecta", "nueva": "nueva-clave-larga"}, timeout=30)
        assert r.status_code == 400
        r = requests.put(f"{BASE_URL}/api/auth/password", headers=admin,
                         json={"actual": hotel_efimero["admin_password"], "nueva": "nueva-clave-larga"}, timeout=30)
        assert r.status_code == 200, r.text
        _login(hotel_efimero["admin_email"], "nueva-clave-larga")
        hotel_efimero["admin_password"] = "nueva-clave-larga"

    def test_perfil(self, hotel_efimero):
        admin = _login(hotel_efimero["admin_email"], hotel_efimero["admin_password"])
        r = requests.put(f"{BASE_URL}/api/auth/perfil", headers=admin, json={"full_name": "Nombre Nuevo"}, timeout=30)
        assert r.status_code == 200
        assert requests.get(f"{BASE_URL}/api/auth/me", headers=admin, timeout=30).json()["full_name"] == "Nombre Nuevo"


class TestEntrarComo:
    def test_entrar_y_salir(self, superadmin, hotel_efimero):
        r = requests.post(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}/entrar", headers=superadmin, timeout=30)
        assert r.status_code == 200, r.text
        dentro = {"Authorization": f"Bearer {r.json()['access_token']}"}

        yo = requests.get(f"{BASE_URL}/api/auth/me", headers=dentro, timeout=30).json()
        assert yo["en_otro_hotel"] is True
        assert yo["role"] == "ADMIN"
        assert yo["rol_real"] == "SUPER_ADMIN"
        assert yo["tenant_id"] == hotel_efimero["id"]

        # Dentro se ven SOLO los usuarios de ese hotel...
        usuarios = requests.get(f"{BASE_URL}/api/users", headers=dentro, timeout=30).json()
        assert {u["tenant_id"] for u in usuarios} == {hotel_efimero["id"]}
        # ...y la consola de hoteles queda cerrada.
        assert requests.get(f"{BASE_URL}/api/tenants", headers=dentro, timeout=30).status_code == 403

        r = requests.post(f"{BASE_URL}/api/auth/salir-de-hotel", headers=dentro, timeout=30)
        assert r.status_code == 200, r.text
        fuera = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert requests.get(f"{BASE_URL}/api/tenants", headers=fuera, timeout=30).status_code == 200

    def test_salir_sin_estar_dentro(self, superadmin):
        assert requests.post(f"{BASE_URL}/api/auth/salir-de-hotel", headers=superadmin, timeout=30).status_code == 400


class TestActivarYEliminar:
    def test_hotel_desactivado_no_entra(self, superadmin, hotel_efimero):
        r = requests.put(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}/activo", headers=superadmin,
                         json={"is_active": False}, timeout=30)
        assert r.status_code == 200, r.text
        r = requests.post(f"{BASE_URL}/api/auth/login", timeout=30,
                          json={"email": hotel_efimero["admin_email"], "password": hotel_efimero["admin_password"]})
        assert r.status_code == 403
        assert "desactivado" in r.json()["detail"]

        # El superadmin sigue entrando aunque haya hoteles apagados.
        _login(SETUP_EMAIL, SETUP_PASSWORD)

        r = requests.put(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}/activo", headers=superadmin,
                         json={"is_active": True}, timeout=30)
        assert r.status_code == 200
        _login(hotel_efimero["admin_email"], hotel_efimero["admin_password"])

    def test_eliminar_hotel_con_todo(self, superadmin, hotel_efimero):
        r = requests.delete(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=superadmin, timeout=60)
        assert r.status_code == 200, r.text
        assert requests.get(f"{BASE_URL}/api/tenants/{hotel_efimero['id']}", headers=superadmin, timeout=30).status_code == 404
        # Su administrador ya no existe.
        r = requests.post(f"{BASE_URL}/api/auth/login", timeout=30,
                          json={"email": hotel_efimero["admin_email"], "password": hotel_efimero["admin_password"]})
        assert r.status_code == 401

    def test_admin_no_elimina_hoteles(self):
        otro = _login(HOTEL_TEST_ADMIN_EMAIL, HOTEL_TEST_ADMIN_PASSWORD)
        yo = requests.get(f"{BASE_URL}/api/auth/me", headers=otro, timeout=30).json()
        assert requests.delete(f"{BASE_URL}/api/tenants/{yo['tenant_id']}", headers=otro, timeout=30).status_code == 403
        assert requests.put(f"{BASE_URL}/api/tenants/{yo['tenant_id']}/activo", headers=otro,
                            json={"is_active": False}, timeout=30).status_code == 403
