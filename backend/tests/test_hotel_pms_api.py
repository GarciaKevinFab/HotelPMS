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
