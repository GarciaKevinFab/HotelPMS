import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  Users,
  Wallet,
  Receipt,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoMetricas, EsqueletoBloque } from '../components/Esqueleto';
import { reportsAPI } from '../lib/api';
import { formatCurrency, getMonthName, getStatusLabel, cn } from '../lib/utils';
import { toast } from 'sonner';

/* Mismos tokens que el panel: turquesa, fucsia, lima, oliva y ambar, que
   son los del logotipo. Antes eran los hexadecimales de Tailwind, con
   azul de cabecera en una marca que no tiene azul. */
const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-3))',
];

/* Props comunes de ejes, rejilla y tooltip para que los graficos se vean
   como uno solo (cada uno traia su tamano de letra y su gris). */
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
};
const CURSOR_BARRA = { fill: 'hsl(var(--muted))' };

const TONOS = {
  turquesa: 'text-[hsl(var(--acento-turquesa))]',
  fucsia: 'text-[hsl(var(--acento-fucsia))]',
  lima: 'text-[hsl(var(--acento-lima))]',
  neutro: 'text-muted-foreground',
};

/* Tarjeta de metrica: rotulo pequeno arriba, cifra grande debajo. El valor
   baja un punto en el telefono porque "S/ 12,345.00" a 24 px no cabe en la
   mitad de 390 px y desbordaba la tarjeta. */
function Metrica({ rotulo, valor, tono }) {
  return (
    <Card className="min-w-0 p-4 shadow-sm">
      <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
      <p className={cn('mt-1 text-xl font-semibold tracking-tight tabular-nums sm:text-2xl', tono && TONOS[tono])}>
        {valor}
      </p>
    </Card>
  );
}

