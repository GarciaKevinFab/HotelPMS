import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  Plus,
  Search,
  MoreHorizontal,
  Edit,
  Key,
  Trash2,
  UserCheck,
  UserX,
  UserRound,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { EstadoVacio } from './EstadoVacio';
import { EsqueletoFilas } from './Esqueleto';
import { usersAPI } from '../lib/api';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

/**
 * Usuarios de UN hotel: listar, crear, editar, restablecer contrasena,
 * activar/desactivar y eliminar.
 *
 * POR QUE ES UN COMPONENTE Y NO UNA PANTALLA
 *
 *   Lo necesitan dos sitios con dos personas distintas delante: el ADMIN en
 *   Configuracion > Usuarios (su propio hotel) y el SUPER_ADMIN en Hoteles >
 *   Usuarios del hotel (cualquier hotel, en un dialogo). Antes eran dos
 *   copias que ya habian divergido: una solo creaba y apagaba con un
 *   interruptor, la otra tenia el resto. Una sola pieza, una sola conducta.
 *
 *   `tenantId` solo lo pasa el SUPER_ADMIN; el ADMIN no lo necesita porque
 *   el servidor ya sabe su hotel por el token y lo ignora si viniera.
 */

export const ROLES_USUARIO = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'RECEPTIONIST', label: 'Recepcionista' },
  { value: 'HOUSEKEEPING', label: 'Limpieza' },
  { value: 'SECURITY', label: 'Seguridad' },
];

const ROTULO_ROL = Object.fromEntries(ROLES_USUARIO.map((r) => [r.value, r.label]));
ROTULO_ROL.SUPER_ADMIN = 'Super Admin';

/* Insignias con los acentos de la marca: el administrador lleva el turquesa
   principal, recepcion el lima, limpieza el oliva y seguridad queda neutro.
   El fucsia se reserva para lo que reclama atencion (inactivo, super admin). */
const COLOR_ROL = {
  ADMIN: 'bg-[hsl(var(--acento-turquesa)/0.12)] text-[hsl(var(--insignia-turquesa))] border-[hsl(var(--acento-turquesa)/0.3)]',
  RECEPTIONIST: 'bg-[hsl(var(--acento-lima)/0.14)] text-[hsl(var(--acento-lima))] border-[hsl(var(--acento-lima)/0.3)]',
  HOUSEKEEPING: 'bg-[hsl(var(--acento-oliva)/0.14)] text-[hsl(var(--acento-oliva))] border-[hsl(var(--acento-oliva)/0.3)]',
  SECURITY: 'bg-muted text-muted-foreground border-border',
  SUPER_ADMIN: 'bg-[hsl(var(--acento-fucsia)/0.10)] text-[hsl(var(--insignia-fucsia))] border-[hsl(var(--acento-fucsia)/0.25)]',
};

export function InsigniaRol({ rol, className }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', COLOR_ROL[rol] || COLOR_ROL.SECURITY, className)}>
      {ROTULO_ROL[rol] || rol}
    </Badge>
  );
}

function InsigniaActivo({ activo }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', activo ? 'status-vacant-clean' : 'status-occupied')}>
      {activo ? 'Activo' : 'Inactivo'}
    </Badge>
  );
}

const FORM_NUEVO = { full_name: '', email: '', password: '', role: 'RECEPTIONIST' };

