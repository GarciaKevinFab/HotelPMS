import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BedDouble,
  UserCheck,
  UserMinus,
  Wallet,
  Calendar,
  ArrowRight,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  BarChart3,
  CreditCard,
  Receipt,
  ShoppingBag,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EsqueletoPanel } from '../components/Esqueleto';
import { dashboardAPI } from '../lib/api';
import { formatCurrency, formatDate, getStatusLabel, cn } from '../lib/utils';

/* LOS COLORES DE LOS GRAFICOS SALEN DE LOS MISMOS TOKENS QUE EL RESTO
 *
 *   Estaban escritos a mano con hexadecimales de Tailwind: azul #3B82F6 para
 *   las habitaciones, verde #10B981 para los extras, y todavia quedaban dos
 *   sueltos (#F59E0B y #64748B). Ahora TODOS leen `--chart-*` y `--status-*`,
 *   que ya estaban definidos en index.css con los colores del logotipo. SVG
 *   resuelve var() igual que cualquier otra propiedad, asi que Recharts los
 *   acepta tal cual y hay una sola fuente de verdad.
 */
const COLORS = {
  rooms: 'hsl(var(--chart-1))',
  extras: 'hsl(var(--chart-4))',
  occupied: 'hsl(var(--status-occupied))',
  vacant_clean: 'hsl(var(--status-vacant-clean))',
  vacant_dirty: 'hsl(var(--status-dirty))',
  out_of_order: 'hsl(var(--status-ooo))',
  accepted: 'hsl(var(--chart-1))',
  rejected: 'hsl(var(--status-occupied))',
  pending: 'hsl(var(--chart-3))',
  voided: 'hsl(var(--status-checkout))',
};

const PAYMENT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-3))',
];

// Ejes y rejilla en los grises de la marca, sin lineas de eje: la rejilla
// punteada ya marca la escala y la linea negra de serie solo anadia ruido.
const EJE = {
  tick: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
  axisLine: false,
  tickLine: false,
};
const TOOLTIP_ESTILO = {
  borderRadius: 8,
  border: '1px solid hsl(var(--border))',
  boxShadow: 'var(--sombra-2)',
  fontSize: 12,
  padding: '8px 10px',
};

/* ESTADO VACIO DENTRO DEL GRAFICO
 *
 *   Un grafico sin datos pintaba ejes, rejilla y leyenda alrededor de nada:
 *   seis marcos vacios en el primer panel que ve un hotel recien dado de
 *   alta. Ahora ocupa el mismo alto que ocuparia el grafico -para que la
 *   pagina no salte cuando lleguen los datos- y dice de donde saldran. */
