import React, { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Search,
  Users,
  Eye,
  CheckCircle,
  XCircle,
  MoreHorizontal,
  CreditCard,
  Pencil,
  Trash2,
  LogIn,
  Power,
  PowerOff,
  BedDouble,
  CalendarDays,
  UserRound,
  Activity,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas } from '../components/Esqueleto';
import { GestionUsuarios } from '../components/GestionUsuarios';
import { tenantsAPI } from '../lib/api';
import { formatDate, formatDateTime, formatCurrency, cn } from '../lib/utils';
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

/* Estado de la suscripcion con los mismos tokens: activa/prueba turquesa,
   vencida (en gracia) lima, suspendida fucsia, cancelada neutro. */
const ESTADOS_SUSC = {
  prueba: ['Prueba', 'status-vacant-clean'],
  activa: ['Activa', 'status-vacant-clean'],
  vencida: ['Vencida', 'status-dirty'],
  suspendida: ['Suspendida', 'status-occupied'],
  cancelada: ['Cancelada', 'status-ooo'],
};
function InsigniaSuscripcion({ estado }) {
  const [texto, clase] = ESTADOS_SUSC[estado] || [estado || 'Sin estado', 'status-ooo'];
  return <Badge variant="outline" className={cn('whitespace-nowrap', clase)}>{texto}</Badge>;
}

function Metrica({ rotulo, valor, tono }) {
  return (
    <Card className="min-w-0 p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', tono)}>{valor}</p>
    </Card>
  );
}

/* Estado de un cobro. Mismos tokens que el resto del panel: pagado turquesa,
   pendiente lima, fallido fucsia, anulado neutro. */
const ESTADOS_PAGO = {
  pagado: ['Pagado', 'status-vacant-clean'],
  pendiente: ['Pendiente', 'status-dirty'],
  fallido: ['Fallido', 'status-occupied'],
  anulado: ['Anulado', 'status-ooo'],
};
function InsigniaPago({ estado }) {
  const [texto, clase] = ESTADOS_PAGO[estado] || [estado || '—', 'status-ooo'];
  return <Badge variant="outline" className={cn('whitespace-nowrap', clase)}>{texto}</Badge>;
}

/* Hasta cuando esta pagado. Solo aparece si la fecha existe: en NULL significa
   "nunca pago" (esta en prueba, o es de los hoteles de antes), y pintar un
   guion ahi haria pensar que se perdio el dato. */
function PagadoHasta({ fecha, className }) {
  if (!fecha) return null;
  const vencido = new Date(fecha) < new Date();
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs tabular-nums',
        vencido ? 'text-destructive' : 'text-muted-foreground', className)}
      title={vencido ? 'El periodo pagado ya venció' : 'Periodo pagado'}
    >
      <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
      Pagado hasta {formatDate(fecha)}
    </span>
  );
}

/* La parte de fecha de un timestamptz, para un <input type="date">. */
const soloFecha = (valor) => (valor ? String(valor).slice(0, 10) : '');

/* Cifra del detalle del hotel: icono chico, numero grande, rotulo debajo. */
function Cifra({ icono: Icono, valor, rotulo }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icono className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs font-medium">{rotulo}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{valor ?? '—'}</p>
    </div>
  );
}

const FORM_VACIO = {
  name: '',
  nombre_comercial: '',
  ruc: '',
  address: '',
  phone: '',
  email: '',
  admin_email: '',
  admin_password: '',
  admin_name: '',
};

const EDICION_VACIA = {
  name: '', razon_social: '', nombre_comercial: '', ruc: '', address: '', phone: '', email: '',
  checkin_time: '14:00', checkout_time: '12:00',
};

