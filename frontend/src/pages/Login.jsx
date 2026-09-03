import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle, LogIn, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ConchaAcceso, TarjetaAcceso, CampoAcceso, claseCampoAcceso } from '../components/layout/ConchaAcceso';

/**
 * Entrada al sistema.
 *
 *   Misma concha que el registro (ConchaAcceso): panel de marca a la
 *   izquierda, tarjeta oscura a la derecha, una sola columna en el telefono.
 *   El titular y las viñetas son frases de la landing: aqui se recibe a quien
 *   vuelve, no se le vende nada nuevo.
 */
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

  const ocupado = loading || authLoading;

  return (
    <ConchaAcceso
      titulo={
        <>
          De la reserva a la boleta,
          <br />
          <span className="text-zen-turquesa">sin cuadernos.</span>
        </>
      }
      descripcion="Recepción sabe qué habitación entregar. Limpieza sabe qué toca asear. Y a fin de mes la caja cuadra, porque el sistema la cuadra sola."
      puntos={[
        'El tablero de habitaciones, igual para todos los turnos',
        'El arqueo suma los cobros y las salidas de caja solo',
        'Boleta y factura electrónica a SUNAT desde la misma pantalla',
      ]}
    >
      <TarjetaAcceso titulo="Entra a tu hotel" subtitulo="Con el correo que registraste al crear la cuenta.">
        <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-zen-fucsia/35 bg-zen-fucsia/10 px-4 py-3 text-[.91rem] text-[#ff8fae]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <CampoAcceso id="email" etiqueta="Correo">
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="maria@mihotel.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={claseCampoAcceso}
              aria-invalid={error ? true : undefined}
              required
              disabled={ocupado}
              data-testid="login-email-input"
            />
          </CampoAcceso>

          <CampoAcceso id="password" etiqueta="Contraseña">
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${claseCampoAcceso} pr-12`}
                aria-invalid={error ? true : undefined}
                required
                disabled={ocupado}
                data-testid="login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-lg text-zen-suave transition-colors duration-150 hover:text-zen-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-turquesa"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </CampoAcceso>

          <button
            type="submit"
            disabled={ocupado}
            aria-busy={loading || undefined}
            data-testid="login-submit-button"
            className="acceso-boton"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </TarjetaAcceso>

      <p className="mt-6 text-center text-sm text-zen-suave acceso-entra acceso-entra-3">
        ¿Tu hotel aún no usa ZenStay?{' '}
        <Link to="/registro" className="font-semibold text-zen-turquesa underline-offset-4 transition-colors duration-150 hover:underline">
          Prueba 14 días gratis
        </Link>
      </p>
      <p className="mt-2 text-center text-sm acceso-entra acceso-entra-3">
        <a href="/" className="text-zen-suave underline underline-offset-4 transition-colors duration-150 hover:text-zen-texto">
          Volver al inicio
        </a>
      </p>

      {/* Pie legal en el telefono (en escritorio va en el panel) */}
      <p className="mt-6 text-center text-xs text-zen-suave lg:hidden">
        &copy; 2026 ZenStay &mdash;{' '}
        <a href="/privacidad" className="underline underline-offset-4 hover:text-zen-turquesa">Privacidad</a>
        {' · '}
        <a href="/terminos" className="underline underline-offset-4 hover:text-zen-turquesa">Términos</a>
      </p>
    </ConchaAcceso>
  );
}

export default Login;
