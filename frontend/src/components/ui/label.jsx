import * as React from "react"
import * as LabelPrimitive from "@radix-ui/react-label"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const labelVariants = cva(
  "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
)

/* Controles a los que una etiqueta puede ponerle nombre. Los tres primeros
   son campos nativos; los `role` cubren los de Radix -Select, Checkbox,
   Switch, RadioGroup-, que por dentro son <button> y no responden a `for`. */
const CONTROLES =
  'input,select,textarea,[role="combobox"],[role="checkbox"],[role="switch"],[role="radiogroup"]';

/**
 * Etiqueta de formulario.
 *
 * POR QUE HACE ALGO MAS QUE PINTAR TEXTO
 *
 *   En la aplicacion hay 104 etiquetas y solo 3 dicen a que campo
 *   pertenecen. Las otras 101 son texto suelto: se ven encima del campo y
 *   para el ojo basta, pero no hay ninguna relacion declarada entre las dos
 *   cosas. Medido en los formularios de alta, TODOS los controles salian sin
 *   nombre: siete campos anonimos seguidos al registrar un huesped, seis al
 *   crear una tarifa. Quien usa un lector de pantalla oye "Nombre" y despues
 *   "cuadro de edicion", sin nada que los una. Y pulsar sobre el rotulo
 *   -que es como se enfoca un campo desde siempre- tampoco hacia nada.
 *
 *   Escribir el par id/htmlFor a mano en 101 sitios se hace una vez y se
 *   olvida en el siguiente formulario que alguien escriba. Asi que la
 *   etiqueta lo resuelve sola: si no le han dicho a quien pertenece, busca el
 *   primer control que venga detras -que es justo donde el diseño ya lo pone-
 *   y se ata a el. Si no encuentra ninguno, es un rotulo suelto y no hace
 *   nada.
 *
 *   Un `htmlFor` escrito a mano siempre manda: esto solo rellena el hueco.
 */
const Label = React.forwardRef(({ className, htmlFor, ...props }, ref) => {
  const propio = React.useId();
  const mio = React.useRef(null);

  const juntarRefs = React.useCallback(
    (nodo) => {
      mio.current = nodo;
      if (typeof ref === 'function') ref(nodo);
      else if (ref) ref.current = nodo;
    },
    [ref]
  );

  React.useEffect(() => {
    if (htmlFor) return;
    const etiqueta = mio.current;
    if (!etiqueta) return;

    let hermano = etiqueta.nextElementSibling;
    while (hermano) {
      const campo = hermano.matches(CONTROLES)
        ? hermano
        : hermano.querySelector(CONTROLES);

      if (campo) {
        if (!campo.id) campo.id = propio;
        etiqueta.setAttribute('for', campo.id);

        /* `for` solo funciona sobre controles de formulario de verdad. Un
           Select de Radix es un <button>, asi que ahi el nombre se pasa por
           aria-labelledby o se queda sin el. */
        const esNativo = /^(INPUT|SELECT|TEXTAREA)$/.test(campo.tagName);
        if (!esNativo && !campo.getAttribute('aria-labelledby')) {
          if (!etiqueta.id) etiqueta.id = `${propio}-rotulo`;
          campo.setAttribute('aria-labelledby', etiqueta.id);
        }
        return;
      }
      hermano = hermano.nextElementSibling;
    }
  });

  return (
    <LabelPrimitive.Root
      ref={juntarRefs}
      htmlFor={htmlFor}
      className={cn(labelVariants(), className)}
      {...props}
    />
  );
});
Label.displayName = LabelPrimitive.Root.displayName

export { Label }
