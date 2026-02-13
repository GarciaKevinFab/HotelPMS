import React, { useState, useEffect } from 'react';
import { 
  BedDouble, 
  UserCheck, 
  UserMinus, 
  SprayCan, 
  Wallet, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Receipt
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { dashboardAPI } from '../lib/api';
import { formatCurrency, formatDate, getStatusLabel } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';

const COLORS = {
  rooms: '#3B82F6',
  extras: '#10B981',
  occupied: '#3B82F6',
  vacant_clean: '#10B981',
  vacant_dirty: '#F59E0B',
  out_of_order: '#F43F5E',
  accepted: '#10B981',
  rejected: '#F43F5E',
  pending: '#F59E0B',
  voided: '#64748B'
};

const PAYMENT_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E'];

export function Dashboard() {
  const { user } = useAuth();
  const [kpis, setKpis] = useState(null);
  const [revenueData, setRevenueData] = useState([]);
  const [occupancyData, setOccupancyData] = useState([]);
  const [paymentMethodsData, setPaymentMethodsData] = useState([]);
  const [roomStatusData, setRoomStatusData] = useState({});
  const [invoicingData, setInvoicingData] = useState([]);
  const [topProductsData, setTopProductsData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [kpisRes, revenueRes, occupancyRes, paymentRes, roomStatusRes, invoicingRes, topProductsRes] = await Promise.all([
        dashboardAPI.kpis(),
        dashboardAPI.revenueChart(30),
        dashboardAPI.occupancyChart(30),
        dashboardAPI.paymentMethodsChart(),
        dashboardAPI.roomStatusChart(),
        dashboardAPI.invoicingStatusChart(),
        dashboardAPI.topProductsChart()
      ]);
      
      setKpis(kpisRes.data);
      setRevenueData(revenueRes.data);
      setOccupancyData(occupancyRes.data);
      setPaymentMethodsData(paymentRes.data);
      setRoomStatusData(roomStatusRes.data);
      setInvoicingData(invoicingRes.data);
      setTopProductsData(topProductsRes.data);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="kpi-card">
              <div className="skeleton h-4 w-20 mb-2" />
              <div className="skeleton h-8 w-16 mb-1" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const todayKpis = [
    { 
      label: 'Ocupación', 
      value: `${kpis?.today?.occupancy_rate || 0}%`, 
      subtext: `${kpis?.today?.rooms_occupied || 0}/${kpis?.today?.rooms_total || 0} hab.`,
      icon: BedDouble,
      color: 'text-blue-600'
    },
    { 
      label: 'Llegadas Hoy', 
      value: kpis?.today?.arrivals || 0, 
      subtext: 'Check-ins esperados',
      icon: UserCheck,
      color: 'text-emerald-600'
    },
    { 
      label: 'Salidas Hoy', 
      value: kpis?.today?.departures || 0, 
      subtext: 'Check-outs esperados',
      icon: UserMinus,
      color: 'text-amber-600'
    },
    { 
      label: 'Hab. Sucias', 
      value: kpis?.today?.rooms_dirty || 0, 
      subtext: 'Pendientes limpieza',
      icon: SprayCan,
      color: kpis?.today?.rooms_dirty > 5 ? 'text-rose-600' : 'text-slate-600'
    },
    { 
      label: 'Ingresos Hoy', 
      value: formatCurrency(kpis?.today?.revenue || 0), 
      subtext: 'Pagos recibidos',
      icon: Wallet,
      color: 'text-emerald-600'
    },
    { 
      label: 'Saldo Pendiente', 
      value: formatCurrency(kpis?.today?.outstanding || 0), 
      subtext: 'En folios abiertos',
      icon: AlertTriangle,
      color: kpis?.today?.outstanding > 0 ? 'text-amber-600' : 'text-slate-600'
    },
  ];

  const roomStatusArray = [
    { name: 'Ocupadas', value: roomStatusData.occupied || 0, color: COLORS.occupied },
    { name: 'Disp. Limpias', value: roomStatusData.vacant_clean || 0, color: COLORS.vacant_clean },
    { name: 'Disp. Sucias', value: roomStatusData.vacant_dirty || 0, color: COLORS.vacant_dirty },
    { name: 'Fuera Servicio', value: roomStatusData.out_of_order || 0, color: COLORS.out_of_order },
  ];

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Resumen operativo del día</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Calendar className="w-4 h-4" />
          {formatDate(new Date().toISOString())}
        </div>
      </div>

      {/* KPI Cards - Today */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {todayKpis.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card key={index} className="kpi-card" data-testid={`kpi-card-${index}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-500">{kpi.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{kpi.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{kpi.subtext}</p>
                </div>
                <div className={`p-2 rounded-lg bg-slate-100 ${kpi.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Monthly KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Ingresos del Mes</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(kpis?.month?.revenue || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">ADR</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(kpis?.month?.adr || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">RevPAR</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{formatCurrency(kpis?.month?.revpar || 0)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Cancelaciones</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{kpis?.month?.cancellations || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">No Shows</p>
          <p className="text-xl font-bold text-slate-900 mt-1">{kpis?.month?.no_shows || 0}</p>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <Card className="chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Ingresos Últimos 30 Días</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }} 
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(val) => `S/${val/1000}k`} />
                <Tooltip 
                  formatter={(value) => formatCurrency(value)}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="rooms" 
                  name="Habitaciones"
                  stroke={COLORS.rooms} 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="extras" 
                  name="Extras"
                  stroke={COLORS.extras} 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Occupancy Chart */}
        <Card className="chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Ocupación Últimos 30 Días</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={occupancyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis 
                  dataKey="date" 
                  tick={{ fontSize: 11 }} 
                  tickFormatter={(val) => val.slice(5)}
                />
                <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                <Tooltip 
                  formatter={(value) => `${value}%`}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Line 
                  type="monotone" 
                  dataKey="rate" 
                  name="Ocupación"
                  stroke={COLORS.rooms} 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Room Status */}
        <Card className="chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Estado de Habitaciones</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={roomStatusArray}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {roomStatusArray.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {roomStatusArray.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-slate-600">{item.name}: <span className="font-medium">{item.value}</span></span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Métodos de Pago (Mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={paymentMethodsData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="total"
                  nameKey="method"
                >
                  {paymentMethodsData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-2">
              {paymentMethodsData.map((item, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} />
                    <span className="text-slate-600">{getStatusLabel(item.method)}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Invoicing Status */}
        <Card className="chart-container">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Facturación (Mes)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={invoicingData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis 
                  type="category" 
                  dataKey="status" 
                  tick={{ fontSize: 11 }} 
                  tickFormatter={(val) => getStatusLabel(val)}
                  width={80}
                />
                <Tooltip formatter={(value, name) => [name === 'count' ? value : formatCurrency(value), name === 'count' ? 'Cantidad' : 'Total']} />
                <Bar dataKey="count" fill={COLORS.rooms} name="Cantidad" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card className="chart-container">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Top 10 Productos/Servicios (Mes)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topProductsData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(val) => formatCurrency(val)} />
              <YAxis 
                type="category" 
                dataKey="product" 
                tick={{ fontSize: 11 }} 
                width={150}
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Bar dataKey="total" fill={COLORS.extras} name="Ingresos" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
