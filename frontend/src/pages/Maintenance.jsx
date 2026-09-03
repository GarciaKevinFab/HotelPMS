import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Plus,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Play,
  ClipboardList
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas, EsqueletoMetricas } from '../components/Esqueleto';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { maintenanceAPI, roomsAPI } from '../lib/api';
import { formatDateTime, getStatusLabel, getStatusClass, formatCurrency, cn } from '../lib/utils';
import { toast } from 'sonner';

// Un matiz por estado, y el mismo en icono, estadistica y fila:
// abierto ambar, en progreso lima, resuelto turquesa, critico fucsia.
const COLOR_AMBAR = 'text-[hsl(38_92%_30%)]';
const COLOR_LIMA = 'text-[hsl(var(--acento-lima))]';
const COLOR_TURQUESA = 'text-[hsl(var(--acento-turquesa))]';
const COLOR_FUCSIA = 'text-[hsl(var(--acento-fucsia))]';

export function Maintenance() {
  const [tickets, setTickets] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    room_id: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    estimated_cost: ''
  });

  useEffect(() => {
    fetchData();
  }, [statusFilter, priorityFilter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;

      const [ticketsRes, roomsRes] = await Promise.all([
        maintenanceAPI.list(params),
        roomsAPI.list()
      ]);
      setTickets(ticketsRes.data);
      setRooms(roomsRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.room_id || !formData.title) {
      toast.error('Complete los campos requeridos');
      return;
    }

    try {
      await maintenanceAPI.create({
        ...formData,
        estimated_cost: formData.estimated_cost ? parseFloat(formData.estimated_cost) : null
      });
      toast.success('Ticket de mantenimiento creado');
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error('Error al crear ticket');
    }
  };

  const handleUpdateStatus = async (ticketId, status) => {
    try {
      await maintenanceAPI.update(ticketId, { status });
      toast.success('Estado actualizado');
      fetchData();
    } catch (err) {
      toast.error('Error al actualizar');
    }
  };

  const resetForm = () => {
    setFormData({
      room_id: '',
      title: '',
      description: '',
      priority: 'MEDIUM',
      estimated_cost: ''
    });
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'CRITICAL': return <AlertTriangle className={cn('h-4 w-4', COLOR_FUCSIA)} aria-hidden="true" />;
      case 'HIGH': return <AlertTriangle className={cn('h-4 w-4', COLOR_AMBAR)} aria-hidden="true" />;
      default: return <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'OPEN': return <Clock className={cn('h-4 w-4', COLOR_AMBAR)} aria-hidden="true" />;
      case 'IN_PROGRESS': return <Wrench className={cn('h-4 w-4', COLOR_LIMA)} aria-hidden="true" />;
      case 'RESOLVED': return <CheckCircle className={cn('h-4 w-4', COLOR_TURQUESA)} aria-hidden="true" />;
      case 'CANCELLED': return <XCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
      default: return null;
    }
  };

  // Stats
  const stats = {
    total: tickets.length,
    open: tickets.filter(t => t.status === 'OPEN').length,
    inProgress: tickets.filter(t => t.status === 'IN_PROGRESS').length,
    critical: tickets.filter(t => t.priority === 'CRITICAL' && t.status !== 'RESOLVED').length,
  };

  const metricas = [
    { rotulo: 'Total Tickets', valor: stats.total, icono: ClipboardList, valorClase: 'text-foreground', caja: 'bg-muted text-muted-foreground' },
    { rotulo: 'Pendientes', valor: stats.open, icono: Clock, valorClase: COLOR_AMBAR, caja: cn('bg-[hsl(38_92%_50%/.12)]', COLOR_AMBAR) },
    { rotulo: 'En Progreso', valor: stats.inProgress, icono: Wrench, valorClase: COLOR_LIMA, caja: cn('bg-[hsl(var(--status-dirty)/.15)]', COLOR_LIMA) },
    { rotulo: 'Críticos', valor: stats.critical, icono: AlertTriangle, valorClase: COLOR_FUCSIA, caja: cn('bg-[hsl(var(--status-occupied)/.10)]', COLOR_FUCSIA) },
  ];

  // Los filtros se aplican en el servidor: si hay alguno puesto, el vacio
  // es "nada coincide", no "todavia no hay partes".
  const hayFiltros = statusFilter !== 'all' || priorityFilter !== 'all';
  const limpiarFiltros = () => { setStatusFilter('all'); setPriorityFilter('all'); };
  const primeraCarga = loading && tickets.length === 0;

  return (
    <div className="space-y-6" data-testid="maintenance-page">
      <EncabezadoPagina
        titulo="Mantenimiento"
        subtitulo="Gestión de tickets de mantenimiento"
        acciones={
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-ticket-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Ticket
          </Button>
        }
      />

      {/* Stats */}
      {primeraCarga ? (
        <EsqueletoMetricas />
      ) : (
        <div className="escalonado grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metricas.map(({ rotulo, valor, icono: Icono, valorClase, caja }) => (
            <Card key={rotulo} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                  <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', valorClase)}>
                    {valor}
                  </p>
                </div>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', caja)}>
                  <Icono className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="OPEN">Abiertos</SelectItem>
              <SelectItem value="IN_PROGRESS">En Progreso</SelectItem>
              <SelectItem value="RESOLVED">Resueltos</SelectItem>
              <SelectItem value="CANCELLED">Cancelados</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por prioridad">
              <SelectValue placeholder="Prioridad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="CRITICAL">Crítica</SelectItem>
              <SelectItem value="HIGH">Alta</SelectItem>
              <SelectItem value="MEDIUM">Media</SelectItem>
              <SelectItem value="LOW">Baja</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Habitación</TableHead>
              <TableHead>Título</TableHead>
              <TableHead>Prioridad</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Costo Est.</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={5} columnas={7} />
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-0">
                  <EstadoVacio
                    icono={Wrench}
                    titulo="Ningún parte de mantenimiento"
                    descripcion="Aquí se anota lo que se rompe: una ducha, un aire, una cerradura. Mientras el parte está abierto, la habitación puede quedar fuera de servicio."
                    accion="Abrir un parte"
                    onAccion={() => setShowCreateDialog(true)}
                    filtrado={hayFiltros}
                    onLimpiar={limpiarFiltros}
                  />
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="whitespace-nowrap font-medium tabular-nums">
                    Hab. {ticket.room?.number || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[12rem] max-w-xs">
                      <p className="font-medium">{ticket.title}</p>
                      {ticket.description && (
                        <p className="line-clamp-1 text-xs text-muted-foreground">{ticket.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getPriorityIcon(ticket.priority)}
                      <Badge className={cn("badge", getStatusClass(ticket.priority))}>
                        {getStatusLabel(ticket.priority)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {getStatusIcon(ticket.status)}
                      <span className="text-sm">{getStatusLabel(ticket.status)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {ticket.estimated_cost ? formatCurrency(ticket.estimated_cost) : '-'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">
                    {formatDateTime(ticket.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {ticket.status === 'OPEN' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleUpdateStatus(ticket.id, 'IN_PROGRESS')}
                      >
                        <Play className="h-4 w-4" />
                        Iniciar
                      </Button>
                    )}
                    {ticket.status === 'IN_PROGRESS' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className={cn(COLOR_TURQUESA, 'hover:text-[hsl(var(--acento-turquesa))]')}
                        onClick={() => handleUpdateStatus(ticket.id, 'RESOLVED')}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Resolver
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Ticket de Mantenimiento</DialogTitle>
            <DialogDescription>Reportar un problema de mantenimiento</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Habitación *</Label>
              <Select
                value={formData.room_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, room_id: v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccione habitación" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>
                      Hab. {room.number} - Piso {room.floor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Ej: Aire acondicionado no funciona"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detalles del problema..."
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Prioridad</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(v) => setFormData(prev => ({ ...prev, priority: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Baja</SelectItem>
                    <SelectItem value="MEDIUM">Media</SelectItem>
                    <SelectItem value="HIGH">Alta</SelectItem>
                    <SelectItem value="CRITICAL">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Costo Estimado (S/)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.estimated_cost}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimated_cost: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Crear Ticket</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Maintenance;
