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
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { EncabezadoPagina } from '../components/EncabezadoPagina';
import { EstadoVacio } from '../components/EstadoVacio';
import { EsqueletoBloque } from '../components/Esqueleto';
import { tenantsAPI, usersAPI } from '../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

/* Misma jerarquia en las tres pestanas: titulo de seccion en font-heading,
   descripcion en gris, y un solo boton turquesa por formulario. */
const TITULO_SECCION = 'font-heading flex items-center gap-2 text-base font-semibold';
const DESCRIPCION_SECCION = 'text-sm text-muted-foreground';

/* El <select> nativo del rol se viste como los Input de shadcn para que no
   desentone en la rejilla; 44 px de alto en el telefono como el resto. */
const SELECT_NATIVO =
  'flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9';

function Dato({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{rotulo}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-foreground">{valor}</dd>
    </div>
  );
}

export function Settings() {
  const { user, isAdmin, isSuperAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState(null);
  const [users, setUsers] = useState([]);

  // Invoicing config
  const [invoicingConfig, setInvoicingConfig] = useState({
    nubefact_ruta: '',
    nubefact_token: '',
    mode: 'MOCK'
  });
  const [showToken, setShowToken] = useState(false);

  // User form
  const [showUserForm, setShowUserForm] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'RECEPTIONIST'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (user?.tenant_id) {
        const tenantRes = await tenantsAPI.get(user.tenant_id);
        setTenant(tenantRes.data);

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
          nubefact_ruta: tenantRes.data.nubefact_ruta || '',
          nubefact_token: tenantRes.data.nubefact_token || '',
          mode: tenantRes.data.invoicing_mode || 'MOCK'
        });
      }

      if (isAdmin) {
        const usersRes = await usersAPI.list();
        setUsers(usersRes.data);
      }
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

  const handleCreateUser = async () => {
    if (!newUser.email || !newUser.password || !newUser.full_name) {
      toast.error('Complete todos los campos');
      return;
    }

    try {
      await usersAPI.create({
        ...newUser,
        tenant_id: user.tenant_id
      });
      toast.success('Usuario creado exitosamente');
      setShowUserForm(false);
      setNewUser({ email: '', password: '', full_name: '', role: 'RECEPTIONIST' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error al crear usuario');
    }
  };

  const handleToggleUserStatus = async (userId, isActive) => {
    try {
      await usersAPI.update(userId, { is_active: !isActive });
      toast.success(isActive ? 'Usuario desactivado' : 'Usuario activado');
      fetchData();
    } catch (err) {
      toast.error('Error al actualizar usuario');
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

  const enProduccion = Boolean(invoicingConfig.nubefact_token);

  return (
    <div className="space-y-6" data-testid="settings-page">
      <EncabezadoPagina titulo="Configuración" subtitulo="Ajustes del sistema y facturación" />

      <Tabs defaultValue="invoicing" className="space-y-6">
        {/* En el telefono las pestanas reparten el ancho; tres botones de
            ancho natural no cabian y la lista se cortaba. */}
        <TabsList className={isAdmin ? 'grid h-auto w-full grid-cols-3 sm:inline-grid sm:w-auto' : 'grid h-auto w-full grid-cols-2 sm:inline-grid sm:w-auto'}>
          <TabsTrigger value="invoicing" className="min-h-[40px] gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            Facturación
          </TabsTrigger>
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
        </TabsList>

        {/* Invoicing Tab */}
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
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tenant ? (
                <dl className="escalonado grid gap-4 sm:grid-cols-2">
                  <Dato rotulo="Razón Social" valor={tenant.name} />
                  <Dato rotulo="Nombre Comercial" valor={tenant.nombre_comercial || '-'} />
                  <Dato rotulo="RUC" valor={<span className="font-mono">{tenant.ruc}</span>} />
                  <Dato rotulo="Dirección" valor={tenant.address || '-'} />
                  <Dato rotulo="Teléfono" valor={tenant.phone || '-'} />
                  <Dato rotulo="Email" valor={tenant.email || '-'} />
                </dl>
              ) : (
                <EstadoVacio
                  compacto
                  icono={Building2}
                  titulo="No hay información del hotel disponible"
                  descripcion="Los datos del hotel los carga el administrador del sistema al darlo de alta. Si cree que falta algo, escríbale."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        {isAdmin && (
          <TabsContent value="users" className="animate-slide-in-up">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <CardTitle className={TITULO_SECCION}>
                      <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                      Usuarios del Sistema
                    </CardTitle>
                    <CardDescription className={`mt-1.5 ${DESCRIPCION_SECCION}`}>
                      Gestione los usuarios con acceso al sistema
                    </CardDescription>
                  </div>
                  <Button
                    className="w-full sm:w-auto sm:shrink-0"
                    variant={showUserForm ? 'outline' : 'default'}
                    onClick={() => setShowUserForm(true)}
                    data-testid="add-user-btn"
                  >
                    Nuevo Usuario
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* New User Form: sin caja propia dentro de la tarjeta; lo
                    separa una linea, y el unico boton turquesa es "Crear". */}
                {showUserForm && (
                  <div className="animate-slide-in-up mb-6">
                    <h4 className="font-heading text-base font-semibold">Crear Nuevo Usuario</h4>
                    <p className={`mt-1 ${DESCRIPCION_SECCION}`}>
                      Recibirá acceso con la contraseña que defina aquí.
                    </p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="nuevo-usuario-nombre">Nombre Completo</Label>
                        <Input
                          id="nuevo-usuario-nombre"
                          value={newUser.full_name}
                          onChange={(e) => setNewUser(prev => ({ ...prev, full_name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nuevo-usuario-email">Email</Label>
                        <Input
                          id="nuevo-usuario-email"
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nuevo-usuario-password">Contraseña</Label>
                        <Input
                          id="nuevo-usuario-password"
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nuevo-usuario-rol">Rol</Label>
                        <select
                          id="nuevo-usuario-rol"
                          value={newUser.role}
                          onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                          className={SELECT_NATIVO}
                        >
                          <option value="RECEPTIONIST">Recepcionista</option>
                          <option value="HOUSEKEEPING">Limpieza</option>
                          {isSuperAdmin && <option value="ADMIN">Administrador</option>}
                        </select>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setShowUserForm(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateUser}>
                        Crear Usuario
                      </Button>
                    </div>
                    <Separator className="mt-6" />
                  </div>
                )}

                {/* Users List */}
                {users.length === 0 ? (
                  <EstadoVacio
                    icono={Users}
                    titulo="No hay usuarios registrados"
                    descripcion="Cree la primera cuenta para recepción o limpieza; cada persona entra con su propio usuario y queda registrada en lo que hace."
                    accion="Nuevo Usuario"
                    onAccion={() => setShowUserForm(true)}
                  />
                ) : (
                  <ul className="escalonado divide-y divide-border">
                    {users.map(u => (
                      <li key={u.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted">
                            <UserRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{u.full_name}</p>
                            <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 pl-[52px] sm:pl-0">
                          <Badge variant="outline" className="font-mono text-[11px]">{u.role}</Badge>
                          {/* La etiqueta es clicable y mide 44 px de alto:
                              el interruptor solo, de 20 px, se erraba. */}
                          <Label
                            htmlFor={`active-${u.id}`}
                            className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm"
                          >
                            <span className={u.is_active ? 'text-foreground' : 'text-muted-foreground'}>
                              {u.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                            <Switch
                              id={`active-${u.id}`}
                              checked={u.is_active}
                              onCheckedChange={() => handleToggleUserStatus(u.id, u.is_active)}
                              disabled={u.id === user?.user_id}
                            />
                          </Label>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default Settings;
