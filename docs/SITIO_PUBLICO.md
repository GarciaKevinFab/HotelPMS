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

Con el número definido aparece un enlace pequeño "¿Dudas? Escríbenos por
WhatsApp", con un mensaje ya escrito según la página o el plan, **solo** en
`/precios` y `/comprar/{plan}`. No hay botón flotante, y la portada y las
páginas legales no llevan WhatsApp. El número tampoco va en el JSON-LD.

## Bloque de confianza

Va junto a los precios en la portada, `/precios` y `/comprar/{plan}`. Responde
las dudas de quien compra, en orden, y termina en el botón **Empieza gratis**
(al registro; desde `/comprar/{plan}` lleva `?plan=`):

1. Pruébalo 14 días gratis, sin tarjeta (`suscripciones.DIAS_PRUEBA`; el
   registro no pide medio de pago).
2. Al terminar eliges tu plan y pagas en línea (checkout de Mercado Pago).
3. Factura electrónica a tu RUC, o boleta si la prefieres.
4. Sin contrato: cancelas cuando quieras desde tu cuenta
   (`POST /api/suscripcion/cancelar`, botón en Configuración).
5. Si no contratas: `DIAS_GRACIA` días más con el sistema completo; después no
   se pueden registrar reservas ni cobros, pero los datos se conservan para
   consultarlos (`server.exigir_suscripcion` solo bloquea escrituras).

Debajo, en letra pequeña, la razón social y el RUC. Si cambia alguna de esas
reglas en el código, hay que cambiar la frase en `backend/contacto.py`.

No hay demos agendadas ni cotizaciones manuales: la prueba gratis cumple ese
papel y el pago es siempre el checkout de Mercado Pago, que no cambia.

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
