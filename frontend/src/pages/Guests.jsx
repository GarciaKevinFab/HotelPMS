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
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EsqueletoFilas, EsqueletoLista, EsqueletoMetricas } from '../components/Esqueleto';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
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
  // Distingue la primera carga (esqueleto en las metricas) de las recargas
  // por busqueda, donde las metricas ya tienen un valor que mostrar.
  const [haCargado, setHaCargado] = useState(false);
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
      setHaCargado(true);
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

  // La busqueda se resuelve en el servidor, asi que "filtrado" es
  // simplemente "hay texto en el buscador".
  const hayFiltro = searchQuery.trim().length > 0;

  const stats = [
    { rotulo: 'Total Huéspedes', valor: guests.length, color: 'text-foreground' },
    { rotulo: 'Con DNI', valor: guests.filter(g => g.doc_type === 'DNI').length, color: 'text-[hsl(var(--acento-turquesa))]' },
    { rotulo: 'Extranjeros', valor: guests.filter(g => g.nationality !== 'PE').length, color: 'text-[hsl(var(--acento-fucsia))]' },
  ];

  // Misma pieza para la tabla y para la lista movil.
  const accionesHuesped = (guest, { ancho = false } = {}) => (
    <Button
      variant={ancho ? 'outline' : 'ghost'}
      size={ancho ? 'default' : 'sm'}
      className={ancho ? 'w-full' : undefined}
      onClick={() => handleViewDetail(guest)}
    >
      <Eye className="w-4 h-4 mr-2" />
      Ver
    </Button>
  );

  const estadoVacio = (
    <EstadoVacio
      icono={Users}
      titulo="Todavía no hay huéspedes"
      descripcion="Se van creando solos al registrar la primera reserva. También puedes darlos de alta ahora si ya tienes sus datos."
      accion="Registrar un huésped"
      onAccion={() => setShowCreateDialog(true)}
      filtrado={hayFiltro}
      onLimpiar={() => { setSearchQuery(''); }}
    />
  );

  return (
    <div className="space-y-6" data-testid="guests-page">
      <EncabezadoPagina
        titulo="Huéspedes"
        subtitulo="Gestión de perfiles de huéspedes"
        acciones={
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-guest-btn">
            <UserPlus className="w-4 h-4 mr-2" />
            Nuevo Huésped
          </Button>
        }
      />

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            aria-label="Buscar huésped por nombre, documento o correo"
            placeholder="Buscar por nombre, documento o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
            data-testid="search-guests-input"
          />
        </div>
      </Card>

      {/* Stats */}
      {!haCargado ? (
        <EsqueletoMetricas cantidad={3} className="grid-cols-3 lg:grid-cols-3" />
      ) : (
        <div className="escalonado grid grid-cols-3 gap-3 sm:gap-4">
          {stats.map((s) => (
            <Card key={s.rotulo} className="p-4 transition-shadow duration-180 hover:shadow-md">
              <p className="text-xs font-medium text-muted-foreground">{s.rotulo}</p>
              <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${s.color}`}>{s.valor}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tabla (desde md) */}
      <div className="hidden md:block">
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
            <TableBody className="escalonado">
              {loading ? (
                <EsqueletoFilas filas={6} columnas={5} />
              ) : guests.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="p-0">
                    {estadoVacio}
                  </TableCell>
                </TableRow>
              ) : (
                guests.map((guest) => (
                  <TableRow key={guest.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 shrink-0 bg-muted rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                        </div>
                        <p className="font-medium">{guest.full_name}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{guest.doc_type}</Badge>
                      <span className="ml-2 tabular-nums">{guest.doc_number}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {guest.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3" aria-hidden="true" /> {guest.phone}</p>}
                        {guest.email && <p className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" aria-hidden="true" /> {guest.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{guest.nationality || 'PE'}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {accionesHuesped(guest)}
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
          <EsqueletoLista cantidad={4} />
        ) : guests.length === 0 ? (
          <Card>{estadoVacio}</Card>
        ) : (
          <div className="escalonado space-y-3">
            {guests.map((guest) => (
              <Card key={guest.id} className="p-4 transition-shadow duration-180 hover:shadow-md">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 shrink-0 bg-muted rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight break-words">{guest.full_name}</p>
                    <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                      {guest.doc_type} {guest.doc_number}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{guest.nationality || 'PE'}</Badge>
                </div>

                {(guest.phone || guest.email) && (
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {guest.phone && (
                      <p className="flex items-center gap-2 tabular-nums">
                        <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{guest.phone}</span>
                      </p>
                    )}
                    {guest.email && (
                      <p className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{guest.email}</span>
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4">
                  {accionesHuesped(guest, { ancho: true })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

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
                <div className="w-16 h-16 shrink-0 bg-muted rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading text-xl font-semibold tracking-tight break-words">{selectedGuest.full_name}</h3>
                  <p className="text-sm text-muted-foreground tabular-nums">{getStatusLabel(selectedGuest.doc_type)}: {selectedGuest.doc_number}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
                {selectedGuest.phone && (
                  <div className="flex items-center gap-2 min-w-0">
                    <Phone className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate tabular-nums">{selectedGuest.phone}</span>
                  </div>
                )}
                {selectedGuest.email && (
                  <div className="flex items-center gap-2 min-w-0">
                    <Mail className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{selectedGuest.email}</span>
                  </div>
                )}
                {selectedGuest.address && (
                  <div className="flex items-center gap-2 sm:col-span-2 min-w-0">
                    <MapPin className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="break-words">{selectedGuest.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
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
