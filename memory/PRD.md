# Hotel PMS - Sistema Multi-Tenant Completo

## Problem Statement
Build a production-ready multi-tenant Hotel Administration PMS (SaaS) for Peru.
- **UI Language:** Spanish (Perú)
- **Currency:** PEN (S/)
- **Timezone:** America/Lima

## Core Features

### Multi-tenancy ✅
- 1 tenant = 1 hotel
- Strict data isolation via `tenant_id` at DB and API levels
- SUPER_ADMIN manages all tenants via Hoteles page
- Create tenant automatically creates ADMIN user

### Roles & Permissions ✅
| Role | Access |
|------|--------|
| SUPER_ADMIN | All features + tenant management |
| ADMIN | Full hotel management, config, users |
| RECEPTIONIST | Reservations, check-in/out, payments |
| HOUSEKEEPING | Room cleaning status only |

### Modules

#### 1. Rooms Management ✅
- Dual state: Occupancy (VACANT, OCCUPIED, DUE_OUT) + Housekeeping (DIRTY, CLEAN, OUT_OF_ORDER)
- Room types with amenities and base pricing
- 30 rooms across 3 floors in demo

#### 2. Rate Management ✅
- Dynamic pricing by date ranges
- Special rates (Temporada Alta, Feriados, Promociones)
- Automatic rate calculation for reservations
- UI page at /rates

#### 3. Reservations & Stays ✅
- Full lifecycle: PREBOOK → CONFIRMED → CHECKED_IN → CHECKED_OUT
- Walk-in support (instant check-in)
- Guest profiles with document types

#### 4. Folio & Payments ✅
- Charges (nightly rates, services, minibar)
- Multiple payment methods (Cash, Card, Transfer, Yape/Plin)
- Cash shifts with open/close and difference alerts

#### 5. Peruvian Invoicing (NubeFact) ✅
- Electronic Boletas/Facturas
- MOCK mode (default) / LIVE mode configurable per tenant
- Settings page for configuration

#### 6. Housekeeping & Maintenance ✅
- Task boards by floor
- Incident reporting
- Maintenance tickets

#### 7. Dashboard & Reports ✅
- KPI cards: Occupancy, Arrivals, Departures, Revenue
- Charts using Recharts
- **PDF/Excel export** for all reports

#### 8. Settings ✅
- NubeFact configuration (RUTA, TOKEN, MOCK/LIVE)
- User management (create, activate/deactivate)
- Hotel information

#### 9. Tenants (SUPER_ADMIN) ✅
- List all hotels
- Create new hotel with automatic admin user
- View tenant details and configuration

## Test Results
- **Backend:** 62/62 tests passed (100%)
- **Frontend:** All 15 pages functional

## Credentials
| Role | Email | Password | Tenant |
|------|-------|----------|--------|
| Super Admin | superadmin@sistema.com | superadmin123 | Global |
| Admin | admin@demo.com | admin123 | Hotel Demo |
| Admin | admin@hoteltest.com | admin123test | Hotel Test |
| Receptionist | recepcion@demo.com | recepcion123 | Hotel Demo |
| Housekeeping | limpieza@demo.com | limpieza123 | Hotel Demo |

## Technical Stack
- **Backend:** FastAPI + MongoDB + JWT
- **Frontend:** React 19 + TailwindCSS + Shadcn/UI + Recharts
- **Export:** openpyxl (Excel), reportlab (PDF)

## API Endpoints (62+ tested)
- `/api/auth` - Authentication
- `/api/tenants` - Tenant CRUD (SUPER_ADMIN)
- `/api/users` - User management
- `/api/rooms` - Room CRUD
- `/api/room-types` - Room type config
- `/api/rates` - Dynamic rate management
- `/api/guests` - Guest profiles
- `/api/reservations` - Booking lifecycle + Walk-in
- `/api/folios` - Charges and payments
- `/api/cash-shifts` - Cash shift management
- `/api/invoices` - Electronic invoicing
- `/api/housekeeping` - Cleaning tasks
- `/api/maintenance` - Maintenance tickets
- `/api/alerts` - System alerts
- `/api/dashboard` - KPIs and charts
- `/api/reports` - Monthly reports + Export PDF/Excel

## File Structure
```
/app/
├── backend/
│   ├── server.py (~2800 lines)
│   ├── requirements.txt
│   └── tests/test_hotel_pms_api.py (62 tests)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/ (AppLayout, Sidebar, Header)
│   │   │   └── ui/ (Shadcn components)
│   │   ├── contexts/ (AuthContext)
│   │   ├── lib/ (api.js, utils.js)
│   │   └── pages/ (15 pages)
│   └── package.json
└── memory/PRD.md
```

## Pages (15)
1. Login
2. Dashboard
3. RoomCalendar
4. Reservations
5. Guests
6. Rooms
7. Rates
8. CashShift
9. Invoices
10. Housekeeping
11. Maintenance
12. Alerts
13. Reports
14. Settings
15. Tenants

## Remaining/Future Tasks

### P2 - Medium Priority
- [ ] Reservas grupales
- [ ] Email notifications
- [ ] Drag-and-drop calendar

### P3 - Low Priority
- [ ] Channel manager integration
- [ ] Dark mode
- [ ] Multi-language

## Known Limitations
- NubeFact defaults to MOCK mode
- No email/SMS notifications
- No channel manager

## Last Updated
February 13, 2026 - Multi-tenancy complete, 62 tests passed
