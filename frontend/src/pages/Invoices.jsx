import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  Download,
  Eye,
  MoreHorizontal,
  XCircle,
  RefreshCw,
  Check,
  AlertCircle,
  Banknote
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas, EsqueletoMetricas } from '../components/Esqueleto';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { invoicesAPI, foliosAPI } from '../lib/api';
import { formatCurrency, formatDate, formatDateTime, getStatusLabel, getStatusClass, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export function Invoices() {
  const { user, isAdmin } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Detail dialog
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Void dialog
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [voidReason, setVoidReason] = useState('');

  useEffect(() => {
    fetchInvoices();
  }, [typeFilter, statusFilter]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = {};
      if (typeFilter !== 'all') params.type = typeFilter;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await invoicesAPI.list(params);
      setInvoices(response.data);
    } catch (err) {
      console.error('Error fetching invoices:', err);
      toast.error('Error al cargar comprobantes');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (invoice) => {
    try {
      const response = await invoicesAPI.get(invoice.id);
      setSelectedInvoice(response.data);
      setShowDetailDialog(true);
    } catch (err) {
      toast.error('Error al cargar detalle');
    }
  };

  const handleVoidInvoice = async () => {
    if (!voidReason.trim()) {
      toast.error('Ingrese el motivo de anulación');
      return;
    }

    try {
      await invoicesAPI.void(selectedInvoice.id, voidReason);
      toast.success('Comprobante anulado');
      setShowVoidDialog(false);
      setVoidReason('');
      fetchInvoices();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al anular comprobante');
    }
  };

  // Mismo matiz que la insignia de getStatusClass, para que icono y texto
  // cuenten lo mismo: aceptado turquesa, rechazado fucsia, pendiente ambar.
  const getStatusIcon = (status) => {
    switch (status) {
      case 'ACCEPTED': return <Check className="h-4 w-4 text-[hsl(var(--acento-turquesa))]" aria-hidden="true" />;
      case 'REJECTED': return <XCircle className="h-4 w-4 text-[hsl(var(--acento-fucsia))]" aria-hidden="true" />;
      case 'PENDING': return <RefreshCw className="h-4 w-4 text-[hsl(38_92%_30%)]" aria-hidden="true" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />;
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      `${inv.series}-${inv.number}`.includes(query) ||
      inv.client_name?.toLowerCase().includes(query) ||
      inv.client_doc_number?.includes(query)
    );
  });

  // Stats
  const stats = {
    total: invoices.length,
    accepted: invoices.filter(i => i.status === 'ACCEPTED').length,
    rejected: invoices.filter(i => i.status === 'REJECTED').length,
    totalAmount: invoices.filter(i => i.status === 'ACCEPTED').reduce((sum, i) => sum + (i.total || 0), 0)
  };

  const metricas = [
    { rotulo: 'Total Comprobantes', valor: stats.total, icono: FileText, tono: 'neutro' },
    { rotulo: 'Aceptados', valor: stats.accepted, icono: Check, tono: 'turquesa' },
    { rotulo: 'Rechazados', valor: stats.rejected, icono: XCircle, tono: 'fucsia' },
    { rotulo: 'Monto Total Aceptado', valor: formatCurrency(stats.totalAmount), icono: Banknote, tono: 'neutro' },
  ];

  const tonos = {
    neutro: { valor: 'text-foreground', caja: 'bg-muted text-muted-foreground' },
    turquesa: { valor: 'text-[hsl(var(--acento-turquesa))]', caja: 'bg-[hsl(var(--status-vacant-clean)/.10)] text-[hsl(var(--acento-turquesa))]' },
    fucsia: { valor: 'text-[hsl(var(--acento-fucsia))]', caja: 'bg-[hsl(var(--status-occupied)/.10)] text-[hsl(var(--acento-fucsia))]' },
  };

  // Tipo y estado se filtran en el servidor; la busqueda, aqui. Cualquiera
  // de los tres activos convierte el vacio en "nada coincide".
  const hayFiltros = searchQuery.trim() !== '' || typeFilter !== 'all' || statusFilter !== 'all';
  const limpiarFiltros = () => { setSearchQuery(''); setTypeFilter('all'); setStatusFilter('all'); };
  const primeraCarga = loading && invoices.length === 0;

  return (
    <div className="space-y-6" data-testid="invoices-page">
      <EncabezadoPagina
        titulo="Facturación"
        subtitulo="Gestión de comprobantes electrónicos"
        acciones={
          <Button variant="outline" onClick={fetchInvoices}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        }
      />

      {/* Stats */}
      {primeraCarga ? (
        <EsqueletoMetricas />
      ) : (
        <div className="escalonado grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metricas.map(({ rotulo, valor, icono: Icono, tono }) => (
            <Card key={rotulo} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                  <p className={cn('mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums', tonos[tono].valor)}>
                    {valor}
                  </p>
                </div>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tonos[tono].caja)}>
                  <Icono className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label="Buscar comprobante por número o cliente"
              placeholder="Buscar por número, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:gap-4">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="BOLETA">Boleta</SelectItem>
                <SelectItem value="FACTURA">Factura</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]" aria-label="Filtrar por estado">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ACCEPTED">Aceptados</SelectItem>
                <SelectItem value="REJECTED">Rechazados</SelectItem>
                <SelectItem value="PENDING">Pendientes</SelectItem>
                <SelectItem value="VOIDED">Anulados</SelectItem>
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
              <TableHead>Comprobante</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="escalonado">
            {loading ? (
              <EsqueletoFilas filas={6} columnas={6} />
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="p-0">
                  <EstadoVacio
                    icono={FileText}
                    titulo="Todavía no hay comprobantes"
                    descripcion="Se emiten al cerrar la cuenta de una estancia. Boleta o factura, según lo que pida el huésped."
                    filtrado={hayFiltros}
                    onLimpiar={limpiarFiltros}
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold text-white',
                          invoice.type === 'BOLETA'
                            ? 'bg-[hsl(var(--acento-turquesa))]'
                            : 'bg-[hsl(var(--acento-oliva))]'
                        )}
                        aria-hidden="true"
                      >
                        {invoice.type === 'BOLETA' ? 'B' : 'F'}
                      </div>
                      <div className="min-w-0">
                        <p className="whitespace-nowrap font-medium tabular-nums">{invoice.series}-{String(invoice.number).padStart(8, '0')}</p>
                        <p className="text-xs text-muted-foreground">{getStatusLabel(invoice.type)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm tabular-nums">
                    {formatDate(invoice.issued_at)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{invoice.client_name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {invoice.client_doc_type}: {invoice.client_doc_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(invoice.status)}
                      <Badge className={cn("badge", getStatusClass(invoice.status))}>
                        {getStatusLabel(invoice.status)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Acciones del comprobante">
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewDetail(invoice)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Ver Detalle
                        </DropdownMenuItem>
                        {invoice.pdf_url && (
                          <DropdownMenuItem onClick={() => window.open(invoice.pdf_url, '_blank')}>
                            <Download className="w-4 h-4 mr-2" />
                            Descargar PDF
                          </DropdownMenuItem>
                        )}
                        {isAdmin && invoice.status === 'ACCEPTED' && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setShowVoidDialog(true);
                            }}
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Anular
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del Comprobante</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/60 p-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Tipo</p>
                  <p className="font-medium">{getStatusLabel(selectedInvoice.type)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Número</p>
                  <p className="font-medium tabular-nums">{selectedInvoice.series}-{String(selectedInvoice.number).padStart(8, '0')}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Fecha Emisión</p>
                  <p className="font-medium tabular-nums">{formatDateTime(selectedInvoice.issued_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Estado</p>
                  <Badge className={cn("badge mt-0.5", getStatusClass(selectedInvoice.status))}>
                    {getStatusLabel(selectedInvoice.status)}
                  </Badge>
                </div>
              </div>

              {/* Client info */}
              <div>
                <h4 className="font-medium mb-2">Datos del Cliente</h4>
                <div className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Nombre/Razón Social</p>
                    <p className="font-medium">{selectedInvoice.client_name}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Documento</p>
                    <p className="font-medium tabular-nums">{selectedInvoice.client_doc_type}: {selectedInvoice.client_doc_number}</p>
                  </div>
                  {selectedInvoice.client_address && (
                    <div className="min-w-0 sm:col-span-2">
                      <p className="text-xs font-medium text-muted-foreground">Dirección</p>
                      <p className="font-medium">{selectedInvoice.client_address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Amounts */}
              <div>
                <h4 className="font-medium mb-2">Montos</h4>
                <div className="space-y-2 rounded-lg border p-4 tabular-nums">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGV (18%):</span>
                    <span>{formatCurrency(selectedInvoice.igv)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                </div>
              </div>

              {/* SUNAT Response */}
              {selectedInvoice.nubefact_response && (
                <div>
                  <h4 className="font-medium mb-2">Respuesta SUNAT</h4>
                  <div className="rounded-lg bg-muted/60 p-4 text-sm">
                    <p><strong>Descripción:</strong> {selectedInvoice.nubefact_response.sunat_description}</p>
                    {selectedInvoice.hash && (
                      // break-all: el hash es una cadena sin espacios que a
                      // 390 px desbordaba el dialogo.
                      <p className="mt-2 break-all"><strong>Hash:</strong> <span className="font-mono text-xs">{selectedInvoice.hash}</span></p>
                    )}
                  </div>
                </div>
              )}

              {/* Download links */}
              <div className="flex flex-wrap gap-2">
                {selectedInvoice.pdf_url && (
                  <Button variant="outline" onClick={() => window.open(selectedInvoice.pdf_url, '_blank')}>
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                )}
                {selectedInvoice.xml_url && (
                  <Button variant="outline" onClick={() => window.open(selectedInvoice.xml_url, '_blank')}>
                    <Download className="w-4 h-4 mr-2" />
                    XML
                  </Button>
                )}
                {selectedInvoice.cdr_url && (
                  <Button variant="outline" onClick={() => window.open(selectedInvoice.cdr_url, '_blank')}>
                    <Download className="w-4 h-4 mr-2" />
                    CDR
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Void Dialog */}
      <Dialog open={showVoidDialog} onOpenChange={setShowVoidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular Comprobante</DialogTitle>
            <DialogDescription>
              Esta acción es irreversible. Se generará una nota de crédito automáticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Motivo de Anulación</Label>
            <Textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Ingrese el motivo de anulación..."
              className="mt-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoidDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleVoidInvoice}>
              Confirmar Anulación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Invoices;
