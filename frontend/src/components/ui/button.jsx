import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

/* CRITERIO DE COLOR
 *
 *   `default` (turquesa) es LA accion principal de la pantalla o del dialogo:
 *   "Nueva reserva", "Guardar", "Confirmar". Una por vista. Todo lo demas va
 *   en `outline` (secundaria con peso), `ghost` (terciaria, dentro de tablas)
 *   o `destructive` (borrar, cancelar una reserva). Antes la principal era
 *   negra -bg-primary- y el acento de la marca no aparecia en ningun boton.
 *
 *   `oscuro` conserva el negro para el raro caso en que haga falta un boton
 *   de peso que no sea la accion principal (p. ej. imprimir un comprobante).
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[transform,background-color,box-shadow,color,border-color] duration-150 ease-out active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-accent text-accent-foreground shadow-sm hover:bg-[hsl(var(--accent-hover))]",
        oscuro:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-card shadow-sm hover:bg-muted hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        // h-11 en movil (44 px, el objetivo tactil) y compacto desde `sm`.
        // Medido antes: casi todos los botones del sistema median 36 px,
        // incluidos los de accion dentro de las tablas.
        default: "h-11 px-4 py-2 sm:h-9",
        sm: "h-11 rounded-md px-3 text-xs sm:h-8",
        lg: "h-11 rounded-md px-8 sm:h-10",
        icon: "h-11 w-11 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
