# Hotel PMS - Sistema de Administración Hotelera

## Problem Statement
Build a production-ready multi-tenant Hotel Administration PMS (SaaS) for Peru.
- **UI Language:** Spanish (Perú)
- **Currency:** PEN (S/)
- **Timezone:** America/Lima

## Core Requirements

### Multi-tenancy
- 1 tenant = 1 hotel
- Strict data isolation via `tenant_id` at DB and API levels

### Roles & Permissions
| Role | Access |
|------|--------|
| SUPER_ADMIN | All features + tenant management |
| ADMIN | Full hotel management, config, users |
| RECEPTIONIST | Reservations, check-in/out, payments |
| HOUSEKEEPING | Room cleaning status only |

### Core Modules

#### 1. Rooms Management
- Dual state system:
  - Occupancy: VACANT, OCCUPIED, DUE_OUT
  - Housekeeping: DIRTY, CLEANING, CLEAN, INSPECT, OUT_OF_ORDER
- Room types with amenities and base pricing

#### 2. Reservations & Stays
- Full lifecycle: PREBOOK → CONFIRMED → CHECKED_IN → CHECKED_OUT
- Walk-ins support (instant check-in)
- Guest profiles with document types (DNI, CE, Passport, RUC)

#### 3. Folio & Payments
- Charges (nightly rates, services, minibar)
- Multiple payment methods (Cash, Card, Transfer, Yape/Plin)
- Partial payments and refunds
- Cash shifts (`Caja por turnos`)

#### 4. Peruvian Invoicing (NubeFact)
- Electronic Boletas/Facturas
- MOCK mode for development (default)
- LIVE mode configurable per tenant via Settings page
- Credit notes and voiding support

#### 5. Housekeeping & Maintenance
- Task boards by floor
- Incident reporting
- Maintenance tickets (can set rooms to OUT_OF_ORDER)

#### 6. Rate Management
- Dynamic pricing by date ranges
- Special rates (Temporada Alta, Feriados)
- Automatic rate calculation for reservations

#### 7. Dashboard & Reports
- KPI cards: Occupancy, Arrivals, Departures, Revenue
- Charts using Recharts
- Monthly reports with **PDF/Excel export**

#### 8. Settings
- NubeFact configuration (RUTA, TOKEN)
- User management (create, activate/deactivate)
- Hotel information display

## What's Been Implemented ✅

### Backend (55/55 tests passed - 100%)
- [x] JWT authentication with role-based access
- [x] Multi-tenant data isolation
- [x] Room management with dual state
- [x] Reservation lifecycle (CRUD, assign room, check-in/out)
- [x] Walk-in endpoint with instant check-in
- [x] Folio system with charges and payments
- [x] Cash shift management (open/close with difference alerts)
- [x] NubeFact integration (MOCK mode)
- [x] Housekeeping task management
- [x] Maintenance ticket system
- [x] Alert notification system
- [x] Audit logging
- [x] **Rate Management** - create, list, delete special rates
- [x] **Rate Calculation** - dynamic pricing with base + special rates
- [x] **Report Export** - PDF and Excel export endpoints
- [x] **User Management** - create, update status, change roles
- [x] **Tenant Invoicing Config** - MOCK/LIVE mode switch

### Frontend (100% functional)
- [x] Login page with authentication
- [x] Dashboard with 6 charts and KPI cards
- [x] Rooms page with 30 rooms, 3 types
- [x] Room Calendar grid view
- [x] Reservations with Walk-in dialog
- [x] Guests management
- [x] Cash Shift with open/close/movements
- [x] Invoices list with filters
- [x] Housekeeping board by floor
- [x] Maintenance tickets
- [x] Alerts notification center
- [x] Reports with **Export Excel/PDF dropdown**
- [x] **Settings page** with 3 tabs:
  - Facturación (NubeFact config)
  - Hotel (info display)
  - Usuarios (user management)

## Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Super Admin | superadmin@sistema.com | superadmin123 |
| Admin | admin@demo.com | admin123 |
| Receptionist | recepcion@demo.com | recepcion123 |
| Housekeeping | limpieza@demo.com | limpieza123 |

## Seed Data
- **Tenant:** Hotel Demo (RUC: 20123456789)
- **Rooms:** 30 rooms across 3 floors
- **Room Types:** Estándar (S/150), Superior (S/220), Suite (S/350)
- **Products:** 8 products for charges
- **Special Rates:** Temporada Alta sample rate created

## Technical Architecture

### Backend
- **Framework:** FastAPI
- **Database:** MongoDB (motor async)
- **Authentication:** JWT (24h expiration)
- **Export:** openpyxl (Excel), reportlab (PDF)

### Frontend
- **Framework:** React 19
- **Styling:** TailwindCSS + Shadcn/UI
- **Charts:** Recharts
- **Routing:** React Router v7

## File Structure
```
/app/
├── backend/
│   ├── server.py          # All API endpoints (~2600 lines)
│   ├── requirements.txt
│   └── tests/
│       └── test_hotel_pms_api.py
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/    # AppLayout, Sidebar, Header
│   │   │   └── ui/        # Shadcn components
│   │   ├── contexts/      # AuthContext
│   │   ├── lib/           # api.js, utils.js
│   │   └── pages/         # 13 page components
│   └── package.json
└── memory/
    └── PRD.md
```

## Environment Configuration

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
JWT_SECRET=hotel-pms-secret-key-production-2024
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=https://hospeda-admin.preview.emergentagent.com
```

## Remaining/Future Tasks

### P2 - Medium Priority
- [ ] Reservas grupales
- [ ] Historial y preferencias de huéspedes
- [ ] Email notifications (check-in confirmation)
- [ ] Rates management UI page

### P3 - Low Priority
- [ ] Channel manager integration
- [ ] Mobile responsive optimizations
- [ ] Dark mode support
- [ ] Multi-language support

## Known Limitations
- NubeFact defaults to MOCK mode (configurable via Settings)
- Email/SMS notifications not implemented
- No channel manager integration

## Test Reports
- `/app/test_reports/iteration_3.json` - Latest test results
- `/app/backend/tests/test_hotel_pms_api.py` - 55 test cases
