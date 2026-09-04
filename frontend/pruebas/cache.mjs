// Pruebas del cache de lecturas (src/lib/cache.js).
//
//   cd frontend && node pruebas/cache.mjs
//
// Va fuera de src/ a proposito: webpack solo empaqueta lo que cuelga de
// index.js, pero un fichero de pruebas dentro del arbol de la aplicacion acaba
// tarde o temprano importado por error. Y no usa `craco test` porque lo que hay
// que comprobar es que las peticiones SALEN o NO SALEN de verdad, y para eso
// hace falta un servidor HTTP y el adapter real de axios -- en jsdom con el
// adapter simulado la prueba no probaria nada.
//
// LA QUE IMPORTA ES LA SEGUNDA
//
//   "la peticion real lleva Authorization" cazo un fallo que habria tumbado el
//   PMS entero: el cache lanzaba la peticion desde su propio interceptor, que
//   corre ANTES del que pone el token, asi que todas las lecturas salian sin
//   cabecera. El backend devolvia 401, el interceptor de respuesta lo leia como
//   sesion caducada y mandaba al login. Nadie podia entrar.
//
//   Que quede escrita es el motivo de que este fichero exista.

import http from 'node:http';
import { createRequire } from 'node:module';
import { instalarCache, limpiarCache } from '../src/lib/cache.js';

const require = createRequire(import.meta.url);
const axios = require('axios');

let golpes = 0; // cuantas veces se llega de verdad al "backend"

const servidor = http.createServer((req, res) => {
  golpes++;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({
    url: req.url,
    golpe: golpes,
    auth: req.headers.authorization || null,
  }));
});

await new Promise((r) => servidor.listen(0, '127.0.0.1', r));

const api = axios.create({ baseURL: `http://127.0.0.1:${servidor.address().port}/api` });
// Mismo orden de registro que src/lib/api.js: primero el de la cabecera, luego
// el cache. Si se invierte, la prueba deja de reproducir la aplicacion real.
api.interceptors.request.use((c) => { c.headers.Authorization = 'Bearer TOKEN-DE-PRUEBA'; return c; });
instalarCache(api);

const fallos = [];
function comprobar(nombre, real, esperado) {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos.push(nombre);
  console.log(`${bien ? 'OK   ' : 'FALLO'} ${nombre}: ${JSON.stringify(real)}` +
    (bien ? '' : ` (esperado ${JSON.stringify(esperado)})`));
}

// --- Lo que se ahorra ------------------------------------------------------

golpes = 0;
const primera = await api.get('/room-types');
await api.get('/room-types');
await api.get('/room-types');
comprobar('3 GET identicos = 1 viaje', golpes, 1);

comprobar('la peticion real lleva Authorization', primera.data.auth, 'Bearer TOKEN-DE-PRUEBA');

// El Dashboard lanza siete graficos a la vez; Reservas y Calendario piden las
// mismas reservas al mismo tiempo.
limpiarCache(); golpes = 0;
await Promise.all([
  api.get('/dashboard/kpis'), api.get('/dashboard/kpis'),
  api.get('/dashboard/kpis'), api.get('/dashboard/kpis'),
]);
comprobar('4 GET en paralelo = 1 viaje', golpes, 1);

limpiarCache(); golpes = 0;
await api.get('/reports/monthly-revenue', { params: { month: 1, year: 2026 } });
await api.get('/reports/monthly-revenue', { params: { month: 2, year: 2026 } });
comprobar('params distintos = 2 viajes', golpes, 2);

golpes = 0;
await api.get('/reports/monthly-revenue', { params: { year: 2026, month: 1 } });
comprobar('params reordenados = misma entrada', golpes, 0);

// --- Lo que NO se puede ahorrar --------------------------------------------

// Un check-in cambia la habitacion, el tablero de limpieza y los KPI. Si el
// cache no lo olvidara, recepcion veria libre una habitacion ya ocupada.
limpiarCache(); golpes = 0;
await api.get('/rooms');
await api.get('/dashboard/kpis');
await api.post('/reservations/abc/checkin');
const antes = golpes;
await api.get('/rooms');
await api.get('/dashboard/kpis');
comprobar('tras el check-in se releen rooms y dashboard', golpes - antes, 2);

limpiarCache(); golpes = 0;
await api.get('/search', { params: { q: 'gar' } });
await api.get('/search', { params: { q: 'gar' } });
comprobar('/search nunca cachea', golpes, 2);

limpiarCache(); golpes = 0;
await api.get('/reports/export/excel', { params: { report_type: 'x' }, responseType: 'arraybuffer' });
await api.get('/reports/export/excel', { params: { report_type: 'x' }, responseType: 'arraybuffer' });
comprobar('exportaciones no cachean', golpes, 2);

limpiarCache(); golpes = 0;
await api.get('/rooms');
await api.get('/rooms', { sinCache: true });
comprobar('sinCache fuerza el viaje', golpes, 2);

// El cambio de turno en recepcion: si el cache sobreviviera al login, la
// siguiente persona veria los datos de la anterior.
limpiarCache(); golpes = 0;
await api.get('/rooms');
limpiarCache();
await api.get('/rooms');
comprobar('limpiarCache obliga a releer', golpes, 2);

// --- Cuando el backend falla -----------------------------------------------

limpiarCache(); golpes = 0;
servidor.close();
try { await api.get('/alerts'); } catch { /* se espera que falle */ }
comprobar('un fallo no deja entrada en cache', golpes, 0);

console.log(fallos.length ? `\n${fallos.length} FALLOS: ${fallos.join(', ')}` : '\nTodo correcto');
process.exit(fallos.length ? 1 : 0);
