import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, Menu } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useAuth } from '../../contexts/AuthContext';
import { searchAPI, alertsAPI } from '../../lib/api';
import { debounce, getStatusLabel } from '../../lib/utils';

const esMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);
  const campoBusqueda = useRef(null);

  // Fetch open alerts count
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const response = await alertsAPI.list({ status: 'OPEN' });
        setAlerts(response.data.slice(0, 5));
        setAlertCount(response.data.length);
      } catch (err) {
        console.error('Error fetching alerts:', err);
      }
    };

    fetchAlerts();
    const interval = setInterval(fetchAlerts, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  // Ctrl K (o Cmd K) lleva el cursor al buscador desde cualquier pantalla.
  useEffect(() => {
    const alTeclear = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        campoBusqueda.current?.focus();
        campoBusqueda.current?.select();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Debounced search
  const performSearch = useCallback(
    debounce(async (query) => {
      if (query.length < 2) {
        setSearchResults(null);
        return;
      }
      try {
        const response = await searchAPI.global(query);
        setSearchResults(response.data);
        setShowResults(true);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300),
    []
  );

  useEffect(() => {
    performSearch(searchQuery);
  }, [searchQuery, performSearch]);

  const handleResultClick = (type, id) => {
    setShowResults(false);
    setSearchQuery('');

    switch (type) {
      case 'guest':
        navigate(`/guests/${id}`);
        break;
      case 'reservation':
        navigate(`/reservations/${id}`);
        break;
      case 'room':
        navigate(`/rooms`);
        break;
      default:
        break;
    }
  };

  const inicial = user?.full_name?.trim()?.charAt(0)?.toUpperCase() || 'U';

  return (
    <header className="header">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        /* h-11 w-11: media 36x36, por debajo del objetivo tactil de 44.
           Y sin aria-label era un boton mudo para un lector de pantalla: el
           unico icono que abre TODA la navegacion en movil. */
        className="h-11 w-11 shrink-0 md:hidden"
        onClick={onMenuClick}
        aria-label="Abrir el menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <div className="relative min-w-0 flex-1 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        {/* El placeholder no es un nombre: desaparece en cuanto se escribe y
            no todos los lectores de pantalla lo anuncian. Sin aria-label este
            campo se oia como "cuadro de edicion" a secas, y esta en las quince
            pantallas del sistema. */}
        <Input
          ref={campoBusqueda}
          type="text"
          aria-label="Buscar huésped, reserva o habitación"
          placeholder="Buscar huésped, reserva, habitación..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchResults && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          className="border-transparent bg-zen-100/70 pl-10 pr-20 shadow-none transition-[background-color,box-shadow] duration-180 hover:bg-zen-100 focus-visible:bg-card focus-visible:ring-2"
          data-testid="global-search-input"
        />
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline-flex"
        >
          {esMac ? '⌘' : 'Ctrl'} K
        </kbd>

        {/* Search results dropdown */}
        {showResults && searchResults && (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg animate-fade-in">
            {/* Guests */}
            {searchResults.guests?.length > 0 && (
              <div className="p-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Huéspedes</p>
                {searchResults.guests.map((guest) => (
                  <button
                    key={guest.id}
                    onClick={() => handleResultClick('guest', guest.id)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted"
                  >
                    <p className="text-sm font-medium">{guest.full_name}</p>
                    <p className="text-xs text-muted-foreground">{guest.doc_type}: {guest.doc_number}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Reservations */}
            {searchResults.reservations?.length > 0 && (
              <div className="border-t border-border p-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Reservas</p>
                {searchResults.reservations.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => handleResultClick('reservation', res.id)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted"
                  >
                    <p className="font-mono text-sm font-medium">{res.code}</p>
                    <p className="text-xs text-muted-foreground">{getStatusLabel(res.status)}</p>
                  </button>
                ))}
              </div>
            )}

            {/* Rooms */}
            {searchResults.rooms?.length > 0 && (
              <div className="border-t border-border p-2">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Habitaciones</p>
                {searchResults.rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => handleResultClick('room', room.id)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors duration-150 hover:bg-muted"
                  >
                    <p className="text-sm font-medium">Hab. {room.number}</p>
                    <p className="text-xs text-muted-foreground">Piso {room.floor}</p>
                  </button>
                ))}
              </div>
            )}

            {/* No results */}
            {!searchResults.guests?.length &&
             !searchResults.reservations?.length &&
             !searchResults.rooms?.length && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No se encontraron resultados
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        {/* Alerts */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative shrink-0 text-zen-700"
              data-testid="alerts-button"
              aria-label={alertCount > 0 ? `Alertas, ${alertCount} pendientes` : 'Alertas'}
            >
              <Bell className="h-5 w-5" />
              {alertCount > 0 && (
                <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background tabular-nums">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h3 className="font-heading text-sm font-semibold">Alertas</h3>
              {alertCount > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">{alertCount} abiertas</span>
              )}
            </div>
            {alerts.length > 0 ? (
              <>
                {alerts.map((alert) => (
                  <DropdownMenuItem key={alert.id} className="flex cursor-pointer flex-col items-start p-3" onClick={() => navigate('/alerts')}>
                    <div className="flex w-full items-center gap-2">
                      <Badge variant={alert.severity === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-xs">
                        {getStatusLabel(alert.severity)}
                      </Badge>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {new Date(alert.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium">{alert.title}</p>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{alert.message}</p>
                  </DropdownMenuItem>
                ))}
                <div className="border-t border-border p-2">
                  <Button
                    variant="ghost"
                    className="w-full text-sm"
                    onClick={() => navigate('/alerts')}
                  >
                    Ver todas las alertas
                  </Button>
                </div>
              </>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No hay alertas pendientes
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User info */}
        <div className="flex items-center gap-3 sm:border-l sm:border-border sm:pl-3">
          <div className="hidden text-right md:block">
            <p className="text-sm font-medium leading-tight text-foreground">{user?.full_name}</p>
            <p className="text-xs text-muted-foreground">{getStatusLabel(user?.role)}</p>
          </div>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zen-900 text-sm font-semibold text-white"
            aria-hidden="true"
          >
            {inicial}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
