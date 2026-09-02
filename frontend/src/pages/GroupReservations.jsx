import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Eye,
  Calendar,
  Phone,
  Mail,
  Building
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EstadoVacio } from '../components/EstadoVacio';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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

  return (
    <div className="space-y-6" data-testid="group-reservations-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Reservas Grupales</h1>
          <p className="text-zen-500">Gestión de grupos y eventos</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-group-btn">
          <Plus className="w-4 h-4 mr-2" />
          Nueva Reserva Grupal
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-zen-500">Total Grupos</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Confirmados</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.confirmed}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Total Habitaciones</p>
          <p className="text-2xl font-bold">{stats.totalRooms}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Ingreso Estimado</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</p>
        </Card>
      </div>

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
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
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
                      <Building className="w-4 h-4 text-zen-500" />
                      <span className="font-medium">{group.group_name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{group.contact_name}</p>
                      {group.contact_phone && (
                        <p className="text-zen-500 flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {group.contact_phone}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{formatDate(group.checkin_date)}</p>
                      <p className="text-zen-500">→ {formatDate(group.checkout_date)}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{group.total_rooms} hab.</Badge>
                  </TableCell>
                  <TableCell className="font-bold">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
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
                <div className="col-span-2">
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
              <div className="grid grid-cols-2 gap-4">
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
                      <SelectTrigger className="flex-1">
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
                      className="w-20"
                      placeholder="Cant."
                    />
                    {formData.rooms.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeRoomRow(index)}>
                        ×
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Other */}
            <div className="grid grid-cols-3 gap-4">
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
              <div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de Reserva Grupal</DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-zen-50 rounded-lg">
                <div>
                  <p className="text-sm text-zen-500">Código</p>
                  <p className="text-xl font-bold font-mono">{selectedGroup.code}</p>
                </div>
                <Badge className={cn("badge", getStatusClass(selectedGroup.status))}>
                  {getStatusLabel(selectedGroup.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-zen-500">Grupo</p>
                  <p className="font-medium">{selectedGroup.group_name}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Contacto</p>
                  <p className="font-medium">{selectedGroup.contact_name}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Check-in</p>
                  <p className="font-medium">{formatDate(selectedGroup.checkin_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Check-out</p>
                  <p className="font-medium">{formatDate(selectedGroup.checkout_date)}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Total Habitaciones</p>
                  <p className="font-medium">{selectedGroup.total_rooms}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Total Estimado</p>
                  <p className="font-medium text-lg">{formatCurrency(selectedGroup.total_estimated)}</p>
                </div>
              </div>

              {selectedGroup.reservation_details && selectedGroup.reservation_details.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Reservas Individuales</h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Código</TableHead>
                          <TableHead>Habitación</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGroup.reservation_details.map(res => (
                          <TableRow key={res.id}>
                            <TableCell className="font-mono text-sm">{res.code}</TableCell>
                            <TableCell>{res.room_id ? `Asignada` : 'Sin asignar'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{getStatusLabel(res.status)}</Badge>
                            </TableCell>
                            <TableCell>{formatCurrency(res.total_estimated)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GroupReservations;
