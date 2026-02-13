import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Plus, 
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
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
      case 'CRITICAL': return <AlertTriangle className="w-4 h-4 text-rose-500" />;
      case 'HIGH': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Wrench className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'OPEN': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'IN_PROGRESS': return <Wrench className="w-4 h-4 text-blue-500" />;
      case 'RESOLVED': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'CANCELLED': return <XCircle className="w-4 h-4 text-slate-400" />;
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

  return (
    <div className="space-y-6" data-testid="maintenance-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mantenimiento</h1>
          <p className="text-slate-500">Gestión de tickets de mantenimiento</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-ticket-btn">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Ticket
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Total Tickets</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Pendientes</p>
          <p className="text-2xl font-bold text-amber-600">{stats.open}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">En Progreso</p>
          <p className="text-2xl font-bold text-blue-600">{stats.inProgress}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Críticos</p>
          <p className="text-2xl font-bold text-rose-600">{stats.critical}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
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
          <SelectTrigger className="w-[150px]">
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
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                  No se encontraron tickets
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">
                    Hab. {ticket.room?.number || '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      {ticket.description && (
                        <p className="text-xs text-slate-500 line-clamp-1">{ticket.description}</p>
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
                    <div className="flex items-center gap-2">
                      {getStatusIcon(ticket.status)}
                      <span className="text-sm">{getStatusLabel(ticket.status)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {ticket.estimated_cost ? formatCurrency(ticket.estimated_cost) : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateTime(ticket.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    {ticket.status === 'OPEN' && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => handleUpdateStatus(ticket.id, 'IN_PROGRESS')}
                      >
                        Iniciar
                      </Button>
                    )}
                    {ticket.status === 'IN_PROGRESS' && (
                      <Button 
                        size="sm"
                        onClick={() => handleUpdateStatus(ticket.id, 'RESOLVED')}
                      >
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
            <div className="grid grid-cols-2 gap-4">
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
