import React, { useState, useEffect } from 'react';
import { Bell, Check, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
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
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoLista } from '../components/Esqueleto';
import { alertsAPI } from '../lib/api';
import { formatDateTime, getStatusLabel, cn } from '../lib/utils';
import { toast } from 'sonner';

/* Severidad con los tokens de la marca: critica en fucsia, aviso en ambar e
   informacion en turquesa. El chip lleva el fondo tenido y el icono el color
   pleno; la insignia repite el matiz para que la severidad se lea sin el
   borde lateral grueso que habia antes. */
const SEVERIDAD = {
  CRITICAL: {
    Icono: XCircle,
    icono: 'text-[hsl(var(--acento-fucsia))]',
    chip: 'bg-[hsl(var(--status-occupied)/.10)]',
    insignia: 'border-[hsl(var(--status-occupied)/.35)] bg-[hsl(var(--status-occupied)/.12)] text-[hsl(var(--insignia-fucsia))]',
  },
  WARN: {
    Icono: AlertTriangle,
    icono: 'text-[hsl(38_92%_30%)]',
    chip: 'bg-[hsl(var(--chart-3)/.12)]',
    insignia: 'border-[hsl(var(--chart-3)/.35)] bg-[hsl(var(--chart-3)/.12)] text-[hsl(38_92%_26%)]',
  },
  INFO: {
    Icono: Info,
    icono: 'text-[hsl(var(--acento-turquesa))]',
    chip: 'bg-[hsl(var(--status-vacant-clean)/.10)]',
    insignia: 'border-[hsl(var(--status-vacant-clean)/.35)] bg-[hsl(var(--status-vacant-clean)/.12)] text-[hsl(var(--insignia-turquesa))]',
  },
};

const SEVERIDAD_NEUTRA = {
  Icono: Bell,
  icono: 'text-muted-foreground',
  chip: 'bg-muted',
  insignia: '',
};

export function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [severityFilter, setSeverityFilter] = useState('all');

  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [resolveNotes, setResolveNotes] = useState('');

  useEffect(() => {
    fetchAlerts();
  }, [statusFilter, severityFilter]);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (severityFilter !== 'all') params.severity = severityFilter;

      const response = await alertsAPI.list(params);
      setAlerts(response.data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    try {
      await alertsAPI.resolve(selectedAlert.id, resolveNotes);
      toast.success('Alerta resuelta');
      setShowResolveDialog(false);
      setResolveNotes('');
      fetchAlerts();
    } catch (err) {
      toast.error('Error al resolver alerta');
    }
  };

  const getSeverity = (severity) => SEVERIDAD[severity] || SEVERIDAD_NEUTRA;

  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'OPEN').length,
    warn: alerts.filter(a => a.severity === 'WARN' && a.status === 'OPEN').length,
    info: alerts.filter(a => a.severity === 'INFO' && a.status === 'OPEN').length,
  };

  const hayFiltros = statusFilter !== 'all' || severityFilter !== 'all';

  const tarjetas = [
    { rotulo: 'Total', valor: stats.total, ...SEVERIDAD_NEUTRA, valorClase: '' },
    { rotulo: 'Críticas', valor: stats.critical, ...SEVERIDAD.CRITICAL, valorClase: 'text-[hsl(var(--acento-fucsia))]' },
    { rotulo: 'Advertencias', valor: stats.warn, ...SEVERIDAD.WARN, valorClase: 'text-[hsl(38_92%_30%)]' },
    { rotulo: 'Información', valor: stats.info, ...SEVERIDAD.INFO, valorClase: 'text-[hsl(var(--acento-turquesa))]' },
  ];

  return (
    <div className="space-y-6" data-testid="alerts-page">
      <EncabezadoPagina titulo="Centro de Alertas" subtitulo="Gestión de notificaciones del sistema" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tarjetas.map(({ rotulo, valor, Icono, icono, chip, valorClase }) => (
          <Card key={rotulo} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{rotulo}</p>
                <p className={cn('mt-1 text-2xl font-semibold tracking-tight tabular-nums', valorClase)}>{valor}</p>
              </div>
              <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg', chip)}>
                <Icono className={cn('h-5 w-5', icono)} aria-hidden="true" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Estado">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="OPEN">Abiertas</SelectItem>
            <SelectItem value="RESOLVED">Resueltas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-full sm:w-[150px]" aria-label="Severidad">
            <SelectValue placeholder="Severidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="CRITICAL">Crítica</SelectItem>
            <SelectItem value="WARN">Advertencia</SelectItem>
            <SelectItem value="INFO">Información</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Alerts List */}
      {loading ? (
        <EsqueletoLista cantidad={5} />
      ) : alerts.length === 0 ? (
        <Card>
          <EstadoVacio
            icono={Bell}
            titulo="Sin alertas"
            descripcion="No hay alertas que mostrar con los filtros seleccionados"
            accion={hayFiltros ? 'Ver todas las alertas' : undefined}
            onAccion={hayFiltros ? () => { setStatusFilter('all'); setSeverityFilter('all'); } : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3 escalonado">
          {alerts.map(alert => {
            const sev = getSeverity(alert.severity);
            return (
              <Card
                key={alert.id}
                className={cn(
                  "p-4 transition-shadow hover:shadow-md",
                  alert.status === 'RESOLVED' && 'opacity-60'
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', sev.chip)}>
                      <sev.Icono className={cn('h-5 w-5', sev.icono)} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{alert.title}</h3>
                        <Badge variant="outline" className={cn('text-xs', sev.insignia)}>
                          {getStatusLabel(alert.severity)}
                        </Badge>
                        {alert.status === 'RESOLVED' && (
                          <Badge variant="outline" className="text-xs">
                            Resuelta
                          </Badge>
                        )}
                      </div>
                      <p className="break-words text-sm text-zen-600">{alert.message}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDateTime(alert.created_at)}
                        {alert.resolved_at && ` • Resuelta: ${formatDateTime(alert.resolved_at)}`}
                      </p>
                    </div>
                  </div>
                  {alert.status === 'OPEN' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full shrink-0 sm:w-auto"
                      onClick={() => {
                        setSelectedAlert(alert);
                        setShowResolveDialog(true);
                      }}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Resolver
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Resolve Dialog */}
      <Dialog open={showResolveDialog} onOpenChange={setShowResolveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Alerta</DialogTitle>
            <DialogDescription>
              Marcar esta alerta como resuelta
            </DialogDescription>
          </DialogHeader>
          {selectedAlert && (
            <div className="space-y-4 py-4">
              <div className="rounded-lg bg-muted p-3">
                <p className="font-medium">{selectedAlert.title}</p>
                <p className="text-sm text-zen-600">{selectedAlert.message}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Notas (opcional)</label>
                <Textarea
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  placeholder="Agregar notas sobre la resolución..."
                  className="mt-2"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResolveDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleResolve}>
              <Check className="w-4 h-4 mr-2" />
              Marcar como Resuelta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Alerts;
