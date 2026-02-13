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
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../components/ui/tooltip';
import { roomsAPI, reservationsAPI } from '../lib/api';
import { formatDate, getDateRange, getStatusLabel, cn } from '../lib/utils';

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'CONFIRMED': return 'bg-blue-500';
      case 'CHECKED_IN': return 'bg-emerald-500';
      case 'CHECKED_OUT': return 'bg-slate-400';
      default: return 'bg-slate-300';
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto"></div>
          <p className="mt-2 text-slate-500">Cargando calendario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="room-calendar-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Calendario de Habitaciones</h1>
          <p className="text-slate-500">Vista general de ocupación y reservas</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
          <Button onClick={() => navigate('/reservations/new')} data-testid="new-reservation-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Reserva
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigateDays(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <CalendarIcon className="w-4 h-4 mr-2" />
            Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigateDays(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="text-sm font-medium text-slate-700">
          {formatDate(startDate.toISOString())} - {formatDate(dateRange[dateRange.length - 1]?.toISOString())}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-500" />
          <span>Confirmada</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500" />
          <span>Check-in</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-400" />
          <span>Check-out</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="room-calendar-grid overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr>
                <th className="w-32 p-2 text-left bg-slate-100 sticky left-0 z-20">
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
                        isToday && "bg-blue-50",
                        isWeekend && "bg-slate-50"
                      )}
                    >
                      <div className="font-medium">
                        {date.toLocaleDateString('es-PE', { weekday: 'short' })}
                      </div>
                      <div className={cn(
                        "text-lg",
                        isToday && "text-blue-600 font-bold"
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
                      className="bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600 sticky left-0"
                    >
                      Piso {floor}
                    </td>
                  </tr>
                  {/* Rooms */}
                  {roomsByFloor[floor].map(room => {
                    const roomReservations = getReservationsForRoom(room.id);
                    
                    return (
                      <tr key={room.id} className="group">
                        <td className="p-2 border-r border-slate-200 bg-white sticky left-0 z-10">
                          <div className="font-medium text-sm">{room.number}</div>
                          <div className="text-xs text-slate-500">{room.room_type?.name}</div>
                          <Badge 
                            variant="outline" 
                            className={cn("text-[10px] mt-1", 
                              room.housekeeping_status === 'CLEAN' && 'border-emerald-300 text-emerald-700',
                              room.housekeeping_status === 'DIRTY' && 'border-amber-300 text-amber-700',
                              room.housekeeping_status === 'OUT_OF_ORDER' && 'border-rose-300 text-rose-700'
                            )}
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
                                "relative h-16 border-r border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors",
                                isToday && "bg-blue-50/50",
                                isWeekend && "bg-slate-50/50"
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
                                            "absolute top-1 bottom-1 left-0 right-0 mx-0.5 rounded text-white text-xs font-medium px-2 py-1 cursor-pointer overflow-hidden",
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
                                          <p className="text-xs text-slate-400">{res.code}</p>
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
