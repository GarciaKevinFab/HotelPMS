import React, { useState, useEffect } from 'react';
import { 
  BedDouble, 
  Plus, 
  Search,
  Building,
  Edit,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Label } from '../components/ui/label';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { roomsAPI, roomTypesAPI } from '../lib/api';
import { formatCurrency, getStatusLabel, getStatusClass, cn } from '../lib/utils';
import { toast } from 'sonner';

export function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [floorFilter, setFloorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [showTypeDialog, setShowTypeDialog] = useState(false);
  
  // Form data
  const [roomForm, setRoomForm] = useState({ number: '', floor: 1, room_type_id: '', notes: '' });
  const [bulkForm, setBulkForm] = useState({ room_type_id: '', floor: 1, start_number: 1, count: 5, prefix: '' });
  const [typeForm, setTypeForm] = useState({ name: '', capacity: 2, amenities: [], base_price: 0 });
  const [newAmenity, setNewAmenity] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [roomsRes, typesRes] = await Promise.all([
        roomsAPI.list(),
        roomTypesAPI.list()
      ]);
      setRooms(roomsRes.data);
      setRoomTypes(typesRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    if (!roomForm.number || !roomForm.room_type_id) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    
    try {
      await roomsAPI.create(roomForm);
      toast.success('Habitación creada');
      setShowCreateDialog(false);
      setRoomForm({ number: '', floor: 1, room_type_id: '', notes: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear habitación');
    }
  };

  const handleBulkCreate = async () => {
    if (!bulkForm.room_type_id || bulkForm.count < 1) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    
    try {
      const response = await roomsAPI.createBulk(bulkForm);
      toast.success(response.data.message);
      setShowBulkDialog(false);
      setBulkForm({ room_type_id: '', floor: 1, start_number: 1, count: 5, prefix: '' });
      fetchData();
    } catch (err) {
      toast.error('Error al crear habitaciones');
    }
  };

  const handleCreateType = async () => {
    if (!typeForm.name || typeForm.base_price <= 0) {
      toast.error('Complete todos los campos requeridos');
      return;
    }
    
    try {
      await roomTypesAPI.create(typeForm);
      toast.success('Tipo de habitación creado');
      setShowTypeDialog(false);
      setTypeForm({ name: '', capacity: 2, amenities: [], base_price: 0 });
      fetchData();
    } catch (err) {
      toast.error('Error al crear tipo');
    }
  };

  const addAmenity = () => {
    if (newAmenity.trim() && !typeForm.amenities.includes(newAmenity.trim())) {
      setTypeForm(prev => ({
        ...prev,
        amenities: [...prev.amenities, newAmenity.trim()]
      }));
      setNewAmenity('');
    }
  };

  const removeAmenity = (amenity) => {
    setTypeForm(prev => ({
      ...prev,
      amenities: prev.amenities.filter(a => a !== amenity)
    }));
  };

  // Get unique floors
  const floors = [...new Set(rooms.map(r => r.floor))].sort((a, b) => a - b);

  const filteredRooms = rooms.filter(room => {
    if (searchQuery && !room.number.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (floorFilter !== 'all' && room.floor !== parseInt(floorFilter)) return false;
    if (statusFilter !== 'all' && room.housekeeping_status !== statusFilter) return false;
    return true;
  });

  // Stats
  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.occupancy_status === 'VACANT' && r.housekeeping_status === 'CLEAN').length,
    occupied: rooms.filter(r => r.occupancy_status === 'OCCUPIED').length,
    dirty: rooms.filter(r => r.housekeeping_status === 'DIRTY').length,
    ooo: rooms.filter(r => r.housekeeping_status === 'OUT_OF_ORDER').length,
  };

  return (
    <div className="space-y-6" data-testid="rooms-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Habitaciones</h1>
          <p className="text-zen-500">Gestión de inventario de habitaciones</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTypeDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Tipo
          </Button>
          <Button variant="outline" onClick={() => setShowBulkDialog(true)}>
            <Building className="w-4 h-4 mr-2" />
            Crear Múltiples
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-room-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Habitación
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <p className="text-sm text-zen-500">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Disponibles</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.available}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Ocupadas</p>
          <p className="text-2xl font-bold text-blue-600">{stats.occupied}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Sucias</p>
          <p className="text-2xl font-bold text-amber-600">{stats.dirty}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Fuera Servicio</p>
          <p className="text-2xl font-bold text-rose-600">{stats.ooo}</p>
        </Card>
      </div>

      {/* Room Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tipos de Habitación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {roomTypes.map(type => (
              <div key={type.id} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium">{type.name}</h3>
                  <Badge variant="secondary">{type.capacity} pax</Badge>
                </div>
                <p className="text-lg font-bold">{formatCurrency(type.base_price)}<span className="text-sm font-normal text-zen-500">/noche</span></p>
                {type.amenities?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {type.amenities.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {roomTypes.length === 0 && (
              <p className="text-zen-500 col-span-3 text-center py-4">
                No hay tipos de habitación configurados
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-400" />
            <Input
              placeholder="Buscar por número..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={floorFilter} onValueChange={setFloorFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Piso" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los pisos</SelectItem>
              {floors.map(floor => (
                <SelectItem key={floor} value={String(floor)}>Piso {floor}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="CLEAN">Limpias</SelectItem>
              <SelectItem value="DIRTY">Sucias</SelectItem>
              <SelectItem value="OUT_OF_ORDER">Fuera Servicio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Piso</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Precio Base</TableHead>
              <TableHead>Ocupación</TableHead>
              <TableHead>Limpieza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredRooms.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zen-500">
                  No se encontraron habitaciones
                </TableCell>
              </TableRow>
            ) : (
              filteredRooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-bold">{room.number}</TableCell>
                  <TableCell>Piso {room.floor}</TableCell>
                  <TableCell>{room.room_type?.name || '-'}</TableCell>
                  <TableCell>{formatCurrency(room.room_type?.base_price || 0)}</TableCell>
                  <TableCell>
                    <Badge className={cn("badge", getStatusClass(room.occupancy_status))}>
                      {getStatusLabel(room.occupancy_status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("badge", getStatusClass(room.housekeeping_status))}>
                      {getStatusLabel(room.housekeeping_status)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Room Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Habitación</DialogTitle>
            <DialogDescription>Crear una nueva habitación</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Número de Habitación</Label>
              <Input
                value={roomForm.number}
                onChange={(e) => setRoomForm(prev => ({ ...prev, number: e.target.value }))}
                placeholder="Ej: 101"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Piso</Label>
              <Input
                type="number"
                min="0"
                value={roomForm.floor}
                onChange={(e) => setRoomForm(prev => ({ ...prev, floor: parseInt(e.target.value) }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Tipo de Habitación</Label>
              <Select 
                value={roomForm.room_type_id} 
                onValueChange={(v) => setRoomForm(prev => ({ ...prev, room_type_id: v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccione tipo" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateRoom}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Create Dialog */}
      <Dialog open={showBulkDialog} onOpenChange={setShowBulkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Múltiples Habitaciones</DialogTitle>
            <DialogDescription>Crear varias habitaciones a la vez</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo de Habitación</Label>
              <Select 
                value={bulkForm.room_type_id} 
                onValueChange={(v) => setBulkForm(prev => ({ ...prev, room_type_id: v }))}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccione tipo" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Piso</Label>
                <Input
                  type="number"
                  min="0"
                  value={bulkForm.floor}
                  onChange={(e) => setBulkForm(prev => ({ ...prev, floor: parseInt(e.target.value) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={bulkForm.count}
                  onChange={(e) => setBulkForm(prev => ({ ...prev, count: parseInt(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Número Inicial</Label>
                <Input
                  type="number"
                  min="1"
                  value={bulkForm.start_number}
                  onChange={(e) => setBulkForm(prev => ({ ...prev, start_number: parseInt(e.target.value) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Prefijo (opcional)</Label>
                <Input
                  value={bulkForm.prefix}
                  onChange={(e) => setBulkForm(prev => ({ ...prev, prefix: e.target.value }))}
                  placeholder="Ej: A"
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDialog(false)}>Cancelar</Button>
            <Button onClick={handleBulkCreate}>Crear Habitaciones</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Type Dialog */}
      <Dialog open={showTypeDialog} onOpenChange={setShowTypeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Tipo de Habitación</DialogTitle>
            <DialogDescription>Definir un nuevo tipo de habitación</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre</Label>
              <Input
                value={typeForm.name}
                onChange={(e) => setTypeForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Suite Ejecutiva"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Capacidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={typeForm.capacity}
                  onChange={(e) => setTypeForm(prev => ({ ...prev, capacity: parseInt(e.target.value) }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Precio Base (S/)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={typeForm.base_price}
                  onChange={(e) => setTypeForm(prev => ({ ...prev, base_price: parseFloat(e.target.value) }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Amenidades</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newAmenity}
                  onChange={(e) => setNewAmenity(e.target.value)}
                  placeholder="Ej: WiFi"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAmenity())}
                />
                <Button type="button" variant="outline" onClick={addAmenity}>Agregar</Button>
              </div>
              {typeForm.amenities.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {typeForm.amenities.map((a, i) => (
                    <Badge 
                      key={i} 
                      variant="secondary" 
                      className="cursor-pointer"
                      onClick={() => removeAmenity(a)}
                    >
                      {a} ×
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTypeDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateType}>Crear Tipo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Rooms;
