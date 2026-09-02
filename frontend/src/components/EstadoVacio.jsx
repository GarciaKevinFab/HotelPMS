import React from 'react';
import { Button } from './ui/button';

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
 */
export function EstadoVacio({
  icono: Icono,
  titulo,
  descripcion,
  accion,
  onAccion,
  filtrado = false,
  onLimpiar,
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icono && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-zen-100 text-zen-500">
          <Icono className="h-6 w-6" aria-hidden="true" />
        </span>
      )}

      <h3 className="text-base font-semibold text-zen-900">
        {filtrado ? 'Nada coincide con ese filtro' : titulo}
      </h3>

      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-zen-500">
        {filtrado
          ? 'Prueba a quitar el filtro o a buscar otra cosa.'
          : descripcion}
      </p>

      {filtrado && onLimpiar ? (
        <Button variant="outline" className="mt-5" onClick={onLimpiar}>
          Quitar el filtro
        </Button>
      ) : (
        accion && onAccion && (
          <Button className="mt-5" onClick={onAccion}>
            {accion}
          </Button>
        )
      )}
    </div>
  );
}

export default EstadoVacio;
