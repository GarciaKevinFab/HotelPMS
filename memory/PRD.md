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
  - Housekeeping: DIRTY, CLEAN, CLEANING, INSPECT, OUT_OF_ORDER
- Room types with amenities and base pricing

#### 2. Reservations & Stays
- Full lifecycle: PREBOOK → CONFIRMED → CHECKED_IN → CHECKED_OUT
- Walk-ins support
- Guest profiles with document types (DNI, CE, Passport, RUC)

#### 3. Folio & Payments
- Charges (nightly rates, services, minibar)
- Multiple payment methods (Cash, Card, Transfer, Yape/Plin)
- Partial payments and refunds
- Cash shifts (`Caja por turnos`)

#### 4. Peruvian Invoicing (NubeFact)
- Electronic Boletas/Facturas
- MOCK mode for development
- LIVE mode with RUTA+TOKEN per tenant
- Credit notes and voiding support
- Artifact storage (XML, CDR, PDF)

#### 5. Housekeeping & Maintenance
- Task boards by floor
- Incident reporting
- Maintenance tickets (can set rooms to OUT_OF_ORDER)

#### 6. Dashboard & Reports
- KPI cards: Occupancy, Arrivals, Departures, Revenue
- Charts using Recharts: Revenue, Occupancy trends, Payment methods, Room status
- Monthly reports with PDF/Excel export (pending)

#### 7. Alerts & Audit
- Notification center for critical events
- Immutable audit log for all operations

## Technical Architecture

### Backend
- **Framework:** FastAPI
- **Database:** MongoDB (motor async driver)
- **Authentication:** JWT (24h expiration)
- **Port:** 8001 (internal)

### Frontend
- **Framework:** React 19
- **Styling:** TailwindCSS + Shadcn/UI
- **Charts:** Recharts
- **State:** React Context (AuthContext)
- **Routing:** React Router v7

### API Structure
All endpoints prefixed with `/api`:
- `/api/auth` - Authentication
- `/api/tenants` - Tenant management
- `/api/users` - User management
- `/api/rooms` - Room CRUD
- `/api/room-types` - Room type configuration
- `/api/guests` - Guest profiles
- `/api/reservations` - Booking lifecycle
- `/api/folios` - Charges and payments
- `/api/cash-shifts` - Cash shift management
- `/api/invoices` - Electronic invoicing
- `/api/housekeeping` - Cleaning tasks
- `/api/maintenance` - Maintenance tickets
- `/api/alerts` - System alerts
- `/api/dashboard` - KPIs and charts
- `/api/reports` - Monthly reports

## What's Been Implemented

### ✅ Completed (Feb 13, 2025)
- [x] Full backend API with all endpoints
- [x] JWT authentication system
- [x] Multi-tenant data isolation
- [x] Role-based access control
- [x] Seed data generation (30 rooms, 3 types, 3 users)
- [x] Complete frontend with 12 pages
- [x] Dashboard with KPIs and Recharts
- [x] Room management with dual state
- [x] Reservation lifecycle (create, assign room, check-in, check-out)
- [x] Folio system with charges and payments
- [x] Cash shift open/close with difference alerts
- [x] NubeFact MOCK integration
- [x] Housekeeping board view
- [x] Maintenance ticket system
- [x] Alert notification center
- [x] Audit logging
- [x] Spanish localization
- [x] Responsive design

### Test Results
- **Backend:** 100% (34/34 tests passed)
- **Frontend:** 100% (all pages functional)

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
  - Floor 1: 101-110 (6 Standard, 3 Superior, 1 Suite)
  - Floor 2: 201-210 (6 Standard, 3 Superior, 1 Suite)
  - Floor 3: 301-310 (6 Standard, 3 Superior, 1 Suite)
- **Room Types:**
  - Estándar: S/150/noche, 2 pax
  - Superior: S/220/noche, 2 pax
  - Suite: S/350/noche, 4 pax
- **Products:** 8 products (Minibar, Lavandería, Servicios)

## Environment Configuration

### Backend (.env)
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=test_database
JWT_SECRET=hotel-pms-secret-key-production-2024
CORS_ORIGINS=*
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=https://hospeda-admin.preview.emergentagent.com
```

## Upcoming/Future Tasks

### P1 - High Priority
- [ ] Calendar/Grid view for reservations
- [ ] Walk-in reservations flow
- [ ] PDF/Excel export for reports
- [ ] NubeFact LIVE mode configuration UI

### P2 - Medium Priority
- [ ] Room rate management by date
- [ ] Group reservations
- [ ] Guest history and preferences
- [ ] Email notifications (check-in confirmation)

### P3 - Low Priority
- [ ] Channel manager integration
- [ ] Mobile responsive optimizations
- [ ] Dark mode support
- [ ] Multi-language support

## Known Limitations
- NubeFact is in MOCK mode (simulated responses)
- Calendar view shows room grid, not timeline view
- No PDF export yet for invoices/reports
- No email/SMS notifications configured

## File Structure
```
/app/
├── backend/
│   ├── server.py          # Monolithic API (2300+ lines)
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
│   │   └── pages/         # 12 page components
│   └── package.json
└── memory/
    └── PRD.md
```
