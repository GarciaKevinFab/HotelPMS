import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter,
  FileText,
  Download,
  Eye,
  MoreHorizontal,
  XCircle,
  RefreshCw,
  Check,
  AlertCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ACCEPTED': return <Check className="w-4 h-4 text-emerald-500" />;
      case 'REJECTED': return <XCircle className="w-4 h-4 text-rose-500" />;
      case 'PENDING': return <RefreshCw className="w-4 h-4 text-amber-500" />;
      default: return <AlertCircle className="w-4 h-4 text-zen-400" />;
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

  return (
    <div className="space-y-6" data-testid="invoices-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zen-900">Facturación</h1>
          <p className="text-zen-500">Gestión de comprobantes electrónicos</p>
        </div>
        <Button variant="outline" onClick={fetchInvoices}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-zen-500">Total Comprobantes</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Aceptados</p>
          <p className="text-2xl font-bold text-emerald-600">{stats.accepted}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Rechazados</p>
          <p className="text-2xl font-bold text-rose-600">{stats.rejected}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-zen-500">Monto Total Aceptado</p>
          <p className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zen-400" />
            <Input
              placeholder="Buscar por número, cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="BOLETA">Boleta</SelectItem>
              <SelectItem value="FACTURA">Factura</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
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
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <div className="w-6 h-6 border-2 border-zen-200 border-t-zen-turquesa rounded-full animate-spin mx-auto" />
                </TableCell>
              </TableRow>
            ) : filteredInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-zen-500">
                  No se encontraron comprobantes
                </TableCell>
              </TableRow>
            ) : (
              filteredInvoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-xs",
                        invoice.type === 'BOLETA' ? 'bg-blue-500' : 'bg-violet-500'
                      )}>
                        {invoice.type === 'BOLETA' ? 'B' : 'F'}
                      </div>
                      <div>
                        <p className="font-medium">{invoice.series}-{String(invoice.number).padStart(8, '0')}</p>
                        <p className="text-xs text-zen-500">{getStatusLabel(invoice.type)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDate(invoice.issued_at)}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">{invoice.client_name}</p>
                      <p className="text-xs text-zen-500">
                        {invoice.client_doc_type}: {invoice.client_doc_number}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
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
                        <Button variant="ghost" size="icon">
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
                            className="text-red-600"
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del Comprobante</DialogTitle>
          </DialogHeader>
          
          {selectedInvoice && (
            <div className="space-y-6">
              {/* Header info */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-zen-50 rounded-lg">
                <div>
                  <p className="text-sm text-zen-500">Tipo</p>
                  <p className="font-medium">{getStatusLabel(selectedInvoice.type)}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Número</p>
                  <p className="font-medium">{selectedInvoice.series}-{String(selectedInvoice.number).padStart(8, '0')}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Fecha Emisión</p>
                  <p className="font-medium">{formatDateTime(selectedInvoice.issued_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-zen-500">Estado</p>
                  <Badge className={cn("badge", getStatusClass(selectedInvoice.status))}>
                    {getStatusLabel(selectedInvoice.status)}
                  </Badge>
                </div>
              </div>

              {/* Client info */}
              <div>
                <h4 className="font-medium mb-2">Datos del Cliente</h4>
                <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg">
                  <div>
                    <p className="text-sm text-zen-500">Nombre/Razón Social</p>
                    <p className="font-medium">{selectedInvoice.client_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zen-500">Documento</p>
                    <p className="font-medium">{selectedInvoice.client_doc_type}: {selectedInvoice.client_doc_number}</p>
                  </div>
                  {selectedInvoice.client_address && (
                    <div className="col-span-2">
                      <p className="text-sm text-zen-500">Dirección</p>
                      <p className="font-medium">{selectedInvoice.client_address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Amounts */}
              <div>
                <h4 className="font-medium mb-2">Montos</h4>
                <div className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-zen-600">Subtotal:</span>
                    <span>{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zen-600">IGV (18%):</span>
                    <span>{formatCurrency(selectedInvoice.igv)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>{formatCurrency(selectedInvoice.total)}</span>
                  </div>
                </div>
              </div>

              {/* SUNAT Response */}
              {selectedInvoice.nubefact_response && (
                <div>
                  <h4 className="font-medium mb-2">Respuesta SUNAT</h4>
                  <div className="p-4 bg-zen-50 rounded-lg text-sm">
                    <p><strong>Descripción:</strong> {selectedInvoice.nubefact_response.sunat_description}</p>
                    {selectedInvoice.hash && (
                      <p className="mt-2"><strong>Hash:</strong> {selectedInvoice.hash}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Download links */}
              <div className="flex gap-2">
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
