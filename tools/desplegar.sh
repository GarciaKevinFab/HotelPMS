#!/usr/bin/env bash
# Despliegue de ZenStay al VPS.
#
#   bash tools/desplegar.sh
#
# QUE HACE Y POR QUE EN ESE ORDEN
#
#   1. Compila el frontend AQUI, no en el VPS. El servidor tiene dos nucleos y
#      corre otros tres proyectos en produccion; un build de CRA lo deja pegado
#      varios minutos y degrada a los vecinos.
#   2. Empaqueta sin los .env. Los secretos viven SOLO en el VPS, generados
#      alli con openssl. Si este script los subiera, una copia acabaria en el
#      portatil, en el historial del shell y en cualquier backup del portatil.
#   3. Sube y reconstruye. El compose recrea los contenedores; el volumen de
#      Postgres NO se toca, asi que los datos sobreviven al despliegue.
#
# LO QUE ESTE SCRIPT NO HACE, A PROPOSITO
#
#   No aplica migraciones de base de datos. Un despliegue que altera el esquema
#   sin que nadie lo mire es como se pierden columnas con datos dentro. Las
#   migraciones de db/migrations/ se aplican a mano, leyendolas antes:
#
#     docker exec -i zenstay-postgres psql -v ON_ERROR_STOP=1 -U postgres \
#       -d zenstay < db/migrations/00X_lo_que_sea.sql
#
#   Y antes de cualquier migracion, un respaldo:
#     /opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos

set -euo pipefail

VPS="${VPS:-root@2.24.115.75}"
LLAVE="${LLAVE:-$HOME/.ssh/hostinger_vps_ed25519}"

cd "$(dirname "$0")/.."

echo "==> 1/4  Compilando el frontend"
( cd frontend && npx craco build )

# Un build que no dejo bundle es un build fallido que CRA puede haber reportado
# como exitoso. Sin esta comprobacion se sube una imagen sin aplicacion dentro
# y el dominio queda sirviendo un index.html que no carga nada.
if ! ls frontend/build/static/js/*.js >/dev/null 2>&1; then
  echo "ERROR: no hay bundle en frontend/build/static/js. El build fallo." >&2
  exit 1
fi

echo "==> 2/4  Empaquetando (sin los .env)"
TMPDIR_PAQUETE="$(mktemp -d)"
PAQUETE="$TMPDIR_PAQUETE/zenstay.tar.gz"
tar --force-local -czf "$PAQUETE" \
  --exclude='.env' --exclude='.env.*' \
  --exclude='__pycache__' --exclude='node_modules' --exclude='.pytest_cache' \
  backend db tools frontend/build docker-compose.yml .dockerignore

# Cinturon y tirantes: si un .env se colara pese a los --exclude, mejor parar
# aqui que descubrirlo cuando ya esta en el servidor.
if tar --force-local -tzf "$PAQUETE" | grep -qE '\.env'; then
  echo "ERROR: el paquete contiene un .env. Abortado." >&2
  exit 1
fi
echo "    $(du -h "$PAQUETE" | cut -f1)"

echo "==> 3/4  Subiendo a $VPS"
scp -i "$LLAVE" -q "$PAQUETE" "$VPS:/tmp/zenstay.tar.gz"
rm -rf "$TMPDIR_PAQUETE"

echo "==> 4/4  Reconstruyendo en el VPS"
ssh -i "$LLAVE" "$VPS" bash -s <<'REMOTO_FIN'
set -euo pipefail
cd /opt/zenstay
tar xzf /tmp/zenstay.tar.gz
rm -f /tmp/zenstay.tar.gz
chmod +x tools/*.sh
docker compose up -d --build

# Esperar a que el healthcheck pase de verdad, en vez de dar por bueno el
# despliegue porque `up -d` volvio sin error: el contenedor puede arrancar y
# morir a los dos segundos por una variable que falta.
for i in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:8002/api/health >/dev/null 2>&1; then
    echo "OK: la API responde"
    curl -s http://127.0.0.1:8002/api/health; echo
    exit 0
  fi
  sleep 2
done
echo "ERROR: la API no respondio en 60s. Logs:" >&2
docker compose logs --tail 30 backend >&2
exit 1
REMOTO_FIN

echo
echo "Desplegado: https://zenstay.sisac.pe"
