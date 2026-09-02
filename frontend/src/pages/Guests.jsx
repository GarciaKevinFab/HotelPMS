import React, { useState, useEffect } from 'react';
import { 
  Search, 
  UserPlus,
  User,
  Phone,
  Mail,
  MapPin,
  Eye,
  Users
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EstadoVacio } from '../components/EstadoVacio';
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
import { guestsAPI } from '../lib/api';
import { getStatusLabel, formatDate } from '../lib/utils';
import { toast } from 'sonner';

export function Guests() {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState(null);
  
  // Form
  const [formData, setFormData] = useState({
    doc_type: 'DNI',
    doc_number: '',
    full_name: '',
    phone: '',
    email: '',
    nationality: 'PE',
    address: ''
  });

  useEffect(() => {
    fetchGuests();
  }, [searchQuery]);

  const fetchGuests = async () => {
    setLoading(true);
    try {
      const response = await guestsAPI.list(searchQuery || undefined);
      setGuests(response.data);
    } catch (err) {
      console.error('Error fetching guests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.doc_number || !formData.full_name) {
      toast.error('Complete los campos requeridos');
      return;
    }

    try {
      await guestsAPI.create(formData);
      toast.success('Huésped creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchGuests();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear huésped');
    }
  };

  const handleViewDetail = async (guest) => {
    try {
      const response = await guestsAPI.get(guest.id);
      setSelectedGuest(response.data);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error('Error al cargar detalle');
    }
  };

  const resetForm = () => {
    setFormData({
      doc_type: 'DNI',
      doc_number: '',
      full_name: '',
      phone: '',
      email: '',
      nationality: 'PE',
      address: ''
    });
  };

  return (
    <div className="space-y-6" data-testid="guests-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Huéspedes</h1>
          <p className="text-zen-500">Gestión de perfiles de huéspedes</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-guest-btn">
          <UserPlus className="w-4 h-4 mr-2" />
          Nuevo Huésped
        </Button>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-400" />
          <Input
            placeholder="Buscar por nombre, documento o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="search-guests-input"
          />
        </div>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-zen-500">Total Huéspedes</p>
          <p className="text-2xl font-bold">{guests.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Con DNI</p>
          <p className="text-2xl font-bold">{guests.filter(g => g.doc_type === 'DNI').length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Extranjeros</p>
          <p className="text-2xl font-bold">{guests.filter(g => g.nationality !== 'PE').length}</p>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Huésped</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Nacionalidad</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : guests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="p-0">
                  <EstadoVacio
                    icono={Users}
                    titulo="Todavía no hay huéspedes"
                    descripcion="Se van creando solos al registrar la primera reserva. También puedes darlos de alta ahora si ya tienes sus datos."
                    accion="Registrar un huésped"
                    onAccion={() => setShowCreateDialog(true)}
                    filtrado={guests.length > 0}
                    onLimpiar={() => { setSearchQuery(''); }}
                  />
                </TableCell>
              </TableRow>
            ) : (
              guests.map((guest) => (
                <TableRow key={guest.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-zen-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-zen-500" />
                      </div>
                      <div>
                        <p className="font-medium">{guest.full_name}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{guest.doc_type}</Badge>
                    <span className="ml-2">{guest.doc_number}</span>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {guest.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3" /> {guest.phone}</p>}
                      {guest.email && <p className="flex items-center gap-1 text-zen-500"><Mail className="w-3 h-3" /> {guest.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{guest.nationality || 'PE'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleViewDetail(guest)}>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Huésped</DialogTitle>
            <DialogDescription>Registrar un nuevo huésped en el sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tipo Documento</Label>
                <Select 
                  value={formData.doc_type} 
                  onValueChange={(v) => setFormData(prev => ({ ...prev, doc_type: v }))}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DNI">DNI</SelectItem>
                    <SelectItem value="CE">Carné Extranjería</SelectItem>
                    <SelectItem value="PASAPORTE">Pasaporte</SelectItem>
                    <SelectItem value="RUC">RUC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Número Documento *</Label>
                <Input
                  value={formData.doc_number}
                  onChange={(e) => setFormData(prev => ({ ...prev, doc_number: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label>Nombre Completo *</Label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData(prev => ({ ...prev, full_name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nacionalidad</Label>
                <Input
                  value={formData.nationality}
                  onChange={(e) => setFormData(prev => ({ ...prev, nationality: e.target.value }))}
                  placeholder="PE"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Dirección</Label>
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Crear Huésped</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle del Huésped</DialogTitle>
          </DialogHeader>
          {selectedGuest && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-zen-100 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-zen-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{selectedGuest.full_name}</h3>
                  <p className="text-zen-500">{getStatusLabel(selectedGuest.doc_type)}: {selectedGuest.doc_number}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                {selectedGuest.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-zen-400" />
                    <span>{selectedGuest.phone}</span>
                  </div>
                )}
                {selectedGuest.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-zen-400" />
                    <span>{selectedGuest.email}</span>
                  </div>
                )}
                {selectedGuest.address && (
                  <div className="flex items-center gap-2 col-span-2">
                    <MapPin className="w-4 h-4 text-zen-400" />
                    <span>{selectedGuest.address}</span>
                  </div>
                )}
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-zen-500">
                  Registrado: {formatDate(selectedGuest.created_at)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Guests;
