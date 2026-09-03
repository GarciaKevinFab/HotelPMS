import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Trash2,
  Key,
  Shield,
  UserCheck,
  UserX,
  Filter
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../components/ui/dropdown-menu';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoMetricas, EsqueletoFilas } from '../components/Esqueleto';
import { cn } from '../lib/utils';
import { usersAPI } from '../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

const ROLE_LABELS = {
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepcionista',
  HOUSEKEEPING: 'Limpieza',
  SECURITY: 'Seguridad',
  SUPER_ADMIN: 'Super Admin',
};

/* Los cinco roles llevaban azul, esmeralda, ambar, morado y rojo: la paleta
   por defecto de Tailwind, sin relacion con la marca ni entre si. Ahora salen
   de los acentos del logotipo, y el fucsia -que en todo el sistema significa
   "esto reclama atencion"- queda para el rol que mas puede romper. */
const ROLE_COLORS = {
  ADMIN: 'bg-zen-100 text-zen-700 border-zen-200',
  RECEPTIONIST: 'bg-[hsl(var(--acento-turquesa)/0.12)] text-[hsl(var(--acento-turquesa))] border-[hsl(var(--acento-turquesa)/0.25)]',
  HOUSEKEEPING: 'bg-[hsl(var(--acento-lima)/0.14)] text-[hsl(var(--acento-lima))] border-[hsl(var(--acento-lima)/0.3)]',
  SECURITY: 'bg-[hsl(var(--acento-oliva)/0.14)] text-[hsl(var(--acento-oliva))] border-[hsl(var(--acento-oliva)/0.3)]',
  SUPER_ADMIN: 'bg-[hsl(var(--acento-fucsia)/0.10)] text-[hsl(var(--acento-fucsia))] border-[hsl(var(--acento-fucsia)/0.25)]',
};

