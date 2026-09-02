import React from 'react';
import { cn } from '../lib/utils';

/**
 * Cabecera de pantalla: titulo, subtitulo y acciones.
 *
 * POR QUE EXISTE
 *
 *   Las dieciseis pantallas repetian el mismo bloque a mano, y cada copia
 *   habia derivado por su lado: unas apilaban en movil y otras no, unas
 *   llevaban `text-2xl font-bold` y otras `text-3xl`, y el subtitulo iba en
 *   tres grises distintos. Una sola pieza, un solo aspecto.
 *
 * EN EL TELEFONO
 *
 *   Todo apilado: titulo, subtitulo y debajo las acciones ocupando la fila
 *   completa, cada boton estirado y con sus 44 px de alto (que ya trae
 *   Button en movil). Dos botones de 36 px pegados a la derecha del titulo
 *   no caben en 390 px y desbordaban la pagina.
 */
export function EncabezadoPagina({ titulo, subtitulo, acciones, className, children }) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold leading-tight tracking-tight text-foreground">
          {titulo}
        </h1>
        {subtitulo && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>
        )}
        {children}
      </div>

      {acciones && (
        <div
          className={cn(
            'flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0',
            // En movil cada boton toma su parte de la fila; en escritorio
            // vuelven a su ancho natural.
            '[&>button]:flex-1 [&>a]:flex-1 md:[&>button]:flex-none md:[&>a]:flex-none',
          )}
        >
          {acciones}
        </div>
      )}
    </header>
  );
}

export default EncabezadoPagina;
