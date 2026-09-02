import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Entrada al sistema.
 *
 * POR QUE SE REHIZO
 *
 *   Esta pantalla y la de alta (/registro, que sirve el backend como HTML)
 *   eran dos productos distintos. El alta iba sobre el verde profundo de la
 *   marca, con Bricolage Grotesque y el fucsia del colibri; esto era una
 *   pantalla partida con una FOTO DE STOCK y una tarjeta blanca sobre
 *   `bg-slate-50`, con el boton en negro. Alguien que se daba de alta y
 *   entraba a continuacion veia dos sitios distintos en el mismo minuto.
 *
 *   Ahora las dos comparten estructura y paleta: misma cabecera, mismo ancho
 *   de columna, mismos campos, mismo boton. Se lee como el mismo producto
 *   porque lo es.
 *
 * LA FOTO SE FUE, Y NO SOLO POR ESTETICA
 *
 *   El fondo se cargaba desde images.unsplash.com. Media pantalla de la puerta
 *   de entrada dependia de un tercero: si Unsplash tarda o esta bloqueado, el
 *   recepcionista que llega a las 6 de la manana ve medio login vacio mientras
 *   espera. Ademas era una peticion externa mas y una foto que no es del hotel
 *   de nadie.
 *
 * UN SOLO DISTINTIVO
 *
 *   Habia DOS a la vez: uno propio sobre la foto y el global de index.html
 *   abajo a la derecha. La misma firma repetida en la misma pantalla. Queda el
 *   global, que es el que comparten los cuatro sistemas.
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

  // Los dos campos comparten una sola cadena de clases: separarlos es
  // exactamente lo que le paso a esta pantalla frente a la del alta.
  const campo =
    'w-full rounded-xl border border-zen-borde bg-zen-superficie px-4 py-3 text-[15px] ' +
    'text-zen-texto placeholder:text-zen-suave/60 outline-none transition ' +
    'focus:border-transparent focus:ring-2 focus:ring-zen-turquesa ' +
    'disabled:opacity-60';

  return (
    <div className="flex min-h-screen flex-col bg-zen-fondo text-zen-texto">
      {/* Cabecera identica a la del alta: misma altura, mismo logotipo, y el
          enlace cruzado al otro lado del flujo. */}
      <header className="mx-auto flex w-full max-w-[1120px] items-center justify-between px-7 py-4">
        <a href="/" className="flex items-center gap-3">
          <img src="/logo-zenstay.png" alt="ZenStay" className="h-10 w-10 object-contain" />
          <span className="font-display text-[1.4rem] font-bold tracking-[-0.03em]">ZenStay</span>
        </a>
        <a href="/registro" className="text-[.95rem] text-zen-suave transition hover:text-zen-turquesa">
          Crear cuenta
        </a>
      </header>

      {/* grid place-items-center sobre flex-1: el bloque queda centrado en lo
          que sobra de alto, sea cual sea la pantalla. */}
      <main className="grid flex-1 place-items-center px-6 py-10">
        <div className="w-full max-w-[440px]">
        {/* La tarjeta le da cuerpo al formulario. Sin ella, sobre un fondo
            plano y una pantalla ancha, los campos flotaban sueltos. */}
        <div className="rounded-[26px] border border-zen-borde bg-gradient-to-b from-zen-alta to-zen-superficie p-7 shadow-[0_40px_90px_-40px_rgba(0,0,0,.85)] sm:p-9">
        <p className="text-[.76rem] font-bold uppercase tracking-[.16em] text-zen-turquesa">
          Acceso al sistema
        </p>
        <h1 className="font-display mt-2.5 text-[clamp(1.9rem,3.2vw,2.5rem)] font-bold leading-[1.05] tracking-[-0.035em]">
          Entra a tu hotel
        </h1>
        <p className="mt-2 text-[.96rem] text-zen-suave">
          Con el correo que registraste al crear la cuenta.
        </p>

        <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-zen-fucsia/35 bg-zen-fucsia/10 px-4 py-3 text-[.91rem] text-[#ff8fae]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1.5 block text-[.86rem] font-bold">
              Correo
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="maria@mihotel.pe"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={campo}
              required
              disabled={loading}
              data-testid="login-email-input"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-[.86rem] font-bold">
              Contraseña
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${campo} pr-12`}
                required
                disabled={loading}
                data-testid="login-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-zen-suave transition hover:text-zen-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-zen-turquesa"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Mismo boton que el del alta: pastilla, fucsia, ancho completo. */}
          <button
            type="submit"
            disabled={loading || authLoading}
            data-testid="login-submit-button"
            className="w-full rounded-full bg-zen-fucsia px-7 py-3.5 text-base font-bold text-[#1a0a10] transition
                       hover:-translate-y-px hover:shadow-[0_6px_26px_-6px_rgba(252,60,120,.6)]
                       focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zen-fucsia
                       disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Entrando…
              </span>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p className="mt-6 text-[.9rem] text-zen-suave">
          ¿Todavía no tienes cuenta?{' '}
          <a href="/registro" className="font-semibold text-zen-turquesa hover:underline">
            Pruébalo 14 días gratis
          </a>
        </p>

        </div>

        <p className="mt-6 text-center text-[.82rem] text-zen-suave">
          <a href="/terminos" className="hover:text-zen-turquesa">Términos</a>
          {' · '}
          <a href="/privacidad" className="hover:text-zen-turquesa">Privacidad</a>
          {' · '}
          <a href="/reclamaciones" className="hover:text-zen-turquesa">Libro de Reclamaciones</a>
        </p>
        </div>
      </main>
    </div>
  );
}

export default Login;
