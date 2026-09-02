import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { Toaster } from '../ui/sonner';

export function AppLayout() {
  const { isAuthenticated, loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zen-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-zen-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-zen-50">
      {/* Sidebar */}
      {/* `abierto` faltaba, y con el la navegacion entera en movil.
          El CSS ya traia la regla `.sidebar.open { translate-x-0 }` y este
          componente ya guardaba el estado... pero no se lo pasaba al Sidebar.
          Resultado: al tocar la hamburguesa se encendia el velo oscuro y el
          menu se quedaba en left:-256, fuera de la pantalla. Desde un telefono
          no habia forma de cambiar de pantalla: se quedaba uno donde estuviera.

          `onNavegar` lo cierra al elegir destino, que es lo que se espera de
          un menu que tapa la pagina entera. */}
      <Sidebar 
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        abierto={mobileMenuOpen}
        onNavegar={() => setMobileMenuOpen(false)}
      />
      
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <div className={cn(
        "main-content",
        sidebarCollapsed && "sidebar-collapsed"
      )}>
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        
        <main className="p-6">
          <div className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Toast notifications */}
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default AppLayout;
