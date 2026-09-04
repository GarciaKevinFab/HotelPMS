// Cache de lecturas para el cliente de axios.
//
// EL PROBLEMA
//
//   Cada pantalla del PMS monta su `useEffect` y pide sus datos. Abrir
//   Habitaciones, ir a Reservas y volver a Habitaciones son tres viajes al
//   backend y tres consultas a Postgres para pintar exactamente lo mismo. Con
//   52 `useEffect` repartidos por la aplicacion, una jornada de recepcion son
//   miles de consultas que devuelven el catalogo de tipos de habitacion o la
//   lista de productos, que no cambia en semanas.
//
//   No es solo coste: es lentitud visible. Cada navegacion enseña un esqueleto
//   de carga aunque el dato ya estuviera en memoria hace dos segundos.
//
// POR QUE AQUI Y NO CON UNA LIBRERIA
//
//   react-query resuelve esto mejor, pero obliga a reescribir los 44 puntos de
//   llamada y a recompilar la SPA con una dependencia mas en un VPS de dos
//   nucleos. Todas las lecturas ya pasan por la misma instancia de axios
//   (lib/api.js), asi que un interceptor cubre las 44 de una vez y ningun
//   componente se entera.
//
// QUE HACE, EN ORDEN
//
//   1. Deduplica: si la misma peticion ya esta en vuelo, la segunda espera a
//      la primera en vez de abrir otra. El Dashboard lanza siete graficos a la
//      vez y Reservas y Calendario piden las mismas reservas.
//   2. Sirve de memoria mientras la entrada siga viva (TTL por ruta).
//   3. Invalida al escribir: un POST/PUT/DELETE tira el cache de su entidad y
//      el de las que dependen de ella. Sin esto el cache miente, que es peor
//      que no tenerlo.
//
// LO QUE NO HACE, A PROPOSITO
//
//   No persiste en localStorage. El cache vive en memoria y muere al recargar
//   la pestaña, que es justo lo que se quiere: si alguien recarga es porque
//   duda de lo que ve, y devolverle lo mismo de disco seria traicionarlo.

import axios from 'axios';

// clave -> { expira: epoch ms, respuesta }
const almacen = new Map();
// clave -> Promise de la peticion en curso
const enVuelo = new Map();

// TTL en segundos por prefijo de ruta. El orden importa: gana el primero que
// encaje, asi que lo especifico va antes que lo general.
//
// El criterio es "cuanto puede envejecer este dato sin que a nadie le importe":
// el catalogo de planes cambia cuando lo cambiamos nosotros; una reserva puede
// cambiar mientras la recepcionista mira la pantalla.
const TTL = [
  // Catalogo: lo edita el ADMIN muy de vez en cuando.
  ['/planes', 300],
  ['/room-types', 300],
  ['/products', 300],
  ['/rates', 300],
  // Estructura del hotel: cambia al dar de alta habitaciones o personal.
  ['/rooms', 60],
  ['/users', 60],
  ['/tenants', 60],
  // Agregados: se recalculan sobre datos del dia, no hace falta al segundo.
  ['/dashboard', 60],
  ['/reports', 60],
  // Operativa viva. TTL corto: existe para absorber el ida y vuelta entre
  // pantallas, no para ahorrarse una recarga de verdad.
  ['/reservations', 20],
  ['/calendar', 20],
  ['/invoices', 20],
  ['/cash-shifts', 20],
  ['/housekeeping', 20],
  ['/maintenance', 20],
  ['/alerts', 20],
  ['/guests', 20],
  ['/folios', 20],
  ['/audit-logs', 20],
  ['/auth/me', 30],
];

// Rutas que NUNCA se cachean.
//
//   /search         cada pulsacion es una consulta distinta; cachear solo
//                   llenaria memoria con resultados que nadie repite.
//   /reports/export descarga un fichero (responseType blob). Guardar binarios
//                   en un Map es la forma rapida de comerse la pestaña.
const NUNCA = ['/search', '/reports/export'];

