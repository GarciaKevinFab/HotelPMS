import React from 'react';
import { Skeleton } from './ui/skeleton';
import { Card } from './ui/card';
import { TableRow, TableCell } from './ui/table';
import { cn } from '../lib/utils';

/**
 * Esqueletos de carga con la forma de lo que va a aparecer.
 *
 *   Un circulo girando en medio de una tabla vacia dice "espera"; unas filas
 *   grises con la anchura de las columnas dicen "espera, y esto es lo que
 *   viene". La segunda espera se hace mas corta aunque dure lo mismo, y la
 *   pagina no salta cuando llegan los datos porque ya ocupaban su sitio.
 */

// Anchuras que se alternan para que las filas no parezcan una rejilla.
const ANCHOS = ['w-24', 'w-32', 'w-20', 'w-28', 'w-16', 'w-36', 'w-24'];

/** Filas de tabla. Va DENTRO de <TableBody>. */
export function EsqueletoFilas({ filas = 6, columnas = 5 }) {
  return (
    <>
      {Array.from({ length: filas }).map((_, f) => (
        <TableRow key={f} className="hover:bg-transparent" aria-hidden="true">
          {Array.from({ length: columnas }).map((__, c) => (
            <TableCell key={c}>
              <Skeleton className={cn('h-4', ANCHOS[(f + c) % ANCHOS.length])} />
              {c === 1 && <Skeleton className="mt-1.5 h-3 w-16" />}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Rejilla de tarjetas (habitaciones, tipos, alertas). */
export function EsqueletoTarjetas({ cantidad = 6, alto = 'h-28', className }) {
  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3', className)} aria-hidden="true">
      {Array.from({ length: cantidad }).map((_, i) => (
        <Card key={i} className={cn('p-4 shadow-sm', alto)}>
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          <Skeleton className="mt-4 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </Card>
      ))}
    </div>
  );
}

/** Fila de metricas (las tarjetas de arriba de casi todas las pantallas). */
export function EsqueletoMetricas({ cantidad = 4, className }) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-4', className)} aria-hidden="true">
      {Array.from({ length: cantidad }).map((_, i) => (
        <Card key={i} className="p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Lista vertical de tarjetas anchas (alertas, cajas cerradas). */
export function EsqueletoLista({ cantidad = 4, className }) {
  return (
    <div className={cn('space-y-3', className)} aria-hidden="true">
      {Array.from({ length: cantidad }).map((_, i) => (
        <Card key={i} className="p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** El panel entero: metricas, franja secundaria y dos graficos. */
export function EsqueletoPanel() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Cargando el panel">
      <EsqueletoMetricas />
      <Card className="grid grid-cols-2 gap-px overflow-hidden bg-border shadow-sm sm:grid-cols-4 lg:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-card px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-2 h-5 w-20" />
          </div>
        ))}
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <Card key={i} className="p-5 shadow-sm">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="mt-5 h-[220px] w-full rounded-lg" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Bloque generico: unas lineas de texto dentro de una tarjeta. */
export function EsqueletoBloque({ lineas = 4, className }) {
  return (
    <Card className={cn('p-6 shadow-sm', className)} aria-hidden="true">
      <Skeleton className="h-5 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lineas }).map((_, i) => (
          <Skeleton key={i} className={cn('h-4', i % 3 === 2 ? 'w-1/2' : 'w-full')} />
        ))}
      </div>
    </Card>
  );
}
