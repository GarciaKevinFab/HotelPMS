# Hotel PMS - Sistema Multi-Tenant Completo

## Sistema de Administración Hotelera (PMS)
**Versión:** 1.0 Final  
**Idioma:** Español (Perú)  
**Moneda:** PEN (S/)  
**Zona Horaria:** America/Lima

---

## RESUMEN EJECUTIVO

Sistema PMS multi-tenant completo para hoteles en Perú con todas las funcionalidades operativas de un hotel moderno: gestión de habitaciones, reservas individuales y grupales, check-in/check-out, facturación electrónica SUNAT (NubeFact), housekeeping, mantenimiento, caja por turnos, y reportes con exportación.

---

## MÓDULOS IMPLEMENTADOS

### 1. Multi-Tenancy ✅
- 1 tenant = 1 hotel con aislamiento completo de datos
- SUPER_ADMIN gestiona todos los hoteles
- Crear hotel automáticamente crea usuario ADMIN
- 3 tenants de demostración configurados

### 2. Autenticación y Roles ✅
| Rol | Acceso |
|-----|--------|
| SUPER_ADMIN | Todo el sistema + gestión de hoteles |
| ADMIN | Configuración hotel, usuarios, reportes |
| RECEPTIONIST | Reservas, check-in/out, pagos, caja |
| HOUSEKEEPING | Solo limpieza de habitaciones |

### 3. Gestión de Habitaciones ✅
- **Estado Dual:**
  - Ocupación: VACANT, OCCUPIED, DUE_OUT
  - Limpieza: DIRTY, CLEANING, CLEAN, INSPECT, OUT_OF_ORDER
- 3 tipos de habitación: Estándar, Superior, Suite
- 30 habitaciones en 3 pisos (demo)

### 4. Tarifas Dinámicas ✅
- Tarifa base por tipo de habitación
- Tarifas especiales por período (Temporada Alta, Feriados)
- Cálculo automático con mezcla de tarifas
- UI completa en /rates

### 5. Reservas Individuales ✅
- Ciclo completo: PREBOOK → CONFIRMED → CHECKED_IN → CHECKED_OUT → CANCELLED
- Walk-in (check-in inmediato sin reserva previa)
- Asignación de habitación
- Búsqueda de disponibilidad

### 6. Reservas Grupales ✅
- Crear reserva para múltiples habitaciones
- Código de grupo único (GRP-XXXXXX)
- Contacto del organizador
- Vista detallada con todas las reservas individuales

### 7. Calendario Visual ✅
- Grid de habitaciones por fecha
- Vista de 14 días configurable
- API para drag-and-drop (mover reservas)
- Colores por estado de reserva

### 8. Huéspedes ✅
- Perfil completo con documento (DNI, CE, Pasaporte, RUC)
- Historial de estadías
- Datos de contacto
- Nacionalidad

### 9. Folio y Cargos ✅
- Cargos automáticos por noche
- Cargos manuales (minibar, servicios, lavandería)
- Anulación de cargos con motivo
- Balance en tiempo real

### 10. Pagos ✅
- Métodos: Efectivo, Tarjeta, Transferencia, Yape/Plin
- Pagos parciales
- Referencia de transacción
- Vinculación a folio

### 11. Caja por Turnos ✅
- Apertura con monto inicial
- Movimientos de entrada/salida
- Cierre con conteo y diferencia
- Alerta automática si hay descuadre

### 12. Facturación Electrónica (NubeFact) ✅
- **MOCK mode** para desarrollo (predeterminado)
- **LIVE mode** configurable por tenant
- Tipos: Boleta, Factura
- Generación de XML, CDR, PDF (simulado en mock)
- Notas de crédito y anulaciones

### 13. Housekeeping ✅
- Tablero por piso
- Estados: PENDING, IN_PROGRESS, COMPLETED, VERIFIED
- Prioridades: LOW, MEDIUM, HIGH, URGENT
- Asignación de personal
- Inspección antes de liberar habitación

### 14. Mantenimiento ✅
- Tickets de incidencias
- Estados: OPEN, IN_PROGRESS, RESOLVED, CLOSED
- Puede marcar habitación como OUT_OF_ORDER
- Registro de solución

### 15. Dashboard ✅
- KPIs: Ocupación, Llegadas, Salidas, Habitaciones Sucias, Ingresos, Saldo Pendiente
- 6 gráficos con Recharts:
  - Ingresos últimos 30 días
  - Ocupación últimos 30 días
  - Estado de habitaciones
  - Métodos de pago
  - Estado de facturación
  - Productos más vendidos

### 16. Reportes ✅
- Ocupación mensual
- Ingresos mensual
- Facturación mensual
- **Exportación PDF** (reportlab)
- **Exportación Excel** (openpyxl)

