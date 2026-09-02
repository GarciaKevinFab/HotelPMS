import React from 'react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

/**
 * Lo que se ve cuando una pantalla no tiene nada que mostrar.
 *
 * POR QUE EXISTE
 *
 *   Cada pantalla resolvia el hueco con un <p> suelto: "No se encontraron
 *   habitaciones", "No hay tarifas especiales configuradas". Un hotel que
 *   acaba de darse de alta abre el sistema, encuentra nueve pantallas con esa
 *   frase y no tiene forma de saber por donde empezar. La frase describe el
 *   vacio; no dice que hacer con el.
 *
 * LOS DOS VACIOS NO SON EL MISMO
 *
 *   "Todavia no has creado ninguna habitacion" y "ninguna habitacion coincide
 *   con este filtro" se parecen en pantalla y no se parecen en nada para quien
 *   mira: el primero necesita un boton para empezar, el segundo necesita saber
 *   que el filtro esta puesto y como quitarlo. Por eso `filtrado` cambia el
 *   texto y la accion, en vez de repetir el mismo cartel.
 *
 * `compacto` es la version que cabe dentro de una tarjeta de grafico.
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
  onAccion,
  filtrado = false,
  onLimpiar,
  compacto = false,
  className,
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compacto ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
      role="status"
    >
      {Icono && (
        <span
          className={cn(
            'mb-4 grid place-items-center rounded-xl bg-[hsl(var(--accent)/.10)] text-[hsl(var(--accent))]',
            compacto ? 'h-10 w-10' : 'h-12 w-12',
          )}
        >
          <Icono className={compacto ? 'h-5 w-5' : 'h-6 w-6'} aria-hidden="true" />
        </span>
      )}

      <h3 className={cn('font-heading font-semibold text-foreground', compacto ? 'text-sm' : 'text-base')}>
        {filtrado ? 'Nada coincide con ese filtro' : titulo}
      </h3>

      {(filtrado || descripcion) && (
        <p className={cn('mt-1.5 max-w-sm leading-relaxed text-muted-foreground', compacto ? 'text-xs' : 'text-sm')}>
          {filtrado
            ? 'Prueba a quitar el filtro o a buscar otra cosa.'
            : descripcion}
        </p>
      )}

      {filtrado && onLimpiar ? (
        <Button variant="outline" className="mt-5" onClick={onLimpiar}>
          Quitar el filtro
        </Button>
      ) : (
        accion && onAccion && (
          <Button className={compacto ? 'mt-4' : 'mt-5'} size={compacto ? 'sm' : 'default'} onClick={onAccion}>
            {accion}
          </Button>
        )
      )}
    </div>
  );
}

export default EstadoVacio;
