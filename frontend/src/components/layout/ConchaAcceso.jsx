import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

/**
 * La concha de las pantallas de acceso: login y registro.
 *
 *   Pantalla partida en escritorio. A la izquierda, el panel de marca sobre el
 *   verde profundo de la landing (matiz 156): trama de puntos, resplandores
 *   turquesa y fucsia, tres formas redondeadas flotando, el logotipo, un
 *   titular en Manrope 800 con la segunda linea en turquesa, un parrafo y tres
 *   viñetas. A la derecha, casi negro-verde, la tarjeta con el formulario.
 *
 *   En el telefono el panel desaparece y queda su fondo: arriba el logotipo
 *   con el nombre y una linea, y debajo la tarjeta. Un scroll de adorno antes
 *   de poder escribir no ayuda a nadie.
 *
 *   Login y registro solo cambian el mensaje: uno recibe a quien vuelve, el
 *   otro convence a quien llega. Los textos salen de la landing.
 */
export function ConchaAcceso({ titulo, descripcion, puntos = [], children }) {
  return (
    <div className="acceso min-h-screen bg-zen-fondo text-zen-texto lg:grid lg:grid-cols-2">
      {/* Panel de marca (solo escritorio) */}
      <aside className="acceso-panel relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Capas decorativas: trama, resplandores y formas. Ninguna recibe
            foco ni lectura; todas quedan detras del contenido. */}
        <div aria-hidden="true" className="acceso-trama absolute inset-0" />
        <div aria-hidden="true" className="acceso-resplandor acceso-resplandor-turquesa" />
        <div aria-hidden="true" className="acceso-resplandor acceso-resplandor-fucsia" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="acceso-forma acceso-forma-1" />
          <div className="acceso-forma acceso-forma-2" />
          <div className="acceso-forma acceso-forma-3" />
        </div>

        {/* Marca, que vuelve al inicio */}
        <div className="relative z-10 acceso-entra">
          <a href="/" className="inline-flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-turquesa focus-visible:ring-offset-2 focus-visible:ring-offset-zen-fondo">
            <img
              src="/logo-zenstay.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <span className="font-heading text-2xl font-extrabold tracking-[-0.03em] text-white">ZenStay</span>
          </a>
        </div>

        {/* Titular, parrafo y viñetas */}
        <div className="relative z-10 max-w-xl acceso-entra acceso-entra-2">
          <h2 className="font-heading text-5xl font-extrabold leading-[1.02] tracking-[-0.035em] text-white xl:text-6xl">
            {titulo}
          </h2>
          {descripcion && (
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-zen-suave">{descripcion}</p>
          )}
          {puntos.length > 0 && (
            <ul className="mt-8 space-y-3.5">
              {puntos.map((punto) => (
                <li key={punto} className="flex items-start gap-3 text-[15px] text-zen-texto/90">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zen-turquesa" aria-hidden="true" />
                  <span>{punto}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pie legal */}
        <p className="relative z-10 text-xs text-zen-suave">
          &copy; 2026 ZenStay &mdash;{' '}
          <a href="/privacidad" className="underline underline-offset-4 transition-colors duration-150 hover:text-zen-turquesa">Privacidad</a>
          {' · '}
          <a href="/terminos" className="underline underline-offset-4 transition-colors duration-150 hover:text-zen-turquesa">Términos</a>
        </p>
      </aside>

      {/* Columna del formulario */}
      <main className="acceso-formulario relative flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:px-6 lg:min-h-0 lg:p-12">
        <div className="relative z-10 w-full max-w-[440px]">
          {/* Cabecera de marca en el telefono */}
          <div className="mb-7 text-center lg:hidden acceso-entra">
            <Link to="/" className="inline-flex flex-col items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zen-turquesa">
              <img
                src="/logo-zenstay.png"
                alt=""
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <span className="font-heading text-[28px] font-extrabold tracking-[-0.03em] text-white">ZenStay</span>
            </Link>
            <p className="mt-1 text-sm text-zen-suave">Gestión hotelera para hospedajes del Perú</p>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

/** La tarjeta oscura donde va el formulario. */
export function TarjetaAcceso({ titulo, subtitulo, children, className = '' }) {
  return (
    <section className={`acceso-tarjeta acceso-entra acceso-entra-2 ${className}`} aria-labelledby="acceso-titulo">
      <h1 id="acceso-titulo" className="font-heading text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-white">
        {titulo}
      </h1>
      {subtitulo && <p className="mt-1.5 text-[15px] text-zen-suave">{subtitulo}</p>}
      {children}
    </section>
  );
}

/** Etiqueta pequeña en mayúsculas + campo oscuro de 48 px. */
export function CampoAcceso({ id, etiqueta, ayuda, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.12em] text-zen-suave">
        {etiqueta}
      </label>
      {children}
      {ayuda && !error && <p className="mt-1.5 text-xs text-zen-suave/90">{ayuda}</p>}
      {error && <p className="mt-1.5 text-xs text-[#ff8fae]" role="alert">{error}</p>}
    </div>
  );
}

// Una sola cadena de clases para todos los campos de acceso.
export const claseCampoAcceso =
  'h-12 w-full rounded-xl border border-zen-borde bg-zen-fondo px-4 text-[15px] text-zen-texto ' +
  'placeholder:text-zen-suave/55 outline-none transition-[border-color,box-shadow,background-color] duration-180 ' +
  'hover:border-zen-500/60 focus:border-transparent focus:ring-2 focus:ring-zen-turquesa ' +
  'aria-[invalid=true]:border-zen-fucsia/60 disabled:opacity-60';

export default ConchaAcceso;
