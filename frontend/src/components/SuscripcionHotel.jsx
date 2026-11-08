import React, { useEffect, useState } from 'react';
import { CreditCard, Download, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
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
import { EsqueletoBloque } from './Esqueleto';
import { suscripcionAPI } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/utils';

/* Suscripcion del hotel, en Configuracion. Solo para su ADMIN: son
   decisiones de pago. El cobro lo hace Mercado Pago; aqui se ve el estado,
   los cobros con su comprobante, se elige boleta o factura y se cancela. */

const TITULO = 'font-heading flex items-center gap-2 text-base font-semibold';
const DESCRIPCION = 'text-sm text-muted-foreground';

const ESTADOS = {
  prueba: 'Prueba gratuita',
  activa: 'Activa',
  vencida: 'Vencida (en gracia)',
  suspendida: 'Suspendida',
  cancelada: 'Cancelada',
};

const COBROS = {
  pagado: 'Pagado',
  fallido: 'Rechazado',
  devuelto: 'Devuelto',
};

const COMPROBANTE = {
  pendiente: 'En emisión',
  emitido: 'Emitido',
  no_aplica: 'Sin comprobante',
};

function mensajeDeError(error, porDefecto) {
  const detalle = error?.response?.data?.detail;
  return typeof detalle === 'string' ? detalle : porDefecto;
}

async function descargar(pago) {
  try {
    const res = await suscripcionAPI.comprobante(pago.id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante-${pago.comp_serie || 'zenstay'}-${pago.comp_numero || pago.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast.error('No pudimos descargar el comprobante');
  }
}

export function SuscripcionHotel() {
  const [cargando, setCargando] = useState(true);
  const [estado, setEstado] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [factura, setFactura] = useState({ tipo: 'boleta', documento: '' });
  const [guardando, setGuardando] = useState(false);
  const [confirmarCancelar, setConfirmarCancelar] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const [e, p] = await Promise.all([suscripcionAPI.estado(), suscripcionAPI.pagos()]);
      setEstado(e.data);
      setPagos(p.data?.pagos || []);
      const f = p.data?.facturacion;
      setFactura({ tipo: f?.tipo || 'boleta', documento: f?.documento || '' });
    } catch (error) {
      toast.error('No pudimos cargar la suscripción');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardarFactura = async (ev) => {
    ev.preventDefault();
    setGuardando(true);
    try {
      await suscripcionAPI.guardarFacturacion(factura);
      toast.success('Guardado. Se usará en los próximos cobros.');
    } catch (error) {
      toast.error(mensajeDeError(error, 'No pudimos guardar los datos'));
    } finally {
      setGuardando(false);
    }
  };

  const cancelar = async () => {
    setCancelando(true);
    try {
      const res = await suscripcionAPI.cancelar();
      toast.success(res.data?.message || 'Suscripción cancelada');
      setConfirmarCancelar(false);
      await cargar();
    } catch (error) {
      toast.error(mensajeDeError(error, 'No pudimos cancelar la suscripción'));
    } finally {
      setCancelando(false);
    }
  };

  if (cargando) return <EsqueletoBloque lineas={6} />;
  if (!estado) return null;

  const efectivo = estado.estado_efectivo || estado.subscription_status;
  const conCobro = Boolean(estado.cobro_automatico);

  return (
    <div className="space-y-6">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className={TITULO}>
            <CreditCard className="h-5 w-5 shrink-0 text-muted-foreground" />
            Tu plan
          </CardTitle>
          <CardDescription className={DESCRIPCION}>
            El cobro lo procesa Mercado Pago. ZenStay no ve ni guarda los datos de tu tarjeta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="font-medium">{estado.plan_nombre}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estado</p>
              <Badge variant={estado.tiene_acceso ? 'secondary' : 'destructive'}>
                {ESTADOS[efectivo] || efectivo}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {efectivo === 'cancelada' ? 'Acceso hasta' : efectivo === 'prueba' ? 'La prueba termina' : 'Pagado hasta'}
              </p>
              <p className="font-medium">{estado.vence ? formatDate(estado.vence) : '—'}</p>
            </div>
          </div>

          {conCobro ? (
            <p className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Cobro automático activo en Mercado Pago. Se renueva solo al terminar cada periodo.
            </p>
          ) : (
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No hay cobro automático activo.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {!conCobro && (
              <Button asChild>
                <a href="/precios">{efectivo === 'activa' ? 'Ver planes' : 'Contratar un plan'}</a>
              </Button>
            )}
            {(conCobro || efectivo === 'activa') && (
              <Button variant="outline" onClick={() => setConfirmarCancelar(true)}>
                Cancelar suscripción
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className={TITULO}>
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
            Comprobante de tus pagos
          </CardTitle>
          <CardDescription className={DESCRIPCION}>
            Elige boleta o factura para los próximos cobros. Los ya cobrados no cambian.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={guardarFactura} className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
            <fieldset className="flex gap-4">
              <legend className="sr-only">Tipo de comprobante</legend>
              {['boleta', 'factura'].map((tipo) => (
                <label key={tipo} className="flex min-h-[40px] items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="tipo"
                    value={tipo}
                    checked={factura.tipo === tipo}
                    onChange={() => setFactura({ ...factura, tipo })}
                  />
                  {tipo === 'boleta' ? 'Boleta' : 'Factura'}
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="documento-comprobante">
                {factura.tipo === 'factura' ? 'RUC' : 'DNI (opcional)'}
              </Label>
              <Input
                id="documento-comprobante"
                inputMode="numeric"
                maxLength={11}
                value={factura.documento}
                onChange={(e) => setFactura({ ...factura, documento: e.target.value.replace(/\D/g, '') })}
              />
            </div>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className={TITULO}>Cobros</CardTitle>
        </CardHeader>
        <CardContent>
          {pagos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay cobros.</p>
          ) : (
            <ul className="divide-y">
              {pagos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">
                      {formatCurrency(p.monto)} · {p.plan_codigo} {p.periodo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(p.confirmado_en || p.created_at)} · {COBROS[p.estado] || p.estado}
                      {p.comp_estado && ` · ${COMPROBANTE[p.comp_estado] || p.comp_estado}`}
                      {p.comp_serie && ` ${p.comp_serie}-${p.comp_numero}`}
                    </p>
                  </div>
                  {p.comp_estado === 'emitido' && p.comp_tiene_pdf && (
                    <Button variant="outline" size="sm" onClick={() => descargar(p)}>
                      <Download className="mr-1 h-4 w-4" />
                      Comprobante
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmarCancelar} onOpenChange={setConfirmarCancelar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la suscripción?</AlertDialogTitle>
            <AlertDialogDescription>
              Mercado Pago dejará de cobrar los próximos periodos. Conservas el acceso
              hasta el fin del periodo ya pagado{estado.vence ? ` (${formatDate(estado.vence)})` : ''}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelando}>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelando}
              onClick={(e) => {
                e.preventDefault();
                cancelar();
              }}
            >
              {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default SuscripcionHotel;