### 17. Alertas ✅
- Tipos: SYSTEM, INVOICING, HOUSEKEEPING, MAINTENANCE, PAYMENT, CASH_SHIFT
- Severidad: INFO, WARNING, ERROR, CRITICAL
- Marcar como leído/resuelto
- Centro de notificaciones en UI

### 18. Notificaciones Email ✅
- Integración Resend (requiere API key)
- Templates HTML profesionales:
  - Confirmación de reserva
  - Bienvenida check-in
  - Recordatorio check-out
  - Comprobante de pago
- Log de notificaciones enviadas

### 19. Audit Log ✅
- Registro inmutable de operaciones
- Filtros por entidad, acción, fecha
- Trazabilidad completa

### 20. Configuración ✅
- NubeFact: RUTA, TOKEN, modo MOCK/LIVE
- Gestión de usuarios: crear, activar/desactivar
- Información del hotel

---

## ARQUITECTURA TÉCNICA

### Backend
- **Framework:** FastAPI 0.115+
- **Base de Datos:** MongoDB (motor async)
- **Autenticación:** JWT (24h)
- **Export:** openpyxl (Excel), reportlab (PDF)
- **Email:** Resend

### Frontend
- **Framework:** React 19
- **Estilos:** TailwindCSS + Shadcn/UI
- **Gráficos:** Recharts
- **Routing:** React Router v7
- **Estado:** React Context

### Estructura de Archivos
```
/app/
├── backend/
│   ├── server.py           # API completa (~3200 líneas)
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/     # AppLayout, Sidebar, Header
│   │   │   └── ui/         # Shadcn (40+ componentes)
│   │   ├── contexts/       # AuthContext
│   │   ├── lib/           # api.js, utils.js
│   │   └── pages/         # 16 páginas
│   └── package.json
└── memory/PRD.md
```

---

## PÁGINAS DEL SISTEMA (16)

1. **Login** - Autenticación
2. **Dashboard** - KPIs y gráficos
3. **RoomCalendar** - Calendario visual de reservas
4. **Reservations** - Reservas individuales + Walk-in
5. **GroupReservations** - Reservas grupales
6. **Guests** - Gestión de huéspedes
7. **Rooms** - Gestión de habitaciones
8. **Rates** - Tarifas dinámicas
9. **CashShift** - Caja por turnos
10. **Invoices** - Facturación electrónica
11. **Housekeeping** - Tablero de limpieza
12. **Maintenance** - Tickets de mantenimiento
13. **Alerts** - Centro de alertas
14. **Reports** - Reportes con export
15. **Settings** - Configuración
16. **Tenants** - Gestión de hoteles (SUPER_ADMIN)

---

## CREDENCIALES DE DEMOSTRACIÓN

| Rol | Email | Contraseña | Hotel |
|-----|-------|------------|-------|
| Super Admin | superadmin@sistema.com | superadmin123 | Global |
| Admin | admin@demo.com | admin123 | Hotel Demo |
| Admin | admin@hoteltest.com | admin123test | Hotel Test |
| Recepcionista | recepcion@demo.com | recepcion123 | Hotel Demo |
| Housekeeping | limpieza@demo.com | limpieza123 | Hotel Demo |

---

## DATOS DE DEMOSTRACIÓN

- **3 Hoteles** (tenants)
- **30 Habitaciones** en Hotel Demo
- **3 Tipos:** Estándar (S/150), Superior (S/220), Suite (S/350)
- **8 Productos** para cargos
- **Reservas** de prueba
- **Tarifas especiales** configuradas

---

## CONFIGURACIÓN

### Backend (.env)
```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="test_database"
JWT_SECRET="hotel-pms-secret-key-production-2024"
RESEND_API_KEY=        # Opcional para emails
SENDER_EMAIL=noreply@hotelpms.com
```

### Frontend (.env)
```
REACT_APP_BACKEND_URL=https://hospeda-admin.preview.emergentagent.com
```

---

## INTEGRACIONES

### NubeFact (Facturación SUNAT)
- **Modo:** MOCK (desarrollo) / LIVE (producción)
- **Configuración:** Por tenant en Settings
- TOKEN nunca expuesto en frontend

### Resend (Email)
- **Estado:** Integrado, requiere API key
- **Templates:** 4 tipos de notificación

---

## ESTADO DEL PROYECTO

✅ **100% FUNCIONAL**

- Backend: Todos los endpoints operativos
- Frontend: Todas las páginas funcionales
- Multi-tenancy: Aislamiento verificado
- Facturación: MOCK mode activo
- Email: Ready (sin API key = skip)

---

## URL DE ACCESO

**Preview:** https://hospeda-admin.preview.emergentagent.com

---

*Última actualización: 13 de Febrero de 2026*
