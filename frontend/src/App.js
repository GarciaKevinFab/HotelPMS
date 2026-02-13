import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

// Layout
import AppLayout from './components/layout/AppLayout';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RoomCalendar from './pages/RoomCalendar';
import Reservations from './pages/Reservations';
import Guests from './pages/Guests';
import Rooms from './pages/Rooms';
import CashShift from './pages/CashShift';
import Invoices from './pages/Invoices';
import Housekeeping from './pages/Housekeeping';
import Maintenance from './pages/Maintenance';
import Alerts from './pages/Alerts';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Tenants from './pages/Tenants';
import Rates from './pages/Rates';

// Styles
import '@/App.css';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected routes */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/calendar" element={<RoomCalendar />} />
            <Route path="/reservations" element={<Reservations />} />
            <Route path="/reservations/:id" element={<Reservations />} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/guests/:id" element={<Guests />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/rates" element={<Rates />} />
            <Route path="/cash-shift" element={<CashShift />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/housekeeping" element={<Housekeeping />} />
            <Route path="/maintenance" element={<Maintenance />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/tenants" element={<Tenants />} />
          </Route>
          
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