export function Employees() {
  const { user, isSuperAdmin } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Create form
  const [createForm, setCreateForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'RECEPTIONIST',
  });

  // Edit form
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    role: 'RECEPTIONIST',
  });

  // Password form
  const [passwordForm, setPasswordForm] = useState({
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const response = await usersAPI.list();
      setEmployees(response.data);
    } catch (err) {
      console.error('Error fetching employees:', err);
      toast.error('Error al cargar empleados');
    } finally {
      setLoading(false);
    }
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (
          !emp.full_name?.toLowerCase().includes(query) &&
          !emp.email?.toLowerCase().includes(query)
        ) {
          return false;
        }
      }
      // Role filter
      if (filterRole !== 'ALL' && emp.role !== filterRole) {
        return false;
      }
      // Status filter
      if (filterStatus === 'ACTIVE' && !emp.is_active) return false;
      if (filterStatus === 'INACTIVE' && emp.is_active) return false;
      return true;
    });
  }, [employees, searchQuery, filterRole, filterStatus]);

  // Stats
  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((e) => e.is_active).length,
    receptionists: employees.filter((e) => e.role === 'RECEPTIONIST').length,
    housekeeping: employees.filter((e) => e.role === 'HOUSEKEEPING').length,
    security: employees.filter((e) => e.role === 'SECURITY').length,
  }), [employees]);

  const handleCreate = async () => {
    if (!createForm.full_name || !createForm.email || !createForm.password) {
      toast.error('Complete todos los campos requeridos');
      return;
    }

    try {
      await usersAPI.create({
        ...createForm,
        tenant_id: user.tenant_id,
      });
      toast.success('Empleado creado exitosamente');
      setShowCreateDialog(false);
      setCreateForm({ full_name: '', email: '', password: '', role: 'RECEPTIONIST' });
      fetchEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear empleado');
    }
  };

  const handleEdit = async () => {
    if (!editForm.full_name || !editForm.email) {
      toast.error('Complete todos los campos requeridos');
      return;
    }

    try {
      await usersAPI.update(selectedEmployee.id, editForm);
      toast.success('Empleado actualizado exitosamente');
      setShowEditDialog(false);
      setSelectedEmployee(null);
      fetchEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al actualizar empleado');
    }
  };

  const handleResetPassword = async () => {
    if (!passwordForm.password) {
      toast.error('Ingrese la nueva contraseña');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (passwordForm.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres');
      return;
    }

    try {
      await usersAPI.resetPassword(selectedEmployee.id, passwordForm.password);
      toast.success('Contraseña actualizada exitosamente');
      setShowPasswordDialog(false);
      setSelectedEmployee(null);
      setPasswordForm({ password: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cambiar contraseña');
    }
  };

  const handleToggleStatus = async (emp) => {
    try {
      await usersAPI.update(emp.id, { is_active: !emp.is_active });
      toast.success(emp.is_active ? 'Empleado desactivado' : 'Empleado activado');
      fetchEmployees();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = async () => {
    try {
      await usersAPI.delete(selectedEmployee.id);
      toast.success('Empleado eliminado exitosamente');
      setShowDeleteDialog(false);
      setSelectedEmployee(null);
      fetchEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al eliminar empleado');
    }
  };

  const openEditDialog = (emp) => {
    setSelectedEmployee(emp);
    setEditForm({
      full_name: emp.full_name,
      email: emp.email,
      role: emp.role,
    });
    setShowEditDialog(true);
  };

  const openPasswordDialog = (emp) => {
    setSelectedEmployee(emp);
    setPasswordForm({ password: '', confirmPassword: '' });
    setShowPasswordDialog(true);
  };

  const openDeleteDialog = (emp) => {
    setSelectedEmployee(emp);
    setShowDeleteDialog(true);
  };

  const isCurrentUser = (emp) => emp.id === user?.user_id;

  const hayFiltros = searchQuery !== '' || filterRole !== 'ALL' || filterStatus !== 'ALL';
  const limpiarFiltros = () => {
    setSearchQuery('');
    setFilterRole('ALL');
    setFilterStatus('ALL');
  };

  const acciones = (
    <Button onClick={() => setShowCreateDialog(true)} data-testid="create-employee-btn">
      <Plus className="w-4 h-4 mr-2" />
      Nuevo Empleado
    </Button>
  );

  /* Las tarjetas de arriba usan el mismo color que la insignia del rol en la
     tabla, para que el ojo una las dos cosas sin leer el rotulo. */
  const tarjetas = [
    { rotulo: 'Total Empleados', valor: stats.total, Icono: Users, chip: 'bg-muted', icono: 'text-foreground' },
    { rotulo: 'Activos', valor: stats.active, Icono: UserCheck, chip: 'bg-[hsl(var(--status-vacant-clean)/.10)]', icono: 'text-[hsl(var(--acento-turquesa))]' },
    { rotulo: 'Recepcionistas', valor: stats.receptionists, Icono: Shield, chip: 'bg-[hsl(var(--acento-turquesa)/.12)]', icono: 'text-[hsl(var(--acento-turquesa))]' },
    { rotulo: 'Limpieza', valor: stats.housekeeping, Icono: Users, chip: 'bg-[hsl(var(--acento-lima)/.14)]', icono: 'text-[hsl(var(--acento-lima))]' },
    { rotulo: 'Seguridad', valor: stats.security, Icono: Shield, chip: 'bg-[hsl(var(--acento-oliva)/.14)]', icono: 'text-[hsl(var(--acento-oliva))]' },
  ];

  if (loading) {
    return (
      <div className="space-y-6" data-testid="employees-page" aria-busy="true">
        <EncabezadoPagina titulo="Gestión de Empleados" subtitulo="Administra el personal del hotel" acciones={acciones} />
        <EsqueletoMetricas cantidad={5} className="gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4" />
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <EsqueletoFilas filas={6} columnas={5} />
            </TableBody>
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="employees-page">
      <EncabezadoPagina titulo="Gestión de Empleados" subtitulo="Administra el personal del hotel" acciones={acciones} />

      {/* Stats */}
      {/* grid-cols-5 fijo no cabe en un movil: cinco tarjetas sobre 375 px dan
          66 px cada una y la ultima se salia de la pantalla. Dos columnas en
          movil, tres en tableta y las cinco cuando hay sitio. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {tarjetas.map(({ rotulo, valor, Icono, chip, icono }) => (
          <Card key={rotulo} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{valor}</p>
              </div>
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', chip)}>
                <Icono className={cn('h-5 w-5', icono)} aria-hidden="true" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar empleado por nombre o correo"
              placeholder="Buscar por nombre o email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="search-employees-input"
            />
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
            <Filter className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filtrar por rol">
                <SelectValue placeholder="Filtrar por rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los roles</SelectItem>
                <SelectItem value="ADMIN">Administrador</SelectItem>
                <SelectItem value="RECEPTIONIST">Recepcionista</SelectItem>
                <SelectItem value="HOUSEKEEPING">Limpieza</SelectItem>
                <SelectItem value="SECURITY">Seguridad</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[160px]" aria-label="Estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="ACTIVE">Activos</SelectItem>
                <SelectItem value="INACTIVE">Inactivos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {filteredEmployees.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="p-0">
                  <EstadoVacio
                    icono={Users}
                    titulo="No se encontraron empleados"
                    descripcion="Crea el primer empleado para dar acceso al personal del hotel con su propio rol."
                    accion="Nuevo Empleado"
                    onAccion={() => setShowCreateDialog(true)}
                    filtrado={employees.length > 0 && hayFiltros}
                    onLimpiar={limpiarFiltros}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredEmployees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-zen-100">
                        <span className="text-sm font-medium text-zen-600">
                          {emp.full_name?.charAt(0)?.toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{emp.full_name}</p>
                        {isCurrentUser(emp) && (
                          <p className="text-xs text-[hsl(var(--acento-turquesa))]">(Tu cuenta)</p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-zen-600">{emp.email}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={ROLE_COLORS[emp.role] || 'bg-zen-100 text-zen-700'}>
                      {ROLE_LABELS[emp.role] || emp.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {emp.is_active ? (
                      <Badge className="border-[hsl(var(--status-vacant-clean)/.35)] bg-[hsl(var(--status-vacant-clean)/.12)] text-[hsl(var(--insignia-turquesa))]">
                        Activo
                      </Badge>
                    ) : (
                      <Badge className="border-[hsl(var(--status-occupied)/.35)] bg-[hsl(var(--status-occupied)/.12)] text-[hsl(var(--insignia-fucsia))]">
                        Inactivo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!isCurrentUser(emp) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" aria-label="Acciones de esta fila" className="w-11 sm:w-9">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(emp)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openPasswordDialog(emp)}>
                            <Key className="w-4 h-4 mr-2" />
                            Cambiar Contraseña
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleToggleStatus(emp)}>
                            {emp.is_active ? (
                              <>
                                <UserX className="w-4 h-4 mr-2" />
                                Desactivar
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-4 h-4 mr-2" />
                                Activar
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(emp)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Employee Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Empleado</DialogTitle>
            <DialogDescription>Registrar un nuevo empleado en el sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre Completo *</Label>
              <Input
                value={createForm.full_name}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, full_name: e.target.value }))}
                placeholder="Nombre del empleado"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Correo Electrónico *</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="correo@ejemplo.com"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Contraseña *</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rol</Label>
              <Select
                value={createForm.role}
                onValueChange={(v) => setCreateForm((prev) => ({ ...prev, role: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEPTIONIST">Recepcionista</SelectItem>
                  <SelectItem value="HOUSEKEEPING">Limpieza</SelectItem>
                  <SelectItem value="SECURITY">Seguridad</SelectItem>
                  {isSuperAdmin && <SelectItem value="ADMIN">Administrador</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Crear Empleado</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Empleado</DialogTitle>
            <DialogDescription>Modificar los datos del empleado</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nombre Completo *</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, full_name: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Correo Electrónico *</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Rol</Label>
              <Select
                value={editForm.role}
                onValueChange={(v) => setEditForm((prev) => ({ ...prev, role: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEPTIONIST">Recepcionista</SelectItem>
                  <SelectItem value="HOUSEKEEPING">Limpieza</SelectItem>
                  <SelectItem value="SECURITY">Seguridad</SelectItem>
                  {isSuperAdmin && <SelectItem value="ADMIN">Administrador</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEdit}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar Contraseña</DialogTitle>
            <DialogDescription>
              Establecer nueva contraseña para {selectedEmployee?.full_name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nueva Contraseña *</Label>
              <Input
                type="password"
                value={passwordForm.password}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Mínimo 8 caracteres"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Confirmar Contraseña *</Label>
              <Input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))
                }
                placeholder="Repita la contraseña"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleResetPassword}>Cambiar Contraseña</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar empleado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente a{' '}
              <strong>{selectedEmployee?.full_name}</strong> del sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default Employees;