function GraficoVacio({ icono: Icono, mensaje, enlace, accion, alto = 250 }) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ height: alto }}
      role="status"
    >
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[hsl(var(--accent)/.10)] text-[hsl(var(--accent))]">
        <Icono className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="max-w-[26ch] text-sm text-muted-foreground">{mensaje}</p>
      {enlace && (
        <Link
          to={enlace}
          className="mt-3 inline-flex items-center gap-1 rounded-md text-sm font-medium text-[hsl(var(--accent))] transition-colors duration-150 hover:text-[hsl(var(--accent-hover))] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {accion}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

function TituloGrafico({ children, extra }) {
  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 p-5 pb-3">
      <CardTitle className="font-heading text-[15px] font-semibold">{children}</CardTitle>
      {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
    </CardHeader>
  );
}

export function Dashboard() {
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

  const fechaHoy = (
    <div className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-muted-foreground shadow-sm tabular-nums">
      <Calendar className="h-4 w-4" aria-hidden="true" />
      {formatDate(new Date().toISOString())}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6" data-testid="dashboard-page">
        <EncabezadoPagina titulo="Panel" subtitulo="Resumen operativo del día" acciones={fechaHoy} />
        <EsqueletoPanel />
      </div>
    );
  }

  /* CUATRO METRICAS PRINCIPALES Y UNA FRANJA
   *
   *   Eran once cajas identicas: seis arriba y cinco abajo, todas del mismo
   *   tamano y peso, asi que ninguna destacaba. Lo que un recepcionista mira
   *   al empezar el turno son cuatro cosas -cuanta ocupacion hay, quien llega,
   *   quien se va y cuanto ha entrado en caja-, y esas van grandes. El resto
   *   -las del mes y las de aviso- van en una franja compacta separada por
   *   lineas de 1 px, no en siete tarjetas mas. */
  const principales = [
    {
      label: 'Ocupación',
      value: `${kpis?.today?.occupancy_rate || 0}%`,
      subtext: `${kpis?.today?.rooms_occupied || 0} de ${kpis?.today?.rooms_total || 0} habitaciones`,
      icon: BedDouble,
    },
    {
      label: 'Llegadas hoy',
      value: kpis?.today?.arrivals || 0,
      subtext: 'Check-ins esperados',
      icon: UserCheck,
    },
    {
      label: 'Salidas hoy',
      value: kpis?.today?.departures || 0,
      subtext: 'Check-outs esperados',
      icon: UserMinus,
    },
    {
      label: 'Ingresos hoy',
      value: formatCurrency(kpis?.today?.revenue || 0),
      subtext: 'Pagos recibidos',
      icon: Wallet,
    },
  ];

  const sucias = kpis?.today?.rooms_dirty || 0;
  const pendiente = kpis?.today?.outstanding || 0;
  const secundarias = [
    { label: 'Ingresos del mes', value: formatCurrency(kpis?.month?.revenue || 0) },
    { label: 'ADR', value: formatCurrency(kpis?.month?.adr || 0) },
    { label: 'RevPAR', value: formatCurrency(kpis?.month?.revpar || 0) },
    { label: 'Cancelaciones', value: kpis?.month?.cancellations || 0 },
    { label: 'No shows', value: kpis?.month?.no_shows || 0 },
    { label: 'Hab. sucias', value: sucias, alerta: sucias > 5 },
    { label: 'Saldo pendiente', value: formatCurrency(pendiente), alerta: pendiente > 0 },
  ];

  const roomStatusArray = [
    { name: 'Ocupadas', value: roomStatusData.occupied || 0, color: COLORS.occupied },
    { name: 'Disp. Limpias', value: roomStatusData.vacant_clean || 0, color: COLORS.vacant_clean },
    { name: 'Disp. Sucias', value: roomStatusData.vacant_dirty || 0, color: COLORS.vacant_dirty },
    { name: 'Fuera Servicio', value: roomStatusData.out_of_order || 0, color: COLORS.out_of_order },
  ];

  // Que hay y que no, para decidir entre grafico y estado vacio.
  const hayIngresos = revenueData.some((d) => (d.rooms || 0) > 0 || (d.extras || 0) > 0);
  const hayOcupacion = occupancyData.some((d) => (d.rate || 0) > 0);
  const hayHabitaciones = roomStatusArray.some((d) => d.value > 0);
  const hayPagos = paymentMethodsData.some((d) => (d.total || 0) > 0);
  const hayComprobantes = invoicingData.some((d) => (d.count || 0) > 0);
  const hayProductos = topProductsData.some((d) => (d.total || 0) > 0);

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <EncabezadoPagina titulo="Panel" subtitulo="Resumen operativo del día" acciones={fechaHoy} />

      {/* Metricas principales */}
      <div className="escalonado grid grid-cols-2 gap-4 lg:grid-cols-4">
        {principales.map((kpi, index) => {
          const Icon = kpi.icon;
          return (
            <Card key={kpi.label} className="kpi-card p-4 sm:p-5" data-testid={`kpi-card-${index}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-muted-foreground">{kpi.label}</p>
                  {/* whitespace-nowrap y tabular-nums: en 375 px "S/ 0.00" partia
                      en dos lineas, y una cifra de dinero partida se lee fatal. */}
                  <p
                    className="mt-1.5 whitespace-nowrap font-heading text-[28px] font-semibold leading-none tracking-tight text-foreground lg:text-[32px] tabular-nums"
                    data-cifra
                  >
                    {kpi.value}
                  </p>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{kpi.subtext}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[hsl(var(--accent)/.10)] text-[hsl(var(--accent))]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Franja de metricas secundarias: una sola tarjeta, celdas separadas
          por 1 px (el gap deja ver el fondo de borde). */}
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border shadow-sm sm:grid-cols-4 lg:grid-cols-7 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
        {secundarias.map((m) => (
          <div key={m.label} className="bg-card px-4 py-3">
            <p className="truncate text-xs text-muted-foreground">{m.label}</p>
            <p
              className={cn(
                'mt-1 whitespace-nowrap text-lg font-semibold tracking-tight tabular-nums',
                m.alerta ? 'text-[hsl(var(--acento-fucsia))]' : 'text-foreground',
              )}
              data-cifra
            >
              {m.value}
            </p>
          </div>
        ))}
      </Card>

      {/* Graficos: fila 1 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="shadow-sm">
          <TituloGrafico extra="Últimos 30 días">Ingresos Últimos 30 Días</TituloGrafico>
          <CardContent className="px-3 pb-4 pt-0 sm:px-5">
            {hayIngresos ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={revenueData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" {...EJE} tickFormatter={(val) => val.slice(5)} />
                  <YAxis {...EJE} tickFormatter={(val) => `S/${val / 1000}k`} />
                  <Tooltip
                    contentStyle={TOOLTIP_ESTILO}
                    formatter={(value) => formatCurrency(value)}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(valor) => <span className="text-[13px] text-zen-700">{valor}</span>}
                  />
                  <Line type="monotone" dataKey="rooms" name="Habitaciones" stroke={COLORS.rooms} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="extras" name="Extras" stroke={COLORS.extras} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <GraficoVacio
                icono={LineChartIcon}
                mensaje="Aparecerá cuando registres la primera reserva."
                enlace="/reservations"
                accion="Crear una reserva"
              />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <TituloGrafico extra="Últimos 30 días">Ocupación Últimos 30 Días</TituloGrafico>
          <CardContent className="px-3 pb-4 pt-0 sm:px-5">
            {hayOcupacion ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={occupancyData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" {...EJE} tickFormatter={(val) => val.slice(5)} />
                  <YAxis {...EJE} domain={[0, 100]} tickFormatter={(val) => `${val}%`} />
                  <Tooltip
                    contentStyle={TOOLTIP_ESTILO}
                    formatter={(value) => `${value}%`}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Line type="monotone" dataKey="rate" name="Ocupación" stroke={COLORS.rooms} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <GraficoVacio
                icono={BedDouble}
                mensaje={hayHabitaciones
                  ? 'Aparecerá cuando registres la primera reserva.'
                  : 'Aparecerá cuando tengas habitaciones y la primera reserva.'}
                enlace={hayHabitaciones ? '/reservations' : '/rooms'}
                accion={hayHabitaciones ? 'Crear una reserva' : 'Crear habitaciones'}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Graficos: fila 2 */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="shadow-sm">
          <TituloGrafico>Estado de Habitaciones</TituloGrafico>
          <CardContent className="px-5 pb-5 pt-0">
            {hayHabitaciones ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={roomStatusArray}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="hsl(var(--card))"
                    >
                      {roomStatusArray.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_ESTILO} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {roomStatusArray.map((item) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden="true" />
                      <span className="truncate text-muted-foreground">
                        {item.name}: <span className="font-medium text-foreground tabular-nums">{item.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <GraficoVacio
                icono={PieChartIcon}
                mensaje="Crea tus habitaciones para ver aquí su estado."
                enlace="/rooms"
                accion="Ir a Habitaciones"
                alto={236}
              />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <TituloGrafico extra="Este mes">Métodos de Pago (Mes)</TituloGrafico>
          <CardContent className="px-5 pb-5 pt-0">
            {hayPagos ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={paymentMethodsData}
                      cx="50%"
                      cy="50%"
                      innerRadius={54}
                      outerRadius={82}
                      paddingAngle={2}
                      dataKey="total"
                      nameKey="method"
                      stroke="hsl(var(--card))"
                    >
                      {paymentMethodsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PAYMENT_COLORS[index % PAYMENT_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_ESTILO} formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {paymentMethodsData.map((item, i) => (
                    <div key={item.method || i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PAYMENT_COLORS[i % PAYMENT_COLORS.length] }} aria-hidden="true" />
                        <span className="text-muted-foreground">{getStatusLabel(item.method)}</span>
                      </div>
                      <span className="font-medium tabular-nums">{formatCurrency(item.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <GraficoVacio
                icono={CreditCard}
                mensaje="Aparecerá con el primer cobro registrado en caja."
                enlace="/cash-shift"
                accion="Ir a Caja"
                alto={236}
              />
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <TituloGrafico extra="Este mes">Facturación (Mes)</TituloGrafico>
          <CardContent className="px-3 pb-5 pt-0 sm:px-5">
            {hayComprobantes ? (
              <ResponsiveContainer width="100%" height={236}>
                <BarChart data={invoicingData} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" {...EJE} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" {...EJE} tickFormatter={(val) => getStatusLabel(val)} width={80} />
                  <Tooltip
                    contentStyle={TOOLTIP_ESTILO}
                    cursor={{ fill: 'hsl(var(--muted) / .5)' }}
                    formatter={(value, name) => [name === 'count' ? value : formatCurrency(value), name === 'count' ? 'Cantidad' : 'Total']}
                  />
                  <Bar dataKey="count" fill={COLORS.rooms} name="Cantidad" radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <GraficoVacio
                icono={Receipt}
                mensaje="Aparecerá cuando emitas el primer comprobante."
                enlace="/invoices"
                accion="Ir a Facturación"
                alto={236}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top productos */}
      <Card className="shadow-sm">
        <TituloGrafico extra="Este mes">Top 10 Productos/Servicios (Mes)</TituloGrafico>
        <CardContent className="px-3 pb-5 pt-0 sm:px-5">
          {hayProductos ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topProductsData} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" {...EJE} tickFormatter={(val) => formatCurrency(val)} />
                <YAxis type="category" dataKey="product" {...EJE} width={150} />
                <Tooltip contentStyle={TOOLTIP_ESTILO} cursor={{ fill: 'hsl(var(--muted) / .5)' }} formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="total" fill={COLORS.extras} name="Ingresos" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <GraficoVacio
              icono={ShoppingBag}
              mensaje="Aparecerá cuando cargues un consumo o servicio a una reserva."
              enlace="/reservations"
              accion="Ver reservas"
              alto={180}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
