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
import { alertsAPI } from '../lib/api';
import { formatDateTime, getStatusLabel, cn } from '../lib/utils';
import { toast } from 'sonner';

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

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="w-5 h-5 text-rose-500" />;
      case 'WARN': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'INFO': return <Info className="w-5 h-5 text-blue-500" />;
      default: return <Bell className="w-5 h-5 text-slate-400" />;
    }
  };

  const getSeverityStyle = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'border-l-rose-500 bg-rose-50';
      case 'WARN': return 'border-l-amber-500 bg-amber-50';
      case 'INFO': return 'border-l-blue-500 bg-blue-50';
      default: return 'border-l-slate-300 bg-slate-50';
    }
  };

  const stats = {
    total: alerts.length,
    critical: alerts.filter(a => a.severity === 'CRITICAL' && a.status === 'OPEN').length,
    warn: alerts.filter(a => a.severity === 'WARN' && a.status === 'OPEN').length,
    info: alerts.filter(a => a.severity === 'INFO' && a.status === 'OPEN').length,
  };

  return (
    <div className="space-y-6" data-testid="alerts-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Centro de Alertas</h1>
          <p className="text-slate-500">Gestión de notificaciones del sistema</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Bell className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-slate-500">Total</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-100 rounded-lg">
              <XCircle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-rose-600">{stats.critical}</p>
              <p className="text-sm text-slate-500">Críticas</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{stats.warn}</p>
              <p className="text-sm text-slate-500">Advertencias</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Info className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{stats.info}</p>
              <p className="text-sm text-slate-500">Información</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="OPEN">Abiertas</SelectItem>
            <SelectItem value="RESOLVED">Resueltas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
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
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <Card className="p-12 text-center">
          <Check className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-xl font-medium mb-2">Sin alertas</h3>
          <p className="text-slate-500">No hay alertas que mostrar con los filtros seleccionados</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {alerts.map(alert => (
            <Card 
              key={alert.id} 
              className={cn(
                "p-4 border-l-4 transition-all",
                getSeverityStyle(alert.severity),
                alert.status === 'RESOLVED' && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium">{alert.title}</h3>
                      <Badge variant="secondary" className="text-xs">
                        {getStatusLabel(alert.severity)}
                      </Badge>
                      {alert.status === 'RESOLVED' && (
                        <Badge variant="outline" className="text-xs">
                          Resuelta
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-600">{alert.message}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {formatDateTime(alert.created_at)}
                      {alert.resolved_at && ` • Resuelta: ${formatDateTime(alert.resolved_at)}`}
                    </p>
                  </div>
                </div>
                {alert.status === 'OPEN' && (
                  <Button 
                    size="sm" 
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
          ))}
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
            <div className="py-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="font-medium">{selectedAlert.title}</p>
                <p className="text-sm text-slate-600">{selectedAlert.message}</p>
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