export function GestionUsuarios({ tenantId = null, compacto = false, className }) {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [seleccionado, setSeleccionado] = useState(null);
  const [dialogo, setDialogo] = useState(null); // 'crear' | 'editar' | 'clave' | 'eliminar'

  const [nuevo, setNuevo] = useState(FORM_NUEVO);
  const [edicion, setEdicion] = useState({ full_name: '', email: '', role: 'RECEPTIONIST', is_active: true });
  const [clave, setClave] = useState({ password: '', confirmar: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await usersAPI.list(tenantId ? { tenant_id: tenantId } : undefined);
      setUsuarios(data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) =>
      u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  }, [usuarios, busqueda]);

  // El id del usuario logueado llega como `id` desde /auth/me.
  const esUnoMismo = (u) => u.id === user?.id;
  const adminsActivos = usuarios.filter((u) => u.role === 'ADMIN' && u.is_active).length;
  const esUltimoAdmin = (u) => u.role === 'ADMIN' && u.is_active && adminsActivos <= 1;

  const cerrar = () => { setDialogo(null); setSeleccionado(null); };

  const abrirEditar = (u) => {
    setSeleccionado(u);
    setEdicion({ full_name: u.full_name || '', email: u.email || '', role: u.role, is_active: Boolean(u.is_active) });
    setDialogo('editar');
  };
  const abrirClave = (u) => { setSeleccionado(u); setClave({ password: '', confirmar: '' }); setDialogo('clave'); };
  const abrirEliminar = (u) => { setSeleccionado(u); setDialogo('eliminar'); };

  const crear = async () => {
    if (!nuevo.full_name.trim() || !nuevo.email.trim() || !nuevo.password) {
      toast.error('Nombre, correo y contraseña son obligatorios');
      return;
    }
    if (nuevo.password.length < 8) {
      toast.error('La contraseña necesita al menos 8 caracteres');
      return;
    }
    setGuardando(true);
    try {
      await usersAPI.create({ ...nuevo, full_name: nuevo.full_name.trim(), email: nuevo.email.trim(), tenant_id: tenantId || user?.tenant_id });
      toast.success('Usuario creado');
      setNuevo(FORM_NUEVO);
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo crear el usuario');
    } finally {
      setGuardando(false);
    }
  };

  const guardarEdicion = async () => {
    if (!edicion.full_name.trim() || !edicion.email.trim()) {
      toast.error('Nombre y correo son obligatorios');
      return;
    }
    setGuardando(true);
    try {
      const cambios = { full_name: edicion.full_name.trim(), email: edicion.email.trim(), role: edicion.role };
      if (edicion.is_active !== Boolean(seleccionado.is_active)) cambios.is_active = edicion.is_active;
      await usersAPI.update(seleccionado.id, cambios);
      toast.success('Usuario actualizado');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo actualizar el usuario');
    } finally {
      setGuardando(false);
    }
  };

  const restablecerClave = async () => {
    if (clave.password.length < 8) {
      toast.error('La contraseña necesita al menos 8 caracteres');
      return;
    }
    if (clave.password !== clave.confirmar) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    setGuardando(true);
    try {
      await usersAPI.resetPassword(seleccionado.id, clave.password);
      toast.success('Contraseña restablecida. Entrégasela por un canal seguro.');
      cerrar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo restablecer la contraseña');
    } finally {
      setGuardando(false);
    }
  };

  const alternarActivo = async (u) => {
    try {
      await usersAPI.update(u.id, { is_active: !u.is_active });
      toast.success(u.is_active ? 'Usuario desactivado' : 'Usuario activado');
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cambiar el estado');
    }
  };

  const eliminar = async () => {
    setGuardando(true);
    try {
      await usersAPI.delete(seleccionado.id);
      toast.success('Usuario eliminado');
      cerrar();
      cargar();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo eliminar el usuario');
    } finally {
      setGuardando(false);
    }
  };

  /* Un solo menu para la tabla (escritorio) y las tarjetas (movil): una accion
     nueva aparece en las dos vistas o en ninguna. */
  const Acciones = ({ u }) => {
    if (esUnoMismo(u)) {
      return <span className="text-xs text-muted-foreground">Tu cuenta</span>;
    }
    const ultimo = esUltimoAdmin(u);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Acciones de ${u.full_name}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => abrirEditar(u)}>
            <Edit className="mr-2 h-4 w-4" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => abrirClave(u)}>
            <Key className="mr-2 h-4 w-4" /> Restablecer contraseña
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => alternarActivo(u)} disabled={ultimo}>
            {u.is_active
              ? <><UserX className="mr-2 h-4 w-4" /> Desactivar</>
              : <><UserCheck className="mr-2 h-4 w-4" /> Activar</>}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => abrirEliminar(u)}
            disabled={ultimo}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const selectorRol = (valor, onCambio, id) => (
    <Select value={valor} onValueChange={onCambio}>
      <SelectTrigger id={id}><SelectValue /></SelectTrigger>
      <SelectContent>
        {ROLES_USUARIO.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className={cn('space-y-4', className)} data-testid="gestion-usuarios">
      {/* Buscador + accion principal */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            aria-label="Buscar usuario por nombre o correo"
            placeholder="Buscar por nombre o correo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button className="w-full sm:w-auto sm:shrink-0" onClick={() => { setNuevo(FORM_NUEVO); setDialogo('crear'); }} data-testid="add-user-btn">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo usuario
        </Button>
      </div>

      {/* Movil: tarjetas */}
      <ul className="escalonado divide-y divide-border sm:hidden">
        {loading && [0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 py-3" aria-hidden="true">
            <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          </li>
        ))}
        {!loading && filtrados.map((u) => (
          <li key={u.id} className="flex items-start gap-3 py-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted">
              <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{u.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <InsigniaRol rol={u.role} />
                <InsigniaActivo activo={u.is_active} />
              </div>
            </div>
            <Acciones u={u} />
          </li>
        ))}
      </ul>

      {/* Escritorio: tabla */}
      <div className={cn('hidden sm:block', !compacto && 'rounded-lg border')}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={4} columnas={4} />
            ) : filtrados.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="p-0">
                  <EstadoVacio
                    compacto={compacto}
                    icono={Users}
                    titulo="Este hotel no tiene usuarios"
                    descripcion="Cada persona entra con su propia cuenta y queda registrada en lo que hace. Crea la primera."
                    accion="Nuevo usuario"
                    onAccion={() => setDialogo('crear')}
                    filtrado={usuarios.length > 0}
                    onLimpiar={() => setBusqueda('')}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filtrados.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
                        {u.full_name?.trim()?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {u.full_name}
                          {esUnoMismo(u) && <span className="ml-2 text-xs font-normal text-[hsl(var(--acento-turquesa))]">(tú)</span>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><InsigniaRol rol={u.role} /></TableCell>
                  <TableCell><InsigniaActivo activo={u.is_active} /></TableCell>
                  <TableCell className="text-right"><Acciones u={u} /></TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {!loading && filtrados.length === 0 && (
        <div className="sm:hidden">
          <EstadoVacio
            compacto
            icono={Users}
            titulo="Este hotel no tiene usuarios"
            descripcion="Crea la primera cuenta para que el personal entre con su propio usuario."
            accion="Nuevo usuario"
            onAccion={() => setDialogo('crear')}
            filtrado={usuarios.length > 0}
            onLimpiar={() => setBusqueda('')}
          />
        </div>
      )}

      {/* Crear */}
      <Dialog open={dialogo === 'crear'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Nuevo usuario</DialogTitle>
            <DialogDescription>Entrará con este correo y la contraseña que definas aquí.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nuevo-nombre">Nombre completo *</Label>
              <Input id="nuevo-nombre" value={nuevo.full_name} onChange={(e) => setNuevo({ ...nuevo, full_name: e.target.value })} placeholder="Ana Quispe" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nuevo-email">Correo *</Label>
              <Input id="nuevo-email" type="email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} placeholder="ana@hotel.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nuevo-rol">Rol</Label>
              {selectorRol(nuevo.role, (v) => setNuevo({ ...nuevo, role: v }), 'nuevo-rol')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nuevo-password">Contraseña *</Label>
              <Input id="nuevo-password" type="password" autoComplete="new-password" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button onClick={crear} disabled={guardando}>{guardando ? 'Creando…' : 'Crear usuario'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={dialogo === 'editar'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Editar usuario</DialogTitle>
            <DialogDescription>{seleccionado?.email}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-nombre">Nombre completo *</Label>
              <Input id="edit-nombre" value={edicion.full_name} onChange={(e) => setEdicion({ ...edicion, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Correo *</Label>
              <Input id="edit-email" type="email" value={edicion.email} onChange={(e) => setEdicion({ ...edicion, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-rol">Rol</Label>
              {selectorRol(edicion.role, (v) => setEdicion({ ...edicion, role: v }), 'edit-rol')}
            </div>
            <Label htmlFor="edit-activo" className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-md border px-3 sm:col-span-2">
              <span className="text-sm">
                {edicion.is_active ? 'Cuenta activa' : 'Cuenta desactivada'}
                <span className="block text-xs font-normal text-muted-foreground">Desactivada, no puede iniciar sesión.</span>
              </span>
              <Switch id="edit-activo" checked={edicion.is_active} onCheckedChange={(v) => setEdicion({ ...edicion, is_active: v })} />
            </Label>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button onClick={guardarEdicion} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restablecer contrasena */}
      <Dialog open={dialogo === 'clave'} onOpenChange={(o) => !o && cerrar()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">Restablecer contraseña</DialogTitle>
            <DialogDescription>
              Nueva contraseña para <span className="font-medium text-foreground">{seleccionado?.full_name}</span>. La anterior deja de servir al instante.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="clave-nueva">Nueva contraseña</Label>
              <Input id="clave-nueva" type="password" autoComplete="new-password" value={clave.password} onChange={(e) => setClave({ ...clave, password: e.target.value })} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clave-confirmar">Repetir contraseña</Label>
              <Input id="clave-confirmar" type="password" autoComplete="new-password" value={clave.confirmar} onChange={(e) => setClave({ ...clave, confirmar: e.target.value })} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={cerrar}>Cancelar</Button>
            <Button onClick={restablecerClave} disabled={guardando}>{guardando ? 'Guardando…' : 'Restablecer'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Eliminar */}
      <AlertDialog open={dialogo === 'eliminar'} onOpenChange={(o) => !o && cerrar()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading">¿Eliminar a {seleccionado?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Pierde el acceso de inmediato y no se puede deshacer. Si ya registró movimientos (cajas, reservas), el sistema no lo dejará borrar: desactívalo en su lugar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar} disabled={guardando} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {guardando ? 'Eliminando…' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GestionUsuarios;