// Que hay que olvidar cuando se escribe en cada sitio.
//
// La clave es el prefijo que se escribe; el valor, los prefijos de lectura que
// dejan de ser de fiar. Las dependencias cruzadas son el motivo de que esto sea
// una tabla y no "borrar lo que empiece igual": hacer un check-in cambia la
// reserva, PERO TAMBIEN el estado de la habitacion, el tablero de limpieza, los
// KPI del dashboard y el calendario. Si solo se olvidara /reservations, la
// recepcionista veria la habitacion libre despues de haber alojado a alguien.
const DEPENDE = {
  '/reservations': ['/reservations', '/calendar', '/rooms', '/dashboard', '/housekeeping', '/alerts', '/folios', '/guests'],
  '/calendar': ['/calendar', '/reservations', '/rooms', '/dashboard'],
  '/rooms': ['/rooms', '/housekeeping', '/dashboard', '/calendar'],
  '/room-types': ['/room-types', '/rooms', '/rates', '/dashboard'],
  '/rates': ['/rates', '/reservations'],
  '/folios': ['/folios', '/reservations', '/invoices', '/cash-shifts', '/dashboard'],
  '/invoices': ['/invoices', '/dashboard', '/reports', '/folios'],
  '/cash-shifts': ['/cash-shifts', '/dashboard', '/reports'],
  '/housekeeping': ['/housekeeping', '/rooms', '/dashboard'],
  '/maintenance': ['/maintenance', '/rooms', '/alerts'],
  '/alerts': ['/alerts', '/dashboard'],
  '/guests': ['/guests', '/reservations'],
  '/products': ['/products', '/folios', '/dashboard'],
  '/users': ['/users'],
  '/tenants': ['/tenants', '/planes'],
  '/notifications': ['/notifications'],
  '/seed': null, // null = tirar el cache entero
};

function prefijo(url) {
  // '/reservations/abc/checkin' -> '/reservations'. Con dos segmentos para las
  // rutas que los usan de verdad ('/auth/me', '/dashboard/kpis') el mapa se
  // duplicaria sin ganar nada: basta el primero para decidir a quien afecta.
  const limpia = String(url || '').split('?')[0];
  const partes = limpia.split('/').filter(Boolean);
  return partes.length ? `/${partes[0]}` : '/';
}

function ttlDe(url) {
  const limpia = String(url || '').split('?')[0];
  for (const [ruta, segundos] of TTL) {
    if (limpia === ruta || limpia.startsWith(`${ruta}/`)) return segundos;
  }
  // Cualquier GET que no este en la tabla igualmente se cachea unos segundos.
  // Es el caso que motiva todo esto: navegar entre dos pantallas y volver no
  // deberia repetir la consulta. Diez segundos no llegan a envejecer nada que
  // un humano note, y cubre las rutas que se añadan mañana sin tocar aqui.
  return 10;
}

function cacheable(config) {
  if (String(config.method || 'get').toLowerCase() !== 'get') return false;
  // Las descargas vienen como blob o arraybuffer.
  if (config.responseType && config.responseType !== 'json') return false;
  const limpia = String(config.url || '').split('?')[0];
  if (NUNCA.some((r) => limpia === r || limpia.startsWith(`${r}/`))) return false;
  // Escotilla por llamada: api.get(url, { sinCache: true }) para el boton de
  // "Actualizar", que tiene que ir al servidor siempre o no significa nada.
  if (config.sinCache) return false;
  return true;
}

function claveDe(config) {
  // Los params se ordenan: { month, year } y { year, month } son la misma
  // consulta y tienen que compartir entrada.
  const params = config.params || {};
  const orden = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join('&');
  return `${config.url}${orden ? `?${orden}` : ''}`;
}

/** Olvida las lecturas afectadas por una escritura en `url`. */
export function invalidar(url) {
  const raiz = prefijo(url);
  const afectados = raiz in DEPENDE ? DEPENDE[raiz] : [raiz];

  if (afectados === null) {
    almacen.clear();
    return;
  }
  for (const clave of Array.from(almacen.keys())) {
    if (afectados.some((p) => clave === p || clave.startsWith(`${p}/`) || clave.startsWith(`${p}?`))) {
      almacen.delete(clave);
    }
  }
}