function TarjetaGrafico({ titulo, children }) {
  return (
    <Card className="min-w-0 overflow-hidden p-5 shadow-sm sm:p-6">
      <h3 className="font-heading text-base font-semibold">{titulo}</h3>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function LeyendaTexto(valor) {
  return <span className="text-xs text-muted-foreground">{valor}</span>;
}

function EsqueletoReporte({ metricas = 4 }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el reporte">
      <EsqueletoMetricas cantidad={metricas} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EsqueletoBloque lineas={5} />
        <EsqueletoBloque lineas={5} />
      </div>
    </div>
  );
}

function SinDatos({ descripcion }) {
  return (
    <Card className="shadow-sm">
      <EstadoVacio
        compacto
        icono={BarChart3}
        titulo="No hay datos disponibles para este período"
        descripcion={descripcion}
      />
    </Card>
  );
}

export function Reports() {
  const [activeTab, setActiveTab] = useState('occupancy');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  // Report data
  const [occupancyReport, setOccupancyReport] = useState(null);
  const [revenueReport, setRevenueReport] = useState(null);
  const [invoicingReport, setInvoicingReport] = useState(null);

  useEffect(() => {
    fetchReports();
  }, [selectedMonth, selectedYear, activeTab]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'occupancy':
          const occRes = await reportsAPI.monthlyOccupancy(selectedMonth, selectedYear);
          setOccupancyReport(occRes.data);
          break;
        case 'revenue':
          const revRes = await reportsAPI.monthlyRevenue(selectedMonth, selectedYear);
          setRevenueReport(revRes.data);
          break;
        case 'invoicing':
          const invRes = await reportsAPI.monthlyInvoicing(selectedMonth, selectedYear);
          setInvoicingReport(invRes.data);
          break;
      }
    } catch (err) {
      console.error('Error fetching report:', err);
      toast.error('Error al cargar reporte');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const response = format === 'excel'
        ? await reportsAPI.exportExcel(activeTab, selectedMonth, selectedYear)
        : await reportsAPI.exportPdf(activeTab, selectedMonth, selectedYear);

      const blob = new Blob([response.data], {
        type: format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'application/pdf'
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_${activeTab}_${selectedYear}_${String(selectedMonth).padStart(2, '0')}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success(`Reporte exportado como ${format.toUpperCase()}`);
    } catch (err) {
      console.error('Error exporting:', err);
      toast.error('Error al exportar reporte');
    } finally {
      setExporting(false);
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: getMonthName(i + 1)
  }));

  const years = Array.from({ length: 5 }, (_, i) => ({
    value: new Date().getFullYear() - i,
    label: String(new Date().getFullYear() - i)
  }));

  const nombreMes = getMonthName(selectedMonth);

  const acciones = (
    <>
      {/* Mes y ano comparten fila en el telefono; el boton de exportar
          baja a la suya y se estira. */}
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-[140px]" aria-label="Mes del reporte">
            <Calendar className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map(m => (
              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
          <SelectTrigger className="w-full sm:w-[140px]" aria-label="Año del reporte">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => (
              <SelectItem key={y.value} value={String(y.value)}>{y.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={exporting} data-testid="export-dropdown">
            <Download className="w-4 h-4 mr-2" />
            {exporting ? 'Exportando...' : 'Exportar'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleExport('excel')} data-testid="export-excel-btn">
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Exportar Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleExport('pdf')} data-testid="export-pdf-btn">
            <FileText className="w-4 h-4 mr-2" />
            Exportar PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  return (
    <div className="space-y-6" data-testid="reports-page">
      <EncabezadoPagina
        titulo="Reportes"
        subtitulo="Análisis y métricas del hotel"
        acciones={acciones}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid h-auto w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="occupancy" className="min-h-[40px] gap-2">
            <Users className="h-4 w-4 shrink-0" />
            Ocupación
          </TabsTrigger>
          <TabsTrigger value="revenue" className="min-h-[40px] gap-2">
            <Wallet className="h-4 w-4 shrink-0" />
            Ingresos
          </TabsTrigger>
          <TabsTrigger value="invoicing" className="min-h-[40px] gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            Facturación
          </TabsTrigger>
        </TabsList>

        {/* Occupancy Report */}
        <TabsContent value="occupancy" className="mt-6 space-y-6">
          {loading ? (
            <EsqueletoReporte metricas={6} />
          ) : occupancyReport ? (
            <>
              {/* Summary Cards */}
              <div className="escalonado grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
                <Metrica rotulo="Ocupación Promedio" valor={`${occupancyReport.summary.occupancy_avg}%`} tono="turquesa" />
                <Metrica rotulo="Noches Vendidas" valor={occupancyReport.summary.room_nights_sold} />
                <Metrica rotulo="Check-ins" valor={occupancyReport.summary.checkins} />
                <Metrica rotulo="Check-outs" valor={occupancyReport.summary.checkouts} />
                <Metrica rotulo="ADR" valor={formatCurrency(occupancyReport.summary.adr)} />
                <Metrica rotulo="RevPAR" valor={formatCurrency(occupancyReport.summary.revpar)} />
              </div>

              {/* Additional stats */}
              <div className="escalonado grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <Metrica rotulo="Cancelaciones" valor={occupancyReport.summary.cancellations} tono="lima" />
                <Metrica rotulo="No Shows" valor={occupancyReport.summary.no_shows} tono="fucsia" />
                <Metrica rotulo="Ingresos Habitaciones" valor={formatCurrency(occupancyReport.summary.room_revenue)} tono="turquesa" />
              </div>
            </>
          ) : (
            <SinDatos descripcion={`Las cifras de ocupación salen de las reservas con check-in o check-out en ${nombreMes} de ${selectedYear}. Cuando haya movimientos ese mes aparecerán aquí.`} />
          )}
        </TabsContent>

        {/* Revenue Report */}
        <TabsContent value="revenue" className="mt-6 space-y-6">
          {loading ? (
            <EsqueletoReporte metricas={4} />
          ) : revenueReport ? (
            <>
              {/* Summary Cards */}
              <div className="escalonado grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                <Metrica rotulo="Total Cargos" valor={formatCurrency(revenueReport.summary.total_charges)} />
                <Metrica rotulo="Total Pagos" valor={formatCurrency(revenueReport.summary.total_payments)} tono="turquesa" />
                <Metrica rotulo="Ingresos Habitaciones" valor={formatCurrency(revenueReport.summary.rooms_revenue)} />
                <Metrica rotulo="Ingresos Extras" valor={formatCurrency(revenueReport.summary.extras_revenue)} />
              </div>

              {/* Charts */}
              <div className="escalonado grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* By Category */}
                <TarjetaGrafico titulo="Ingresos por Categoría">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={Object.entries(revenueReport.by_category).map(([name, value]) => ({ name: getStatusLabel(name), value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="hsl(var(--card))"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {Object.keys(revenueReport.by_category).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={TOOLTIP_ESTILO} />
                      <Legend iconType="circle" iconSize={8} formatter={LeyendaTexto} />
                    </PieChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>

                {/* By Payment Method */}
                <TarjetaGrafico titulo="Pagos por Método">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={Object.entries(revenueReport.by_payment_method).map(([name, value]) => ({ name: getStatusLabel(name), value }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" {...EJE} />
                      <YAxis {...EJE} tickFormatter={(v) => `S/${v/1000}k`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={TOOLTIP_ESTILO} cursor={CURSOR_BARRA} />
                      <Bar dataKey="value" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>
              </div>
            </>
          ) : (
            <SinDatos descripcion={`Los ingresos se calculan con los cargos y cobros registrados en ${nombreMes} de ${selectedYear}. En cuanto se registre el primer pago de ese mes verás aquí el desglose.`} />
          )}
        </TabsContent>

        {/* Invoicing Report */}
        <TabsContent value="invoicing" className="mt-6 space-y-6">
          {loading ? (
            <EsqueletoReporte metricas={4} />
          ) : invoicingReport ? (
            <>
              {/* Summary Cards */}
              <div className="escalonado grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                <Metrica rotulo="Total Comprobantes" valor={invoicingReport.summary.total_invoices} />
                <Metrica rotulo="Monto Total" valor={formatCurrency(invoicingReport.summary.total_amount)} tono="turquesa" />
                <Metrica rotulo="Boletas" valor={invoicingReport.by_type?.BOLETA?.count || 0} />
                <Metrica rotulo="Facturas" valor={invoicingReport.by_type?.FACTURA?.count || 0} />
              </div>

              {/* Charts */}
              <div className="escalonado grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* By Type */}
                <TarjetaGrafico titulo="Por Tipo de Comprobante">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={Object.entries(invoicingReport.by_type).map(([name, data]) => ({ name: getStatusLabel(name), value: data.total }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="value"
                        stroke="hsl(var(--card))"
                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {Object.keys(invoicingReport.by_type).map((_, index) => (
                          <Cell key={`tipo-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} contentStyle={TOOLTIP_ESTILO} />
                      <Legend iconType="circle" iconSize={8} formatter={LeyendaTexto} />
                    </PieChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>

                {/* By Status */}
                <TarjetaGrafico titulo="Por Estado SUNAT">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={Object.entries(invoicingReport.by_status).map(([name, data]) => ({ name: getStatusLabel(name), count: data.count, total: data.total }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" {...EJE} />
                      <YAxis {...EJE} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_ESTILO} cursor={CURSOR_BARRA} />
                      <Bar dataKey="count" fill="hsl(var(--chart-4))" name="Cantidad" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </TarjetaGrafico>
              </div>
            </>
          ) : (
            <SinDatos descripcion={`Este reporte se arma con los comprobantes (boletas y facturas) emitidos en ${nombreMes} de ${selectedYear}. Cuando se emita el primero de ese mes aparecerá aquí.`} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Reports;
