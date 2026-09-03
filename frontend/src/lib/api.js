import axios from 'axios';

// En produccion la SPA y la API viven en el MISMO origen -- el backend sirve
// las dos cosas (ver servir_web en backend/server.py) --, asi que la ruta
// relativa siempre es la correcta y no hay que nombrar ningun host.
//
// Por que se decide por NODE_ENV y no solo por la variable de entorno:
// `.env.production` la declaraba vacia (REACT_APP_BACKEND_URL=), pero Create
// React App NO sobrescribe con un valor vacio -- se quedaba con el de `.env`,
// que apunta a http://localhost:8000 para el desarrollo. Resultado: el bundle
// de PRODUCCION pedia el login a la maquina del propio usuario y no podia
// entrar nadie. La API respondia 200 perfectamente; el navegador ni siquiera
// la estaba llamando.
//
// En desarrollo si hace falta la variable: React corre en :3000 y el backend
// en otro puerto.
const BACKEND_URL =
  process.env.NODE_ENV === 'production'
    ? ''
    : (process.env.REACT_APP_BACKEND_URL || '');

export const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // window.location.href se salta el router a proposito: al caducar el
      // token (24 h) hay que descartar todo el estado en memoria.
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  // Alta publica de un hotel y su administrador (POST /api/registro).
  registro: (data) => api.post('/registro', data),
};

// Tenants
export const tenantsAPI = {
  list: () => api.get('/tenants'),
  get: (id) => api.get(`/tenants/${id}`),
  create: (data) => api.post('/tenants', data),
  updateInvoicing: (id, data) => api.put(`/tenants/${id}/invoicing`, data),
};

// Users
export const usersAPI = {
  list: () => api.get('/users'),
  get: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, password) => api.put(`/users/${id}/password`, { password }),
};

// Room Types
export const roomTypesAPI = {
  list: () => api.get('/room-types'),
  create: (data) => api.post('/room-types', data),
  update: (id, data) => api.put(`/room-types/${id}`, data),
};

// Rates (Tarifas)
export const ratesAPI = {
  list: (roomTypeId) => api.get('/rates', { params: { room_type_id: roomTypeId } }),
  create: (data) => api.post('/rates', data),
  delete: (id) => api.delete(`/rates/${id}`),
  calculate: (roomTypeId, checkinDate, checkoutDate) => 
    api.get('/rates/calculate', { params: { room_type_id: roomTypeId, checkin_date: checkinDate, checkout_date: checkoutDate } }),
};

// Rooms
export const roomsAPI = {
  list: (params) => api.get('/rooms', { params }),
  create: (data) => api.post('/rooms', data),
  createBulk: (data) => api.post('/rooms/bulk', data),
  updateStatus: (id, params) => api.put(`/rooms/${id}/status`, null, { params }),
};

// Guests
export const guestsAPI = {
  list: (search) => api.get('/guests', { params: { search } }),
  get: (id) => api.get(`/guests/${id}`),
  create: (data) => api.post('/guests', data),
};

// Reservations
export const reservationsAPI = {
  list: (params) => api.get('/reservations', { params }),
  get: (id) => api.get(`/reservations/${id}`),
  create: (data) => api.post('/reservations', data),
  update: (id, data) => api.put(`/reservations/${id}`, data),
  assignRoom: (id, roomId) => api.post(`/reservations/${id}/assign-room`, { room_id: roomId }),
  checkin: (id) => api.post(`/reservations/${id}/checkin`),
  checkout: (id) => api.post(`/reservations/${id}/checkout`),
};

// Group Reservations
export const groupReservationsAPI = {
  list: (params) => api.get('/reservations/groups', { params }),
  get: (id) => api.get(`/reservations/groups/${id}`),
  create: (data) => api.post('/reservations/group', data),
};

// Calendar
export const calendarAPI = {
  getReservations: (startDate, endDate) => api.get('/calendar/reservations', { params: { start_date: startDate, end_date: endDate } }),
  moveReservation: (id, data) => api.put(`/calendar/reservations/${id}/move`, data),
};

