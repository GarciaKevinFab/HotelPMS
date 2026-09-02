import React from 'react';
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
  DollarSign,
  UsersRound
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

const navItems = [
  { 
    path: '/dashboard', 
    icon: LayoutDashboard, 
    label: 'Panel',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/calendar', 
    icon: CalendarDays, 
    label: 'Calendario',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/reservations', 
    icon: ClipboardList, 
    label: 'Reservas',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/reservations/groups', 
    icon: UsersRound, 
    label: 'Grupos',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/guests', 
    icon: Users, 
    label: 'Huéspedes',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/rooms', 
    icon: BedDouble, 
    label: 'Habitaciones',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/rates', 
    icon: DollarSign, 
    label: 'Tarifas',
    roles: ['SUPER_ADMIN', 'ADMIN']
  },
  { 
    path: '/cash-shift', 
    icon: Wallet, 
    label: 'Caja',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/invoices', 
    icon: Receipt, 
    label: 'Facturación',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/housekeeping', 
    icon: SprayCan, 
    label: 'Limpieza',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPING']
  },
  { 
    path: '/maintenance', 
    icon: Wrench, 
    label: 'Mantenimiento',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  { 
    path: '/alerts', 
    icon: Bell, 
    label: 'Alertas',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST', 'HOUSEKEEPING']
  },
  { 
    path: '/reports', 
    icon: BarChart3, 
    label: 'Reportes',
    roles: ['SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST']
  },
  {
    path: '/employees',
    icon: Users,
    label: 'Empleados',
    roles: ['SUPER_ADMIN', 'ADMIN']
  },
  {
    path: '/settings',
    icon: Settings,
    label: 'Configuración',
    roles: ['SUPER_ADMIN', 'ADMIN']
  },
  { 
    path: '/tenants', 
    icon: Building2, 
    label: 'Hoteles',
    roles: ['SUPER_ADMIN']
  },
];

export function Sidebar({ collapsed, onToggle }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  const filteredNav = navItems.filter(item => 
    item.roles.includes(user?.role)
  );

  return (
    <aside className={cn(
      "sidebar flex flex-col",
      collapsed && "collapsed"
    )}>
      {/*
        Marca. Antes era un icono genérico de edificio sobre un cuadrado azul
        y el rótulo "HotelPMS" — ni el logotipo registrado ni el nombre del
        producto. El azul además no aparece en ninguna parte de la identidad:
        la marca es fucsia, turquesa, lima y oliva.
      */}
      <div className="h-16 flex items-center px-4 border-b border-zen-800">
        {!collapsed ? (
          <div className="flex items-center gap-2.5">
            <img src="/logo-zenstay.png" alt="ZenStay" className="h-9 w-9 object-contain" />
            <h1 className="text-white font-bold text-lg tracking-tight">ZenStay</h1>
          </div>
        ) : (
          <img src="/logo-zenstay.png" alt="ZenStay" className="h-9 w-9 object-contain mx-auto" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <ul className="space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path || 
                           location.pathname.startsWith(item.path + '/');
            
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={cn(
                    "sidebar-nav-item",
                    isActive && "active",
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="p-3 border-t border-zen-800">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 bg-zen-700 rounded-full flex items-center justify-center text-sm font-medium text-white">
              {user?.full_name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
              <p className="text-xs text-zen-400 truncate">{user?.email}</p>
            </div>
          </div>
        ) : null}
        
        <button
          onClick={logout}
          className={cn(
            "sidebar-nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-900/20",
            collapsed && "justify-center px-0"
          )}
          title={collapsed ? "Cerrar Sesión" : undefined}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span>Cerrar Sesión</span>}
        </button>

        {/*
          Aquí llegué a poner una firma de Star Insights, hasta darme cuenta de
          que ya existe uno flotante en frontend/public/index.html, visible en
          todas las pantallas del sistema. Dos firmas en la misma vista es
          ruido, así que se queda la que ya estaba — solo hubo que corregirle
          el nombre: decía "Confort Inn", que es el cliente, no el producto.
        */}
      </div>

      {/* Collapse button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-zen-800 border border-zen-700 rounded-full flex items-center justify-center text-zen-400 hover:text-white hover:bg-zen-700 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}

export default Sidebar;
