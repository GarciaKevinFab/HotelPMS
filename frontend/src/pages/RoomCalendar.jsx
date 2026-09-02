import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { BedDouble } from 'lucide-react';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { roomsAPI, reservationsAPI } from '../lib/api';
import { formatDate, getDateRange, getStatusLabel, getStatusClass, cn } from '../lib/utils';

export function RoomCalendar() {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [daysToShow] = useState(14);

  // Generate date range
  const dateRange = useMemo(() => {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToShow - 1);
    return getDateRange(startDate, endDate);
  }, [startDate, daysToShow]);

  useEffect(() => {
    fetchData();
  }, [startDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysToShow);
      
      const [roomsRes, reservationsRes] = await Promise.all([
        roomsAPI.list(),
        reservationsAPI.list({
          from_date: startDate.toISOString().split('T')[0],
          to_date: endDate.toISOString().split('T')[0]
        })
      ]);
      
      setRooms(roomsRes.data);
      setReservations(reservationsRes.data.filter(r => 
        ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(r.status)
      ));
    } catch (err) {
      console.error('Error fetching calendar data:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigateDays = (direction) => {
    const newDate = new Date(startDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setStartDate(newDate);
  };

  const goToToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setStartDate(today);
  };

  const getReservationsForRoom = (roomId) => {
    return reservations.filter(r => r.room_id === roomId);
  };

  const getReservationPosition = (reservation) => {
    const checkin = new Date(reservation.checkin_date);
    const checkout = new Date(reservation.checkout_date);
    
    // Calculate start position
    const startIdx = dateRange.findIndex(d => 
      d.toISOString().split('T')[0] === checkin.toISOString().split('T')[0]
    );
    
    // Calculate end position
    const endIdx = dateRange.findIndex(d => 
      d.toISOString().split('T')[0] === checkout.toISOString().split('T')[0]
    );
    
    const actualStart = Math.max(0, startIdx);
    const actualEnd = endIdx === -1 ? dateRange.length : Math.min(endIdx, dateRange.length);
    
    if (actualStart >= dateRange.length || actualEnd <= 0) {
      return null; // Reservation not visible
    }
    
    return {
      start: actualStart,
      span: actualEnd - actualStart,
      startsBeforeView: startIdx < 0,
      endsAfterView: endIdx === -1 || endIdx >= dateRange.length
    };
  };

  /* Una habitacion ocupada se pintaba de VERDE aqui y de fucsia en el tablero
     de estados, y una reservada de AZUL, que es el unico color que la marca no
     tiene. Quien mira el calendario y el tablero en la misma jornada aprendia
     dos codigos de color para lo mismo. Ahora los dos leen los mismos tokens. */
  const getStatusColor = (status) => {
    switch (status) {
      case 'CONFIRMED': return 'bg-[hsl(var(--status-reserved))]';
      case 'CHECKED_IN': return 'bg-[hsl(var(--status-occupied))]';
      case 'CHECKED_OUT': return 'bg-[hsl(var(--status-checkout))]';
      default: return 'bg-zen-300';
    }
  };

  const handleCellClick = (room, date) => {
    // Navigate to create reservation with pre-filled data
    const dateStr = date.toISOString().split('T')[0];
    navigate(`/reservations/new?room=${room.id}&date=${dateStr}`);
  };

  const handleReservationClick = (reservation, e) => {
    e.stopPropagation();
    navigate(`/reservations/${reservation.id}`);
  };

  // Group rooms by floor
  const roomsByFloor = useMemo(() => {
    const grouped = {};
    rooms.forEach(room => {
      const floor = room.floor || 0;
      if (!grouped[floor]) grouped[floor] = [];
      grouped[floor].push(room);
    });
    return grouped;
  }, [rooms]);

  const cabecera = (
    <EncabezadoPagina
      titulo="Calendario de Habitaciones"
      subtitulo="Vista general de ocupación y reservas"
      acciones={
        <>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="w-4 h-4" />
            Actualizar
          </Button>
          <Button onClick={() => navigate('/reservations/new')} data-testid="new-reservation-btn">
            <Plus className="w-4 h-4" />
            Nueva Reserva
          </Button>
        </>
      }
    />
  );

  if (loading) {
    return (
      <div className="space-y-4" data-testid="room-calendar-page">
        {cabecera}
        <Card className="p-3 shadow-sm">
          <Skeleton className="h-9 w-56" />
        </Card>
        <Card className="overflow-hidden shadow-sm" aria-busy="true" aria-label="Cargando calendario">
          <div className="flex gap-px bg-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={cn('bg-card p-3', i === 0 ? 'w-32 shrink-0' : 'flex-1')}>
                <Skeleton className="mx-auto h-3 w-8" />
                <Skeleton className="mx-auto mt-2 h-5 w-6" />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, f) => (
            <div key={f} className="flex gap-px border-t border-border bg-border">
              <div className="w-32 shrink-0 bg-card p-3">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="mt-1.5 h-3 w-16" />
              </div>
              <div className="flex-1 bg-card p-3">
                <Skeleton className={cn('h-8 rounded-md', ['w-1/3 ml-[10%]', 'w-1/4 ml-[45%]', 'w-1/2 ml-[5%]', 'w-1/5 ml-[60%]', 'w-2/5 ml-[30%]'][f])} />
              </div>
            </div>
          ))}
        </Card>
      </div>
    );
  }

  // Sin habitaciones no hay filas que pintar: mejor decirlo y llevar a
  // crearlas que mostrar una cabecera de fechas sobre nada.
  if (rooms.length === 0) {
    return (
      <div className="space-y-4" data-testid="room-calendar-page">
        {cabecera}
        <Card className="shadow-sm">
          <EstadoVacio
            icono={BedDouble}
            titulo="Crea tus habitaciones para ver el calendario"
            descripcion="El calendario muestra una fila por habitación y, encima, las reservas de cada día. En cuanto tengas la primera habitación aparecerá aquí."
            accion="Ir a Habitaciones"
            onAccion={() => navigate('/rooms')}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="room-calendar-page">
      {cabecera}

      {/* Navigation */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="w-11 sm:w-9"
                  aria-label="Ver los días anteriores"
                  onClick={() => navigateDays(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <CalendarIcon className="w-4 h-4 mr-2" />
            Hoy
          </Button>
          <Button variant="outline" size="sm" className="w-11 sm:w-9"
                  aria-label="Ver los días siguientes"
                  onClick={() => navigateDays(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm font-medium text-zen-700 tabular-nums">
          {formatDate(startDate.toISOString())} - {formatDate(dateRange[dateRange.length - 1]?.toISOString())}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[hsl(var(--status-reserved))]" aria-hidden="true" />
          <span>Confirmada</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[hsl(var(--status-occupied))]" aria-hidden="true" />
          <span>Check-in</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[hsl(var(--status-checkout))]" aria-hidden="true" />
          <span>Check-out</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="room-calendar-grid overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr>
                <th className="w-32 p-2 text-left bg-zen-100 sticky left-0 z-20">
                  Habitación
                </th>
                {dateRange.map((date, idx) => {
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                  return (
                    <th 
                      key={idx} 
                      className={cn(
                        "w-24 p-2 text-center text-xs",
                        isToday && "bg-[hsl(var(--acento-turquesa)/0.08)]",
                        isWeekend && "bg-zen-50"
                      )}
                    >
                      <div className="font-medium">
                        {date.toLocaleDateString('es-PE', { weekday: 'short' })}
                      </div>
                      <div className={cn(
                        "text-lg",
                        isToday && "text-[hsl(var(--acento-turquesa))] font-bold"
                      )}>
                        {date.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Object.keys(roomsByFloor).sort((a, b) => Number(a) - Number(b)).map(floor => (
                <React.Fragment key={floor}>
                  {/* Floor separator */}
                  <tr>
                    <td 
                      colSpan={dateRange.length + 1} 
                      className="bg-zen-100 px-3 py-1.5 text-sm font-semibold text-zen-600 sticky left-0"
                    >
                      Piso {floor}
                    </td>
                  </tr>
                  {/* Rooms */}
                  {roomsByFloor[floor].map(room => {
                    const roomReservations = getReservationsForRoom(room.id);
                    
                    return (
                      <tr key={room.id} className="group">
                        <td className="p-2 border-r border-zen-200 bg-white sticky left-0 z-10">
                          <div className="font-medium text-sm">{room.number}</div>
                          <div className="text-xs text-zen-500">{room.room_type?.name}</div>
                          <Badge
                            variant="outline"
                            className={cn("badge mt-1 text-[10px]", getStatusClass(room.housekeeping_status))}
                          >
                            {getStatusLabel(room.housekeeping_status)}
                          </Badge>
                        </td>
                        {dateRange.map((date, dateIdx) => {
                          const isToday = date.toDateString() === new Date().toDateString();
                          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                          
                          return (
                            <td 
                              key={dateIdx} 
                              className={cn(
                                "relative h-16 border-r border-zen-100 cursor-pointer hover:bg-zen-50 transition-colors",
                                isToday && "bg-[hsl(var(--acento-turquesa)/0.05)]",
                                isWeekend && "bg-zen-50/50"
                              )}
                              onClick={() => handleCellClick(room, date)}
                            >
                              {/* Render reservations */}
                              {roomReservations.map(res => {
                                const pos = getReservationPosition(res);
                                if (!pos || pos.start !== dateIdx) return null;
                                
                                return (
                                  <TooltipProvider key={res.id}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div
                                          className={cn(
                                            "absolute top-1 bottom-1 left-0 right-0 mx-0.5 rounded text-white text-xs font-medium px-2 py-1 cursor-pointer overflow-hidden shadow-sm transition-[box-shadow,filter] duration-150 hover:brightness-95 hover:shadow-md",
                                            getStatusColor(res.status),
                                            !pos.startsBeforeView && "rounded-l-md ml-1",
                                            !pos.endsAfterView && "rounded-r-md mr-1"
                                          )}
                                          style={{
                                            width: `calc(${pos.span * 100}% - 4px)`,
                                            zIndex: 5
                                          }}
                                          onClick={(e) => handleReservationClick(res, e)}
                                        >
                                          <div className="truncate">
                                            {res.guest?.full_name || res.code}
                                          </div>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="text-sm">
                                          <p className="font-medium">{res.guest?.full_name}</p>
                                          <p className="text-xs text-zen-500">{res.code}</p>
                                          <p className="text-xs mt-1">
                                            {formatDate(res.checkin_date)} - {formatDate(res.checkout_date)}
                                          </p>
                                          <p className="text-xs">{getStatusLabel(res.status)}</p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                );
                              })}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RoomCalendar;
