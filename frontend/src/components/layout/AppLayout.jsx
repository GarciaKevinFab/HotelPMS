import React, { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import { Toaster } from '../ui/sonner';
import { Button } from '../ui/button';
import { ShieldAlert, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export function AppLayout() {
  const { isAuthenticated, loading, enOtroHotel, hotelNombre, salirDeHotel } = useAuth();
  const location = useLocation();
  const [saliendo, setSaliendo] = useState(false);

  const alSalirDelHotel = async () => {
    setSaliendo(true);
    try {
      await salirDeHotel();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo salir del hotel');
      setSaliendo(false);
    }
  };
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('zen.menu') === 'plegado'; } catch { return false; }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // El cajon del telefono se cierra solo al cambiar de pantalla y con Escape.
  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [mobileMenuOpen]);

  const alternarMenu = () => {
    setSidebarCollapsed((v) => {
      try { localStorage.setItem('zen.menu', v ? 'abierto' : 'plegado'); } catch { /* sin almacenamiento */ }
      return !v;
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center" role="status" aria-live="polite">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-zen-200 border-t-[hsl(var(--accent))]" />
          <p className="mt-4 text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* `abierto` faltaba, y con el la navegacion entera en movil.
          El CSS ya traia la regla `.sidebar.open` y este componente ya
          guardaba el estado... pero no se lo pasaba al Sidebar. Resultado: al
          tocar la hamburguesa se encendia el velo oscuro y el menu se quedaba
          fuera de la pantalla. `onNavegar` lo cierra al elegir destino. */}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={alternarMenu}
        abierto={mobileMenuOpen}
        onNavegar={() => setMobileMenuOpen(false)}
      />

      {/* Velo del telefono: siempre en el DOM para poder fundirse. */}
      <div
        className={cn('velo md:hidden', mobileMenuOpen && 'visible')}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <div className={cn('main-content', sidebarCollapsed && 'sidebar-collapsed')}>
        {/* SUPER_ADMIN dentro de un hotel: la franja va ENCIMA de la cabecera
            y no se puede cerrar. Es la unica cosa ambar de toda la app, a
            proposito: significa "no estas en tu casa, esto es de un cliente". */}
        {enOtroHotel && (
          <div
            role="status"
            className="flex flex-col gap-2 border-b border-[hsl(var(--chart-3)/.45)] bg-[hsl(var(--chart-3)/.14)] px-4 py-2.5 text-sm text-foreground sm:flex-row sm:items-center sm:gap-4 sm:px-6"
            data-testid="franja-otro-hotel"
          >
            <ShieldAlert className="hidden h-5 w-5 shrink-0 text-[hsl(var(--chart-3))] sm:block" aria-hidden="true" />
            <p className="min-w-0 flex-1 leading-snug">
              <span className="font-semibold">Estás dentro de {hotelNombre} como superadmin.</span>{' '}
              <span className="text-muted-foreground">Todo lo que hagas queda en los datos de este hotel.</span>
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full shrink-0 border-[hsl(var(--chart-3)/.5)] bg-background sm:w-auto"
              onClick={alSalirDelHotel}
              disabled={saliendo}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              {saliendo ? 'Saliendo…' : 'Salir de este hotel'}
            </Button>
          </div>
        )}

        <Header onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="p-4 sm:p-6">
          {/* La `key` reinicia la animacion de entrada en cada cambio de ruta. */}
          <div key={location.pathname} className="page-transition mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Avisos: abajo a la derecha, lejos de la cabecera y de los botones de
          accion de cada pantalla, que estan arriba. */}
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}

export default AppLayout;
