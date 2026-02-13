import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Format currency as PEN
export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return 'S/ 0.00';
  return `S/ ${Number(amount).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date in Spanish
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Format datetime in Spanish
export function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString('es-PE', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Format time only
export function formatTime(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

// Get status badge class
export function getStatusClass(status) {
  const statusClasses = {
    // Room occupancy
    'VACANT': 'status-vacant-clean',
    'OCCUPIED': 'status-occupied',
    'DUE_OUT': 'status-checkout',
    // Housekeeping
    'DIRTY': 'status-dirty',
    'CLEANING': 'status-occupied',
    'CLEAN': 'status-vacant-clean',
    'INSPECT': 'status-reserved',
    'OUT_OF_ORDER': 'status-ooo',
    // Reservation
    'PREBOOK': 'status-reserved',
    'CONFIRMED': 'status-occupied',
    'CHECKED_IN': 'status-vacant-clean',
    'CHECKED_OUT': 'status-checkout',
    'NO_SHOW': 'status-ooo',
    'CANCELLED': 'status-ooo',
    // Invoice
    'DRAFT': 'status-checkout',
    'SENT': 'status-reserved',
    'ACCEPTED': 'status-vacant-clean',
    'REJECTED': 'status-ooo',
    'VOIDED': 'status-dirty',
    'PENDING': 'status-reserved',
    // Alert
    'INFO': 'alert-card info',
    'WARN': 'alert-card warn',
    'CRITICAL': 'alert-card critical',
    // Cash shift
    'OPEN': 'status-vacant-clean',
    'CLOSED': 'status-checkout',
    // Tasks
    'DONE': 'status-vacant-clean',
    'IN_PROGRESS': 'status-occupied',
    // Maintenance
    'LOW': 'status-checkout',
    'MEDIUM': 'status-dirty',
    'HIGH': 'status-reserved',
    'CRITICAL': 'status-ooo',
    'RESOLVED': 'status-vacant-clean',
  };
  return statusClasses[status] || 'bg-slate-100 text-slate-700 border-slate-200';
}

// Get status label in Spanish
export function getStatusLabel(status) {
  const labels = {
    // Room occupancy
    'VACANT': 'Disponible',
    'OCCUPIED': 'Ocupado',
    'DUE_OUT': 'Salida Hoy',
    // Housekeeping
    'DIRTY': 'Sucia',
    'CLEANING': 'Limpiando',
    'CLEAN': 'Limpia',
    'INSPECT': 'Inspeccionar',
    'OUT_OF_ORDER': 'Fuera de Servicio',
    // Reservation
    'PREBOOK': 'Pre-reserva',
    'CONFIRMED': 'Confirmada',
    'CHECKED_IN': 'Check-in',
    'CHECKED_OUT': 'Check-out',
    'NO_SHOW': 'No Show',
    'CANCELLED': 'Cancelada',
    // Invoice
    'DRAFT': 'Borrador',
    'SENT': 'Enviada',
    'ACCEPTED': 'Aceptada',
    'REJECTED': 'Rechazada',
    'VOIDED': 'Anulada',
    'PENDING': 'Pendiente',
    // Invoice type
    'BOLETA': 'Boleta',
    'FACTURA': 'Factura',
    // Payment methods
    'EFECTIVO': 'Efectivo',
    'TARJETA': 'Tarjeta/POS',
    'TRANSFERENCIA': 'Transferencia',
    'YAPE_PLIN': 'Yape/Plin',
    'OTRO': 'Otro',
    // Doc types
    'DNI': 'DNI',
    'CE': 'Carné Extranjería',
    'PASAPORTE': 'Pasaporte',
    'RUC': 'RUC',
    // Roles
    'SUPER_ADMIN': 'Super Admin',
    'ADMIN': 'Administrador',
    'RECEPTIONIST': 'Recepcionista',
    'HOUSEKEEPING': 'Housekeeping',
    // Cash shift
    'OPEN': 'Abierta',
    'CLOSED': 'Cerrada',
    // Tasks
    'DONE': 'Completada',
    'IN_PROGRESS': 'En Progreso',
    // Maintenance
    'LOW': 'Baja',
    'MEDIUM': 'Media',
    'HIGH': 'Alta',
    // Alert
    'INFO': 'Información',
    'WARN': 'Advertencia',
    // Categories
    'HABITACION': 'Habitación',
    'MINIBAR': 'Minibar',
    'LAVANDERIA': 'Lavandería',
    'SERVICIOS': 'Servicios',
    'DANOS': 'Daños',
  };
  return labels[status] || status;
}

// Calculate nights between dates
export function calculateNights(checkin, checkout) {
  if (!checkin || !checkout) return 0;
  const start = new Date(checkin);
  const end = new Date(checkout);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// Check if user has permission
export function hasPermission(user, permission) {
  if (!user) return false;
  const role = user.role;
  
  // Super admin has all permissions
  if (role === 'SUPER_ADMIN') return true;
  
  // Define role permissions
  const rolePermissions = {
    'ADMIN': [
      'reservations.create', 'reservations.edit', 'reservations.cancel', 'reservations.no_show',
      'checkin.perform', 'checkout.perform',
      'folio.add_charge', 'folio.void_charge', 'folio.add_payment', 'folio.refund',
      'cashshift.open', 'cashshift.close', 'cashshift.reopen',
      'invoicing.issue', 'invoicing.retry_send', 'invoicing.void_invoice', 'invoicing.credit_note',
      'config.manage_rooms', 'config.manage_rates', 'config.manage_users', 'config.manage_invoicing',
      'reports.view', 'audit.view'
    ],
    'RECEPTIONIST': [
      'reservations.create', 'reservations.edit', 'reservations.cancel', 'reservations.no_show',
      'checkin.perform', 'checkout.perform',
      'folio.add_charge', 'folio.add_payment',
      'cashshift.open', 'cashshift.close',
      'invoicing.issue', 'invoicing.retry_send',
      'reports.view'
    ],
    'HOUSEKEEPING': [
      'housekeeping.view', 'housekeeping.update'
    ]
  };
  
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission);
}

// Check if room is available for assignment
export function isRoomAvailable(room) {
  return room.occupancy_status === 'VACANT' && 
         room.housekeeping_status === 'CLEAN' && 
         room.housekeeping_status !== 'OUT_OF_ORDER';
}

// Generate date range array
export function getDateRange(startDate, endDate) {
  const dates = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// Get month name in Spanish
export function getMonthName(month) {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] || '';
}

// Debounce function
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Local storage helpers
export const storage = {
  get: (key) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
};
