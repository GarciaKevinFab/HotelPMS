import React, { useState, useEffect, useCallback } from 'react';
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

export function Header({ onMenuClick }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertCount, setAlertCount] = useState(0);

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

  return (
    <header className="header">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        /* h-11 w-11: medía 36x36, por debajo del objetivo tactil de 44.
           Y sin aria-label era un boton mudo para un lector de pantalla: el
           unico icono que abre TODA la navegacion en movil. */
        className="h-11 w-11 md:hidden"
        onClick={onMenuClick}
        aria-label="Abrir el menú"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-500" />
        {/* El placeholder no es un nombre: desaparece en cuanto se escribe y
            no todos los lectores de pantalla lo anuncian. Sin aria-label este
            campo se oia como "cuadro de edicion" a secas, y esta en las quince
            pantallas del sistema. */}
        <Input
          type="text"
          aria-label="Buscar huésped, reserva o habitación"
          placeholder="Buscar huésped, reserva, habitación..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={() => searchResults && setShowResults(true)}
          onBlur={() => setTimeout(() => setShowResults(false), 200)}
          className="pl-10 bg-zen-50 border-zen-200"
          data-testid="global-search-input"
        />
        
        {/* Search results dropdown */}
        {showResults && searchResults && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-zen-200 z-50 max-h-96 overflow-y-auto">
            {/* Guests */}
            {searchResults.guests?.length > 0 && (
              <div className="p-2">
                <p className="text-xs font-medium text-zen-500 px-2 py-1">Huéspedes</p>
                {searchResults.guests.map((guest) => (
                  <button
                    key={guest.id}
                    onClick={() => handleResultClick('guest', guest.id)}
                    className="w-full text-left px-2 py-2 hover:bg-zen-50 rounded-md"
                  >
                    <p className="text-sm font-medium">{guest.full_name}</p>
                    <p className="text-xs text-zen-500">{guest.doc_type}: {guest.doc_number}</p>
                  </button>
                ))}
              </div>
            )}
            
            {/* Reservations */}
            {searchResults.reservations?.length > 0 && (
              <div className="p-2 border-t border-zen-100">
                <p className="text-xs font-medium text-zen-500 px-2 py-1">Reservas</p>
                {searchResults.reservations.map((res) => (
                  <button
                    key={res.id}
                    onClick={() => handleResultClick('reservation', res.id)}
                    className="w-full text-left px-2 py-2 hover:bg-zen-50 rounded-md"
                  >
                    <p className="text-sm font-medium">{res.code}</p>
                    <p className="text-xs text-zen-500">{getStatusLabel(res.status)}</p>
                  </button>
                ))}
              </div>
            )}
            
            {/* Rooms */}
            {searchResults.rooms?.length > 0 && (
              <div className="p-2 border-t border-zen-100">
                <p className="text-xs font-medium text-zen-500 px-2 py-1">Habitaciones</p>
                {searchResults.rooms.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => handleResultClick('room', room.id)}
                    className="w-full text-left px-2 py-2 hover:bg-zen-50 rounded-md"
                  >
                    <p className="text-sm font-medium">Hab. {room.number}</p>
                    <p className="text-xs text-zen-500">Piso {room.floor}</p>
                  </button>
                ))}
              </div>
            )}
            
            {/* No results */}
            {!searchResults.guests?.length && 
             !searchResults.reservations?.length && 
             !searchResults.rooms?.length && (
              <div className="p-4 text-center text-sm text-zen-500">
                No se encontraron resultados
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Alerts */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" data-testid="alerts-button">
              <Bell className="h-5 w-5" />
              {alertCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {alertCount > 9 ? '9+' : alertCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="px-3 py-2 border-b border-zen-100">
              <h3 className="font-semibold">Alertas</h3>
            </div>
            {alerts.length > 0 ? (
              <>
                {alerts.map((alert) => (
                  <DropdownMenuItem key={alert.id} className="flex flex-col items-start p-3 cursor-pointer">
                    <div className="flex items-center gap-2 w-full">
                      <Badge variant={alert.severity === 'CRITICAL' ? 'destructive' : 'secondary'} className="text-xs">
                        {getStatusLabel(alert.severity)}
                      </Badge>
                      <span className="text-xs text-zen-500 ml-auto">
                        {new Date(alert.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm font-medium mt-1">{alert.title}</p>
                    <p className="text-xs text-zen-500 line-clamp-1">{alert.message}</p>
                  </DropdownMenuItem>
                ))}
                <div className="p-2 border-t border-zen-100">
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
              <div className="p-4 text-center text-sm text-zen-500">
                No hay alertas pendientes
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User info */}
        <div className="hidden md:flex items-center gap-3 pl-4 border-l border-zen-200">
          <div className="text-right">
            <p className="text-sm font-medium text-zen-900">{user?.full_name}</p>
            <p className="text-xs text-zen-500">{getStatusLabel(user?.role)}</p>
          </div>
          <div className="w-9 h-9 bg-zen-900 rounded-full flex items-center justify-center text-sm font-medium text-white">
            {user?.full_name?.charAt(0) || 'U'}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
