import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Building2, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription } from '../components/ui/alert';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate('/dashboard');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Error de conexión. Intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 bg-cover bg-center relative"
        style={{ 
          backgroundImage: 'url(https://images.unsplash.com/photo-1768346564825-6f90c0b89e2e?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBob3RlbCUyMGxvYmJ5JTIwbHV4dXJ5fGVufDB8fHx8MTc3MDk2MTI0MHww&ixlib=rb-4.1.0&q=85)'
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/90 to-slate-900/50" />
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="mb-8">
            {/* El logotipo registrado, no un icono genérico sobre azul: el
                azul no aparece en ninguna parte de la identidad de ZenStay. */}
            <div className="flex items-center gap-3 mb-4">
              <img src="/logo-zenstay.png" alt="ZenStay" className="w-14 h-14 object-contain" />
              <span className="text-3xl font-bold text-white tracking-tight">ZenStay</span>
            </div>
            <p className="text-slate-300 text-lg max-w-md">
              De la reserva a la boleta, sin cuadernos. Recepción, limpieza, caja
              y comprobantes SUNAT en un solo sitio.
            </p>
          </div>
          <div className="flex gap-6 text-sm text-slate-400">
            <div>
              <p className="text-2xl font-bold text-white">100%</p>
              <p>Automatizado</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">24/7</p>
              <p>Disponible</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-white">SUNAT</p>
              <p>Integrado</p>
            </div>
          </div>
          <a href="https://sisac.pe" target="_blank" rel="noopener noreferrer"
             className="mt-10 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 transition-colors hover:border-teal-400/50">
            <img src="/logo-zenstay.png" alt="" className="h-6 w-6 object-contain" />
            <span className="leading-tight">
              <span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">Hecho por</span>
              <span className="block text-xs font-semibold text-slate-200">Star Insights IT by SISAC</span>
            </span>
            <span className="ml-1 h-2 w-2 rounded-full bg-teal-400" />
          </a>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <img src="/logo-zenstay.png" alt="ZenStay" className="w-11 h-11 object-contain" />
            <span className="text-2xl font-bold text-slate-900 tracking-tight">ZenStay</span>
          </div>

          <Card className="border-0 shadow-xl">
            <CardHeader className="space-y-1 pb-6">
              <CardTitle className="text-2xl font-bold tracking-tight">Iniciar Sesión</CardTitle>
              <CardDescription>
                Ingresa tus credenciales para acceder al sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive" className="animate-fade-in">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Correo Electrónico</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="correo@hotel.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={loading}
                      data-testid="login-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                      disabled={loading}
                      data-testid="login-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base font-semibold"
                  disabled={loading || authLoading}
                  data-testid="login-submit-button"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Ingresando...
                    </span>
                  ) : (
                    'Ingresar'
                  )}
                </Button>
              </form>

              {/*
                Aquí había un recuadro con las credenciales del hotel demo
                (admin@demo.com / admin123, y las de recepción y limpieza),
                visible en la pantalla de entrada de PRODUCCIÓN.

                Se quita por dos motivos. El primero es de seguridad: publicar
                usuarios y contraseñas en la portada del sistema invita a
                probarlos, y hasta hace poco esas claves estaban de verdad en
                el código. El segundo es que ya ni siquiera servían —
                /api/seed toma ahora la clave de SEED_DEMO_PASSWORD — así que
                además de peligroso era un cartel que mentía.

                En su lugar, la puerta de entrada para quien todavía no tiene
                cuenta: la prueba gratuita.
              */}
              <p className="mt-6 text-center text-sm text-slate-500">
                ¿Aún no tienes cuenta?{' '}
                <a href="/registro" className="font-semibold text-slate-900 hover:underline">
                  Prueba ZenStay 14 días gratis
                </a>
              </p>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-slate-500 mt-6">
            Sistema de Gestión Hotelera &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;
