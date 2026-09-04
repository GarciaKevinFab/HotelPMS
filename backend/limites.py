"""Limite de peticiones por IP.

EL AGUJERO QUE TAPA

  Los 97 endpoints de la API no tenian ningun freno. Comprobado contra el
  contenedor en produccion: 200 peticiones seguidas a /api/health salieron
  200 veces con codigo 200 en 1,7 segundos. Ni un 429.

  Y no hay nada detras que ayude. El tunel de Cloudflare entrega directo a
  uvicorn en 127.0.0.1:8002; no hay proxy intermedio con reglas. O sea que
  cualquiera con un bucle de shell puede dejar sin servicio a todos los
  hoteles, o sentarse a probar contrasenas contra /api/auth/login todo lo
  rapido que le de la red.

POR QUE UNA TABLA DE REGLAS Y NO UN DECORADOR POR ENDPOINT

  slowapi -- que es lo que usa CargoXprez -- se pone con @limiter.limit encima
  de cada funcion. Ahi acabo cubriendo 7 de 205 endpoints, porque decorar de
  uno en uno no escala y lo que se olvida no avisa: queda sin proteger y con
  el mismo aspecto que el resto.

  Aqui el limite se decide por (metodo, prefijo de ruta) en una sola tabla. La
  ultima regla es un techo que aplica a TODA la API, asi que un endpoint nuevo
  nace protegido en vez de nacer abierto. Ademas no obliga a meter
  `request: Request` en firmas que no lo necesitan.

POR QUE EN MEMORIA Y NO EN REDIS

  El contenedor corre un solo proceso uvicorn, sin --workers (ver
  backend/Dockerfile y su comentario sobre el pool de asyncpg). Con un unico
  proceso, un contador en memoria es exacto y no anade una pieza mas que
  mantener. Si algun dia se levantan varios workers o varias replicas, esto
  hay que mover a un almacen compartido: cada proceso contaria por su cuenta
  y el limite real seria el configurado multiplicado por el numero de
  procesos.

POR QUE MIDDLEWARE ASGI Y NO BaseHTTPMiddleware

  server.py devuelve StreamingResponse en tres sitios (las exportaciones a
  Excel y PDF). BaseHTTPMiddleware consume y reemite el cuerpo de la
  respuesta, que con streaming es justo lo que no se quiere. Un middleware
  ASGI puro decide antes de llamar a la aplicacion y, si deja pasar, no toca
  la respuesta en absoluto.
"""

import json
import time
from collections import defaultdict, deque


def ip_del_cliente(cabeceras: dict) -> str:
    """La IP real de quien pide, no la del tunel.

    Al backend NO llega nadie directamente: el puerto 8002 esta atado a
    127.0.0.1 y todo entra por el tunel de Cloudflare, asi que la direccion de
    la conexion es SIEMPRE la puerta de la red de Docker. Sin esta funcion, el
    limite no seria por IP sino GLOBAL: el primer atacante dejaria fuera a
    todos los hoteles a la vez. Un fallo que no se parece a un problema de
    limites y que solo aparece cuando hay clientes de verdad.

    CF-Connecting-IP la pone Cloudflare y aqui es de fiar precisamente porque
    no hay otra forma de llegar: nada externo alcanza el puerto para
    falsificarla. Si algun dia el backend se expone directo, esta cabecera
    deja de merecer confianza y hay que revisar esto.
    """
    for nombre in (b"cf-connecting-ip", b"x-forwarded-for"):
        valor = cabeceras.get(nombre)
        if valor:
            # X-Forwarded-For puede traer una cadena; el cliente es el primero.
            return valor.decode("latin-1").split(",")[0].strip()
    return "desconocida"


