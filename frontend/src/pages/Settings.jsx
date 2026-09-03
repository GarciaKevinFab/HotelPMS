import React, { useState, useEffect } from 'react';
import {
  Building2,
  Receipt,
  Users,
  Save,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  UserRound,
  KeyRound,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoBloque } from '../components/Esqueleto';
import { GestionUsuarios, InsigniaRol } from '../components/GestionUsuarios';
import { tenantsAPI, authAPI } from '../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

/* Misma jerarquia en todas las pestanas: titulo de seccion en font-heading,
   descripcion en gris, y un solo boton turquesa por formulario. */
const TITULO_SECCION = 'font-heading flex items-center gap-2 text-base font-semibold';
const DESCRIPCION_SECCION = 'text-sm text-muted-foreground';

const HOTEL_VACIO = {
  name: '', razon_social: '', nombre_comercial: '', ruc: '', address: '', phone: '', email: '',
  checkin_time: '14:00', checkout_time: '12:00',
};

/* ---------------------------------------------------------------------- */
/* Mi cuenta: nombre y contrasena propios. Lo ve todo el mundo, incluido   */
/* el SUPER_ADMIN, que hasta ahora no tenia forma de cambiar su clave.     */
/* ---------------------------------------------------------------------- */
function MiCuenta() {
  const { user, actualizarUsuario, enOtroHotel } = useAuth();
  const [nombre, setNombre] = useState(user?.full_name || '');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [claves, setClaves] = useState({ actual: '', nueva: '', repetir: '' });
  const [verClaves, setVerClaves] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);

  useEffect(() => { setNombre(user?.full_name || ''); }, [user?.full_name]);

  const guardarNombre = async () => {
    const limpio = nombre.trim();
    if (limpio.length < 2) {
      toast.error('Escribe tu nombre');
      return;
    }
    setGuardandoNombre(true);
    try {
      await authAPI.actualizarPerfil({ full_name: limpio });
      actualizarUsuario({ full_name: limpio });
      toast.success('Nombre actualizado');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo guardar el nombre');
    } finally {
      setGuardandoNombre(false);
    }
  };

  const cambiarClave = async () => {
    if (!claves.actual) {
      toast.error('Escribe tu contraseña actual');
      return;
    }
    if (claves.nueva.length < 8) {
      toast.error('La contraseña nueva necesita al menos 8 caracteres');
      return;
    }
    if (claves.nueva !== claves.repetir) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }
    setGuardandoClave(true);
    try {
      await authAPI.cambiarPassword(claves.actual, claves.nueva);
      setClaves({ actual: '', nueva: '', repetir: '' });
      toast.success('Contraseña cambiada');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo cambiar la contraseña');
    } finally {
      setGuardandoClave(false);
    }
  };

  const tipo = verClaves ? 'text' : 'password';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className={TITULO_SECCION}>
            <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Mis datos
          </CardTitle>
          <CardDescription className={DESCRIPCION_SECCION}>
            El nombre con el que apareces en la cabecera y en la bitácora.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {enOtroHotel && (
            <p className="rounded-md border border-[hsl(var(--chart-3)/.45)] bg-[hsl(var(--chart-3)/.12)] px-3 py-2 text-sm">
              Estás dentro de un hotel como superadmin: sal de él para editar tu cuenta.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="cuenta-nombre">Nombre completo</Label>
              <Input id="cuenta-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} disabled={enOtroHotel} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cuenta-email">Correo de acceso</Label>
              <Input id="cuenta-email" value={user?.email || ''} readOnly className="bg-muted/50" />
              <p className="text-xs text-muted-foreground">Lo cambia el administrador del hotel.</p>
            </div>
            <div className="space-y-2">
              <Label>Rol</Label>
              <div className="flex h-11 items-center sm:h-9">
                <InsigniaRol rol={user?.rol_real || user?.role} />
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <Button className="w-full sm:w-auto" onClick={guardarNombre} disabled={guardandoNombre || enOtroHotel || nombre.trim() === (user?.full_name || '')}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {guardandoNombre ? 'Guardando…' : 'Guardar nombre'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className={TITULO_SECCION}>
            <KeyRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Cambiar contraseña
          </CardTitle>
          <CardDescription className={DESCRIPCION_SECCION}>
            Necesitas la actual. La nueva, de al menos 8 caracteres.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="clave-actual">Contraseña actual</Label>
              <Input id="clave-actual" type={tipo} autoComplete="current-password" value={claves.actual} onChange={(e) => setClaves({ ...claves, actual: e.target.value })} disabled={enOtroHotel} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clave-nueva">Nueva contraseña</Label>
              <Input id="clave-nueva" type={tipo} autoComplete="new-password" value={claves.nueva} onChange={(e) => setClaves({ ...claves, nueva: e.target.value })} disabled={enOtroHotel} placeholder="Mínimo 8 caracteres" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="clave-repetir">Repetir nueva</Label>
              <Input id="clave-repetir" type={tipo} autoComplete="new-password" value={claves.repetir} onChange={(e) => setClaves({ ...claves, repetir: e.target.value })} disabled={enOtroHotel} />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => setVerClaves((v) => !v)}>
              {verClaves ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              {verClaves ? 'Ocultar contraseñas' : 'Mostrar contraseñas'}
            </Button>
            <Button className="w-full sm:w-auto" onClick={cambiarClave} disabled={guardandoClave || enOtroHotel}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              {guardandoClave ? 'Cambiando…' : 'Cambiar contraseña'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Settings() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState(null);

  // Invoicing config
  const [invoicingConfig, setInvoicingConfig] = useState({
    nubefact_ruta: '',
    nubefact_token: '',
    mode: 'MOCK'
  });
  const [showToken, setShowToken] = useState(false);

  // Ficha del hotel (editable por el ADMIN)
  const [hotelForm, setHotelForm] = useState(HOTEL_VACIO);
  const [savingHotel, setSavingHotel] = useState(false);

  // El SUPER_ADMIN de verdad (sin hotel) solo tiene "Mi cuenta": la
  // facturacion y la ficha son de UN hotel, y el no tiene ninguno. Cuando
  // entra a uno con "Entrar como" el token trae tenant_id y ve todo lo del
  // hotel, igual que su ADMIN.
  const tieneHotel = Boolean(user?.tenant_id);
  const soloCuenta = !tieneHotel;

  useEffect(() => {
    if (tieneHotel) fetchData();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tieneHotel]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const tenantRes = await tenantsAPI.get(user.tenant_id);
      const t = tenantRes.data;
      setTenant(t);
      setHotelForm({
        name: t.name || '',
        razon_social: t.razon_social || '',
        nombre_comercial: t.nombre_comercial || '',
        ruc: t.ruc || '',
        address: t.address || '',
        phone: t.phone || '',
        email: t.email || '',
        checkin_time: t.checkin_time || '14:00',
        checkout_time: t.checkout_time || '12:00',
      });

      // La configuracion de facturacion viene en campos planos del hotel.
      // Antes llegaba anidada en `invoicing_config` Y duplicada en la raiz;
      // con Postgres existe una sola vez, que es la que consulta el codigo
      // que emite los comprobantes.
      //
      // El modo sale de invoicing_mode y no de "¿hay token?": un hotel puede
      // tener el token cargado y seguir en MOCK a proposito mientras prueba,
      // y con la regla vieja la pantalla le decia que ya estaba emitiendo de
      // verdad a SUNAT.
      setInvoicingConfig({
        nubefact_ruta: t.nubefact_ruta || '',
        nubefact_token: t.nubefact_token || '',
        mode: t.invoicing_mode || 'MOCK'
      });
    } catch (err) {
      console.error('Error fetching settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInvoicing = async () => {
    setSaving(true);
    try {
      // Se manda tambien el modo: es lo que decide si los comprobantes van de
      // verdad a SUNAT o se quedan en simulacion. Sin este campo, elegir LIVE
      // en la pantalla no cambiaba nada en el servidor.
      //
      // Lo que NO se manda (series, correlativos, IGV) se queda intacto: el
      // endpoint hace coalesce campo a campo.
      await tenantsAPI.updateInvoicing(user.tenant_id, {
        nubefact_ruta: invoicingConfig.nubefact_ruta || null,
        nubefact_token: invoicingConfig.nubefact_token || null,
        invoicing_mode: invoicingConfig.mode || 'MOCK'
      });
      toast.success('Configuración de facturación guardada');
    } catch (err) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const guardarHotel = async () => {
    if (!hotelForm.name.trim()) {
      toast.error('El nombre del hotel es obligatorio');
      return;
    }
    if (hotelForm.ruc.length !== 11) {
      toast.error('RUC debe tener 11 dígitos');
      return;
    }
    setSavingHotel(true);
    try {
      // Solo viajan los campos con valor: el servidor deja intacto lo que no
      // llega, y un correo vacio no pasa la validacion.
      const datos = {};
      Object.entries(hotelForm).forEach(([k, v]) => { if (String(v).trim() !== '') datos[k] = String(v).trim(); });
      await tenantsAPI.update(user.tenant_id, datos);
      toast.success('Datos del hotel guardados');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudieron guardar los datos del hotel');
    } finally {
      setSavingHotel(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" data-testid="settings-page">
        <EncabezadoPagina titulo="Configuración" subtitulo="Ajustes del sistema y facturación" />
        <EsqueletoBloque lineas={6} />
      </div>
    );
  }

  if (soloCuenta) {
    return (
      <div className="space-y-6" data-testid="settings-page">
        <EncabezadoPagina
          titulo="Configuración"
          subtitulo={isSuperAdmin ? 'Tu cuenta de superadmin. Los hoteles se administran desde Hoteles.' : 'Tu cuenta'}
        />
        <MiCuenta />
      </div>
    );
  }

  const enProduccion = invoicingConfig.mode === 'LIVE';
  const pestanas = isAdmin ? 4 : 2;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <EncabezadoPagina titulo="Configuración" subtitulo="Ajustes del sistema, facturación y tu cuenta" />

      <Tabs defaultValue={isAdmin ? 'invoicing' : 'cuenta'} className="space-y-6">
        {/* En el telefono las pestanas reparten el ancho; cuatro botones de
            ancho natural no cabian y la lista se cortaba. */}
        <TabsList className={cn('grid h-auto w-full sm:inline-grid sm:w-auto', pestanas === 4 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2')}>
          {isAdmin && (
            <TabsTrigger value="invoicing" className="min-h-[40px] gap-2">
              <Receipt className="h-4 w-4 shrink-0" />
              Facturación
            </TabsTrigger>
          )}
          <TabsTrigger value="hotel" className="min-h-[40px] gap-2">
            <Building2 className="h-4 w-4 shrink-0" />
            Hotel
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="min-h-[40px] gap-2">
              <Users className="h-4 w-4 shrink-0" />
              Usuarios
            </TabsTrigger>
          )}
          <TabsTrigger value="cuenta" className="min-h-[40px] gap-2">
            <UserRound className="h-4 w-4 shrink-0" />
            Mi cuenta
          </TabsTrigger>
        </TabsList>

        {/* Invoicing Tab */}
        {isAdmin && (
        <TabsContent value="invoicing" className="animate-slide-in-up">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className={TITULO_SECCION}>
                <Receipt className="h-5 w-5 shrink-0 text-muted-foreground" />
                Configuración NubeFact
              </CardTitle>
              <CardDescription className={DESCRIPCION_SECCION}>
                Configure la integración con SUNAT para facturación electrónica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mode indicator */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {enProduccion ? (
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--acento-turquesa))]" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(var(--chart-3))]" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {enProduccion ? 'Modo Producción' : 'Modo Pruebas (MOCK)'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {enProduccion ? 'Facturas enviadas a SUNAT' : 'Facturas simuladas, no enviadas a SUNAT'}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={enProduccion ? 'status-vacant-clean self-start sm:self-auto' : 'status-dirty self-start sm:self-auto'}
                >
                  {enProduccion ? 'LIVE' : 'MOCK'}
                </Badge>
              </div>

              <Separator />

              {/* API Configuration */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nubefact_ruta">URL de la API (Ruta)</Label>
                  <Input
                    id="nubefact_ruta"
                    value={invoicingConfig.nubefact_ruta}
                    onChange={(e) => setInvoicingConfig(prev => ({ ...prev, nubefact_ruta: e.target.value }))}
                    placeholder="https://api.nubefact.com/api/v1/..."
                    data-testid="nubefact-ruta-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    La URL proporcionada por NubeFact para su cuenta
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nubefact_token">Token de Autenticación</Label>
                  <div className="relative">
                    <Input
                      id="nubefact_token"
                      type={showToken ? 'text' : 'password'}
                      value={invoicingConfig.nubefact_token}
                      onChange={(e) => setInvoicingConfig(prev => ({ ...prev, nubefact_token: e.target.value }))}
                      placeholder="••••••••••••••••"
                      className="pr-12"
                      data-testid="nubefact-token-input"
                    />
                    {/* Era un boton mudo: solo un ojo, sin nombre, asi que con
                        lector de pantalla se oia "boton" y nada mas. Y median
                        40 px de ancho; px-4 los lleva a 44. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={showToken ? 'Ocultar el token' : 'Mostrar el token'}
                      className="absolute right-0 top-0 h-full px-4 text-muted-foreground"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    El token de su cuenta NubeFact. Nunca compartir este valor.
                  </p>
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="nubefact_modo">Modo de emisión</Label>
                  <select
                    id="nubefact_modo"
                    value={invoicingConfig.mode}
                    onChange={(e) => setInvoicingConfig(prev => ({ ...prev, mode: e.target.value }))}
                    className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-9 sm:max-w-xs"
                  >
                    <option value="MOCK">Pruebas (MOCK): no se envía nada a SUNAT</option>
                    <option value="LIVE">Producción (LIVE): comprobantes reales</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button className="w-full sm:w-auto" onClick={handleSaveInvoicing} disabled={saving} data-testid="save-invoicing-btn">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Guardando...' : 'Guardar Configuración'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}

        {/* Hotel Tab */}
        <TabsContent value="hotel" className="animate-slide-in-up">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className={TITULO_SECCION}>
                <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                Información del Hotel
              </CardTitle>
              <CardDescription className={DESCRIPCION_SECCION}>
                Datos fiscales y de contacto que aparecen en los comprobantes
                {isAdmin ? '. El plan y la facturación electrónica van aparte.' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!tenant ? (
                <EstadoVacio
                  compacto
                  icono={Building2}
                  titulo="No hay información del hotel disponible"
                  descripcion="Los datos del hotel los carga el administrador del sistema al darlo de alta. Si cree que falta algo, escríbale."
                />
              ) : isAdmin ? (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="hotel-name">Nombre *</Label>
                      <Input id="hotel-name" value={hotelForm.name} onChange={(e) => setHotelForm({ ...hotelForm, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-ruc">RUC *</Label>
                      <Input id="hotel-ruc" inputMode="numeric" maxLength={11} className="font-mono" value={hotelForm.ruc} onChange={(e) => setHotelForm({ ...hotelForm, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-razon">Razón social</Label>
                      <Input id="hotel-razon" value={hotelForm.razon_social} onChange={(e) => setHotelForm({ ...hotelForm, razon_social: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-comercial">Nombre comercial</Label>
                      <Input id="hotel-comercial" value={hotelForm.nombre_comercial} onChange={(e) => setHotelForm({ ...hotelForm, nombre_comercial: e.target.value })} />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="hotel-address">Dirección</Label>
                      <Input id="hotel-address" value={hotelForm.address} onChange={(e) => setHotelForm({ ...hotelForm, address: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-phone">Teléfono</Label>
                      <Input id="hotel-phone" value={hotelForm.phone} onChange={(e) => setHotelForm({ ...hotelForm, phone: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-email">Correo</Label>
                      <Input id="hotel-email" type="email" value={hotelForm.email} onChange={(e) => setHotelForm({ ...hotelForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-checkin">Hora de check-in</Label>
                      <Input id="hotel-checkin" type="time" value={hotelForm.checkin_time} onChange={(e) => setHotelForm({ ...hotelForm, checkin_time: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotel-checkout">Hora de check-out</Label>
                      <Input id="hotel-checkout" type="time" value={hotelForm.checkout_time} onChange={(e) => setHotelForm({ ...hotelForm, checkout_time: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button className="w-full sm:w-auto" onClick={guardarHotel} disabled={savingHotel}>
                      <Save className="h-4 w-4" aria-hidden="true" />
                      {savingHotel ? 'Guardando…' : 'Guardar datos del hotel'}
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="escalonado grid gap-4 sm:grid-cols-2">
                  {[
                    ['Razón Social', tenant.razon_social || tenant.name],
                    ['Nombre Comercial', tenant.nombre_comercial || '-'],
                    ['RUC', <span className="font-mono">{tenant.ruc}</span>],
                    ['Dirección', tenant.address || '-'],
                    ['Teléfono', tenant.phone || '-'],
                    ['Email', tenant.email || '-'],
                  ].map(([rotulo, valor]) => (
                    <div key={rotulo} className="min-w-0">
                      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
                      <dd className="mt-1 break-words text-sm font-medium text-foreground">{valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        {isAdmin && (
          <TabsContent value="users" className="animate-slide-in-up">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className={TITULO_SECCION}>
                  <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                  Usuarios del hotel
                </CardTitle>
                <CardDescription className={DESCRIPCION_SECCION}>
                  Crea cuentas, cambia nombre o rol, restablece contraseñas y da de baja. No puedes borrarte a ti ni al último administrador.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GestionUsuarios />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Mi cuenta */}
        <TabsContent value="cuenta" className="animate-slide-in-up">
          <MiCuenta />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Settings;
