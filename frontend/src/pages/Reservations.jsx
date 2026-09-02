import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Search, 
  Filter,
  UserCheck,
  UserMinus,
  Eye,
  MoreHorizontal,
  X,
  Zap
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
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
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { reservationsAPI, guestsAPI, roomTypesAPI, roomsAPI, walkinAPI } from '../lib/api';
import { formatDate, formatCurrency, getStatusLabel, getStatusClass, calculateNights, cn } from '../lib/utils';
import { toast } from 'sonner';

export function Reservations() {
  const navigate = useNavigate();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  
  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showWalkinDialog, setShowWalkinDialog] = useState(false);
  const [guests, setGuests] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [formData, setFormData] = useState({
    guest_id: '',
    room_type_id: '',
    room_id: '',
    checkin_date: '',
    checkout_date: '',
    adults: 1,
    children: 0,
    total_estimated: 0,
    deposit_amount: 0,
    source: 'DIRECTO',
    notes: ''
  });
  const [newGuest, setNewGuest] = useState({
    doc_type: 'DNI',
    doc_number: '',
    full_name: '',
    phone: '',
    email: '',
    nationality: 'PE'
  });
  const [showNewGuestForm, setShowNewGuestForm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Cancel dialog
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [selectedReservation, setSelectedReservation] = useState(null);

  // Walk-in form
  const [walkinForm, setWalkinForm] = useState({
    doc_type: 'DNI',
    doc_number: '',
    full_name: '',
    phone: '',
    email: '',
    nationality: 'PE',
    room_id: '',
    checkout_date: '',
    adults: 1,
    children: 0,
    notes: ''
  });
  const [walkinRooms, setWalkinRooms] = useState([]);
  const [creatingWalkin, setCreatingWalkin] = useState(false);

  useEffect(() => {
    fetchReservations();
    fetchRoomTypes();
  }, [statusFilter]);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const response = await reservationsAPI.list(params);
      setReservations(response.data);
    } catch (err) {
      console.error('Error fetching reservations:', err);
      toast.error('Error al cargar reservas');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoomTypes = async () => {
    try {
      const response = await roomTypesAPI.list();
      setRoomTypes(response.data);
    } catch (err) {
      console.error('Error fetching room types:', err);
    }
  };

  const fetchAvailableRooms = async () => {
    if (!formData.room_type_id) return;
    try {
      const response = await roomsAPI.list({ 
        occupancy_status: 'VACANT', 
        housekeeping_status: 'CLEAN' 
      });
      const filtered = response.data.filter(r => r.room_type_id === formData.room_type_id);
      setAvailableRooms(filtered);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

  const searchGuests = async (query) => {
    if (query.length < 2) {
      setGuests([]);
      return;
    }
    try {
      const response = await guestsAPI.list(query);
      setGuests(response.data);
    } catch (err) {
      console.error('Error searching guests:', err);
    }
  };

  const calculateTotal = () => {
    if (!formData.checkin_date || !formData.checkout_date || !formData.room_type_id) return;
    
    const nights = calculateNights(formData.checkin_date, formData.checkout_date);
    const roomType = roomTypes.find(rt => rt.id === formData.room_type_id);
    if (roomType) {
      const total = nights * roomType.base_price;
      setFormData(prev => ({ ...prev, total_estimated: total }));
    }
  };

  useEffect(() => {
    calculateTotal();
  }, [formData.checkin_date, formData.checkout_date, formData.room_type_id]);

  useEffect(() => {
    fetchAvailableRooms();
  }, [formData.room_type_id]);

  const handleCreateGuest = async () => {
    try {
      const response = await guestsAPI.create(newGuest);
      setFormData(prev => ({ ...prev, guest_id: response.data.id }));
      setShowNewGuestForm(false);
      toast.success('Huésped creado exitosamente');
    } catch (err) {
      toast.error('Error al crear huésped');
    }
  };

  const handleCreateReservation = async () => {
    if (!formData.guest_id || !formData.checkin_date || !formData.checkout_date || !formData.room_type_id) {
      toast.error('Complete todos los campos requeridos');
      return;
    }

    setCreating(true);
    try {
      const response = await reservationsAPI.create(formData);
      toast.success(`Reserva ${response.data.code} creada exitosamente`);
      setShowCreateDialog(false);
      fetchReservations();
      resetForm();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear reserva');
    } finally {
      setCreating(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!cancelReason.trim()) {
      toast.error('Ingrese el motivo de cancelación');
      return;
    }

    try {
      await reservationsAPI.update(selectedReservation.id, {
        status: 'CANCELLED',
        cancel_reason: cancelReason
      });
      toast.success('Reserva cancelada');
      setShowCancelDialog(false);
      setCancelReason('');
      fetchReservations();
    } catch (err) {
      toast.error('Error al cancelar reserva');
    }
  };

  const handleCheckin = async (reservation) => {
    if (!reservation.room_id) {
      toast.error('Asigne una habitación antes del check-in');
      return;
    }

    try {
      await reservationsAPI.checkin(reservation.id);
      toast.success('Check-in realizado exitosamente');
      fetchReservations();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al realizar check-in');
    }
  };

  const handleCheckout = async (reservation) => {
    try {
      await reservationsAPI.checkout(reservation.id);
      toast.success('Check-out realizado exitosamente');
      fetchReservations();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al realizar check-out');
    }
  };

  const resetForm = () => {
    setFormData({
      guest_id: '',
      room_type_id: '',
      room_id: '',
      checkin_date: '',
      checkout_date: '',
      adults: 1,
      children: 0,
      total_estimated: 0,
      deposit_amount: 0,
      source: 'DIRECTO',
      notes: ''
    });
    setNewGuest({
      doc_type: 'DNI',
      doc_number: '',
      full_name: '',
      phone: '',
      email: '',
      nationality: 'PE'
    });
    setShowNewGuestForm(false);
  };

  const fetchWalkinRooms = async () => {
    try {
      const response = await roomsAPI.list({ 
        occupancy_status: 'VACANT', 
        housekeeping_status: 'CLEAN' 
      });
      setWalkinRooms(response.data);
    } catch (err) {
      console.error('Error fetching rooms:', err);
    }
  };

  const handleWalkinCreate = async () => {
    if (!walkinForm.doc_number || !walkinForm.full_name || !walkinForm.room_id || !walkinForm.checkout_date) {
      toast.error('Complete todos los campos requeridos');
      return;
    }

    setCreatingWalkin(true);
    try {
      const response = await walkinAPI.create({
        guest_data: {
          doc_type: walkinForm.doc_type,
          doc_number: walkinForm.doc_number,
          full_name: walkinForm.full_name,
          phone: walkinForm.phone || null,
          email: walkinForm.email || null,
          nationality: walkinForm.nationality
        },
        room_id: walkinForm.room_id,
        checkout_date: walkinForm.checkout_date,
        adults: walkinForm.adults,
        children: walkinForm.children,
        notes: walkinForm.notes || null
      });
      
      toast.success(`Walk-in ${response.data.code} registrado exitosamente`);
      setShowWalkinDialog(false);
      resetWalkinForm();
      fetchReservations();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al registrar walk-in');
    } finally {
      setCreatingWalkin(false);
    }
  };

  const resetWalkinForm = () => {
    setWalkinForm({
      doc_type: 'DNI',
      doc_number: '',
      full_name: '',
      phone: '',
      email: '',
      nationality: 'PE',
      room_id: '',
      checkout_date: '',
      adults: 1,
      children: 0,
      notes: ''
    });
  };

  const filteredReservations = reservations.filter(r => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      r.code?.toLowerCase().includes(query) ||
      r.guest?.full_name?.toLowerCase().includes(query) ||
      r.guest?.doc_number?.includes(query)
    );
  });

  return (
    <div className="space-y-6" data-testid="reservations-page">
      {/* Header */}
      {/* En movil va en columna: titulo y botones en una sola fila con
          justify-between no caben en 375 px y desbordaban la pagina. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Reservas</h1>
          <p className="text-zen-500">Gestión de reservaciones</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              fetchWalkinRooms();
              setShowWalkinDialog(true);
            }}
            data-testid="walkin-btn"
          >
            <Zap className="w-4 h-4 mr-2" />
            Walk-in
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-reservation-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Reserva
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-500" />
            <Input
              aria-label="Buscar reserva por código o huésped"
              placeholder="Buscar por código, huésped..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-reservations-input"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="status-filter-select">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="CONFIRMED">Confirmadas</SelectItem>
              <SelectItem value="CHECKED_IN">Check-in</SelectItem>
              <SelectItem value="CHECKED_OUT">Check-out</SelectItem>
              <SelectItem value="CANCELLED">Canceladas</SelectItem>
              <SelectItem value="NO_SHOW">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Huésped</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Habitación</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredReservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-zen-500">
                  No se encontraron reservas
                </TableCell>
              </TableRow>
            ) : (
              filteredReservations.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell className="font-medium">{reservation.code}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{reservation.guest?.full_name || '-'}</p>
                      <p className="text-xs text-zen-500">
                        {reservation.guest?.doc_type}: {reservation.guest?.doc_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <p>{formatDate(reservation.checkin_date)}</p>
                      <p className="text-zen-500">{formatDate(reservation.checkout_date)}</p>
                      <p className="text-xs text-zen-500">
                        {calculateNights(reservation.checkin_date, reservation.checkout_date)} noches
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {reservation.room_id ? (
                      <Badge variant="outline">Hab. asignada</Badge>
                    ) : (
                      <Badge variant="secondary">Sin asignar</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(reservation.total_estimated)}
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("badge", getStatusClass(reservation.status))}>
                      {getStatusLabel(reservation.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`reservation-actions-${reservation.id}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/reservations/${reservation.id}`)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Detalle
                        </DropdownMenuItem>
                        {reservation.status === 'CONFIRMED' && (
                          <>
                            <DropdownMenuItem onClick={() => handleCheckin(reservation)}>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Check-in
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => {
                                setSelectedReservation(reservation);
                                setShowCancelDialog(true);
                              }}
                            >
                              <X className="w-4 h-4 mr-2" />
                              Cancelar
                            </DropdownMenuItem>
                          </>
                        )}
                        {reservation.status === 'CHECKED_IN' && (
                          <DropdownMenuItem onClick={() => handleCheckout(reservation)}>
                            <UserMinus className="w-4 h-4 mr-2" />
                            Check-out
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Reservation Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Reserva</DialogTitle>
            <DialogDescription>
              Ingrese los datos de la reservación
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Guest Section */}
            <div className="space-y-4">
              <h3 className="font-medium text-zen-900">Huésped</h3>
              
              {!showNewGuestForm ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-500" />
                    <Input
                      aria-label="Buscar huésped por nombre o documento"
                      placeholder="Buscar huésped por nombre o documento..."
                      className="pl-10"
                      onChange={(e) => searchGuests(e.target.value)}
                    />
                  </div>
                  
                  {guests.length > 0 && (
                    <div className="border rounded-lg max-h-40 overflow-y-auto">
                      {guests.map(guest => (
                        <button
                          key={guest.id}
                          className={cn(
                            "w-full text-left p-3 hover:bg-zen-50 border-b last:border-0",
                            formData.guest_id === guest.id && "bg-[hsl(var(--acento-turquesa)/0.10)]"
                          )}
                          onClick={() => setFormData(prev => ({ ...prev, guest_id: guest.id }))}
                        >
                          <p className="font-medium">{guest.full_name}</p>
                          <p className="text-sm text-zen-500">{guest.doc_type}: {guest.doc_number}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => setShowNewGuestForm(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Huésped
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 p-4 border rounded-lg bg-zen-50">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Tipo Documento</Label>
                      <Select 
                        value={newGuest.doc_type} 
                        onValueChange={(v) => setNewGuest(prev => ({ ...prev, doc_type: v }))}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DNI">DNI</SelectItem>
                          <SelectItem value="CE">Carné Extranjería</SelectItem>
                          <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                          <SelectItem value="RUC">RUC</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Número Documento</Label>
                      <Input
                        value={newGuest.doc_number}
                        onChange={(e) => setNewGuest(prev => ({ ...prev, doc_number: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Nombre Completo</Label>
                    <Input
                      value={newGuest.full_name}
                      onChange={(e) => setNewGuest(prev => ({ ...prev, full_name: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Teléfono</Label>
                      <Input
                        value={newGuest.phone}
                        onChange={(e) => setNewGuest(prev => ({ ...prev, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={newGuest.email}
                        onChange={(e) => setNewGuest(prev => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setShowNewGuestForm(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateGuest}>
                      Crear Huésped
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Fecha Check-in</Label>
                <Input
                  type="date"
                  value={formData.checkin_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, checkin_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Fecha Check-out</Label>
                <Input
                  type="date"
                  value={formData.checkout_date}
                  onChange={(e) => setFormData(prev => ({ ...prev, checkout_date: e.target.value }))}
                />
              </div>
            </div>

            {/* Room Type */}
            <div>
              <Label>Tipo de Habitación</Label>
              <Select 
                value={formData.room_type_id} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, room_type_id: v, room_id: '' }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccione tipo" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} - {formatCurrency(rt.base_price)}/noche
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Room (optional) */}
            {availableRooms.length > 0 && (
              <div>
                <Label>Habitación (Opcional)</Label>
                <Select 
                  value={formData.room_id} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, room_id: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Seleccione habitación" /></SelectTrigger>
                  <SelectContent>
                    {availableRooms.map(room => (
                      <SelectItem key={room.id} value={room.id}>
                        Hab. {room.number} - Piso {room.floor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Guests count */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Adultos</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.adults}
                  onChange={(e) => setFormData(prev => ({ ...prev, adults: parseInt(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Niños</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.children}
                  onChange={(e) => setFormData(prev => ({ ...prev, children: parseInt(e.target.value) }))}
                />
              </div>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Total Estimado</Label>
                <Input
                  value={formatCurrency(formData.total_estimated)}
                  readOnly
                  className="bg-zen-50"
                />
              </div>
              <div>
                <Label>Depósito</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.deposit_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, deposit_amount: parseFloat(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas adicionales..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateReservation} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Reserva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Reserva</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer. Ingrese el motivo de cancelación.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Motivo de Cancelación</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ingrese el motivo..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Volver
            </Button>
            <Button variant="destructive" onClick={handleCancelReservation}>
              Confirmar Cancelación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Walk-in Dialog */}
      <Dialog open={showWalkinDialog} onOpenChange={setShowWalkinDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" />
              Walk-in
            </DialogTitle>
            <DialogDescription>
              Registro rápido de huésped sin reserva previa
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Guest Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo Documento *</Label>
                <Select 
                  value={walkinForm.doc_type} 
                  onValueChange={(v) => setWalkinForm(prev => ({ ...prev, doc_type: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="CE">Carné Extranjería</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número Documento *</Label>
                <Input
                  value={walkinForm.doc_number}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, doc_number: e.target.value }))}
                  placeholder="12345678"
                />
              </div>
            </div>
            
            <div>
              <Label>Nombre Completo *</Label>
              <Input
                value={walkinForm.full_name}
                onChange={(e) => setWalkinForm(prev => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nombre del huésped"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={walkinForm.phone}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+51 999 999 999"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={walkinForm.email}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, email: e.target.value }))}
                />
              </div>
            </div>

            {/* Room Selection */}
            <div>
              <Label>Habitación Disponible *</Label>
              <Select 
                value={walkinForm.room_id} 
                onValueChange={(v) => setWalkinForm(prev => ({ ...prev, room_id: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Seleccione habitación" /></SelectTrigger>
                <SelectContent>
                  {walkinRooms.map(room => (
                    <SelectItem key={room.id} value={room.id}>
                      Hab. {room.number} - {room.room_type?.name} - {formatCurrency(room.room_type?.base_price)}/noche
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {walkinRooms.length === 0 && (
                <p className="text-sm text-amber-600 mt-1">No hay habitaciones disponibles</p>
              )}
            </div>

            {/* Checkout date */}
            <div>
              <Label>Fecha de Check-out *</Label>
              <Input
                type="date"
                value={walkinForm.checkout_date}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => setWalkinForm(prev => ({ ...prev, checkout_date: e.target.value }))}
              />
            </div>

            {/* Guests */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Adultos</Label>
                <Input
                  type="number"
                  min="1"
                  value={walkinForm.adults}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, adults: parseInt(e.target.value) || 1 }))}
                />
              </div>
              <div>
                <Label>Niños</Label>
                <Input
                  type="number"
                  min="0"
                  value={walkinForm.children}
                  onChange={(e) => setWalkinForm(prev => ({ ...prev, children: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <Label>Notas</Label>
              <Textarea
                value={walkinForm.notes}
                onChange={(e) => setWalkinForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Observaciones..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWalkinDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleWalkinCreate} 
              disabled={creatingWalkin || walkinRooms.length === 0}
              className="bg-amber-500 hover:bg-amber-600"
            >
              {creatingWalkin ? 'Registrando...' : 'Registrar Walk-in'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Reservations;
