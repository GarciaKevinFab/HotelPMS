import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Users,
  Eye,
  Settings,
  CheckCircle,
  XCircle,
  MoreHorizontal
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas } from '../components/Esqueleto';
import { tenantsAPI } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

/* Insignia de estado del hotel con los mismos tokens que las habitaciones:
   activo = turquesa, inactivo = neutro. Antes "Activo" llevaba un verde de Tailwind ajeno a la marca. */
function InsigniaEstado({ activo, className }) {
  return (
    <Badge
      variant="outline"
      className={cn('gap-1 whitespace-nowrap', activo ? 'status-vacant-clean' : 'status-ooo', className)}
    >
      {activo ? <CheckCircle className="h-3 w-3" aria-hidden="true" /> : <XCircle className="h-3 w-3" aria-hidden="true" />}
      {activo ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

function Metrica({ rotulo, valor, tono }) {
  return (
    <Card className="min-w-0 p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', tono)}>{valor}</p>
    </Card>
  );
}

export function Tenants() {
  const { isSuperAdmin } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(null);

  // Form
  const [formData, setFormData] = useState({
    name: '',
    nombre_comercial: '',
    ruc: '',
    address: '',
    phone: '',
    email: '',
    admin_email: '',
    admin_password: '',
    admin_name: ''
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
    }
  }, [isSuperAdmin]);

  // Only SUPER_ADMIN can access this page
  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const response = await tenantsAPI.list();
      setTenants(response.data);
    } catch (err) {
      console.error('Error fetching tenants:', err);
      toast.error('Error al cargar hoteles');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.ruc || !formData.admin_email || !formData.admin_password) {
      toast.error('Complete los campos requeridos');
      return;
    }

    if (formData.ruc.length !== 11) {
      toast.error('RUC debe tener 11 dígitos');
      return;
    }

    setCreating(true);
    try {
      await tenantsAPI.create({
        name: formData.name,
        nombre_comercial: formData.nombre_comercial || formData.name,
        ruc: formData.ruc,
        address: formData.address || null,
        phone: formData.phone || null,
        email: formData.email || null,
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
        admin_name: formData.admin_name || 'Administrador'
      });
      toast.success('Hotel creado exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear hotel');
    } finally {
      setCreating(false);
    }
  };

  const handleViewDetail = async (tenant) => {
    try {
      const response = await tenantsAPI.get(tenant.id);
      setSelectedTenant(response.data);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error('Error al cargar detalle');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      nombre_comercial: '',
      ruc: '',
      address: '',
      phone: '',
      email: '',
      admin_email: '',
      admin_password: '',
      admin_name: ''
    });
  };

  const filteredTenants = tenants.filter(t => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return t.name?.toLowerCase().includes(query) || t.ruc?.includes(query);
  });

  // Stats
  const stats = {
    total: tenants.length,
    active: tenants.filter(t => t.is_active !== false).length,
    inactive: tenants.filter(t => t.is_active === false).length
  };

  return (
    <div className="space-y-6" data-testid="tenants-page">
      <EncabezadoPagina
        titulo="Hoteles (Tenants)"
        subtitulo="Gestión de hoteles en el sistema"
        acciones={
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-tenant-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Hotel
          </Button>
        }
      />

      {/* Stats */}
      <div className="escalonado grid grid-cols-3 gap-3 sm:gap-4">
        <Metrica rotulo="Total Hoteles" valor={stats.total} />
        <Metrica rotulo="Activos" valor={stats.active} tono="text-[hsl(var(--acento-turquesa))]" />
        <Metrica rotulo="Inactivos" valor={stats.inactive} tono="text-muted-foreground" />
      </div>

      {/* Search */}
      <Card className="p-3 shadow-sm sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Buscar hotel por nombre o RUC"
            placeholder="Buscar por nombre o RUC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hotel</TableHead>
              <TableHead>RUC</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={5} columnas={6} />
            ) : filteredTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EstadoVacio
                    icono={Building2}
                    titulo="No se encontraron hoteles"
                    descripcion="Cada hotel es un espacio independiente con sus propias habitaciones, usuarios y comprobantes. Cree el primero para empezar."
                    accion="Nuevo Hotel"
                    onAccion={() => setShowCreateDialog(true)}
                    filtrado={tenants.length > 0}
                    onLimpiar={() => setSearchQuery('')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredTenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[hsl(var(--acento-turquesa)/0.12)]">
                        <Building2 className="h-5 w-5 text-[hsl(var(--acento-turquesa))]" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{tenant.name}</p>
                        {tenant.nombre_comercial && tenant.nombre_comercial !== tenant.name && (
                          <p className="truncate text-xs text-muted-foreground">{tenant.nombre_comercial}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm tabular-nums">{tenant.ruc}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {tenant.phone && <p>{tenant.phone}</p>}
                      {tenant.email && <p className="text-muted-foreground">{tenant.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <InsigniaEstado activo={tenant.is_active !== false} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(tenant.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Acciones de ${tenant.name}`}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetail(tenant)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Detalle
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Users className="w-4 h-4 mr-2" />
                          Ver Usuarios
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Settings className="w-4 h-4 mr-2" />
                          Configuración
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Crear Nuevo Hotel</DialogTitle>
            <DialogDescription>
              Configure un nuevo hotel en el sistema multi-tenant
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* Hotel Info */}
            <section>
              <h4 className="font-heading flex items-center gap-2 text-base font-semibold">
                <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Información del Hotel
              </h4>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="hotel-name">Razón Social *</Label>
                  <Input
                    id="hotel-name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Hotel Example S.A.C."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel-nombre-comercial">Nombre Comercial</Label>
                  <Input
                    id="hotel-nombre-comercial"
                    value={formData.nombre_comercial}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_comercial: e.target.value }))}
                    placeholder="Hotel Example"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel-ruc">RUC *</Label>
                  <Input
                    id="hotel-ruc"
                    inputMode="numeric"
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    placeholder="20123456789"
                    maxLength={11}
                    className="font-mono"
                  />
                  <p className="text-xs tabular-nums text-muted-foreground">{formData.ruc.length}/11 dígitos</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hotel-phone">Teléfono</Label>
                  <Input
                    id="hotel-phone"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+51 1 234 5678"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="hotel-address">Dirección</Label>
                  <Input
                    id="hotel-address"
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Av. Principal 123, Lima"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="hotel-email">Email del Hotel</Label>
                  <Input
                    id="hotel-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="contacto@hotel.com"
                  />
                </div>
              </div>
            </section>

            {/* Admin User */}
            <section className="border-t pt-6">
              <h4 className="font-heading flex items-center gap-2 text-base font-semibold">
                <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Usuario Administrador
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Se creará un usuario ADMIN para este hotel
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="admin-name">Nombre del Admin</Label>
                  <Input
                    id="admin-name"
                    value={formData.admin_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
                    placeholder="Juan Pérez"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">Email del Admin *</Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_email: e.target.value }))}
                    placeholder="admin@hotel.com"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="admin-password">Contraseña *</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                  />
                </div>
              </div>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Hotel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Detalle del Hotel</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[hsl(var(--acento-turquesa)/0.12)]">
                  <Building2 className="h-7 w-7 text-[hsl(var(--acento-turquesa))]" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-heading truncate text-lg font-semibold">{selectedTenant.name}</h3>
                  <p className="truncate text-sm text-muted-foreground">{selectedTenant.nombre_comercial}</p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-4 border-t pt-5">
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">RUC</dt>
                  <dd className="mt-1 font-mono text-sm tabular-nums">{selectedTenant.ruc}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Estado</dt>
                  <dd className="mt-1">
                    <InsigniaEstado activo={selectedTenant.is_active !== false} />
                  </dd>
                </div>
                {selectedTenant.phone && (
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Teléfono</dt>
                    <dd className="mt-1 text-sm">{selectedTenant.phone}</dd>
                  </div>
                )}
                {selectedTenant.email && (
                  <div className="min-w-0">
                    <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                    <dd className="mt-1 break-words text-sm">{selectedTenant.email}</dd>
                  </div>
                )}
                {selectedTenant.address && (
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-muted-foreground">Dirección</dt>
                    <dd className="mt-1 text-sm">{selectedTenant.address}</dd>
                  </div>
                )}
              </dl>

              {/* Invoicing Config */}
              <div className="border-t pt-5">
                <h4 className="font-heading text-base font-semibold">Configuración Facturación</h4>
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground">Modo NubeFact:</span>
                  <Badge
                    variant="outline"
                    className={selectedTenant.invoicing_mode === 'LIVE' ? 'status-vacant-clean' : 'status-dirty'}
                  >
                    {selectedTenant.invoicing_mode || 'MOCK'}
                  </Badge>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  Creado: {formatDate(selectedTenant.created_at)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Tenants;
