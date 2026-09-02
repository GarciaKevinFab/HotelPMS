import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  BedDouble,
  ClipboardList,
  Receipt,
  Wallet,
  SprayCan,
  Wrench,
  Bell,
  Settings,
  Building2,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Tag,
  UsersRound,
  UserCog,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

/* EL MENU, EN CUATRO GRUPOS
 *
 *   Eran dieciseis entradas seguidas, del panel a la configuracion, sin nada
 *   que las separara. El recepcionista que busca "Caja" tenia que leerlas
 *   todas. Agrupadas por quien las usa -recepcion, el hotel como inventario,
 *   el dinero, la administracion-, la vista salta al grupo y de ahi al item.
 *
 *   Los roles se conservan tal cual: lo que cambia es el orden y los rotulos,
 *   no quien ve que. Un grupo que se queda sin entradas para un rol no se
 *   pinta.
 */
const secciones = [
  {
    rotulo: 'Recepción',
    items: [
      { path: '/dashboard', icon: LayoutDashboard, label: 'Panel', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/calendar', icon: CalendarDays, label: 'Calendario', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/reservations', icon: ClipboardList, label: 'Reservas', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'], exacto: true },
      { path: '/reservations/groups', icon: UsersRound, label: 'Grupos', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/guests', icon: Users, label: 'Huéspedes', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
    ],
  },
  {
    rotulo: 'Hotel',
    items: [
      { path: '/rooms', icon: BedDouble, label: 'Habitaciones', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/rates', icon: Tag, label: 'Tarifas', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { path: '/housekeeping', icon: SprayCan, label: 'Limpieza', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPING'] },
      { path: '/maintenance', icon: Wrench, label: 'Mantenimiento', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
    ],
  },
  {
    rotulo: 'Dinero',
    items: [
      { path: '/cash-shift', icon: Wallet, label: 'Caja', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/invoices', icon: Receipt, label: 'Facturación', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
      { path: '/reports', icon: BarChart3, label: 'Reportes', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST'] },
    ],
  },
  {
    rotulo: 'Administración',
    items: [
      { path: '/alerts', icon: Bell, label: 'Alertas', roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPING'] },
      { path: '/employees', icon: UserCog, label: 'Empleados', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { path: '/settings', icon: Settings, label: 'Configuración', roles: ['SUPER_ADMIN', 'ADMIN'] },
      { path: '/tenants', icon: Building2, label: 'Hoteles', roles: ['SUPER_ADMIN'] },
    ],
  },
];

function useMediaQuery(consulta) {
  const [coincide, setCoincide] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(consulta).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = (e) => setCoincide(e.matches);
    mq.addEventListener('change', alCambiar);
    setCoincide(mq.matches);
    return () => mq.removeEventListener('change', alCambiar);
  }, [consulta]);
  return coincide;
}

export function Sidebar({ collapsed, onToggle, abierto = false, onNavegar }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Plegar solo existe en escritorio: en el telefono el menu es un cajon
  // que se abre entero, aunque el usuario lo hubiera plegado en su PC.
  const esEscritorio = useMediaQuery('(min-width: 1024px)');
  const plegado = collapsed && esEscritorio;

  const visibles = secciones
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(user?.role)) }))
    .filter((s) => s.items.length > 0);

  const estaActivo = (item) => {
    if (item.exacto) {
      // "Reservas" no debe encenderse cuando estamos en "Grupos".
      return location.pathname === item.path ||
        (location.pathname.startsWith(item.path + '/') && !location.pathname.startsWith(item.path + '/groups'));
    }
    return location.pathname === item.path || location.pathname.startsWith(item.path + '/');
  };

  const Enlace = ({ item }) => {
    const Icon = item.icon;
    const activo = estaActivo(item);
    const enlace = (
      <NavLink
        onClick={onNavegar}
        to={item.path}
        aria-current={activo ? 'page' : undefined}
        className={cn('sidebar-nav-item', activo && 'active')}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2} aria-hidden="true" />
        {!plegado && <span className="truncate">{item.label}</span>}
        {plegado && <span className="sr-only">{item.label}</span>}
      </NavLink>
    );

    if (!plegado) return enlace;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{enlace}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={10} className="bg-zen-900 text-white border-zen-800">
          {item.label}
        </TooltipContent>
      </Tooltip>
    );
  };

  const inicial = user?.full_name?.trim()?.charAt(0)?.toUpperCase() || 'U';

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn('sidebar flex flex-col', collapsed && 'collapsed', abierto && 'open')}
        aria-label="Menú principal"
      >
        {/* Marca: el logotipo real. Si el archivo no llega, se oculta la
            imagen en vez de dejar el texto alternativo suelto junto al nombre. */}
        <div className={cn('flex h-16 shrink-0 items-center border-b border-zen-800', plegado ? 'justify-center px-0' : 'px-4')}>
          <NavLink to="/dashboard" className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-turquesa" onClick={onNavegar}>
            <img
              src="/logo-zenstay.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            {!plegado && (
              <span className="font-heading text-lg font-bold tracking-tight text-white">ZenStay</span>
            )}
            <span className="sr-only">ZenStay, ir al panel</span>
          </NavLink>
        </div>

        {/* Navegacion por grupos */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2">
          {visibles.map((seccion) => (
            <div key={seccion.rotulo}>
              <div className="sidebar-seccion" aria-hidden={plegado ? 'true' : undefined}>
                {seccion.rotulo}
              </div>
              <ul className="space-y-0.5">
                {seccion.items.map((item) => (
                  <li key={item.path}>
                    <Enlace item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Usuario y salida */}
        <div className="shrink-0 border-t border-zen-800 p-3">
          {!plegado && (
            <div className="mb-1 flex items-center gap-3 px-2 py-2">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zen-800 text-sm font-semibold text-zen-turquesa ring-1 ring-zen-700">
                {inicial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user?.full_name}</p>
                <p className="truncate text-xs text-zen-400">{user?.email}</p>
              </div>
            </div>
          )}

          {plegado ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={logout} className="sidebar-nav-item w-full text-zen-400 hover:text-white" aria-label="Cerrar Sesión">
                  <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10} className="bg-zen-900 text-white border-zen-800">
                Cerrar Sesión
              </TooltipContent>
            </Tooltip>
          ) : (
            <button onClick={logout} className="sidebar-nav-item w-full text-zen-400 hover:text-white">
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>Cerrar Sesión</span>
            </button>
          )}
        </div>

        {/* Contraer o desplegar. Solo en escritorio: en el telefono el menu se
            abre y se cierra con la hamburguesa. */}
        <button
          onClick={onToggle}
          aria-label={collapsed ? 'Desplegar el menú' : 'Contraer el menú'}
          className="absolute -right-3 top-[4.5rem] hidden h-6 w-6 items-center justify-center rounded-full border border-zen-700 bg-zen-800 text-zen-400 shadow-sm transition-colors duration-150 hover:bg-zen-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-turquesa lg:flex"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </aside>
    </TooltipProvider>
  );
}

export default Sidebar;
