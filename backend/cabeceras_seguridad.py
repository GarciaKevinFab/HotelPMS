"""Cabeceras de seguridad HTTP, puestas por la propia aplicacion.

POR QUE AQUI Y NO EN CLOUDFLARE

  La auditoria del 2026-11-09 encontro que ninguna respuesta llevaba HSTS,
  nosniff, X-Frame-Options ni Referrer-Policy. Se podrian poner con una regla
  de transformacion del panel de Cloudflare, pero eso no queda en el
  repositorio, no se prueba y se pierde el dia que el tunel cambie. Desde la
  app viajan con cada respuesta -- API, landing, checkout y SPA -- y una
  prueba (tests/test_seguridad_auditoria.py) comprueba que esten.

POR QUE MIDDLEWARE ASGI Y NO BaseHTTPMiddleware

  Por lo mismo que backend/limites.py: hay StreamingResponse (exportaciones a
  Excel y PDF) y BaseHTTPMiddleware consume y reemite el cuerpo. Aqui solo se
  tocan las cabeceras del mensaje http.response.start; el cuerpo pasa intacto.

LA CSP VA EN MODO Report-Only

  La politica de abajo esta pensada para lo que carga hoy el frontend: scripts
  en linea (el registro del service worker y PostHog en el index.html de la
  SPA, los de la landing), estilos en linea (React y Radix los ponen en el
  atributo style), Google Fonts, PostHog y los formularios del checkout que
  terminan en Mercado Pago. No se pudo comprobar en un navegador real contra
  la SPA compilada y todos sus flujos, asi que va como
  Content-Security-Policy-Report-Only: el navegador avisa en la consola de lo
  que bloquearia, sin bloquearlo. Cuando la consola salga limpia en
  produccion, se cambia el nombre de la cabecera con
  ZENSTAY_CSP_APLICAR=1 y pasa a aplicarse.
"""

import os

CSP = "; ".join([
    "default-src 'self'",
    # 'unsafe-inline': hay scripts en linea en index.html y en la landing. Es
    # el primer candidato a cambiar por hashes cuando la CSP se aplique.
    # static.cloudflareinsights.com: el beacon de Cloudflare Web Analytics, que
    # el propio Cloudflare inyecta en las paginas al pasar por el tunel.
    "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com "
    "https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    # cloudflareinsights.com: adonde ese beacon manda las mediciones.
    "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com "
    "https://cloudflareinsights.com",
    "manifest-src 'self'",
    # blob: en produccion el navegador registro "Creating a worker from
    # 'blob:https://zenstay.sisac.pe/...' violates worker-src 'self'". Un
    # worker creado desde un blob: es codigo que ya cargo la propia pagina.
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    # El POST de /comprar redirige a Mercado Pago, y Chrome aplica form-action
    # tambien a la redireccion.
    "form-action 'self' https://*.mercadopago.com https://*.mercadopago.com.pe",
    "frame-ancestors 'none'",
])


def _csp_aplicada() -> bool:
    return os.environ.get("ZENSTAY_CSP_APLICAR", "").strip() == "1"


def cabeceras() -> list:
    nombre_csp = (b"content-security-policy" if _csp_aplicada()
                  else b"content-security-policy-report-only")
    return [
        # Un ano. Sin preload: entrar en la lista de los navegadores es una
        # decision del dominio entero (sisac.pe), no de esta aplicacion.
        (b"strict-transport-security", b"max-age=31536000; includeSubDomains"),
        (b"x-content-type-options", b"nosniff"),
        # Doble: X-Frame-Options para navegadores viejos, frame-ancestors en la
        # CSP para los nuevos. Nadie tiene por que meter el PMS en un iframe.
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        # Minima: nada de lo que hace el sistema necesita camara, microfono,
        # geolocalizacion ni pagos del navegador (el pago es en Mercado Pago).
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=(), payment=(), usb=()"),
        (nombre_csp, CSP.encode("latin-1")),
    ]


class CabecerasSeguridad:
    """Anade las cabeceras que la respuesta no traiga ya puestas."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        extra = cabeceras()

        async def enviar(mensaje):
            if mensaje["type"] == "http.response.start":
                actuales = list(mensaje.get("headers") or [])
                presentes = {k.lower() for k, _ in actuales}
                actuales += [(k, v) for k, v in extra if k not in presentes]
                mensaje = dict(mensaje, headers=actuales)
            await send(mensaje)

        return await self.app(scope, receive, enviar)
