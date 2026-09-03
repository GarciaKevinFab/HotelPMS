import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  Trash2,
  Calendar,
  Tag,
  BedDouble
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoFilas, EsqueletoTarjetas } from '../components/Esqueleto';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
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
import { ratesAPI, roomTypesAPI } from '../lib/api';
import { formatCurrency, formatDate, cn } from '../lib/utils';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

export function Rates() {
  const { isAdmin } = useAuth();
  const [rates, setRates] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoomType, setSelectedRoomType] = useState('all');

  // Create dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [formData, setFormData] = useState({
    room_type_id: '',
    date_from: '',
    date_to: '',
    price: '',
    name: '',
    min_stay: 1
  });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchData();
  }, [selectedRoomType]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ratesRes, rtRes] = await Promise.all([
        ratesAPI.list(selectedRoomType !== 'all' ? selectedRoomType : null),
        roomTypesAPI.list()
      ]);
      setRates(ratesRes.data);
      setRoomTypes(rtRes.data);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.room_type_id || !formData.date_from || !formData.date_to || !formData.price) {
      toast.error('Complete los campos requeridos');
      return;
    }

    if (new Date(formData.date_from) > new Date(formData.date_to)) {
      toast.error('La fecha de inicio debe ser anterior a la fecha fin');
      return;
    }

    setCreating(true);
    try {
      await ratesAPI.create({
        room_type_id: formData.room_type_id,
        date_from: formData.date_from,
        date_to: formData.date_to,
        price: parseFloat(formData.price),
        name: formData.name || null,
        min_stay: formData.min_stay
      });
      toast.success('Tarifa creada exitosamente');
      setShowCreateDialog(false);
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear tarifa');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (rateId) => {
    if (!confirm('¿Eliminar esta tarifa?')) return;

    try {
      await ratesAPI.delete(rateId);
      toast.success('Tarifa eliminada');
      fetchData();
    } catch (err) {
      toast.error('Error al eliminar tarifa');
    }
  };

  const resetForm = () => {
    setFormData({
      room_type_id: '',
      date_from: '',
      date_to: '',
      price: '',
      name: '',
      min_stay: 1
    });
  };

  const getRoomTypeName = (rtId) => {
    const rt = roomTypes.find(r => r.id === rtId);
    return rt?.name || 'Desconocido';
  };

  const getRoomTypeBasePrice = (rtId) => {
    const rt = roomTypes.find(r => r.id === rtId);
    return rt?.base_price || 0;
  };

  // Group rates by room type
  const ratesByType = {};
  rates.forEach(rate => {
    if (!ratesByType[rate.room_type_id]) {
      ratesByType[rate.room_type_id] = [];
    }
    ratesByType[rate.room_type_id].push(rate);
  });

  // El filtro se aplica en el servidor, asi que "filtrado" es simplemente
  // que haya un tipo elegido distinto de "todos".
  const hayFiltro = selectedRoomType !== 'all';
  // La rejilla de tipos solo muestra esqueleto la primera vez: al cambiar el
  // filtro los tipos ya estan cargados y parpadearian sin motivo.
  const primeraCarga = loading && roomTypes.length === 0;
  const columnas = isAdmin ? 7 : 6;

  return (
    <div className="space-y-6" data-testid="rates-page">
      <EncabezadoPagina
        titulo="Tarifas"
        subtitulo="Gestión de precios por temporada"
        acciones={isAdmin && (
          <Button onClick={() => setShowCreateDialog(true)} data-testid="create-rate-btn">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Tarifa
          </Button>
        )}
      />

      {/* Room Types Overview */}
      {primeraCarga ? (
        <EsqueletoTarjetas cantidad={3} alto="h-auto" className="md:grid-cols-3" />
      ) : roomTypes.length === 0 ? (
        <Card>
          <EstadoVacio
            compacto
            icono={BedDouble}
            titulo="Sin tipos de habitación"
            descripcion="Las tarifas se definen por tipo de habitación. Crea primero los tipos desde Habitaciones y aquí aparecerá su precio base."
          />
        </Card>
      ) : (
        <div className="escalonado grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {roomTypes.map(rt => (
            <Card key={rt.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-muted-foreground">{rt.name}</p>
                  <p className="mt-1 whitespace-nowrap text-2xl font-semibold tracking-tight tabular-nums text-[hsl(var(--acento-turquesa))]">
                    {formatCurrency(rt.base_price)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Tarifa Base</p>
                </div>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[hsl(var(--status-vacant-clean)/.10)] text-[hsl(var(--acento-turquesa))]">
                  <BedDouble className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                {ratesByType[rt.id]?.length || 0} tarifas especiales configuradas
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Filter */}
      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Label htmlFor="filtro-tipo-tarifa">Filtrar por tipo:</Label>
          <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
            <SelectTrigger id="filtro-tipo-tarifa" className="w-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {roomTypes.map(rt => (
                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Rates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tarifas Especiales</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tipo Habitación</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Precio/Noche</TableHead>
                <TableHead>Estancia Mín.</TableHead>
                <TableHead>vs Base</TableHead>
                {isAdmin && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody className="escalonado">
              {loading ? (
                <EsqueletoFilas filas={5} columnas={columnas} />
              ) : rates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnas} className="p-0">
                    <EstadoVacio
                      icono={DollarSign}
                      titulo="Sin tarifas especiales"
                      descripcion="Cada tipo de habitación ya cobra su precio base. Las especiales sirven para temporada alta, fines de semana o un rango de fechas concreto."
                      accion={isAdmin ? 'Crear una tarifa' : undefined}
                      onAccion={isAdmin ? () => setShowCreateDialog(true) : undefined}
                      filtrado={hayFiltro}
                      onLimpiar={() => setSelectedRoomType('all')}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rates.map((rate) => {
                  const basePrice = getRoomTypeBasePrice(rate.room_type_id);
                  const diff = rate.price - basePrice;
                  const diffPercent = basePrice > 0 ? ((diff / basePrice) * 100).toFixed(0) : 0;

                  return (
                    <TableRow key={rate.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <Tag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className={cn(!rate.name && 'font-normal text-muted-foreground')}>
                            {rate.name || 'Sin nombre'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{getRoomTypeName(rate.room_type_id)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 whitespace-nowrap text-sm">
                          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          {formatDate(rate.date_from)} - {formatDate(rate.date_to)}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-semibold tabular-nums">
                        {formatCurrency(rate.price)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {rate.min_stay > 1 ? `${rate.min_stay} noches` : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            'border-transparent tabular-nums',
                            diff > 0
                              ? 'bg-[hsl(var(--status-occupied)/.10)] text-[hsl(var(--acento-fucsia))]'
                              : diff < 0
                                ? 'bg-[hsl(var(--status-vacant-clean)/.10)] text-[hsl(var(--acento-turquesa))]'
                                : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {diff > 0 ? '+' : ''}{diffPercent}%
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label="Eliminar tarifa"
                            onClick={() => handleDelete(rate.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Tarifa Especial</DialogTitle>
            <DialogDescription>
              Configure una tarifa para un período específico
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Tipo de Habitación *</Label>
              <Select
                value={formData.room_type_id}
                onValueChange={(v) => setFormData(prev => ({ ...prev, room_type_id: v }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccione tipo" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map(rt => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name} (Base: {formatCurrency(rt.base_price)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Nombre de la Tarifa</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ej: Temporada Alta, Feriado, Promoción..."
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Fecha Inicio *</Label>
                <Input
                  type="date"
                  value={formData.date_from}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_from: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Fecha Fin *</Label>
                <Input
                  type="date"
                  value={formData.date_to}
                  onChange={(e) => setFormData(prev => ({ ...prev, date_to: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Precio por Noche (S/) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0.00"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Estancia Mínima (noches)</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.min_stay}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_stay: parseInt(e.target.value) || 1 }))}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creando...' : 'Crear Tarifa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Rates;
