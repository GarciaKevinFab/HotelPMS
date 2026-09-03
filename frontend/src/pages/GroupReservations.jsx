import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Eye,
  Phone,
  Building,
  BedDouble,
  CheckCircle,
  Banknote,
  X
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas, EsqueletoMetricas } from '../components/Esqueleto';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
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
import { groupReservationsAPI, roomTypesAPI } from '../lib/api';
import { formatCurrency, formatDate, getStatusLabel, getStatusClass, cn } from '../lib/utils';
import { toast } from 'sonner';

export function GroupReservations() {
  const [groups, setGroups] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Form
  const [formData, setFormData] = useState({
    group_name: '',
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    checkin_date: '',
    checkout_date: '',
    rooms: [{ room_type_id: '', quantity: 1 }],
    adults: 2,
    children: 0,
    deposit_amount: 0,
    notes: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [groupsRes, rtRes] = await Promise.all([
        groupReservationsAPI.list(),
        roomTypesAPI.list()
      ]);
      setGroups(groupsRes.data);
      setRoomTypes(rtRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.group_name || !formData.contact_name || !formData.checkin_date || !formData.checkout_date) {
      toast.error('Complete los campos requeridos');
      return;
    }

    if (!formData.rooms.some(r => r.room_type_id && r.quantity > 0)) {
      toast.error('Agregue al menos una habitación');
      return;
    }

    setCreating(true);
    try {
      const response = await groupReservationsAPI.create({
        ...formData,
        rooms: formData.rooms.filter(r => r.room_type_id && r.quantity > 0)
      });
      toast.success(`Reserva grupal ${response.data.code} creada con ${response.data.reservations_created} habitaciones`);
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear reserva grupal');
    } finally {
      setCreating(false);
    }
  };

  const handleViewDetail = async (group) => {
    try {
      const response = await groupReservationsAPI.get(group.id);
      setSelectedGroup(response.data);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error('Error al cargar detalle');
    }
  };

  const addRoomRow = () => {
    setFormData(prev => ({
      ...prev,
      rooms: [...prev.rooms, { room_type_id: '', quantity: 1 }]
    }));
  };

  const updateRoomRow = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      rooms: prev.rooms.map((r, i) => i === index ? { ...r, [field]: value } : r)
    }));
  };

  const removeRoomRow = (index) => {
    if (formData.rooms.length > 1) {
      setFormData(prev => ({
        ...prev,
        rooms: prev.rooms.filter((_, i) => i !== index)
      }));
    }
  };

  const resetForm = () => {
    setFormData({
      group_name: '',
      contact_name: '',
      contact_phone: '',
      contact_email: '',
      checkin_date: '',
      checkout_date: '',
      rooms: [{ room_type_id: '', quantity: 1 }],
      adults: 2,
      children: 0,
      deposit_amount: 0,
      notes: ''
    });
  };

  const getRoomTypeName = (rtId) => {
    const rt = roomTypes.find(r => r.id === rtId);
    return rt?.name || 'Desconocido';
  };

  // Stats
  const stats = {
    total: groups.length,
    confirmed: groups.filter(g => g.status === 'CONFIRMED').length,
    totalRooms: groups.reduce((sum, g) => sum + (g.total_rooms || 0), 0),
    totalRevenue: groups.reduce((sum, g) => sum + (g.total_estimated || 0), 0)
  };

  const metricas = [
    { rotulo: 'Total Grupos', valor: stats.total, icono: Users, tono: 'neutro' },
    { rotulo: 'Confirmados', valor: stats.confirmed, icono: CheckCircle, tono: 'turquesa' },
    { rotulo: 'Total Habitaciones', valor: stats.totalRooms, icono: BedDouble, tono: 'neutro' },
    { rotulo: 'Ingreso Estimado', valor: formatCurrency(stats.totalRevenue), icono: Banknote, tono: 'fucsia' },
  ];

  const tonos = {
    neutro: { valor: 'text-foreground', caja: 'bg-muted text-muted-foreground' },
    turquesa: { valor: 'text-[hsl(var(--acento-turquesa))]', caja: 'bg-[hsl(var(--status-vacant-clean)/.10)] text-[hsl(var(--acento-turquesa))]' },
    fucsia: { valor: 'text-foreground', caja: 'bg-[hsl(var(--status-occupied)/.10)] text-[hsl(var(--acento-fucsia))]' },
  };

  return (
    <div className="space-y-6" data-testid="group-reservations-page">
      <EncabezadoPagina
        titulo="Reservas Grupales"
        subtitulo="Gestión de grupos y eventos"
        acciones={
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-group-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Reserva Grupal
          </Button>
        }
      />

      {/* Stats */}
      {loading ? (
        <EsqueletoMetricas />
      ) : (
        <div className="escalonado grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metricas.map(({ rotulo, valor, icono: Icono, tono }) => (
            <Card key={rotulo} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                  <p className={cn('mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums', tonos[tono].valor)}>
                    {valor}
                  </p>
                </div>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tonos[tono].caja)}>
                  <Icono className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Habitaciones</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={5} columnas={8} />
            ) : groups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="p-0">
                  <EstadoVacio
                    icono={Users}
                    titulo="Sin reservas de grupo"
                    descripcion="Sirven para delegaciones, promociones o empresas: varias habitaciones bajo un mismo titular y una sola cuenta."
                    accion="Crear una reserva de grupo"
                    onAccion={() => setShowCreateDialog(true)}
                  />
                </TableCell>
              </TableRow>
            ) : (
              groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-mono font-medium">{group.code}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{group.group_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{group.contact_name}</p>
                      {group.contact_phone && (
                        <p className="flex items-center gap-1 text-muted-foreground tabular-nums">
                          <Phone className="h-3 w-3" aria-hidden="true" /> {group.contact_phone}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap text-sm tabular-nums">
                      <p>{formatDate(group.checkin_date)}</p>
                      <p className="text-muted-foreground">→ {formatDate(group.checkout_date)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="tabular-nums">{group.total_rooms} hab.</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                    {formatCurrency(group.total_estimated)}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("badge", getStatusClass(group.status))}>
                      {getStatusLabel(group.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleViewDetail(group)}>
                      <Eye className="w-4 h-4 mr-2" />
                      Ver
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Reserva Grupal</DialogTitle>
            <DialogDescription>
              Crear una reserva para múltiples habitaciones
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Group Info */}
            <div>
              <h4 className="font-medium mb-3">Información del Grupo</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Nombre del Grupo / Evento *</Label>
                  <Input
                    value={formData.group_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, group_name: e.target.value }))}
                    placeholder="Ej: Congreso ABC, Boda García-López"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Nombre de Contacto *</Label>
                  <Input
                    value={formData.contact_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={formData.contact_phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Dates */}
            <div>
              <h4 className="font-medium mb-3">Fechas</h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>Check-in *</Label>
                  <Input
                    type="date"
                    value={formData.checkin_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, checkin_date: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Check-out *</Label>
                  <Input
                    type="date"
                    value={formData.checkout_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, checkout_date: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Rooms */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium">Habitaciones</h4>
                <Button variant="outline" size="sm" onClick={addRoomRow}>
                  <Plus className="w-4 h-4 mr-1" /> Agregar
                </Button>
              </div>
              <div className="space-y-2">
                {formData.rooms.map((room, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Select
                      value={room.room_type_id}
                      onValueChange={(v) => updateRoomRow(index, 'room_type_id', v)}
                    >
                      <SelectTrigger className="min-w-0 flex-1">
                        <SelectValue placeholder="Tipo de habitación" />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map(rt => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name} ({formatCurrency(rt.base_price)}/noche)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="1"
                      value={room.quantity}
                      onChange={(e) => updateRoomRow(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-20 shrink-0"
                      placeholder="Cant."
                      aria-label="Cantidad"
                    />
                    {formData.rooms.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Quitar habitación"
                        onClick={() => removeRoomRow(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Other */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <Label>Adultos</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.adults}
                  onChange={(e) => setFormData(prev => ({ ...prev, adults: parseInt(e.target.value) || 1 }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Niños</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.children}
                  onChange={(e) => setFormData(prev => ({ ...prev, children: parseInt(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <Label>Depósito (S/)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.deposit_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, deposit_amount: parseFloat(e.target.value) || 0 }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Observaciones..."
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Reserva Grupal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Reserva Grupal</DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 p-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Código</p>
                  <p className="font-mono text-xl font-semibold tracking-tight">{selectedGroup.code}</p>
                </div>
                <Badge className={cn("badge shrink-0", getStatusClass(selectedGroup.status))}>
                  {getStatusLabel(selectedGroup.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Grupo</p>
                  <p className="font-medium">{selectedGroup.group_name}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">Contacto</p>
                  <p className="font-medium">{selectedGroup.contact_name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Check-in</p>
                  <p className="font-medium tabular-nums">{formatDate(selectedGroup.checkin_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Check-out</p>
                  <p className="font-medium tabular-nums">{formatDate(selectedGroup.checkout_date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Habitaciones</p>
                  <p className="font-medium tabular-nums">{selectedGroup.total_rooms}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total Estimado</p>
                  <p className="text-lg font-semibold tracking-tight tabular-nums">{formatCurrency(selectedGroup.total_estimated)}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Reservas Individuales</h4>
                <div className="overflow-hidden rounded-lg border">
                  {selectedGroup.reservation_details && selectedGroup.reservation_details.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Habitación</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="escalonado">
                        {selectedGroup.reservation_details.map(res => (
                          <TableRow key={res.id}>
                            <TableCell className="font-mono text-sm">{res.code}</TableCell>
                            <TableCell>{res.room_id ? `Asignada` : 'Sin asignar'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getStatusLabel(res.status)}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums">{formatCurrency(res.total_estimated)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <EstadoVacio
                      compacto
                      icono={BedDouble}
                      titulo="Sin reservas individuales"
                      descripcion="Este grupo todavía no tiene habitaciones desglosadas."
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupReservations;
