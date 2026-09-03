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
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoTarjetas } from '../components/Esqueleto';
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
      case 'DIRTY': return <AlertTriangle className="w-4 h-4" aria-hidden="true" />;
      case 'CLEANING': return <Clock className="w-4 h-4" aria-hidden="true" />;
      case 'CLEAN': return <Check className="w-4 h-4" aria-hidden="true" />;
      default: return <SprayCan className="w-4 h-4" aria-hidden="true" />;
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

  const floors = Object.keys(board.floors).sort((a, b) => Number(a) - Number(b));
  const totalRooms = floors.reduce((n, f) => n + board.floors[f].length, 0);
  const visibleRooms = floors.reduce((n, f) => n + filterRooms(board.floors[f]).length, 0);

  const acciones = (
    <>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filtrar por estado">
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
      <div className="flex w-full overflow-hidden rounded-lg border sm:w-auto" role="group" aria-label="Vista">
        <Button
          variant={view === 'board' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setView('board')}
          className="flex-1 rounded-none sm:flex-none"
          aria-pressed={view === 'board'}
        >
          Tablero
        </Button>
        <Button
          variant={view === 'tasks' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setView('tasks')}
          className="flex-1 rounded-none sm:flex-none"
          aria-pressed={view === 'tasks'}
        >
          Tareas ({tasks.length})
        </Button>
      </div>
    </>
  );

  if (loading) {
    return (
      <div className="space-y-6" data-testid="housekeeping-page" aria-busy="true">
        <EncabezadoPagina titulo="Limpieza" subtitulo="Gestión de limpieza de habitaciones" acciones={acciones} />
        <EsqueletoTarjetas
          cantidad={12}
          alto="h-32"
          className="grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="housekeeping-page">
      {/* "Limpieza", no "Housekeeping": lo abre desde el movil quien limpia
          las habitaciones, y el propio subtitulo ya lo decia en castellano. */}
      <EncabezadoPagina titulo="Limpieza" subtitulo="Gestión de limpieza de habitaciones" acciones={acciones} />

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[hsl(var(--status-dirty))]" />
          <span>Sucia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[hsl(var(--status-reserved))]" />
          <span>Limpiando</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[hsl(var(--status-vacant-clean))]" />
          <span>Limpia</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-sm bg-[hsl(var(--status-ooo))]" />
          <span>Fuera de Servicio</span>
        </div>
      </div>

      {view === 'board' ? (
        /* Board View */
        <div className="space-y-6">
          {visibleRooms === 0 && (
            <Card>
              <EstadoVacio
                icono={SprayCan}
                titulo="No hay habitaciones en el tablero"
                descripcion="Cuando se registren habitaciones aparecerán aquí agrupadas por piso, con su estado de limpieza."
                filtrado={totalRooms > 0}
                onLimpiar={() => setFilter('all')}
              />
            </Card>
          )}
          {floors.map(floor => {
            const rooms = filterRooms(board.floors[floor]);
            if (rooms.length === 0) return null;

            return (
              <div key={floor} className="hk-floor-section">
                <h2 className="hk-floor-title">
                  <SprayCan className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  Piso {floor}
                  <Badge variant="secondary" className="ml-2">
                    {rooms.filter(r => r.housekeeping_status === 'DIRTY').length} sucias
                  </Badge>
                </h2>
                <div className="hk-room-grid escalonado">
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
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-heading text-lg font-semibold tabular-nums">{room.number}</span>
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
                        <div className="mt-3 space-y-1 border-t border-zen-200 pt-3">
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
        <div className="space-y-4 escalonado">
          {tasks.length === 0 ? (
            <Card>
              <EstadoVacio
                icono={Check}
                titulo="¡Todas las tareas completadas!"
                descripcion="No hay tareas pendientes de limpieza. Las nuevas aparecerán aquí al liberarse una habitación."
              />
            </Card>
          ) : (
            tasks.map(task => (
              <Card key={task.id} className="p-4 transition-shadow hover:shadow-md">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-4">
                    {/* Prioridad alta en fucsia (el color de "reclama atencion"
                        en todo el sistema); normal en ambar de aviso. */}
                    <div className={cn(
                      "grid h-12 w-12 shrink-0 place-items-center rounded-lg font-heading text-base font-semibold tabular-nums",
                      task.priority === 'HIGH'
                        ? 'bg-[hsl(var(--status-occupied)/.12)] text-[hsl(var(--acento-fucsia))]'
                        : 'bg-[hsl(var(--chart-3)/.14)] text-[hsl(38_92%_30%)]'
                    )}>
                      {task.room?.number || '?'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium">Habitación {task.room?.number}</p>
                      <p className="text-sm text-muted-foreground">Piso {task.room?.floor}</p>
                      <Badge variant={task.priority === 'HIGH' ? 'destructive' : 'secondary'} className="mt-1">
                        Prioridad {task.priority === 'HIGH' ? 'Alta' : 'Normal'}
                      </Badge>
                    </div>
                  </div>
                  <Button onClick={() => handleCompleteTask(task.id)} className="w-full sm:w-auto">
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
