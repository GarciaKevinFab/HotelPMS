import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { FileText, Upload, Ban, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EsqueletoBloque } from '../components/Esqueleto';
import { comprobantesAPI } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, formatDate } from '../lib/utils';

/* Consola del dueno para los comprobantes de la suscripcion (adaptada de la
   de LicitaPro). Cada cobro aprobado por Mercado Pago entra como pendiente
   con la foto de los datos de boleta o factura de ese momento. El dueno lo
   emite en el sistema de SUNAT que use y aqui registra serie, numero, fecha
   y el PDF, que el hotel descarga desde su cuenta. Solo SUPER_ADMIN. */

function hoy() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function mensajeDeError(error, porDefecto) {
  const detalle = error?.response?.data?.detail;
  return typeof detalle === 'string' ? detalle : porDefecto;
}

async function verPdf(pago) {
  try {
    const res = await comprobantesAPI.pdf(pago.id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    toast.error('No pudimos abrir el PDF');
  }
}

function Datos({ p }) {
  return (
    <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">Hotel</dt>
      <dd>{p.hotel} · RUC {p.hotel_ruc || '—'} · {p.email}</dd>
      <dt className="text-muted-foreground">Comprobante</dt>
      <dd>
        {p.comp_tipo === 'factura' ? 'Factura' : 'Boleta'}
        {p.comp_documento ? ` a ${p.comp_documento}` : ' sin documento'}
        {p.comp_nombre ? ` · ${p.comp_nombre}` : ''}
      </dd>
      {p.comp_direccion && (
        <>
          <dt className="text-muted-foreground">Dirección</dt>
          <dd>{p.comp_direccion}</dd>
        </>
      )}
      <dt className="text-muted-foreground">Importe</dt>
      <dd>
        {formatCurrency(p.monto)} (valor de venta {formatCurrency(p.base)} + IGV {formatCurrency(p.igv)})
        · {p.plan_codigo} {p.periodo}
      </dd>
      <dt className="text-muted-foreground">Cobro</dt>
      <dd>
        {formatDate(p.confirmado_en || p.created_at)} · Mercado Pago {p.referencia}
      </dd>
    </dl>
  );
}

function Pendiente({ p, alTerminar }) {
  const [serie, setSerie] = useState(p.comp_tipo === 'factura' ? 'F001' : 'B001');
  const [numero, setNumero] = useState('');
  const [emitido, setEmitido] = useState(hoy());
  const [pdf, setPdf] = useState(null);
  const [nota, setNota] = useState('');
  const [enviando, setEnviando] = useState(false);

  const registrar = async (ev) => {
    ev.preventDefault();
    const datos = new FormData();
    datos.append('serie', serie.trim().toUpperCase());
    datos.append('numero', numero.trim());
    datos.append('emitido', emitido);
    if (pdf) datos.append('pdf', pdf);
    setEnviando(true);
    try {
      await comprobantesAPI.emitido(p.id, datos);
      toast.success('Comprobante registrado');
      alTerminar();
    } catch (error) {
      toast.error(mensajeDeError(error, 'No pudimos registrar el comprobante'));
    } finally {
      setEnviando(false);
    }
  };

  const sinComprobante = async () => {
    if (!nota.trim()) {
      toast.error('Escribe por qué no lleva comprobante');
      return;
    }
    setEnviando(true);
    try {
      await comprobantesAPI.noAplica(p.id, nota.trim());
      toast.success('Marcado sin comprobante');
      alTerminar();
    } catch (error) {
      toast.error(mensajeDeError(error, 'No pudimos marcarlo'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <li className="space-y-4 py-4">
      <Datos p={p} />
      <form onSubmit={registrar} className="grid gap-3 sm:grid-cols-4 sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor={`serie-${p.id}`}>Serie</Label>
          <Input id={`serie-${p.id}`} value={serie} maxLength={4} onChange={(e) => setSerie(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`numero-${p.id}`}>Número</Label>
          <Input id={`numero-${p.id}`} inputMode="numeric" value={numero} maxLength={8}
                 onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`fecha-${p.id}`}>Fecha de emisión</Label>
          <Input id={`fecha-${p.id}`} type="date" value={emitido} onChange={(e) => setEmitido(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pdf-${p.id}`}>PDF</Label>
          <Input id={`pdf-${p.id}`} type="file" accept="application/pdf"
                 onChange={(e) => setPdf(e.target.files?.[0] || null)} />
        </div>
        <div className="sm:col-span-4">
          <Button type="submit" disabled={enviando}>
            <Upload className="mr-1 h-4 w-4" />
            Registrar emitido
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1 space-y-1.5">
          <Label htmlFor={`nota-${p.id}`}>O marcar sin comprobante (motivo)</Label>
          <Input id={`nota-${p.id}`} value={nota} maxLength={300} onChange={(e) => setNota(e.target.value)} />
        </div>
        <Button variant="outline" disabled={enviando} onClick={sinComprobante}>
          <Ban className="mr-1 h-4 w-4" />
          Sin comprobante
        </Button>
      </div>
    </li>
  );
}

function Hecho({ p }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="text-sm">
        <p className="font-medium">
          {p.hotel} · {formatCurrency(p.monto)}
          {p.estado === 'devuelto' && <Badge variant="destructive" className="ml-2">Devuelto</Badge>}
        </p>
        <p className="text-muted-foreground">
          {p.comp_estado === 'emitido'
            ? `${p.comp_tipo === 'factura' ? 'Factura' : 'Boleta'} ${p.comp_serie}-${p.comp_numero} · ${formatDate(p.comp_emitido_en)}`
            : `Sin comprobante: ${p.comp_nota || '—'}`}
        </p>
      </div>
      {p.comp_tiene_pdf && (
        <Button variant="outline" size="sm" onClick={() => verPdf(p)}>
          <Eye className="mr-1 h-4 w-4" />
          PDF
        </Button>
      )}
    </li>
  );
}

export function Comprobantes() {
  const { isSuperAdmin } = useAuth();
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState({ pendientes: [], devueltos: [], recientes: [] });

  const cargar = async () => {
    setCargando(true);
    try {
      const res = await comprobantesAPI.panel();
      setDatos(res.data);
    } catch (error) {
      toast.error('No pudimos cargar los comprobantes');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6" data-testid="comprobantes-page">
      <EncabezadoPagina titulo="Comprobantes" subtitulo="Boletas y facturas de los cobros de la suscripción" />

      {cargando ? (
        <EsqueletoBloque lineas={6} />
      ) : (
        <>
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-base font-semibold">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                Pendientes de emitir ({datos.pendientes.length})
              </CardTitle>
              <CardDescription>
                Emite cada uno en tu sistema de SUNAT con estos datos y registra aquí serie, número y PDF.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {datos.pendientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay comprobantes pendientes.</p>
              ) : (
                <ul className="divide-y">
                  {datos.pendientes.map((p) => <Pendiente key={p.id} p={p} alTerminar={cargar} />)}
                </ul>
              )}
            </CardContent>
          </Card>

          {datos.devueltos.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="font-heading text-base font-semibold">
                  Devueltos con comprobante emitido
                </CardTitle>
                <CardDescription>
                  Mercado Pago devolvió estos cobros: corresponde emitir la nota de crédito.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {datos.devueltos.map((p) => <Hecho key={p.id} p={p} />)}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="font-heading text-base font-semibold">Últimos registrados</CardTitle>
            </CardHeader>
            <CardContent>
              {datos.recientes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía no hay comprobantes registrados.</p>
              ) : (
                <ul className="divide-y">
                  {datos.recientes.map((p) => <Hecho key={p.id} p={p} />)}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default Comprobantes;
