// Un comprobante en estado DRAFT ("Borrador") es INTERNO: mientras la
// facturacion electronica propia no este activada (backend/facturacion_propia.py)
// no se envia a SUNAT y no tiene validez tributaria. La misma frase en todas
// las pantallas que lo muestran.
export const AVISO_COMPROBANTE_INTERNO =
  'Comprobante interno — sin validez tributaria hasta activar la facturación electrónica';

export function esComprobanteInterno(comprobante) {
  return comprobante?.status === 'DRAFT';
}
