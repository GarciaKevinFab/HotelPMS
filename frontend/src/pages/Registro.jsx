import React, { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { authAPI } from '../lib/api';
import { ConchaAcceso, TarjetaAcceso, CampoAcceso, claseCampoAcceso } from '../components/layout/ConchaAcceso';

/**
 * Alta de un hotel nuevo (antes era backend/landing/registro.html).
 *
 *   Misma concha que el login. Los campos, las ayudas y el texto legal son
 *   los mismos que tenia la pagina estatica. POST /api/registro crea el hotel
 *   y su administrador en una transaccion; como no devuelve token, al terminar
 *   se entra con POST /api/auth/login usando lo que se acaba de escribir y se
 *   va directo al panel, sin pedirle a nadie que repita su contraseña.
 *
 *   Las validaciones repiten las del backend a proposito: el servidor manda,
 *   pero avisar antes del viaje evita descubrir que el RUC no tenia 11 digitos
 *   despues de llenar cinco campos.
 */
const INICIAL = { hotel_name: '', ruc: '', admin_name: '', admin_email: '', admin_password: '' };

export function Registro() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [datos, setDatos] = useState(INICIAL);
  const [errores, setErrores] = useState({});
  const [errorGeneral, setErrorGeneral] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const set = (campo) => (e) => {
    const valor = campo === 'ruc' ? e.target.value.replace(/\D/g, '').slice(0, 11) : e.target.value;
    setDatos((d) => ({ ...d, [campo]: valor }));
    if (errores[campo]) setErrores((er) => ({ ...er, [campo]: undefined }));
  };

  const validar = () => {
    const e = {};
    if (datos.hotel_name.trim().length < 2) e.hotel_name = 'Escribe el nombre del hotel.';
    if (!/^\d{11}$/.test(datos.ruc)) e.ruc = 'El RUC debe tener exactamente 11 dígitos.';
    if (datos.admin_name.trim().length < 2) e.admin_name = 'Escribe tu nombre.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.admin_email.trim())) e.admin_email = 'Ese correo no parece válido.';
    if (datos.admin_password.length < 8) e.admin_password = 'La contraseña debe tener al menos 8 caracteres.';
    return e;
  };

  const enviar = async (e) => {
    e.preventDefault();
    setErrorGeneral('');
    const problemas = validar();
    setErrores(problemas);
    if (Object.keys(problemas).length > 0) return;

    setEnviando(true);
    const cuerpo = {
      hotel_name: datos.hotel_name.trim(),
      ruc: datos.ruc,
      admin_name: datos.admin_name.trim(),
      admin_email: datos.admin_email.trim(),
      admin_password: datos.admin_password,
    };
    try {
      await authAPI.registro(cuerpo);
    } catch (err) {
      const detalle = err.response?.data?.detail;
      const mensaje = typeof detalle === 'string'
        ? detalle
        : err.response
          ? 'No pudimos crear la cuenta. Revisa los datos e inténtalo otra vez.'
          : 'No hay conexión con el servidor. Inténtalo en un momento.';
      // El backend manda un `detail` legible para lo que el usuario puede
      // arreglar; se coloca junto al campo que toca.
      if (/RUC/i.test(mensaje)) setErrores({ ruc: mensaje });
      else if (/correo/i.test(mensaje)) setErrores({ admin_email: mensaje });
      else setErrorGeneral(mensaje);
      setEnviando(false);
      return;
    }

    // Cuenta creada: entrar y llevar al panel.
    const r = await login(cuerpo.admin_email, cuerpo.admin_password);
    setEnviando(false);
    if (r.success) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/login', { replace: true });
    }
  };

  return (
    <ConchaAcceso
      titulo={
        <>
          Hecho para el Perú,
          <br />
          <span className="text-zen-turquesa">no traducido.</span>
        </>
      }
      descripcion="Sin tarjeta. Sin instalación. Funciona en la computadora de recepción."
      puntos={[
        'El sistema no deja vender dos veces la misma noche',
        'El arqueo suma los cobros y las salidas de caja solo',
        'Boleta y factura electrónica a SUNAT desde la misma pantalla',
      ]}
    >
      <TarjetaAcceso
        titulo="Crea la cuenta de tu hotel"
        subtitulo="Toma un minuto. Después cargas tus habitaciones y ya puedes recibir huéspedes."
      >
        <form onSubmit={enviar} className="mt-7 space-y-5" noValidate>
          {errorGeneral && (
            <div
              role="alert"
              aria-live="assertive"
              className="animate-fade-in flex items-start gap-2.5 rounded-xl border border-zen-fucsia/35 bg-zen-fucsia/10 px-4 py-3 text-[.91rem] text-[#ff8fae]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{errorGeneral}</span>
            </div>
          )}

          <CampoAcceso id="hotel_name" etiqueta="Nombre del hotel" error={errores.hotel_name}>
            <input id="hotel_name" value={datos.hotel_name} onChange={set('hotel_name')} required
                   autoComplete="organization" placeholder="Hostal Los Girasoles"
                   className={claseCampoAcceso} aria-invalid={errores.hotel_name ? true : undefined}
                   disabled={enviando} data-testid="registro-hotel-input" />
          </CampoAcceso>

          <CampoAcceso id="ruc" etiqueta="RUC" ayuda="11 dígitos. Es el que aparecerá en tus comprobantes." error={errores.ruc}>
            <input id="ruc" value={datos.ruc} onChange={set('ruc')} required inputMode="numeric"
                   maxLength={11} placeholder="20123456789"
                   className={`${claseCampoAcceso} font-mono tracking-wider tabular-nums`}
                   aria-invalid={errores.ruc ? true : undefined}
                   disabled={enviando} data-testid="registro-ruc-input" />
          </CampoAcceso>

          <CampoAcceso id="admin_name" etiqueta="Tu nombre" error={errores.admin_name}>
            <input id="admin_name" value={datos.admin_name} onChange={set('admin_name')} required
                   autoComplete="name" placeholder="María Gutiérrez"
                   className={claseCampoAcceso} aria-invalid={errores.admin_name ? true : undefined}
                   disabled={enviando} data-testid="registro-nombre-input" />
          </CampoAcceso>

          <CampoAcceso id="admin_email" etiqueta="Correo" ayuda="Con este correo entrarás al sistema." error={errores.admin_email}>
            <input id="admin_email" type="email" value={datos.admin_email} onChange={set('admin_email')} required
                   autoComplete="email" placeholder="maria@mihotel.pe"
                   className={claseCampoAcceso} aria-invalid={errores.admin_email ? true : undefined}
                   disabled={enviando} data-testid="registro-correo-input" />
          </CampoAcceso>

          <CampoAcceso id="admin_password" etiqueta="Contraseña" ayuda="Mínimo 8 caracteres." error={errores.admin_password}>
            <input id="admin_password" type="password" value={datos.admin_password} onChange={set('admin_password')}
                   required minLength={8} autoComplete="new-password"
                   className={claseCampoAcceso} aria-invalid={errores.admin_password ? true : undefined}
                   disabled={enviando} data-testid="registro-clave-input" />
          </CampoAcceso>

          <button type="submit" disabled={enviando} aria-busy={enviando || undefined}
                  className="acceso-boton" data-testid="registro-submit-button">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {enviando ? 'Creando tu cuenta…' : 'Crear cuenta y empezar'}
            {!enviando && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>

          <p className="text-[.85rem] leading-relaxed text-zen-suave">
            Al crear la cuenta aceptas que guardemos los datos de tu hotel para prestarte
            el servicio. Puedes cancelar cuando quieras y llevarte tu información.
          </p>
        </form>
      </TarjetaAcceso>

      <p className="mt-6 text-center text-sm text-zen-suave acceso-entra acceso-entra-3">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="font-semibold text-zen-turquesa underline-offset-4 transition-colors duration-150 hover:underline">
          Entrar
        </Link>
      </p>
      <p className="mt-2 text-center text-sm acceso-entra acceso-entra-3">
        <a href="/" className="text-zen-suave underline underline-offset-4 transition-colors duration-150 hover:text-zen-texto">
          Volver al inicio
        </a>
      </p>

      <p className="mt-6 text-center text-xs text-zen-suave lg:hidden">
        &copy; 2026 ZenStay &mdash;{' '}
        <a href="/privacidad" className="underline underline-offset-4 hover:text-zen-turquesa">Privacidad</a>
        {' · '}
        <a href="/terminos" className="underline underline-offset-4 hover:text-zen-turquesa">Términos</a>
      </p>
    </ConchaAcceso>
  );
}

export default Registro;
