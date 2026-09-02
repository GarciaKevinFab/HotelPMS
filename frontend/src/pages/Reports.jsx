import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Download, 
  Calendar,
  TrendingUp,
  Users,
  Wallet,
  Receipt,
  SprayCan,
  Wrench,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { reportsAPI } from '../lib/api';
import { formatCurrency, getMonthName, getStatusLabel } from '../lib/utils';
import { toast } from 'sonner';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#F43F5E'];

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

  return (
    <div className="space-y-6" data-testid="reports-page">
      {/* Header */}
      {/* En movil va en columna: titulo y botones en una sola fila con
          justify-between no caben en 375 px y desbordaban la pagina. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Reportes</h1>
          <p className="text-zen-500">Análisis y métricas del hotel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map(m => (
                <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y.value} value={String(y.value)}>{y.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="occupancy" className="flex flex-wrap items-center gap-2">
            <Users className="w-4 h-4" />
            Ocupación
          </TabsTrigger>
          <TabsTrigger value="revenue" className="flex flex-wrap items-center gap-2">
            <Wallet className="w-4 h-4" />
            Ingresos
          </TabsTrigger>
          <TabsTrigger value="invoicing" className="flex flex-wrap items-center gap-2">
            <Receipt className="w-4 h-4" />
            Facturación
          </TabsTrigger>
        </TabsList>

        {/* Occupancy Report */}
        <TabsContent value="occupancy" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin" />
            </div>
          ) : occupancyReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Ocupación Promedio</p>
                  <p className="text-2xl font-bold">{occupancyReport.summary.occupancy_avg}%</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Noches Vendidas</p>
                  <p className="text-2xl font-bold">{occupancyReport.summary.room_nights_sold}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Check-ins</p>
                  <p className="text-2xl font-bold">{occupancyReport.summary.checkins}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Check-outs</p>
                  <p className="text-2xl font-bold">{occupancyReport.summary.checkouts}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">ADR</p>
                  <p className="text-2xl font-bold">{formatCurrency(occupancyReport.summary.adr)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">RevPAR</p>
                  <p className="text-2xl font-bold">{formatCurrency(occupancyReport.summary.revpar)}</p>
                </Card>
              </div>

              {/* Additional stats */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Cancelaciones</p>
                  <p className="text-xl font-bold text-amber-600">{occupancyReport.summary.cancellations}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">No Shows</p>
                  <p className="text-xl font-bold text-rose-600">{occupancyReport.summary.no_shows}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Ingresos Habitaciones</p>
                  <p className="text-xl font-bold text-emerald-600">{formatCurrency(occupancyReport.summary.room_revenue)}</p>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-zen-500">
              No hay datos disponibles para este período
            </Card>
          )}
        </TabsContent>

        {/* Revenue Report */}
        <TabsContent value="revenue" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin" />
            </div>
          ) : revenueReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Total Cargos</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueReport.summary.total_charges)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Total Pagos</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(revenueReport.summary.total_payments)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Ingresos Habitaciones</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueReport.summary.rooms_revenue)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Ingresos Extras</p>
                  <p className="text-2xl font-bold">{formatCurrency(revenueReport.summary.extras_revenue)}</p>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Category */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Ingresos por Categoría</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={Object.entries(revenueReport.by_category).map(([name, value]) => ({ name: getStatusLabel(name), value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {Object.keys(revenueReport.by_category).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>

                {/* By Payment Method */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Pagos por Método</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={Object.entries(revenueReport.by_payment_method).map(([name, value]) => ({ name: getStatusLabel(name), value }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `S/${v/1000}k`} />
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-zen-500">
              No hay datos disponibles para este período
            </Card>
          )}
        </TabsContent>

        {/* Invoicing Report */}
        <TabsContent value="invoicing" className="space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin" />
            </div>
          ) : invoicingReport ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Total Comprobantes</p>
                  <p className="text-2xl font-bold">{invoicingReport.summary.total_invoices}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Monto Total</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(invoicingReport.summary.total_amount)}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Boletas</p>
                  <p className="text-2xl font-bold">{invoicingReport.by_type?.BOLETA?.count || 0}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm text-zen-500">Facturas</p>
                  <p className="text-2xl font-bold">{invoicingReport.by_type?.FACTURA?.count || 0}</p>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Type */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Por Tipo de Comprobante</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={Object.entries(invoicingReport.by_type).map(([name, data]) => ({ name: getStatusLabel(name), value: data.total }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        dataKey="value"
                        label
                      >
                        <Cell fill="#3B82F6" />
                        <Cell fill="#8B5CF6" />
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>

                {/* By Status */}
                <Card className="p-6">
                  <h3 className="font-semibold mb-4">Por Estado SUNAT</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={Object.entries(invoicingReport.by_status).map(([name, data]) => ({ name: getStatusLabel(name), count: data.count, total: data.total }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#10B981" name="Cantidad" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          ) : (
            <Card className="p-8 text-center text-zen-500">
              No hay datos disponibles para este período
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Reports;
