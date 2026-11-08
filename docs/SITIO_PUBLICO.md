# Sitio público: SEO y contacto de ventas

Las páginas públicas (portada, `/precios`, `/comprar/{plan}`, términos,
privacidad y Libro de Reclamaciones) las sirve el backend. Ninguna depende de
JavaScript para mostrar precios, metadatos ni botones de contacto.

## Variables de entorno

| Variable | Para qué | Si falta |
|---|---|---|
| `ZENSTAY_URL_PUBLICA` | Origen del sitio en canonical, Open Graph, sitemap, robots y llms.txt | `https://zenstay.sisac.pe` |
| `WHATSAPP_VENTAS` | Número de ventas, formato `51XXXXXXXXX` (51 + 9 dígitos, sin `+` ni espacios) | No se muestra ningún WhatsApp |

`WHATSAPP_VENTAS` se pone en `backend/.env.production` del VPS (nunca en git) y
se aplica al reiniciar el contenedor. El número no está escrito en el código.
Si el valor no tiene el formato correcto se trata como si faltara y queda un
aviso en el log.

Con el número definido aparecen:

- "Escríbenos por WhatsApp" en el bloque de confianza de la portada, `/precios`
  y `/comprar/{plan}`, con un mensaje ya escrito según la página o el plan.
- Un botón flotante discreto en la esquina inferior derecha de esas tres
  páginas (el crédito de SISAC pasa a la izquierda).
- Los enlaces "te enviamos una cotización" (empresas que pagan con orden de
  compra o transferencia) y "agenda una demo de 20 minutos".
- El teléfono en el `ContactPoint` del JSON-LD.

Sin el número, el bloque de confianza sigue saliendo (razón social, RUC y
"emitimos boleta o factura electrónica"), y la cotización y la demo van a
`mailto:soporte@sisac.pe`. Es solo contacto: el pago sigue siendo el checkout
de Mercado Pago.

## Lo que leen los buscadores y los asistentes

- `/robots.txt`: permite todo salvo `/api/` y `/comprar/pedido/`, y apunta al sitemap.
- `/sitemap.xml`: portada, precios, páginas legales y un `/comprar/{plan}` por
  cada plan de pago activo.
- `/llms.txt`: resumen factual del producto, con los precios de la tabla `planes`.
- JSON-LD (`Organization` + `SoftwareApplication`) en la portada y en
  `/precios`. Las `offers` salen de la tabla `planes` en cada petición: cambiar
  un precio sigue siendo un `UPDATE`. No se declaran reseñas ni valoraciones, y
  no hay `FAQPage` porque no hay preguntas frecuentes visibles.
- Cada página pública lleva `lang="es-PE"`, canonical, Open Graph y Twitter. La
  página de un pedido lleva `noindex`.

Si la base no responde, sitemap y llms.txt siguen respondiendo sin precios ni
páginas de compra, en vez de dar error o inventar cifras.

El código está en `backend/seo.py`, `backend/contacto.py` y las rutas al final
de `backend/checkout.py`. Pruebas: `backend/tests/test_seo.py`.