# Reglas: (metodo o None para cualquiera, prefijo, cuantas, en cuantos segundos).
#
# Gana la PRIMERA que encaja, asi que lo estricto va arriba y el techo al final.
#
# Los numeros salen de para que sirve cada ruta, no de una cifra redonda:
#
#   login       Una persona que se equivoca de contrasena reintenta tres o
#               cuatro veces. Diez por minuto deja trabajar a quien se equivoca
#               y convierte la fuerza bruta en algo inviable.
#   registro    Un hotel se da de alta una vez. Cinco por hora y por IP cubre a
#               quien lo intenta varias veces por un error de formulario, y
#               frena el alta masiva de hoteles basura.
#   comprar     Igual: se compra una vez, no veinte.
#   escrituras  Un recepcionista muy rapido no pasa de dos o tres por segundo.
#               Ciento veinte por minuto es holgado.
#   techo       Diez por segundo sostenidos por IP. Un hotel entero sale por la
#               misma IP publica -- varios puestos tras el mismo router -- y aun
#               asi navegando no se acerca, menos ahora con el cache de lecturas
#               del frontend. Existe para que nadie pueda tumbar el servicio, no
#               para racionar el uso.
REGLAS = [
    ("POST", "/api/auth/login", 10, 60),
    ("PUT", "/api/auth/password", 10, 60),
    ("POST", "/api/registro", 5, 3600),
    ("POST", "/comprar", 10, 3600),
    ("POST", "/api/seed", 3, 3600),
    ("POST", None, 120, 60),
    ("PUT", None, 120, 60),
    ("PATCH", None, 120, 60),
    ("DELETE", None, 120, 60),
    (None, None, 600, 60),
]

# Solo se cuenta lo que cuelga de estos prefijos. Los ficheros de la SPA
# (/static/js/...) quedan fuera a proposito: una primera carga pide decenas de
# ellos de golpe y gastaria el cubo de la API sin que nadie haya llamado a
# ningun endpoint.
PREFIJOS = ("/api", "/comprar", "/precios")

# Rutas exentas. El healthcheck del compose golpea cada 30 s desde dentro del
# contenedor y no tiene sentido que compita con nadie.
EXENTAS = ("/api/health",)


class LimitePeticiones:
    """Middleware ASGI que cuenta peticiones por (IP, regla) en ventana deslizante."""

    def __init__(self, app, reglas=REGLAS, prefijos=PREFIJOS, exentas=EXENTAS):
        self.app = app
        self.reglas = reglas
        self.prefijos = tuple(prefijos)
        self.exentas = tuple(exentas)
        # (ip, indice de regla) -> deque de instantes
        self._marcas = defaultdict(deque)
        self._ultima_purga = time.monotonic()

    def _regla_para(self, metodo: str, ruta: str):
        for indice, (met, prefijo, cuantas, ventana) in enumerate(self.reglas):
            if met is not None and met != metodo:
                continue
            if prefijo is not None and not ruta.startswith(prefijo):
                continue
            return indice, cuantas, ventana
        return None

    def _purgar(self, ahora: float) -> None:
        """Tira los cubos que ya no cuentan nada.

        Sin esto, el diccionario crece con una entrada por cada IP que haya
        pasado alguna vez -- que en una API publica es memoria que solo sube.
        Cada minuto basta: las ventanas mas largas son de una hora, y esas se
        vacian solas cuando les toca.
        """
        if ahora - self._ultima_purga < 60:
            return
        self._ultima_purga = ahora
        for clave in [c for c, marcas in self._marcas.items() if not marcas]:
            del self._marcas[clave]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        ruta = scope.get("path", "")
        if not ruta.startswith(self.prefijos) or ruta.startswith(self.exentas):
            return await self.app(scope, receive, send)

        regla = self._regla_para(scope.get("method", "GET"), ruta)
        if regla is None:
            return await self.app(scope, receive, send)
        indice, cuantas, ventana = regla

        cabeceras = dict(scope.get("headers") or [])
        clave = (ip_del_cliente(cabeceras), indice)

        ahora = time.monotonic()
        marcas = self._marcas[clave]
        limite = ahora - ventana
        while marcas and marcas[0] <= limite:
            marcas.popleft()

        if len(marcas) >= cuantas:
            # Cuanto falta para que la mas antigua salga de la ventana.
            espera = max(1, int(marcas[0] + ventana - ahora) + 1)
            cuerpo = json.dumps({
                "detail": (
                    "Demasiadas peticiones desde esta conexion. "
                    f"Vuelve a intentarlo en {espera} segundos."
                )
            }).encode("utf-8")
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(cuerpo)).encode("latin-1")),
                    # Retry-After es la parte que un cliente educado puede
                    # obedecer sola. Sin ella, reintentar en bucle es lo
                    # razonable desde fuera y el 429 no calma nada.
                    (b"retry-after", str(espera).encode("latin-1")),
                ],
            })
            await send({"type": "http.response.body", "body": cuerpo})
            return

        marcas.append(ahora)
        self._purgar(ahora)
        return await self.app(scope, receive, send)
