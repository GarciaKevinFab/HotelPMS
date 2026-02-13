"""
Hotel PMS Backend API Tests
Tests for: Authentication, Rooms, Room Types, Dashboard, Reservations, Housekeeping, Cash Shifts
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_EMAIL = "admin@demo.com"
ADMIN_PASSWORD = "admin123"
RECEPTIONIST_EMAIL = "recepcion@demo.com"
RECEPTIONIST_PASSWORD = "recepcion123"
HOUSEKEEPING_EMAIL = "limpieza@demo.com"
HOUSEKEEPING_PASSWORD = "limpieza123"


class TestHealthCheck:
    """Health check endpoint tests - run first"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data


class TestAuthentication:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test admin login with valid credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["email"] == ADMIN_EMAIL
        assert data["user"]["role"] == "ADMIN"
        assert data["token_type"] == "bearer"
    
    def test_login_receptionist_success(self):
        """Test receptionist login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": RECEPTIONIST_EMAIL,
            "password": RECEPTIONIST_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "RECEPTIONIST"
    
    def test_login_housekeeping_success(self):
        """Test housekeeping login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": HOUSEKEEPING_EMAIL,
            "password": HOUSEKEEPING_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "HOUSEKEEPING"
    
    def test_login_invalid_credentials(self):
        """Test login with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data
    
    def test_login_nonexistent_user(self):
        """Test login with non-existent email"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "nonexistent@test.com",
            "password": "anypassword"
        })
        assert response.status_code == 401
    
    def test_me_endpoint_with_token(self):
        """Test /auth/me with valid token"""
        # First login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        token = login_response.json()["access_token"]
        
        # Then get user info
        response = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == ADMIN_EMAIL
    
    def test_me_endpoint_without_token(self):
        """Test /auth/me without token"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401


@pytest.fixture
def admin_token():
    """Get admin authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin authentication failed")


@pytest.fixture
def auth_headers(admin_token):
    """Get headers with auth token"""
    return {"Authorization": f"Bearer {admin_token}"}


class TestRoomTypes:
    """Room Types endpoint tests"""
    
    def test_list_room_types(self, auth_headers):
        """Test listing room types"""
        response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have 3 seeded room types
        assert len(data) >= 3
        
        # Verify room type structure
        for rt in data:
            assert "id" in rt
            assert "name" in rt
            assert "capacity" in rt
            assert "base_price" in rt
    
    def test_room_types_have_expected_names(self, auth_headers):
        """Verify seeded room types exist"""
        response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        data = response.json()
        names = [rt["name"] for rt in data]
        
        # Check for expected room types
        assert "Estándar" in names or "Estandar" in names or any("Est" in n for n in names)


