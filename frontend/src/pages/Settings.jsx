import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Building2, 
  Receipt, 
  Users,
  Save,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { tenantsAPI, usersAPI } from '../lib/api';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';

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
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-4 border-zen-200 border-t-zen-turquesa rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zen-900">Configuración</h1>
        <p className="text-zen-500">Ajustes del sistema y facturación</p>
      </div>

      <Tabs defaultValue="invoicing" className="space-y-6">
        <TabsList>
          <TabsTrigger value="invoicing" className="gap-2">
            <Receipt className="w-4 h-4" />
            Facturación
          </TabsTrigger>
          <TabsTrigger value="hotel" className="gap-2">
            <Building2 className="w-4 h-4" />
            Hotel
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users" className="gap-2">
              <Users className="w-4 h-4" />
              Usuarios
            </TabsTrigger>
          )}
        </TabsList>

        {/* Invoicing Tab */}
        <TabsContent value="invoicing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5" />
                Configuración NubeFact
              </CardTitle>
              <CardDescription>
                Configure la integración con SUNAT para facturación electrónica
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Mode indicator */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-zen-50">
                <div className="flex items-center gap-3">
                  {invoicingConfig.nubefact_token ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <div>
                        <p className="font-medium">Modo Producción</p>
                        <p className="text-sm text-zen-500">Facturas enviadas a SUNAT</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                      <div>
                        <p className="font-medium">Modo Pruebas (MOCK)</p>
                        <p className="text-sm text-zen-500">Facturas simuladas, no enviadas a SUNAT</p>
                      </div>
                    </>
                  )}
                </div>
                <Badge variant={invoicingConfig.nubefact_token ? 'default' : 'secondary'}>
                  {invoicingConfig.nubefact_token ? 'LIVE' : 'MOCK'}
                </Badge>
              </div>

              <Separator />

              {/* API Configuration */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="nubefact_ruta">URL de la API (Ruta)</Label>
                  <Input
                    id="nubefact_ruta"
                    value={invoicingConfig.nubefact_ruta}
                    onChange={(e) => setInvoicingConfig(prev => ({ ...prev, nubefact_ruta: e.target.value }))}
                    placeholder="https://api.nubefact.com/api/v1/..."
                    className="mt-2"
                    data-testid="nubefact-ruta-input"
                  />
                  <p className="text-xs text-zen-500 mt-1">
                    La URL proporcionada por NubeFact para su cuenta
                  </p>
                </div>

                <div>
                  <Label htmlFor="nubefact_token">Token de Autenticación</Label>
                  <div className="relative mt-2">
                    <Input
                      id="nubefact_token"
                      type={showToken ? 'text' : 'password'}
                      value={invoicingConfig.nubefact_token}
                      onChange={(e) => setInvoicingConfig(prev => ({ ...prev, nubefact_token: e.target.value }))}
                      placeholder="••••••••••••••••"
                      className="pr-10"
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
                      className="absolute right-0 top-0 h-full px-4"
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-zen-500 mt-1">
                    El token de su cuenta NubeFact. Nunca compartir este valor.
                  </p>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button onClick={handleSaveInvoicing} disabled={saving} data-testid="save-invoicing-btn">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? 'Guardando...' : 'Guardar Configuración'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Hotel Tab */}
        <TabsContent value="hotel">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Información del Hotel
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tenant ? (
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label className="text-zen-500">Razón Social</Label>
                    <p className="font-medium mt-1">{tenant.name}</p>
                  </div>
                  <div>
                    <Label className="text-zen-500">Nombre Comercial</Label>
                    <p className="font-medium mt-1">{tenant.nombre_comercial || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-zen-500">RUC</Label>
                    <p className="font-medium mt-1">{tenant.ruc}</p>
                  </div>
                  <div>
                    <Label className="text-zen-500">Dirección</Label>
                    <p className="font-medium mt-1">{tenant.address || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-zen-500">Teléfono</Label>
                    <p className="font-medium mt-1">{tenant.phone || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-zen-500">Email</Label>
                    <p className="font-medium mt-1">{tenant.email || '-'}</p>
                  </div>
                </div>
              ) : (
                <p className="text-zen-500">No hay información del hotel disponible</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        {isAdmin && (
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5" />
                      Usuarios del Sistema
                    </CardTitle>
                    <CardDescription>
                      Gestione los usuarios con acceso al sistema
                    </CardDescription>
                  </div>
                  <Button onClick={() => setShowUserForm(true)} data-testid="add-user-btn">
                    Nuevo Usuario
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* New User Form */}
                {showUserForm && (
                  <div className="mb-6 p-4 border rounded-lg bg-zen-50">
                    <h4 className="font-medium mb-4">Crear Nuevo Usuario</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Nombre Completo</Label>
                        <Input
                          value={newUser.full_name}
                          onChange={(e) => setNewUser(prev => ({ ...prev, full_name: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={newUser.email}
                          onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Contraseña</Label>
                        <Input
                          type="password"
                          value={newUser.password}
                          onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label>Rol</Label>
                        <select
                          value={newUser.role}
                          onChange={(e) => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 border rounded-md"
                        >
                          <option value="RECEPTIONIST">Recepcionista</option>
                          <option value="HOUSEKEEPING">Limpieza</option>
                          {isSuperAdmin && <option value="ADMIN">Administrador</option>}
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-4">
                      <Button variant="outline" onClick={() => setShowUserForm(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateUser}>
                        Crear Usuario
                      </Button>
                    </div>
                  </div>
                )}

                {/* Users List */}
                <div className="space-y-3">
                  {users.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-zen-100 rounded-full flex items-center justify-center">
                          <Users className="w-5 h-5 text-zen-500" />
                        </div>
                        <div>
                          <p className="font-medium">{u.full_name}</p>
                          <p className="text-sm text-zen-500">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="outline">{u.role}</Badge>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`active-${u.id}`} className="text-sm">
                            {u.is_active ? 'Activo' : 'Inactivo'}
                          </Label>
                          <Switch
                            id={`active-${u.id}`}
                            checked={u.is_active}
                            onCheckedChange={() => handleToggleUserStatus(u.id, u.is_active)}
                            disabled={u.id === user?.user_id}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <p className="text-center text-zen-500 py-8">No hay usuarios registrados</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

export default Settings;