/** Vacia el cache entero. Se llama al entrar y al salir de una sesion. */
export function limpiarCache() {
  almacen.clear();
  enVuelo.clear();
}

/**
 * Engancha el cache a una instancia de axios.
 *
 * Se hace con `config.adapter` y no devolviendo la respuesta desde el
 * interceptor porque axios espera que un interceptor de peticion devuelva una
 * config, no una respuesta: cortar ahi obliga a rechazar la promesa con un
 * objeto centinela y a distinguirlo despues en el interceptor de error. El
 * adapter es el punto que axios ya tiene previsto para "esta peticion la
 * resuelve otro".
 */
export function instalarCache(api) {
  api.interceptors.request.use((config) => {
    if (!cacheable(config)) return config;

    const clave = claveDe(config);
    const guardada = almacen.get(clave);

    if (guardada && guardada.expira > Date.now()) {
      config.adapter = () => Promise.resolve({ ...guardada.respuesta, config, cached: true });
      return config;
    }
    if (guardada) almacen.delete(clave);

    const cursando = enVuelo.get(clave);
    if (cursando) {
      // Misma peticion ya viajando: esta se cuelga de aquella. Si la primera
      // falla, esta falla igual -- que es lo correcto: son la misma consulta.
      config.adapter = () => cursando.then((r) => ({ ...r, config, cached: true }));
      return config;
    }

    // Primera de su clase: se anota como en vuelo para que las siguientes se
    // enganchen. Pero el viaje NO se lanza aqui.
    //
    // POR QUE PEREZOSO Y NO `original(config)` A SECAS
    //
    //   Este interceptor corre ANTES que el que pone la cabecera Authorization
    //   -- axios ejecuta los de peticion en orden inverso al registro --, asi
    //   que disparar la peticion en esta linea la manda SIN TOKEN. Sale un 401,
    //   el interceptor de respuesta lo lee como sesion caducada y echa al
    //   usuario al login. Es decir: la aplicacion entera deja de funcionar
    //   nada mas entrar.
    //
    //   La promesa se crea ahora (para poder deduplicar) pero se resuelve
    //   cuando axios invoca el adapter, que es el final de la cadena y ya trae
    //   la cabecera puesta.
    //
    //   El adapter se resuelve con axios.getAdapter porque desde axios 1.x
    //   `defaults.adapter` NO es una funcion sino la lista de candidatos por
    //   nombre -- ["xhr","http","fetch"] --; llamarlo directamente revienta con
    //   "adapter is not a function".
    let lanzar;
    const viaje = new Promise((cumplir, fallar) => {
      lanzar = (configFinal) => {
        const original = axios.getAdapter(api.defaults.adapter);
        Promise.resolve(original(configFinal)).then(cumplir, fallar);
      };
    });
    let lanzada = false;
    enVuelo.set(clave, viaje);
    viaje
      .then((respuesta) => {
        almacen.set(clave, {
          expira: Date.now() + ttlDe(config.url) * 1000,
          // Solo lo que un componente puede llegar a mirar. Guardar `request`
          // (un XMLHttpRequest) mantendria vivo el objeto del navegador.
          respuesta: {
            data: respuesta.data,
            status: respuesta.status,
            statusText: respuesta.statusText,
            headers: respuesta.headers,
          },
        });
      })
      .catch(() => {
        // Un error no se cachea: el siguiente intento tiene que volver a
        // preguntar. Si Postgres estuvo caido dos segundos, no se puede quedar
        // caido en la pantalla veinte mas.
      })
      .finally(() => {
        enVuelo.delete(clave);
      });

    config.adapter = (configFinal) => {
      if (!lanzada) {
        lanzada = true;
        lanzar(configFinal);
      }
      return viaje.then((r) => ({ ...r, config: configFinal }));
    };
    return config;
  });

  api.interceptors.response.use(
    (respuesta) => {
      const metodo = String(respuesta.config?.method || '').toLowerCase();
      if (['post', 'put', 'patch', 'delete'].includes(metodo)) {
        invalidar(respuesta.config.url);
      }
      return respuesta;
    },
    (error) => Promise.reject(error)
  );

  return api;
}