// Notifications
export const notificationsAPI = {
  send: (template, recipientEmail, data) => api.post('/notifications/send', { template, recipient_email: recipientEmail, data }),
  getLogs: (limit) => api.get('/notifications/logs', { params: { limit } }),
};

// Folios
export const foliosAPI = {
  get: (id) => api.get(`/folios/${id}`),
  addCharge: (id, data) => api.post(`/folios/${id}/charges`, data),
  voidCharge: (folioId, chargeId, reason) => api.post(`/folios/${folioId}/charges/${chargeId}/void`, { reason }),
  addPayment: (id, data) => api.post(`/folios/${id}/payments`, data),
};

// Cash Shifts
export const cashShiftsAPI = {
  list: (params) => api.get('/cash-shifts', { params }),
  current: () => api.get('/cash-shifts/current'),
  open: (openingAmount) => api.post('/cash-shifts/open', { opening_amount: openingAmount }),
  close: (id, countedCash, notes) => api.post(`/cash-shifts/${id}/close`, { counted_cash: countedCash, notes }),
  addMovement: (id, data) => api.post(`/cash-shifts/${id}/movements`, data),
};

// Invoices
export const invoicesAPI = {
  list: (params) => api.get('/invoices', { params }),
  get: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices', data),
  void: (id, reason) => api.post(`/invoices/${id}/void`, { reason }),
};

// Housekeeping
export const housekeepingAPI = {
  tasks: (params) => api.get('/housekeeping/tasks', { params }),
  board: () => api.get('/housekeeping/board'),
  completeTask: (id) => api.post(`/housekeeping/tasks/${id}/complete`),
};

// Maintenance
export const maintenanceAPI = {
  list: (params) => api.get('/maintenance/tickets', { params }),
  create: (data) => api.post('/maintenance/tickets', data),
  update: (id, params) => api.put(`/maintenance/tickets/${id}`, null, { params }),
};

// Alerts
export const alertsAPI = {
  list: (params) => api.get('/alerts', { params }),
  resolve: (id, notes) => api.post(`/alerts/${id}/resolve`, { notes }),
};

// Products
export const productsAPI = {
  list: (category) => api.get('/products', { params: { category } }),
  create: (data) => api.post('/products', data),
};

// Dashboard
export const dashboardAPI = {
  kpis: () => api.get('/dashboard/kpis'),
  revenueChart: (days) => api.get('/dashboard/charts/revenue', { params: { days } }),
  occupancyChart: (days) => api.get('/dashboard/charts/occupancy', { params: { days } }),
  paymentMethodsChart: () => api.get('/dashboard/charts/payment-methods'),
  roomStatusChart: () => api.get('/dashboard/charts/room-status'),
  invoicingStatusChart: () => api.get('/dashboard/charts/invoicing-status'),
  topProductsChart: () => api.get('/dashboard/charts/top-products'),
};

// Reports
export const reportsAPI = {
  monthlyOccupancy: (month, year) => api.get('/reports/monthly-occupancy', { params: { month, year } }),
  monthlyRevenue: (month, year) => api.get('/reports/monthly-revenue', { params: { month, year } }),
  monthlyInvoicing: (month, year) => api.get('/reports/monthly-invoicing', { params: { month, year } }),
  exportExcel: (reportType, month, year) => api.get('/reports/export/excel', { 
    params: { report_type: reportType, month, year },
    responseType: 'blob'
  }),
  exportPdf: (reportType, month, year) => api.get('/reports/export/pdf', { 
    params: { report_type: reportType, month, year },
    responseType: 'blob'
  }),
};

// Walk-in
export const walkinAPI = {
  create: (data) => api.post('/reservations/walkin', data),
};

// Search
export const searchAPI = {
  global: (q) => api.get('/search', { params: { q } }),
};

// Audit
export const auditAPI = {
  list: (params) => api.get('/audit-logs', { params }),
};

// Seed
export const seedAPI = {
  create: () => api.post('/seed'),
};

export default api;
