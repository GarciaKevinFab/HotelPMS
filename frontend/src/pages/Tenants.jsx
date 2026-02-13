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
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { tenantsAPI } from '../lib/api';
import { formatDate, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hoteles (Tenants)</h1>
          <p className="text-slate-500">Gestión de hoteles en el sistema</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="create-tenant-btn">
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Hotel
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Total Hoteles</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Activos</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Inactivos</p>
          <p className="text-2xl font-bold text-slate-400">{stats.inactive}</p>
        </Card>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre o RUC..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </Card>

      {/* Table */}
      <Card>
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
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-slate-200 border-t-blue-500 rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredTenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                  No se encontraron hoteles
                </TableCell>
              </TableRow>
            ) : (
              filteredTenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{tenant.name}</p>
                        {tenant.nombre_comercial && tenant.nombre_comercial !== tenant.name && (
                          <p className="text-xs text-slate-500">{tenant.nombre_comercial}</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{tenant.ruc}</TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {tenant.phone && <p>{tenant.phone}</p>}
                      {tenant.email && <p className="text-slate-500">{tenant.email}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {tenant.is_active !== false ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Activo
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <XCircle className="w-3 h-3 mr-1" />
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">
                    {formatDate(tenant.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Hotel</DialogTitle>
            <DialogDescription>
              Configure un nuevo hotel en el sistema multi-tenant
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Hotel Info */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Información del Hotel
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Razón Social *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Hotel Example S.A.C."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Nombre Comercial</Label>
                  <Input
                    value={formData.nombre_comercial}
                    onChange={(e) => setFormData(prev => ({ ...prev, nombre_comercial: e.target.value }))}
                    placeholder="Hotel Example"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>RUC *</Label>
                  <Input
                    value={formData.ruc}
                    onChange={(e) => setFormData(prev => ({ ...prev, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                    placeholder="20123456789"
                    maxLength={11}
                    className="mt-1 font-mono"
                  />
                  <p className="text-xs text-slate-500 mt-1">{formData.ruc.length}/11 dígitos</p>
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+51 1 234 5678"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Dirección</Label>
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Av. Principal 123, Lima"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Email del Hotel</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="contacto@hotel.com"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Admin User */}
            <div className="border-t pt-6">
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Usuario Administrador
              </h4>
              <p className="text-sm text-slate-500 mb-4">
                Se creará un usuario ADMIN para este hotel
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del Admin</Label>
                  <Input
                    value={formData.admin_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_name: e.target.value }))}
                    placeholder="Juan Pérez"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Email del Admin *</Label>
                  <Input
                    type="email"
                    value={formData.admin_email}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_email: e.target.value }))}
                    placeholder="admin@hotel.com"
                    className="mt-1"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Contraseña *</Label>
                  <Input
                    type="password"
                    value={formData.admin_password}
                    onChange={(e) => setFormData(prev => ({ ...prev, admin_password: e.target.value }))}
                    placeholder="Mínimo 8 caracteres"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
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
            <DialogTitle>Detalle del Hotel</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Building2 className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{selectedTenant.name}</h3>
                  <p className="text-slate-500">{selectedTenant.nombre_comercial}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div>
                  <p className="text-sm text-slate-500">RUC</p>
                  <p className="font-mono">{selectedTenant.ruc}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Estado</p>
                  <Badge className={selectedTenant.is_active !== false ? 'bg-emerald-100 text-emerald-700' : ''}>
                    {selectedTenant.is_active !== false ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                {selectedTenant.phone && (
                  <div>
                    <p className="text-sm text-slate-500">Teléfono</p>
                    <p>{selectedTenant.phone}</p>
                  </div>
                )}
                {selectedTenant.email && (
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p>{selectedTenant.email}</p>
                  </div>
                )}
                {selectedTenant.address && (
                  <div className="col-span-2">
                    <p className="text-sm text-slate-500">Dirección</p>
                    <p>{selectedTenant.address}</p>
                  </div>
                )}
              </div>

              {/* Invoicing Config */}
              <div className="pt-4 border-t">
                <h4 className="font-medium mb-2">Configuración Facturación</h4>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-sm">
                    <span className="text-slate-500">Modo NubeFact:</span>{' '}
                    <Badge variant="outline">
                      {selectedTenant.invoicing_config?.nubefact_token ? 'LIVE' : 'MOCK'}
                    </Badge>
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-slate-500">
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