class TestRooms:
    """Rooms endpoint tests"""
    
    def test_list_rooms(self, auth_headers):
        """Test listing all rooms"""
        response = requests.get(f"{BASE_URL}/api/rooms", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have 30 seeded rooms
        assert len(data) >= 30
    
    def test_rooms_have_required_fields(self, auth_headers):
        """Verify room structure"""
        response = requests.get(f"{BASE_URL}/api/rooms", headers=auth_headers)
        data = response.json()
        
        for room in data[:5]:  # Check first 5 rooms
            assert "id" in room
            assert "number" in room
            assert "floor" in room
            assert "occupancy_status" in room
            assert "housekeeping_status" in room
            assert "room_type" in room
    
    def test_filter_rooms_by_floor(self, auth_headers):
        """Test filtering rooms by floor"""
        response = requests.get(f"{BASE_URL}/api/rooms?floor=1", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        for room in data:
            assert room["floor"] == 1
    
    def test_filter_rooms_by_housekeeping_status(self, auth_headers):
        """Test filtering rooms by housekeeping status"""
        response = requests.get(f"{BASE_URL}/api/rooms?housekeeping_status=CLEAN", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        for room in data:
            assert room["housekeeping_status"] == "CLEAN"


class TestDashboard:
    """Dashboard endpoint tests"""
    
    def test_dashboard_kpis(self, auth_headers):
        """Test dashboard KPIs endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/kpis", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify KPI structure
        assert "today" in data
        assert "month" in data
        
        # Today KPIs
        today = data["today"]
        assert "occupancy_rate" in today
        assert "rooms_total" in today
        assert "rooms_occupied" in today
        assert "arrivals" in today
        assert "departures" in today
    
    def test_revenue_chart(self, auth_headers):
        """Test revenue chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/revenue?days=30", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_occupancy_chart(self, auth_headers):
        """Test occupancy chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/occupancy?days=30", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_room_status_chart(self, auth_headers):
        """Test room status chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/room-status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)
    
    def test_payment_methods_chart(self, auth_headers):
        """Test payment methods chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/payment-methods", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_invoicing_status_chart(self, auth_headers):
        """Test invoicing status chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/invoicing-status", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_top_products_chart(self, auth_headers):
        """Test top products chart endpoint"""
        response = requests.get(f"{BASE_URL}/api/dashboard/charts/top-products", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestReservations:
    """Reservations endpoint tests"""
    
    def test_list_reservations(self, auth_headers):
        """Test listing reservations"""
        response = requests.get(f"{BASE_URL}/api/reservations", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_reservations_without_auth(self):
        """Test reservations endpoint without auth"""
        response = requests.get(f"{BASE_URL}/api/reservations")
        assert response.status_code == 401


class TestHousekeeping:
    """Housekeeping endpoint tests"""
    
    def test_housekeeping_board(self, auth_headers):
        """Test housekeeping board endpoint"""
        response = requests.get(f"{BASE_URL}/api/housekeeping/board", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "floors" in data
        assert isinstance(data["floors"], dict)
    
    def test_housekeeping_tasks(self, auth_headers):
        """Test housekeeping tasks endpoint"""
        response = requests.get(f"{BASE_URL}/api/housekeeping/tasks", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestCashShifts:
    """Cash Shifts endpoint tests"""
    
    def test_list_cash_shifts(self, auth_headers):
        """Test listing cash shifts"""
        response = requests.get(f"{BASE_URL}/api/cash-shifts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_current_cash_shift(self, auth_headers):
        """Test getting current cash shift"""
        response = requests.get(f"{BASE_URL}/api/cash-shifts/current", headers=auth_headers)
        # Can be 200 with data or 200 with null if no shift open
        assert response.status_code == 200


class TestGuests:
    """Guests endpoint tests"""
    
    def test_list_guests(self, auth_headers):
        """Test listing guests"""
        response = requests.get(f"{BASE_URL}/api/guests", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestAlerts:
    """Alerts endpoint tests"""
    
    def test_list_alerts(self, auth_headers):
        """Test listing alerts"""
        response = requests.get(f"{BASE_URL}/api/alerts", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestInvoices:
    """Invoices endpoint tests"""
    
    def test_list_invoices(self, auth_headers):
        """Test listing invoices"""
        response = requests.get(f"{BASE_URL}/api/invoices", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestMaintenance:
    """Maintenance endpoint tests"""
    
    def test_list_maintenance_tickets(self, auth_headers):
        """Test listing maintenance tickets"""
        response = requests.get(f"{BASE_URL}/api/maintenance/tickets", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestUsers:
    """Users endpoint tests"""
    
    def test_list_users(self, auth_headers):
        """Test listing users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have at least 3 seeded users
        assert len(data) >= 3


class TestAuditLogs:
    """Audit logs endpoint tests"""
    
    def test_list_audit_logs(self, auth_headers):
        """Test listing audit logs"""
        response = requests.get(f"{BASE_URL}/api/audit-logs", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestSearch:
    """Search endpoint tests"""
    
    def test_global_search(self, auth_headers):
        """Test global search endpoint"""
        response = requests.get(f"{BASE_URL}/api/search?q=101", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


class TestReportsExport:
    """Reports Export endpoint tests - Excel and PDF"""
    
    def test_export_excel_occupancy(self, auth_headers):
        """Test export occupancy report to Excel"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/excel",
            params={"report_type": "occupancy", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
        assert len(response.content) > 0
    
    def test_export_excel_revenue(self, auth_headers):
        """Test export revenue report to Excel"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/excel",
            params={"report_type": "revenue", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
    
    def test_export_excel_invoicing(self, auth_headers):
        """Test export invoicing report to Excel"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/excel",
            params={"report_type": "invoicing", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers.get("content-type", "")
    
    def test_export_pdf_occupancy(self, auth_headers):
        """Test export occupancy report to PDF"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf",
            params={"report_type": "occupancy", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
        assert len(response.content) > 0
    
    def test_export_pdf_revenue(self, auth_headers):
        """Test export revenue report to PDF"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf",
            params={"report_type": "revenue", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")
    
    def test_export_pdf_invoicing(self, auth_headers):
        """Test export invoicing report to PDF"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf",
            params={"report_type": "invoicing", "month": 1, "year": 2026},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "application/pdf" in response.headers.get("content-type", "")


class TestRatesManagement:
    """Rates Management endpoint tests - Special rates and rate calculation"""
    
    def test_list_rates(self, auth_headers):
        """Test listing rates"""
        response = requests.get(f"{BASE_URL}/api/rates", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
    
    def test_create_special_rate(self, auth_headers):
        """Test creating a special rate for a room type"""
        # First get a room type
        room_types_response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        assert room_types_response.status_code == 200
        room_types = room_types_response.json()
        
        if not room_types:
            pytest.skip("No room types available")
        
        room_type = room_types[0]
        
        # Create a special rate for next month
        from datetime import datetime, timedelta
        start_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=37)).strftime("%Y-%m-%d")
        
        rate_data = {
            "room_type_id": room_type["id"],
            "date_from": start_date,
            "date_to": end_date,
            "price": 250.00,
            "name": "TEST_Temporada Alta",
            "min_stay": 2
        }
        
        response = requests.post(f"{BASE_URL}/api/rates", json=rate_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "message" in data
        assert data["message"] == "Tarifa creada"
    
    def test_calculate_rate_with_base_price(self, auth_headers):
        """Test rate calculation using base price (no special rate)"""
        # Get a room type
        room_types_response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        room_types = room_types_response.json()
        
        if not room_types:
            pytest.skip("No room types available")
        
        room_type = room_types[0]
        
        # Calculate rate for dates without special rate (far future)
        from datetime import datetime, timedelta
        checkin = (datetime.now() + timedelta(days=100)).strftime("%Y-%m-%d")
        checkout = (datetime.now() + timedelta(days=103)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/rates/calculate",
            params={
                "room_type_id": room_type["id"],
                "checkin_date": checkin,
                "checkout_date": checkout
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "room_type" in data
        assert "nights" in data
        assert data["nights"] == 3
        assert "total" in data
        assert "breakdown" in data
        assert len(data["breakdown"]) == 3
        
        # Verify breakdown uses base price
        for night in data["breakdown"]:
            assert "date" in night
            assert "price" in night
            assert "rate_name" in night
    
    def test_calculate_rate_with_special_rate(self, auth_headers):
        """Test rate calculation with special rate applied"""
        # Get a room type
        room_types_response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        room_types = room_types_response.json()
        
        if not room_types:
            pytest.skip("No room types available")
        
        room_type = room_types[0]
        
        # Create a special rate for specific dates (use unique far future dates)
        from datetime import datetime, timedelta
        import time
        unique_offset = int(time.time()) % 100 + 150  # Unique offset 150-250 days
        start_date = (datetime.now() + timedelta(days=unique_offset)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=unique_offset + 7)).strftime("%Y-%m-%d")
        special_price = 199.99
        
        rate_data = {
            "room_type_id": room_type["id"],
            "date_from": start_date,
            "date_to": end_date,
            "price": special_price,
            "name": "TEST_Promocion Especial",
            "min_stay": 1
        }
        
        create_response = requests.post(f"{BASE_URL}/api/rates", json=rate_data, headers=auth_headers)
        assert create_response.status_code == 200
        
        # Calculate rate for dates within special rate period
        checkin = (datetime.now() + timedelta(days=unique_offset + 1)).strftime("%Y-%m-%d")
        checkout = (datetime.now() + timedelta(days=unique_offset + 4)).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{BASE_URL}/api/rates/calculate",
            params={
                "room_type_id": room_type["id"],
                "checkin_date": checkin,
                "checkout_date": checkout
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["nights"] == 3
        
        # Verify special rate is applied (price should match our created rate)
        for night in data["breakdown"]:
            assert night["price"] == special_price
            assert "Promocion" in night["rate_name"] or "Especial" in night["rate_name"]
    
    def test_delete_rate(self, auth_headers):
        """Test deleting a rate"""
        # First create a rate to delete
        room_types_response = requests.get(f"{BASE_URL}/api/room-types", headers=auth_headers)
        room_types = room_types_response.json()
        
        if not room_types:
            pytest.skip("No room types available")
        
        room_type = room_types[0]
        
        from datetime import datetime, timedelta
        start_date = (datetime.now() + timedelta(days=200)).strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=207)).strftime("%Y-%m-%d")
        
        rate_data = {
            "room_type_id": room_type["id"],
            "date_from": start_date,
            "date_to": end_date,
            "price": 300.00,
            "name": "TEST_Rate_To_Delete",
            "min_stay": 1
        }
        
        create_response = requests.post(f"{BASE_URL}/api/rates", json=rate_data, headers=auth_headers)
        assert create_response.status_code == 200
        rate_id = create_response.json()["id"]
        
        # Delete the rate
        delete_response = requests.delete(f"{BASE_URL}/api/rates/{rate_id}", headers=auth_headers)
        assert delete_response.status_code == 200
        assert delete_response.json()["message"] == "Tarifa eliminada"


class TestUserManagement:
    """User Management endpoint tests - Create, update, activate/deactivate"""
    
    def test_create_user(self, auth_headers):
        """Test creating a new user"""
        import time
        unique_id = str(int(time.time()))[-6:]
        
        user_data = {
            "email": f"test_user_{unique_id}@demo.com",
            "password": "testpass123",
            "full_name": f"TEST_User {unique_id}",
            "role": "RECEPTIONIST"
        }
        
        response = requests.post(f"{BASE_URL}/api/users", json=user_data, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "Usuario creado exitosamente"
    
    def test_create_user_duplicate_email(self, auth_headers):
        """Test creating user with duplicate email fails"""
        user_data = {
            "email": ADMIN_EMAIL,  # Already exists
            "password": "testpass123",
            "full_name": "Duplicate User",
            "role": "RECEPTIONIST"
        }
        
        response = requests.post(f"{BASE_URL}/api/users", json=user_data, headers=auth_headers)
        assert response.status_code == 400
        assert "Email ya registrado" in response.json()["detail"]
    
    def test_update_user_status_deactivate(self, auth_headers):
        """Test deactivating a user"""
        # First create a user to deactivate
        import time
        unique_id = str(int(time.time()))[-6:]
        
        user_data = {
            "email": f"test_deactivate_{unique_id}@demo.com",
            "password": "testpass123",
            "full_name": f"TEST_Deactivate User {unique_id}",
            "role": "HOUSEKEEPING"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/users", json=user_data, headers=auth_headers)
        assert create_response.status_code == 200
        user_id = create_response.json()["id"]
        
        # Deactivate the user
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json={"is_active": False},
            headers=auth_headers
        )
        assert update_response.status_code == 200
        assert update_response.json()["message"] == "Usuario actualizado"
        
        # Verify user cannot login
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        assert login_response.status_code == 401
        assert "desactivado" in login_response.json()["detail"]
    
    def test_update_user_status_reactivate(self, auth_headers):
        """Test reactivating a deactivated user"""
        # Create and deactivate a user
        import time
        unique_id = str(int(time.time()))[-6:]
        
        user_data = {
            "email": f"test_reactivate_{unique_id}@demo.com",
            "password": "testpass123",
            "full_name": f"TEST_Reactivate User {unique_id}",
            "role": "RECEPTIONIST"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/users", json=user_data, headers=auth_headers)
        user_id = create_response.json()["id"]
        
        # Deactivate
        requests.put(f"{BASE_URL}/api/users/{user_id}", json={"is_active": False}, headers=auth_headers)
        
        # Reactivate
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json={"is_active": True},
            headers=auth_headers
        )
        assert update_response.status_code == 200
        
        # Verify user can login again
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        assert login_response.status_code == 200
    
    def test_update_user_role(self, auth_headers):
        """Test updating user role"""
        # Create a user
        import time
        unique_id = str(int(time.time()))[-6:]
        
        user_data = {
            "email": f"test_role_{unique_id}@demo.com",
            "password": "testpass123",
            "full_name": f"TEST_Role User {unique_id}",
            "role": "RECEPTIONIST"
        }
        
        create_response = requests.post(f"{BASE_URL}/api/users", json=user_data, headers=auth_headers)
        user_id = create_response.json()["id"]
        
        # Update role to HOUSEKEEPING
        update_response = requests.put(
            f"{BASE_URL}/api/users/{user_id}",
            json={"role": "HOUSEKEEPING"},
            headers=auth_headers
        )
        assert update_response.status_code == 200
        
        # Verify role changed by logging in and checking
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": user_data["email"],
            "password": user_data["password"]
        })
        assert login_response.status_code == 200
        assert login_response.json()["user"]["role"] == "HOUSEKEEPING"


class TestTenantInvoicingConfig:
    """Tenant Invoicing Configuration tests - NubeFact settings"""
    
    def test_get_tenant_with_invoicing_config(self, auth_headers):
        """Test getting tenant includes invoicing config"""
        # First get user info to get tenant_id
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        assert me_response.status_code == 200
        tenant_id = me_response.json().get("tenant_id")
        
        if not tenant_id:
            pytest.skip("User has no tenant_id")
        
        # Get tenant details
        tenant_response = requests.get(f"{BASE_URL}/api/tenants/{tenant_id}", headers=auth_headers)
        assert tenant_response.status_code == 200
        tenant = tenant_response.json()
        
        assert "invoicing_config" in tenant
        config = tenant["invoicing_config"]
        assert "invoicing_mode" in config
        assert "boleta_series" in config
        assert "factura_series" in config
        assert "igv_rate" in config
    
    def test_update_invoicing_config_mock_mode(self, auth_headers):
        """Test updating invoicing config to MOCK mode"""
        # Get tenant_id
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        tenant_id = me_response.json().get("tenant_id")
        
        if not tenant_id:
            pytest.skip("User has no tenant_id")
        
        # Update to MOCK mode (no token)
        config_data = {
            "nubefact_ruta": None,
            "nubefact_token": None,
            "invoicing_mode": "MOCK",
            "boleta_series": "B001",
            "boleta_correlative": 1,
            "factura_series": "F001",
            "factura_correlative": 1,
            "igv_rate": 18.0
        }
        
        response = requests.put(
            f"{BASE_URL}/api/tenants/{tenant_id}/invoicing",
            json=config_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["message"] == "Configuración de facturación actualizada"
    
    def test_update_invoicing_config_live_mode(self, auth_headers):
        """Test updating invoicing config to LIVE mode with credentials"""
        # Get tenant_id
        me_response = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers)
        tenant_id = me_response.json().get("tenant_id")
        
        if not tenant_id:
            pytest.skip("User has no tenant_id")
        
        # Update to LIVE mode with test credentials
        config_data = {
            "nubefact_ruta": "https://api.nubefact.com/api/v1/test",
            "nubefact_token": "test-token-12345",
            "invoicing_mode": "LIVE",
            "boleta_series": "B001",
            "boleta_correlative": 100,
            "factura_series": "F001",
            "factura_correlative": 50,
            "igv_rate": 18.0
        }
        
        response = requests.put(
            f"{BASE_URL}/api/tenants/{tenant_id}/invoicing",
            json=config_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        # Verify config was saved
        tenant_response = requests.get(f"{BASE_URL}/api/tenants/{tenant_id}", headers=auth_headers)
        tenant = tenant_response.json()
        assert tenant["invoicing_config"]["nubefact_ruta"] == "https://api.nubefact.com/api/v1/test"
        assert tenant["invoicing_config"]["nubefact_token"] == "test-token-12345"
        assert tenant["invoicing_config"]["invoicing_mode"] == "LIVE"
        
        # Reset back to MOCK mode for other tests
        reset_config = {
            "nubefact_ruta": None,
            "nubefact_token": None,
            "invoicing_mode": "MOCK",
            "boleta_series": "B001",
            "boleta_correlative": 1,
            "factura_series": "F001",
            "factura_correlative": 1,
            "igv_rate": 18.0
        }
        requests.put(f"{BASE_URL}/api/tenants/{tenant_id}/invoicing", json=reset_config, headers=auth_headers)


class TestWalkin:
    """Walk-in reservation endpoint tests"""
    
    def test_walkin_create(self, auth_headers):
        """Test creating a walk-in reservation"""
        from datetime import datetime, timedelta
        
        # First get an available room
        rooms_response = requests.get(
            f"{BASE_URL}/api/rooms",
            params={"occupancy_status": "VACANT", "housekeeping_status": "CLEAN"},
            headers=auth_headers
        )
        assert rooms_response.status_code == 200
        rooms = rooms_response.json()
        
        if not rooms:
            pytest.skip("No available rooms for walk-in test")
        
        room = rooms[0]
        
        # Create walk-in with unique guest data
        import time
        unique_id = str(int(time.time()))[-6:]
        
        # Use tomorrow's date for checkout
        checkout_date = (datetime.now() + timedelta(days=2)).strftime("%Y-%m-%d")
        
        walkin_data = {
            "guest_data": {
                "doc_type": "DNI",
                "doc_number": f"TEST{unique_id}",
                "full_name": f"Test Walkin Guest {unique_id}",
                "phone": "999888777",
                "email": f"test{unique_id}@walkin.com",
                "nationality": "PE"
            },
            "room_id": room["id"],
            "checkout_date": checkout_date,
            "adults": 1,
            "children": 0,
            "notes": "Test walk-in reservation"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/reservations/walkin",
            json=walkin_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "code" in data
        assert data["code"].startswith("WLK-")
        assert "id" in data
        assert "stay_id" in data
        assert "folio_id" in data
        assert "message" in data
    
    def test_walkin_invalid_room(self, auth_headers):
        """Test walk-in with invalid room ID"""
        walkin_data = {
            "guest_data": {
                "doc_type": "DNI",
                "doc_number": "99999999",
                "full_name": "Test Invalid Room",
                "phone": "999888777",
                "nationality": "PE"
            },
            "room_id": "000000000000000000000000",
            "checkout_date": "2026-01-20",
            "adults": 1,
            "children": 0
        }
        
        response = requests.post(
            f"{BASE_URL}/api/reservations/walkin",
            json=walkin_data,
            headers=auth_headers
        )
        
        assert response.status_code == 404


if __name__ == "__main__":
    pytest.main([__file__, "-v"])


# ============== NEW TESTS FOR ITERATION 4 ==============

# Super Admin credentials
SUPER_ADMIN_EMAIL = "superadmin@sistema.com"
SUPER_ADMIN_PASSWORD = "superadmin123"

# Hotel Test credentials
HOTEL_TEST_ADMIN_EMAIL = "admin@hoteltest.com"
HOTEL_TEST_ADMIN_PASSWORD = "admin123test"


class TestSuperAdminAuth:
    """Super Admin authentication tests"""
    
    def test_super_admin_login(self):
        """Test SUPER_ADMIN login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["role"] == "SUPER_ADMIN"
        assert "access_token" in data


class TestTenantsAPI:
    """Tenants (Hotels) API tests - SUPER_ADMIN only"""
    
    @pytest.fixture
    def super_admin_token(self):
        """Get SUPER_ADMIN token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPER_ADMIN_EMAIL,
            "password": SUPER_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def admin_token(self):
        """Get regular ADMIN token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_list_tenants_super_admin(self, super_admin_token):
        """SUPER_ADMIN can list all tenants"""
        response = requests.get(f"{BASE_URL}/api/tenants", headers={
            "Authorization": f"Bearer {super_admin_token}"
        })
        assert response.status_code == 200
        tenants = response.json()
        assert isinstance(tenants, list)
        assert len(tenants) >= 2  # At least Hotel Demo and Hotel Test
    
    def test_list_tenants_admin_forbidden(self, admin_token):
        """Regular ADMIN cannot list tenants"""
        response = requests.get(f"{BASE_URL}/api/tenants", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 403
    
    def test_get_tenant_detail(self, super_admin_token):
        """SUPER_ADMIN can get tenant detail"""
        # First list tenants
        list_response = requests.get(f"{BASE_URL}/api/tenants", headers={
            "Authorization": f"Bearer {super_admin_token}"
        })
        tenants = list_response.json()
        tenant_id = tenants[0]["id"]
        
        # Get detail
        response = requests.get(f"{BASE_URL}/api/tenants/{tenant_id}", headers={
            "Authorization": f"Bearer {super_admin_token}"
        })
        assert response.status_code == 200
        data = response.json()
        assert "name" in data
        assert "ruc" in data


class TestMultiTenantIsolation:
    """Multi-tenant data isolation tests"""
    
    @pytest.fixture
    def demo_token(self):
        """Get Hotel Demo admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def test_hotel_token(self):
        """Get Hotel Test admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": HOTEL_TEST_ADMIN_EMAIL,
            "password": HOTEL_TEST_ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_rooms_isolation(self, demo_token, test_hotel_token):
        """Each tenant only sees their own rooms"""
        # Hotel Demo rooms
        demo_response = requests.get(f"{BASE_URL}/api/rooms", headers={
            "Authorization": f"Bearer {demo_token}"
        })
        demo_rooms = demo_response.json()
        
        # Hotel Test rooms
        test_response = requests.get(f"{BASE_URL}/api/rooms", headers={
            "Authorization": f"Bearer {test_hotel_token}"
        })
        test_rooms = test_response.json()
        
        # Hotel Demo should have rooms, Hotel Test should have none (new tenant)
        assert len(demo_rooms) > 0
        assert len(test_rooms) == 0
    
    def test_reservations_isolation(self, demo_token, test_hotel_token):
        """Each tenant only sees their own reservations"""
        # Hotel Demo reservations
        demo_response = requests.get(f"{BASE_URL}/api/reservations", headers={
            "Authorization": f"Bearer {demo_token}"
        })
        demo_reservations = demo_response.json()
        
        # Hotel Test reservations
        test_response = requests.get(f"{BASE_URL}/api/reservations", headers={
            "Authorization": f"Bearer {test_hotel_token}"
        })
        test_reservations = test_response.json()
        
        # Hotel Demo should have reservations, Hotel Test should have none
        assert len(demo_reservations) > 0
        assert len(test_reservations) == 0


class TestRatesAPIIteration4:
    """Rates API tests for iteration 4"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def room_type_id(self, admin_token):
        """Get first room type ID"""
        response = requests.get(f"{BASE_URL}/api/room-types", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        room_types = response.json()
        return room_types[0]["id"]
    
    def test_list_rates(self, admin_token):
        """List all rates"""
        response = requests.get(f"{BASE_URL}/api/rates", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        rates = response.json()
        assert isinstance(rates, list)
    
    def test_create_rate(self, admin_token, room_type_id):
        """Create a new special rate"""
        response = requests.post(f"{BASE_URL}/api/rates", headers={
            "Authorization": f"Bearer {admin_token}"
        }, json={
            "room_type_id": room_type_id,
            "date_from": "2026-05-01",
            "date_to": "2026-05-15",
            "price": 175.00,
            "name": "TEST_Fiestas Patrias",
            "min_stay": 2
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["message"] == "Tarifa creada"
    
    def test_filter_rates_by_room_type(self, admin_token, room_type_id):
        """Filter rates by room type"""
        response = requests.get(f"{BASE_URL}/api/rates?room_type_id={room_type_id}", headers={
            "Authorization": f"Bearer {admin_token}"
        })
        assert response.status_code == 200
        rates = response.json()
        for rate in rates:
            assert rate["room_type_id"] == room_type_id


class TestReportsExport:
    """Reports export tests"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD
        })
        return response.json()["access_token"]
    
    def test_export_excel_occupancy(self, admin_token):
        """Export occupancy report as Excel"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/excel?report_type=occupancy&from_date=2026-02-01&to_date=2026-02-28",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert "spreadsheet" in response.headers.get("content-type", "")
    
    def test_export_pdf_occupancy(self, admin_token):
        """Export occupancy report as PDF"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf?report_type=occupancy&from_date=2026-02-01&to_date=2026-02-28",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        assert "pdf" in response.headers.get("content-type", "")
    
    def test_export_excel_revenue(self, admin_token):
        """Export revenue report as Excel"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/excel?report_type=revenue&from_date=2026-02-01&to_date=2026-02-28",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
    
    def test_export_pdf_revenue(self, admin_token):
        """Export revenue report as PDF"""
        response = requests.get(
            f"{BASE_URL}/api/reports/export/pdf?report_type=revenue&from_date=2026-02-01&to_date=2026-02-28",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
