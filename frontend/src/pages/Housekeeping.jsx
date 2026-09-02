import React, { useState, useEffect } from 'react';
import { SprayCan, Check, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { housekeepingAPI, roomsAPI } from '../lib/api';
import { getStatusLabel, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export function Housekeeping() {
  const { user } = useAuth();
  const [board, setBoard] = useState({ floors: {} });
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('board'); // 'board' or 'tasks'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [boardRes, tasksRes] = await Promise.all([
        housekeepingAPI.board(),
        housekeepingAPI.tasks({ status: 'OPEN' })
      ]);
      setBoard(boardRes.data);
      setTasks(tasksRes.data);
    } catch (err) {
      console.error('Error fetching housekeeping data:', err);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (roomId, newStatus) => {
    try {
      await roomsAPI.updateStatus(roomId, null, newStatus);
      toast.success(`Habitación actualizada a ${getStatusLabel(newStatus)}`);
      fetchData();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleCompleteTask = async (taskId) => {
    try {
      await housekeepingAPI.completeTask(taskId);
      toast.success('Tarea completada');
      fetchData();
    } catch (err) {
      toast.error('Error al completar tarea');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'DIRTY': return <AlertTriangle className="w-4 h-4" />;
      case 'CLEANING': return <Clock className="w-4 h-4" />;
      case 'CLEAN': return <Check className="w-4 h-4" />;
      default: return <SprayCan className="w-4 h-4" />;
    }
  };

  const getCardStyle = (room) => {
    switch (room.housekeeping_status) {
      case 'DIRTY': return 'hk-room-card dirty';
      case 'CLEANING': return 'hk-room-card cleaning';
      case 'CLEAN': return 'hk-room-card clean';
      case 'OUT_OF_ORDER': return 'hk-room-card ooo';
      default: return 'hk-room-card';
    }
  };

  const filterRooms = (rooms) => {
    if (filter === 'all') return rooms;
    return rooms.filter(r => r.housekeeping_status === filter);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto"></div>
          <p className="mt-2 text-zen-500">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="housekeeping-page">
      {/* Header */}
      {/* En movil va en columna. En una sola fila, el titulo mas el selector
          de 180 px y los dos botones sumaban 515 px sobre una pantalla de
          375: la cabecera se salia 140 px y arrastraba a toda la pagina.
          Y esta es JUSTO la pantalla que el personal de limpieza abre desde
          el telefono. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {/* "Limpieza", no "Housekeeping": lo abre desde el movil quien
              limpia las habitaciones, y el propio subtitulo ya lo decia en
              castellano. */}
          <h1 className="text-2xl font-bold text-zen-900">Limpieza</h1>
          <p className="text-zen-500">Gestión de limpieza de habitaciones</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="DIRTY">Sucias</SelectItem>
              <SelectItem value="CLEANING">Limpiando</SelectItem>
              <SelectItem value="CLEAN">Limpias</SelectItem>
              <SelectItem value="OUT_OF_ORDER">Fuera de servicio</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex border rounded-lg overflow-hidden">
            <Button 
              variant={view === 'board' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setView('board')}
              className="rounded-none"
            >
              Tablero
            </Button>
            <Button 
              variant={view === 'tasks' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setView('tasks')}
              className="rounded-none"
            >
              Tareas ({tasks.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-amber-400" />
          <span>Sucia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-400" />
          <span>Limpiando</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-400" />
          <span>Limpia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-rose-400" />
          <span>Fuera de Servicio</span>
        </div>
      </div>

      {view === 'board' ? (
        /* Board View */
        <div className="space-y-6">
          {Object.keys(board.floors).sort((a, b) => Number(a) - Number(b)).map(floor => {
            const rooms = filterRooms(board.floors[floor]);
            if (rooms.length === 0) return null;

            return (
              <div key={floor} className="hk-floor-section">
                <h2 className="hk-floor-title">
                  <SprayCan className="w-5 h-5 text-zen-400" />
                  Piso {floor}
                  <Badge variant="secondary" className="ml-2">
                    {rooms.filter(r => r.housekeeping_status === 'DIRTY').length} sucias
                  </Badge>
                </h2>
                <div className="hk-room-grid">
                  {rooms.map(room => (
                    <div
                      key={room.id}
                      className={getCardStyle(room)}
                      onClick={() => {
                        // Quick status change flow
                        if (room.housekeeping_status === 'DIRTY') {
                          handleStatusChange(room.id, 'CLEANING');
                        } else if (room.housekeeping_status === 'CLEANING') {
                          handleStatusChange(room.id, 'CLEAN');
                        }
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg font-bold">{room.number}</span>
                        {getStatusIcon(room.housekeeping_status)}
                      </div>
                      <p className="text-sm text-zen-600">
                        {getStatusLabel(room.housekeeping_status)}
                      </p>
                      {room.occupancy_status === 'OCCUPIED' && (
                        <Badge variant="secondary" className="mt-2 text-xs">
                          Ocupada
                        </Badge>
                      )}
                      
                      {room.housekeeping_status !== 'OUT_OF_ORDER' && room.housekeeping_status !== 'CLEAN' && (
                        <div className="mt-3 pt-3 border-t border-zen-200 space-y-1">
                          {room.housekeeping_status === 'DIRTY' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="w-full text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(room.id, 'CLEANING');
                              }}
                            >
                              Iniciar Limpieza
                            </Button>
                          )}
                          {room.housekeeping_status === 'CLEANING' && (
                            <Button 
                              size="sm" 
                              className="w-full text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStatusChange(room.id, 'CLEAN');
                              }}
                            >
                              Marcar Limpia
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Tasks View */
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <Card className="p-8 text-center">
              <Check className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium">¡Todas las tareas completadas!</h3>
              <p className="text-zen-500">No hay tareas pendientes de limpieza</p>
            </Card>
          ) : (
            tasks.map(task => (
              <Card key={task.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold",
                      task.priority === 'HIGH' ? 'bg-rose-500' : 'bg-amber-500'
                    )}>
                      {task.room?.number || '?'}
                    </div>
                    <div>
                      <p className="font-medium">Habitación {task.room?.number}</p>
                      <p className="text-sm text-zen-500">Piso {task.room?.floor}</p>
                      <Badge variant={task.priority === 'HIGH' ? 'destructive' : 'secondary'} className="mt-1">
                        Prioridad {task.priority === 'HIGH' ? 'Alta' : 'Normal'}
                      </Badge>
                    </div>
                  </div>
                  <Button onClick={() => handleCompleteTask(task.id)}>
                    <Check className="w-4 h-4 mr-2" />
                    Completar
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default Housekeeping;
