import React, { useState, useEffect } from 'react';
import {
  BedDouble,
  Plus,
  Search,
  Building
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { EstadoVacio } from '../components/EstadoVacio';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EsqueletoFilas, EsqueletoLista, EsqueletoMetricas, EsqueletoTarjetas } from '../components/Esqueleto';
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
import { roomsAPI, roomTypesAPI } from '../lib/api';
import { formatCurrency, getStatusLabel, getStatusClass, cn } from '../lib/utils';
import { toast } from 'sonner';

// Una sola pieza para las insignias de ocupacion y limpieza, en tabla y en
// tarjetas moviles, para que no deriven entre si.
function InsigniaEstado({ estado }) {
  return (
    <Badge className={cn('badge', getStatusClass(estado))}>
      {getStatusLabel(estado)}
    </Badge>
  );
}

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

  const limpiarFiltros = () => {
    setSearchQuery('');
    setFloorFilter('all');
    setStatusFilter('all');
  };

  // Stats
  const stats = [
    { rotulo: 'Total', valor: rooms.length, color: 'text-foreground' },
    {
      rotulo: 'Disponibles',
      valor: rooms.filter(r => r.occupancy_status === 'VACANT' && r.housekeeping_status === 'CLEAN').length,
      color: 'text-[hsl(var(--acento-turquesa))]',
    },
    { rotulo: 'Ocupadas', valor: rooms.filter(r => r.occupancy_status === 'OCCUPIED').length, color: 'text-[hsl(var(--acento-fucsia))]' },
    { rotulo: 'Sucias', valor: rooms.filter(r => r.housekeeping_status === 'DIRTY').length, color: 'text-[hsl(var(--acento-lima))]' },
    { rotulo: 'Fuera Servicio', valor: rooms.filter(r => r.housekeeping_status === 'OUT_OF_ORDER').length, color: 'text-muted-foreground' },
  ];

  // Compartido entre la tabla y la lista movil.
  const estadoVacioHabitaciones = (
    <EstadoVacio
      icono={BedDouble}
      titulo="Todavía no hay habitaciones"
      descripcion="Con «Crear múltiples» cargas un piso entero de una vez: dices el rango de números y el tipo, y quedan todas."
      accion="Crear varias habitaciones"
      onAccion={() => setShowBulkDialog(true)}
      filtrado={rooms.length > 0 && filteredRooms.length === 0}
      onLimpiar={limpiarFiltros}
    />
  );

  return (
    <div className="space-y-6" data-testid="rooms-page">
      <EncabezadoPagina
        titulo="Habitaciones"
        subtitulo="Gestión de inventario de habitaciones"
        acciones={
          <>
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
          </>
        }
      />

      {/* Stats */}
      {loading ? (
        <EsqueletoMetricas cantidad={5} className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" />
      ) : (
        <div className="escalonado grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          {stats.map((s) => (
            <Card key={s.rotulo} className="p-4 transition-shadow duration-180 hover:shadow-md">
              <p className="text-xs font-medium text-muted-foreground">{s.rotulo}</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${s.color}`}>{s.valor}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Room Types: seccion con titulo y rejilla de tarjetas sueltas, en vez
          de tarjetas con borde dentro de otra tarjeta. */}
      <section aria-labelledby="titulo-tipos" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="titulo-tipos" className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Tipos de Habitación
          </h2>
          {!loading && roomTypes.length > 0 && (
            <span className="text-sm text-muted-foreground tabular-nums">{roomTypes.length}</span>
          )}
        </div>

        {loading ? (
          <EsqueletoTarjetas cantidad={3} />
        ) : roomTypes.length === 0 ? (
          <Card>
            <EstadoVacio
              icono={BedDouble}
              titulo="Empieza por los tipos de habitación"
              descripcion="Una matrimonial, una doble, una suite… Cada tipo lleva su capacidad y su precio base, y es lo que después se usa para cobrar la noche."
              accion="Crear el primer tipo"
              onAccion={() => setShowTypeDialog(true)}
            />
          </Card>
        ) : (
          <div className="escalonado grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {roomTypes.map(type => (
              <Card key={type.id} className="p-4 transition-shadow duration-180 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words font-semibold leading-tight">{type.name}</h3>
                  <Badge variant="secondary" className="shrink-0 tabular-nums">{type.capacity} pax</Badge>
                </div>
                <p className="mt-2 text-lg font-semibold tracking-tight tabular-nums">
                  {formatCurrency(type.base_price)}
                  <span className="text-sm font-normal text-muted-foreground">/noche</span>
                </p>
                {type.amenities?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {type.amenities.map((a, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              aria-label="Buscar habitación por número"
              placeholder="Buscar por número..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <Select value={floorFilter} onValueChange={setFloorFilter}>
              <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por piso">
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
              <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por estado de limpieza">
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
        </div>
      </Card>

      {/* Tabla (desde md) */}
      <div className="hidden md:block">
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
            <TableBody className="escalonado">
              {loading ? (
                <EsqueletoFilas filas={8} columnas={6} />
              ) : filteredRooms.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="p-0">
                    {estadoVacioHabitaciones}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-semibold tabular-nums">{room.number}</TableCell>
                    <TableCell>Piso {room.floor}</TableCell>
                    <TableCell>{room.room_type?.name || '-'}</TableCell>
                    <TableCell className="tabular-nums">{formatCurrency(room.room_type?.base_price || 0)}</TableCell>
                    <TableCell>
                      <InsigniaEstado estado={room.occupancy_status} />
                    </TableCell>
                    <TableCell>
                      <InsigniaEstado estado={room.housekeeping_status} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Tarjetas apiladas (movil) */}
      <div className="md:hidden">
        {loading ? (
          <EsqueletoLista cantidad={5} />
        ) : filteredRooms.length === 0 ? (
          <Card>{estadoVacioHabitaciones}</Card>
        ) : (
          <div className="escalonado space-y-3">
            {filteredRooms.map((room) => (
              <Card key={room.id} className="p-4 transition-shadow duration-180 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold leading-tight tabular-nums">{room.number}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Piso {room.floor} · {room.room_type?.name || '-'}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-medium tabular-nums">
                    {formatCurrency(room.room_type?.base_price || 0)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <InsigniaEstado estado={room.occupancy_status} />
                  <InsigniaEstado estado={room.housekeeping_status} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

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
