import React, { useState, useEffect } from 'react';
import {
  Wallet,
  Plus,
  Minus,
  Lock,
  Unlock,
  CreditCard,
  Banknote,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoMetricas, EsqueletoLista } from '../components/Esqueleto';
import { cashShiftsAPI } from '../lib/api';
import { formatCurrency, formatDateTime, getStatusLabel, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export function CashShift() {
  const { user } = useAuth();
  const [currentShift, setCurrentShift] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showMovementDialog, setShowMovementDialog] = useState(false);

  // Form data
  const [openingAmount, setOpeningAmount] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [closeNotes, setCloseNotes] = useState('');
  const [movementType, setMovementType] = useState('IN');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [currentRes, shiftsRes] = await Promise.all([
        cashShiftsAPI.current(),
        cashShiftsAPI.list()
      ]);
      setCurrentShift(currentRes.data);
      setShifts(shiftsRes.data);
    } catch (err) {
      console.error('Error fetching cash shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShift = async () => {
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      toast.error('Ingrese un monto de apertura válido');
      return;
    }

    try {
      await cashShiftsAPI.open(parseFloat(openingAmount));
      toast.success('Caja abierta exitosamente');
      setShowOpenDialog(false);
      setOpeningAmount('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al abrir caja');
    }
  };

  const handleCloseShift = async () => {
    if (!countedCash || parseFloat(countedCash) < 0) {
      toast.error('Ingrese el efectivo contado');
      return;
    }

    try {
      const response = await cashShiftsAPI.close(currentShift.id, parseFloat(countedCash), closeNotes);
      const diff = response.data.difference;

      if (Math.abs(diff) > 0) {
        toast.warning(`Caja cerrada con diferencia de ${formatCurrency(diff)}`);
      } else {
        toast.success('Caja cerrada exitosamente');
      }

      setShowCloseDialog(false);
      setCountedCash('');
      setCloseNotes('');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al cerrar caja');
    }
  };

  const handleAddMovement = async () => {
    if (!movementAmount || parseFloat(movementAmount) <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }
    if (!movementReason.trim()) {
      toast.error('Ingrese el motivo del movimiento');
      return;
    }

    try {
      await cashShiftsAPI.addMovement(currentShift.id, {
        type: movementType,
        amount: parseFloat(movementAmount),
        reason: movementReason
      });
      toast.success('Movimiento registrado');
      setShowMovementDialog(false);
      setMovementAmount('');
      setMovementReason('');
      fetchData();
    } catch (err) {
      toast.error('Error al registrar movimiento');
    }
  };

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'EFECTIVO': return <Banknote className="w-4 h-4" />;
      case 'TARJETA': return <CreditCard className="w-4 h-4" />;
      default: return <Wallet className="w-4 h-4" />;
    }
  };

  const closedShifts = shifts.filter(s => s.status === 'CLOSED');

  const acciones = (
    <Button variant="outline" size="sm" onClick={fetchData}>
      <RefreshCw className="w-4 h-4 mr-2" />
      Actualizar
    </Button>
  );

  if (loading) {
    return (
      <div className="space-y-6" data-testid="cash-shift-page" aria-busy="true">
        <EncabezadoPagina titulo="Caja" subtitulo="Gestión de turnos de caja" acciones={acciones} />
        <EsqueletoMetricas />
        <EsqueletoLista cantidad={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="cash-shift-page">
      <EncabezadoPagina titulo="Caja" subtitulo="Gestión de turnos de caja" acciones={acciones} />

      {/* Current Shift Card */}
      {currentShift ? (
        <div className="cash-shift-card">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-white/10">
                <Unlock className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-xl font-semibold leading-tight">Caja Abierta</h2>
                <p className="mt-0.5 text-sm text-white/70">
                  Desde {formatDateTime(currentShift.opened_at)}
                </p>
              </div>
            </div>
            <Badge className="border-transparent bg-[hsl(var(--status-vacant-clean))] text-white">Activa</Badge>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <div className="cash-shift-stat">
              <p className="text-xs font-medium text-white/70">Apertura</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(currentShift.opening_amount)}</p>
            </div>
            <div className="cash-shift-stat">
              <p className="text-xs font-medium text-white/70">Efectivo</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(currentShift.totals?.EFECTIVO || 0)}</p>
            </div>
            <div className="cash-shift-stat">
              <p className="text-xs font-medium text-white/70">Tarjeta</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(currentShift.totals?.TARJETA || 0)}</p>
            </div>
            <div className="cash-shift-stat">
              <p className="text-xs font-medium text-white/70">Total Pagos</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-[hsl(var(--status-vacant-clean))]">{formatCurrency(currentShift.total_payments || 0)}</p>
            </div>
          </div>

          {/* Payment Methods Breakdown */}
          {currentShift.totals && Object.keys(currentShift.totals).length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-white/70">Desglose por Método</h3>
              <div className="space-y-2 escalonado">
                {Object.entries(currentShift.totals).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-sm">
                      {getPaymentMethodIcon(method)}
                      <span>{getStatusLabel(method)}</span>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* En movil los dos botones se apilan a lo ancho; en una fila no
              caben con sus 44 px de alto sin apretar el texto. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setShowMovementDialog(true)}
              data-testid="add-movement-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Movimiento
            </Button>
            <Button
              onClick={() => setShowCloseDialog(true)}
              data-testid="close-shift-btn"
            >
              <Lock className="w-4 h-4 mr-2" />
              Cerrar Caja
            </Button>
          </div>
        </div>
      ) : (
        <Card>
          {/* El boton va fuera de EstadoVacio para conservar su data-testid. */}
          <EstadoVacio
            icono={Lock}
            titulo="No hay caja abierta"
            descripcion="Abra una caja para comenzar a registrar pagos"
            className="pb-0"
          />
          <div className="flex justify-center px-6 pb-14 pt-5">
            <Button onClick={() => setShowOpenDialog(true)} data-testid="open-shift-btn">
              <Unlock className="w-4 h-4 mr-2" />
              Abrir Caja
            </Button>
          </div>
        </Card>
      )}

      {/* Previous Shifts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Historial de Cajas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Apertura</TableHead>
                <TableHead>Cierre</TableHead>
                <TableHead>Monto Inicial</TableHead>
                <TableHead>Total Pagos</TableHead>
                <TableHead>Efectivo Contado</TableHead>
                <TableHead>Diferencia</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="escalonado">
              {closedShifts.map(shift => (
                <TableRow key={shift.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(shift.opened_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(shift.closed_at)}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(shift.opening_amount)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatCurrency(Object.values(shift.totals || {}).reduce((a, b) => a + b, 0))}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(shift.counted_cash)}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "font-medium tabular-nums",
                      shift.difference > 0 && "text-[hsl(var(--acento-turquesa))]",
                      shift.difference < 0 && "text-[hsl(var(--acento-fucsia))]"
                    )}>
                      {shift.difference > 0 ? '+' : ''}{formatCurrency(shift.difference)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getStatusLabel(shift.status)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {closedShifts.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0">
                    <EstadoVacio
                      icono={Wallet}
                      titulo="No hay registros de cajas cerradas"
                      descripcion="Cuando cierres una caja aparecerá aquí con su arqueo, el efectivo contado y la diferencia."
                    />
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Open Shift Dialog */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir Caja</DialogTitle>
            <DialogDescription>
              Ingrese el monto de efectivo inicial para comenzar el turno
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Monto de Apertura (S/)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={openingAmount}
              onChange={(e) => setOpeningAmount(e.target.value)}
              placeholder="0.00"
              className="mt-2"
              data-testid="opening-amount-input"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleOpenShift}>
              Abrir Caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close Shift Dialog */}
      <Dialog open={showCloseDialog} onOpenChange={setShowCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cerrar Caja</DialogTitle>
            <DialogDescription>
              Cuente el efectivo y registre el cierre de caja
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2 rounded-lg bg-muted p-4">
              <div className="flex justify-between text-sm">
                <span>Monto apertura:</span>
                <span className="font-medium tabular-nums">{formatCurrency(currentShift?.opening_amount || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Pagos en efectivo:</span>
                <span className="font-medium tabular-nums">{formatCurrency(currentShift?.totals?.EFECTIVO || 0)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Efectivo esperado:</span>
                <span className="tabular-nums">{formatCurrency((currentShift?.opening_amount || 0) + (currentShift?.totals?.EFECTIVO || 0))}</span>
              </div>
            </div>

            <div>
              <Label>Efectivo Contado (S/)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                placeholder="0.00"
                className="mt-2"
                data-testid="counted-cash-input"
              />
            </div>

            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                placeholder="Observaciones del cierre..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCloseShift}>
              Cerrar Caja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movement Dialog */}
      <Dialog open={showMovementDialog} onOpenChange={setShowMovementDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Movimiento</DialogTitle>
            <DialogDescription>
              Ingrese un movimiento de efectivo (ingreso o egreso)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button
                variant={movementType === 'IN' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMovementType('IN')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ingreso
              </Button>
              <Button
                variant={movementType === 'OUT' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setMovementType('OUT')}
              >
                <Minus className="w-4 h-4 mr-2" />
                Egreso
              </Button>
            </div>

            <div>
              <Label>Monto (S/)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0.00"
                className="mt-2"
              />
            </div>

            <div>
              <Label>Motivo</Label>
              <Textarea
                value={movementReason}
                onChange={(e) => setMovementReason(e.target.value)}
                placeholder="Describa el motivo del movimiento..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMovementDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddMovement}>
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default CashShift;