export function Tenants() {
  const { isSuperAdmin, entrarEnHotel } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  // Los pagos del hotel abierto. null = todavia cargando o sin pedir.
  const [pagos, setPagos] = useState(null);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [stats, setStats] = useState(null);

  // Editar hotel
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState(EDICION_VACIA);
  const [savingEdit, setSavingEdit] = useState(false);

  // Usuarios del hotel, activar/desactivar, eliminar, entrar como
  const [showUsersDialog, setShowUsersDialog] = useState(false);
  const [showActivoDialog, setShowActivoDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmacionNombre, setConfirmacionNombre] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // Plan y pago a mano: el SUPER_ADMIN pone el plan y el estado cuando el
  // hotel paga en efectivo, por Yape o por transferencia, o cuando se le
  // regala un periodo. Sin esto solo la pasarela podia activar un plan.
  const [showPlanDialog, setShowPlanDialog] = useState(false);
  const [planes, setPlanes] = useState([]);
  const [planForm, setPlanForm] = useState({ plan_codigo: '', subscription_status: 'activa', vence: '', nota: '' });
  const [savingPlan, setSavingPlan] = useState(false);

  const abrirPlan = (tenant) => {
    const manual = tenant.settings?.suscripcion_manual || {};
    setSelectedTenant(tenant);
    setPlanForm({
      plan_codigo: tenant.plan_codigo || 'prueba',
      subscription_status: tenant.subscription_status || 'prueba',
      // subscription_ends_at primero: es la columna que escriben las DOS vias
      // (la pasarela y este mismo formulario), asi que es la unica que refleja
      // un pago hecho con tarjeta. La nota manual solo dice lo que se tecleo
      // aqui la ultima vez.
      vence: soloFecha(tenant.subscription_ends_at) || manual.vence
        || soloFecha(tenant.trial_ends_at) || '',
      nota: manual.nota || '',
    });
    setShowPlanDialog(true);
  };

  const guardarPlan = async () => {
    if (!selectedTenant) return;
    setSavingPlan(true);
    try {
      await tenantsAPI.updateSuscripcion(selectedTenant.id, {
        plan_codigo: planForm.plan_codigo,
        subscription_status: planForm.subscription_status,
        vence: planForm.vence || null,
        nota: planForm.nota || null,
      });
      toast.success('Plan del hotel actualizado');
      setShowPlanDialog(false);
      fetchTenants();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo actualizar el plan');
    } finally {
      setSavingPlan(false);
    }
  };

  // Form
  const [formData, setFormData] = useState(FORM_VACIO);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      fetchTenants();
      tenantsAPI.planes().then((r) => setPlanes(r.data || [])).catch(() => setPlanes([]));
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
    if (formData.admin_password.length < 8) {
      toast.error('La contraseña del administrador necesita al menos 8 caracteres');
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
      setFormData(FORM_VACIO);
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear hotel');
    } finally {
      setCreating(false);
    }
  };

  const handleViewDetail = async (tenant) => {
    setSelectedTenant(tenant);
    setStats(null);
    setPagos(null);
    setShowDetailDialog(true);
    try {
      const [detalle, cifras] = await Promise.all([tenantsAPI.get(tenant.id), tenantsAPI.stats(tenant.id)]);
      setSelectedTenant(detalle.data);
      setStats(cifras.data);
    } catch (err) {
      toast.error('Error al cargar detalle');
    }
    // El historial va aparte y sin toast: es informacion secundaria, y que no
    // cargue no puede tumbar la ficha entera del hotel.
    try {
      const historial = await tenantsAPI.pagos(tenant.id);
      setPagos(historial.data || []);
    } catch (err) {
      setPagos([]);
    }
  };

  const abrirEditar = (tenant) => {
    setSelectedTenant(tenant);
    setEditForm({
      name: tenant.name || '',
      razon_social: tenant.razon_social || '',
      nombre_comercial: tenant.nombre_comercial || '',
      ruc: tenant.ruc || '',
      address: tenant.address || '',
      phone: tenant.phone || '',
      email: tenant.email || '',
      checkin_time: tenant.checkin_time || '14:00',
      checkout_time: tenant.checkout_time || '12:00',
    });
    setShowEditDialog(true);
  };

  const guardarEdicion = async () => {
    if (!selectedTenant) return;
    if (!editForm.name.trim()) {
      toast.error('El nombre del hotel es obligatorio');
      return;
    }
    if (editForm.ruc.length !== 11) {
      toast.error('RUC debe tener 11 dígitos');
      return;
    }
    setSavingEdit(true);
    try {
      // Solo se mandan los campos con valor: el servidor deja intacto lo que
      // no llega, y un correo vacio no pasa la validacion de EmailStr.
      const datos = {};
      Object.entries(editForm).forEach(([k, v]) => { if (String(v).trim() !== '') datos[k] = String(v).trim(); });
      await tenantsAPI.update(selectedTenant.id, datos);
      toast.success('Hotel actualizado');
      setShowEditDialog(false);
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo actualizar el hotel');
    } finally {
      setSavingEdit(false);
    }
  };

  const abrirUsuarios = (tenant) => { setSelectedTenant(tenant); setShowUsersDialog(true); };
  const abrirActivo = (tenant) => { setSelectedTenant(tenant); setShowActivoDialog(true); };
  const abrirEliminar = (tenant) => { setSelectedTenant(tenant); setConfirmacionNombre(''); setShowDeleteDialog(true); };

  const cambiarActivo = async () => {
    if (!selectedTenant) return;
    const activar = selectedTenant.is_active === false;
    setOcupado(true);
    try {
      await tenantsAPI.setActivo(selectedTenant.id, activar);
      toast.success(activar ? 'Hotel activado' : 'Hotel desactivado. Nadie de ese hotel podrá entrar.');
      setShowActivoDialog(false);
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cambiar el estado del hotel');
    } finally {
      setOcupado(false);
    }
  };

  const eliminarHotel = async () => {
    if (!selectedTenant || confirmacionNombre.trim() !== selectedTenant.name) return;
    setOcupado(true);
    try {
      await tenantsAPI.delete(selectedTenant.id);
      toast.success(`${selectedTenant.name} eliminado con todos sus datos`);
      setShowDeleteDialog(false);
      setSelectedTenant(null);
      fetchTenants();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo eliminar el hotel');
    } finally {
      setOcupado(false);
    }
  };

  const entrarComo = async (tenant) => {
    try {
      toast.message(`Entrando en ${tenant.nombre_comercial || tenant.name}…`);
      await entrarEnHotel(tenant.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo entrar en el hotel');
    }
  };

  const filteredTenants = tenants.filter(t => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return t.name?.toLowerCase().includes(query) || t.ruc?.includes(query) || t.nombre_comercial?.toLowerCase().includes(query);
  });

  // Stats
  const resumen = {
    total: tenants.length,
    active: tenants.filter(t => t.is_active !== false).length,
    inactive: tenants.filter(t => t.is_active === false).length
  };

  /* Un solo menu para la tabla (escritorio) y las tarjetas (movil). El orden
     va de lo inocuo a lo irreversible: mirar, editar, gestionar, entrar,
     apagar y, separado y en rojo, borrar. */
  const AccionesHotel = ({ tenant }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Acciones de ${tenant.name}`}>
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleViewDetail(tenant)}>
          <Eye className="w-4 h-4 mr-2" /> Ver detalle
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrirEditar(tenant)}>
          <Pencil className="w-4 h-4 mr-2" /> Editar hotel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrirUsuarios(tenant)}>
          <Users className="w-4 h-4 mr-2" /> Usuarios
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrirPlan(tenant)}>
          <CreditCard className="w-4 h-4 mr-2" /> Plan y pago
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => entrarComo(tenant)} disabled={tenant.is_active === false}>
          <LogIn className="w-4 h-4 mr-2" /> Entrar como
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => abrirActivo(tenant)}>
          {tenant.is_active === false
            ? <><Power className="w-4 h-4 mr-2" /> Activar hotel</>
            : <><PowerOff className="w-4 h-4 mr-2" /> Desactivar hotel</>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => abrirEliminar(tenant)} className="text-destructive focus:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Eliminar hotel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const IconoHotel = ({ activo, grande = false }) => (
    <div className={cn(
      'grid shrink-0 place-items-center rounded-lg',
      grande ? 'h-14 w-14 rounded-xl' : 'h-10 w-10',
      activo ? 'bg-[hsl(var(--acento-turquesa)/0.12)]' : 'bg-muted',
    )}>
      <Building2 className={cn(grande ? 'h-7 w-7' : 'h-5 w-5', activo ? 'text-[hsl(var(--acento-turquesa))]' : 'text-muted-foreground')} aria-hidden="true" />
    </div>
  );

  const estadoVacio = (
    <EstadoVacio
      icono={Building2}
      titulo="No se encontraron hoteles"
      descripcion="Cada hotel es un espacio independiente con sus propias habitaciones, usuarios y comprobantes. Cree el primero para empezar."
      accion="Nuevo Hotel"
      onAccion={() => setShowCreateDialog(true)}
      filtrado={tenants.length > 0}
      onLimpiar={() => setSearchQuery('')}
    />
  );

  return (
    <div className="space-y-6" data-testid="tenants-page">
      <EncabezadoPagina
        titulo="Hoteles"
        subtitulo="Todos los hoteles del sistema: sus datos, usuarios, plan y acceso"
        acciones={
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-tenant-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Hotel
          </Button>
        }
      />

      {/* Stats */}
      <div className="escalonado grid grid-cols-3 gap-3 sm:gap-4">
        <Metrica rotulo="Total Hoteles" valor={resumen.total} />
        <Metrica rotulo="Activos" valor={resumen.active} tono="text-[hsl(var(--acento-turquesa))]" />
        <Metrica rotulo="Inactivos" valor={resumen.inactive} tono="text-muted-foreground" />
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

      {/* Movil: tarjetas. Ocho columnas en 390 px esconden todo tras un
          arrastre lateral que nadie descubre. */}
      <Card className="shadow-sm md:hidden">
        {loading ? (
          <ul className="divide-y divide-border" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 p-4">
                <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : filteredTenants.length === 0 ? estadoVacio : (
          <ul className="escalonado divide-y divide-border">
            {filteredTenants.map((tenant) => (
              <li key={tenant.id} className="flex items-start gap-3 p-4">
                <IconoHotel activo={tenant.is_active !== false} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{tenant.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono tabular-nums">{tenant.ruc}</span>
                    {tenant.email && <> · {tenant.email}</>}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <InsigniaEstado activo={tenant.is_active !== false} />
                    <InsigniaSuscripcion estado={tenant.subscription_status} />
                    <span className="text-xs capitalize text-muted-foreground">{tenant.plan_codigo || 'prueba'}</span>
                    <PagadoHasta fecha={tenant.subscription_ends_at} />
                  </div>
                  <p className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                    <span className="inline-flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" aria-hidden="true" /> {tenant.habitaciones ?? 0} hab.</span>
                    <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden="true" /> {tenant.usuarios ?? 0} usuarios</span>
                  </p>
                </div>
                <AccionesHotel tenant={tenant} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Escritorio: la tabla */}
      <Card className="hidden shadow-sm md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Hotel</TableHead>
              <TableHead>RUC</TableHead>
              <TableHead>Contacto</TableHead>
              <TableHead className="text-right">Hab.</TableHead>
              <TableHead className="text-right">Usuarios</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={5} columnas={9} />
            ) : filteredTenants.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={9} className="p-0">{estadoVacio}</TableCell>
              </TableRow>
            ) : (
              filteredTenants.map((tenant) => (
                <TableRow key={tenant.id} className={cn(tenant.is_active === false && 'opacity-70')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <IconoHotel activo={tenant.is_active !== false} />
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
                  <TableCell className="text-right tabular-nums">{tenant.habitaciones ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{tenant.usuarios ?? 0}</TableCell>
                  <TableCell>
                    <InsigniaEstado activo={tenant.is_active !== false} />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => abrirPlan(tenant)}
                      className="group flex flex-col items-start gap-1 rounded-md text-left"
                      aria-label={`Cambiar plan de ${tenant.name}`}
                    >
                      <span className="text-sm font-medium capitalize group-hover:text-accent">{tenant.plan_codigo || 'prueba'}</span>
                      <InsigniaSuscripcion estado={tenant.subscription_status} />
                      <PagadoHasta fecha={tenant.subscription_ends_at} />
                    </button>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(tenant.created_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <AccionesHotel tenant={tenant} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Plan y pago (SUPER_ADMIN) */}
      <Dialog open={showPlanDialog} onOpenChange={setShowPlanDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Plan y pago</DialogTitle>
            <DialogDescription>
              {selectedTenant?.name}. Úsalo cuando el hotel paga en efectivo, por Yape o por
              transferencia, o para regalar un periodo. Lo que pongas aquí manda sobre la pasarela.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan-codigo">Plan</Label>
              <Select value={planForm.plan_codigo} onValueChange={(v) => setPlanForm({ ...planForm, plan_codigo: v })}>
                <SelectTrigger id="plan-codigo"><SelectValue placeholder="Elige un plan" /></SelectTrigger>
                <SelectContent>
                  {planes.map((p) => (
                    <SelectItem key={p.codigo} value={p.codigo}>
                      {p.nombre} · S/ {Number(p.precio_mensual || 0).toFixed(0)}/mes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-estado">Estado</Label>
              <Select value={planForm.subscription_status} onValueChange={(v) => setPlanForm({ ...planForm, subscription_status: v })}>
                <SelectTrigger id="plan-estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="activa">Activa (pagada)</SelectItem>
                  <SelectItem value="prueba">Prueba</SelectItem>
                  <SelectItem value="vencida">Vencida (en gracia, sigue entrando)</SelectItem>
                  <SelectItem value="suspendida">Suspendida (no puede operar)</SelectItem>
                  <SelectItem value="cancelada">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-vence">Pagado o en prueba hasta</Label>
              <Input id="plan-vence" type="date" value={planForm.vence} onChange={(e) => setPlanForm({ ...planForm, vence: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Se guarda en la misma fecha que escribe la pasarela al confirmar un pago.
                El acceso lo sigue decidiendo el estado.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-nota">Nota</Label>
              <Textarea id="plan-nota" rows={2} placeholder="Ej.: pagó S/ 119 en efectivo el 3/9, recibo 0012" value={planForm.nota} onChange={(e) => setPlanForm({ ...planForm, nota: e.target.value })} />
            </div>
          </div>
          {selectedTenant?.settings?.suscripcion_manual?.en && (
            <p className="text-xs text-muted-foreground">
              Último cambio manual: {formatDate(selectedTenant.settings.suscripcion_manual.en)} por {selectedTenant.settings.suscripcion_manual.por}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowPlanDialog(false)}>Cancelar</Button>
            <Button onClick={guardarPlan} disabled={savingPlan || !planForm.plan_codigo}>
              {savingPlan ? 'Guardando…' : 'Guardar plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    autoComplete="new-password"
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

      {/* Editar hotel */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Editar hotel</DialogTitle>
            <DialogDescription>
              Datos fiscales y de contacto de {selectedTenant?.name}. El plan y el estado se cambian aparte.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nombre *</Label>
              <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ruc">RUC *</Label>
              <Input
                id="edit-ruc"
                inputMode="numeric"
                maxLength={11}
                className="font-mono"
                value={editForm.ruc}
                onChange={(e) => setEditForm({ ...editForm, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-razon">Razón social</Label>
              <Input id="edit-razon" value={editForm.razon_social} onChange={(e) => setEditForm({ ...editForm, razon_social: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-comercial">Nombre comercial</Label>
              <Input id="edit-comercial" value={editForm.nombre_comercial} onChange={(e) => setEditForm({ ...editForm, nombre_comercial: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-address">Dirección</Label>
              <Input id="edit-address" value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Teléfono</Label>
              <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Correo</Label>
              <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-checkin">Hora de check-in</Label>
              <Input id="edit-checkin" type="time" value={editForm.checkin_time} onChange={(e) => setEditForm({ ...editForm, checkin_time: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-checkout">Hora de check-out</Label>
              <Input id="edit-checkout" type="time" value={editForm.checkout_time} onChange={(e) => setEditForm({ ...editForm, checkout_time: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={savingEdit}>{savingEdit ? 'Guardando…' : 'Guardar cambios'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usuarios del hotel */}
      <Dialog open={showUsersDialog} onOpenChange={setShowUsersDialog}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Usuarios de {selectedTenant?.nombre_comercial || selectedTenant?.name}</DialogTitle>
            <DialogDescription>
              Crea, edita, restablece contraseñas o elimina cuentas de este hotel. El último administrador activo no se puede quitar.
            </DialogDescription>
          </DialogHeader>
          {showUsersDialog && selectedTenant && (
            <GestionUsuarios tenantId={selectedTenant.id} compacto />
          )}
        </DialogContent>
      </Dialog>

      {/* Activar / desactivar */}
      <AlertDialog open={showActivoDialog} onOpenChange={setShowActivoDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">
              {selectedTenant?.is_active === false ? `¿Activar ${selectedTenant?.name}?` : `¿Desactivar ${selectedTenant?.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {selectedTenant?.is_active === false
                ? 'Sus usuarios vuelven a poder iniciar sesión con las mismas cuentas.'
                : 'Nadie de este hotel podrá iniciar sesión hasta que lo actives de nuevo. Sus datos no se tocan.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={cambiarActivo} disabled={ocupado}>
              {ocupado ? 'Guardando…' : (selectedTenant?.is_active === false ? 'Activar' : 'Desactivar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Eliminar hotel: exige escribir el nombre */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-destructive">Eliminar {selectedTenant?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran para siempre sus habitaciones, reservas, huéspedes, comprobantes, cajas y usuarios. No hay papelera ni forma de recuperarlo. Si solo quieres cortar el acceso, desactívalo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirmar-nombre">Escribe <span className="font-mono">{selectedTenant?.name}</span> para confirmar</Label>
            <Input
              id="confirmar-nombre"
              value={confirmacionNombre}
              onChange={(e) => setConfirmacionNombre(e.target.value)}
              autoComplete="off"
              placeholder={selectedTenant?.name}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); eliminarHotel(); }}
              disabled={ocupado || confirmacionNombre.trim() !== (selectedTenant?.name || '')}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {ocupado ? 'Eliminando…' : 'Eliminar para siempre'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Detalle del Hotel</DialogTitle>
          </DialogHeader>
          {selectedTenant && (
            <div className="space-y-5 py-2">
              <div className="flex items-center gap-4">
                <IconoHotel activo={selectedTenant.is_active !== false} grande />
                <div className="min-w-0">
                  <h3 className="font-heading truncate text-lg font-semibold">{selectedTenant.name}</h3>
                  <p className="truncate text-sm text-muted-foreground">{selectedTenant.nombre_comercial}</p>
                </div>
              </div>

              {/* Estadisticas */}
              <div className="grid grid-cols-2 gap-3 border-t pt-5 sm:grid-cols-4">
                <Cifra icono={BedDouble} rotulo="Habitaciones" valor={stats?.habitaciones} />
                <Cifra icono={CalendarDays} rotulo="Reservas del mes" valor={stats?.reservas_mes} />
                <Cifra icono={UserRound} rotulo="Huéspedes" valor={stats?.huespedes} />
                <Cifra icono={Users} rotulo="Usuarios" valor={stats ? `${stats.usuarios_activos}/${stats.usuarios}` : undefined} />
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                Última actividad: {stats?.ultima_actividad ? formatDateTime(stats.ultima_actividad) : 'sin movimientos todavía'}
                {stats?.estancias_activas > 0 && <> · {stats.estancias_activas} estancias en curso</>}
              </p>

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
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Plan</dt>
                  <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm capitalize">
                    {selectedTenant.plan_codigo || 'prueba'} <InsigniaSuscripcion estado={selectedTenant.subscription_status} />
                  </dd>
                  <dd className="mt-1"><PagadoHasta fecha={selectedTenant.subscription_ends_at} /></dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Check-in / check-out</dt>
                  <dd className="mt-1 text-sm tabular-nums">{selectedTenant.checkin_time || '14:00'} · {selectedTenant.checkout_time || '12:00'}</dd>
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

              {/* Historial de pagos. Es la otra mitad de "Plan y pago": el
                  dialogo de al lado deja poner el plan a mano, y aqui se ve
                  lo que de verdad se cobro. */}
              <div className="border-t pt-5">
                <h4 className="font-heading text-base font-semibold">Pagos</h4>
                {pagos === null ? (
                  <p className="mt-2 text-sm text-muted-foreground">Cargando…</p>
                ) : pagos.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Todavía no hay cobros registrados para este hotel.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-border rounded-lg border">
                    {pagos.map((pago) => (
                      <li key={pago.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium capitalize">
                            {pago.plan_codigo} · {pago.periodo}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            {pago.izipay_order_number || pago.metodo || '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold tabular-nums">{formatCurrency(pago.monto)}</p>
                          <p className="mt-1 flex items-center justify-end gap-2 text-xs text-muted-foreground tabular-nums">
                            <InsigniaPago estado={pago.estado} />
                            {formatDate(pago.confirmado_en || pago.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

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

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Creado: {formatDate(selectedTenant.created_at)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setShowDetailDialog(false); abrirEditar(selectedTenant); }}>
                    <Pencil className="h-4 w-4" aria-hidden="true" /> Editar
                  </Button>
                  <Button size="sm" onClick={() => entrarComo(selectedTenant)} disabled={selectedTenant.is_active === false}>
                    <LogIn className="h-4 w-4" aria-hidden="true" /> Entrar como
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Tenants;
