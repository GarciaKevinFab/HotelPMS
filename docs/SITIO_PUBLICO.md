# Sitio público: SEO y preguntas frecuentes

Las páginas públicas (portada, `/precios`, `/comprar/{plan}`, términos,
privacidad y Libro de Reclamaciones) las sirve el backend. Ninguna depende de
JavaScript para mostrar precios, metadatos ni preguntas frecuentes.

## Variables de entorno

| Variable | Para qué | Si falta |
|---|---|---|
| `ZENSTAY_URL_PUBLICA` | Origen del sitio en canonical, Open Graph, sitemap, robots y llms.txt | `https://zenstay.sisac.pe` |

No hay WhatsApp ni contacto de ventas: la compra es rápida y automática, sin
hablar con nadie. Las dudas se resuelven por escrito (abajo).

## Preguntas frecuentes (`/precios#preguntas`)

Siete preguntas visibles, sin acordeones, en el orden en que se las hace el
dueño de un hostal: tarjeta para probar, qué pasa al terminar la prueba, cómo
se paga, factura, cancelar, si se borran los datos, y si funciona en el
celular. El texto vive en `backend/dudas.py` (`preguntas()`), y el mismo texto
va al `FAQPage` del JSON-LD de `/precios`: una prueba exige que coincidan
exactamente.

Cada respuesta está comprobada contra el código (ver la cabecera de
`dudas.py`). Los plazos salen de `suscripciones.DIAS_PRUEBA`, `DIAS_GRACIA` y
`MESES_DEL_ANUAL`. No se menciona Yape ni banca móvil (pendiente de
aprobación). Tampoco se pregunta si ZenStay emite boletas a los huéspedes: la
emisión a SUNAT por NubeFact no está verificada de punta a punta.

## Bloque de confianza (portada y `/comprar/{plan}`)

Cuatro líneas (prueba sin tarjeta, pago en línea al terminar, factura a tu
RUC o boleta, sin contrato, qué pasa si no contratas), el botón **Empieza
gratis** (al registro; desde `/comprar/{plan}` con `?plan=`), un enlace a las
preguntas frecuentes y, en letra pequeña, la razón social y el RUC. En
`/precios` no va: ahí están las preguntas completas, con el mismo botón.

El pago es siempre el checkout de Mercado Pago, que no cambia.

## Lo que leen los buscadores y los asistentes

- `/robots.txt`: permite todo salvo `/api/` y `/comprar/pedido/`, y apunta al sitemap.
- `/sitemap.xml`: portada, precios, páginas legales y un `/comprar/{plan}` por
  cada plan de pago activo.
- `/llms.txt`: resumen factual del producto, con los precios de la tabla `planes`.
- JSON-LD (`Organization` + `SoftwareApplication`) en la portada y en
  `/precios`, más `FAQPage` solo en `/precios`. Las `offers` salen de la tabla
  `planes` en cada petición: cambiar un precio sigue siendo un `UPDATE`. No se
  declaran reseñas ni valoraciones.
- Cada página pública lleva `lang="es-PE"`, canonical, Open Graph y Twitter. La
  página de un pedido lleva `noindex`.

Si la base no responde, sitemap y llms.txt siguen respondiendo sin precios ni
páginas de compra, en vez de dar error o inventar cifras.

El código está en `backend/seo.py`, `backend/dudas.py` y las rutas al final
de `backend/checkout.py`. Pruebas: `backend/tests/test_seo.py`.
