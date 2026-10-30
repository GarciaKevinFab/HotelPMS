#!/usr/bin/env bash
# Copia de seguridad de ZenStay.
#
# QUE PROTEGE
#
#   La base tiene las reservas, los huespedes, los folios, los pagos y los
#   comprobantes emitidos de todos los hoteles. Perder eso no se arregla con
#   dinero: son datos de facturacion que SUNAT exige conservar, y el hotel no
#   puede volver a teclear las estadias de los ultimos meses.
#
# COMO SE PROGRAMA (en el cron del HOST, no dentro de compose)
#
#   Un respaldo que vive dentro del mismo compose se pierde con el compose.
#
#     crontab -e
#     0 9 * * * /opt/zenstay/tools/respaldar.sh /opt/zenstay/respaldos >> /var/log/zenstay-respaldo.log 2>&1
#
#   09:00 UTC = 04:00 de Lima. Una hora despues del de LicitaPro (08:00 UTC)
#   para no volcar dos bases a la vez en un VPS de dos nucleos.
#
# COMO SE RESTAURA (probarlo ANTES de necesitarlo)
#
#   gunzip -c zenstay-AAAAMMDD-HHMMSS.sql.gz | \
#     docker exec -i zenstay-postgres psql -U postgres -d zenstay
#
#   Un respaldo que nunca se restauro es una suposicion, no una copia.

set -euo pipefail

DESTINO="${1:-}"
if [[ -z "$DESTINO" ]]; then
  echo "Uso: $0 <directorio-destino> [dias-a-conservar]" >&2
  exit 1
fi
DIAS_CONSERVAR="${2:-14}"

cd "$(dirname "$0")/.."

# ─── Leer el .env, NO ejecutarlo ─────────────────────────────────────────────
#
#   `. ./.env` no lee el archivo: lo EJECUTA. Un valor con espacios se parte y
#   bash intenta correr el segundo trozo como comando. Peor todavia: cualquier
#   cosa escrita en el .env correria como root cada madrugada.
#
#   docker-compose lee ese mismo archivo sin quejarse porque su formato NO es
#   shell, asi que el .env nunca tuvo por que ser codigo valido.
leer_env() {
  local v archivo="${2:-.env}"
  [[ -f "$archivo" ]] || return 0
  v="$(sed -n "s/^$1=//p" "$archivo" | head -1)"
  # Las comillas envolventes son del formato, no del valor.
  v="${v%\"}"; v="${v#\"}"
  v="${v%\'}"; v="${v#\'}"
  printf '%s' "$v"
}

: "${POSTGRES_PASSWORD:=$(leer_env POSTGRES_PASSWORD)}"
: "${RESPALDO_REMOTO:=$(leer_env RESPALDO_REMOTO)}"

if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
  echo "ERROR: POSTGRES_PASSWORD vacia. No se puede volcar la base." >&2
  exit 1
fi

# ─── Aviso de fallo ──────────────────────────────────────────────────────────
# Un respaldo que falla en silencio es peor que no tener respaldo: da por
# cubierto un riesgo que sigue abierto.
avisar_fallo() {
  local codigo=$?
  [[ $codigo -eq 0 ]] && return 0
  echo "[$(date '+%F %T')] FALLO con codigo $codigo -- NO hay copia de hoy" >&2
}
trap avisar_fallo EXIT

SELLO="$(date +%Y%m%d-%H%M%S)"
DUMP="$DESTINO/zenstay-$SELLO.sql.gz"
mkdir -p "$DESTINO"

echo "[$(date '+%F %T')] Volcando la base..."
# La contrasena viaja por el entorno del contenedor y no como argumento: los
# argumentos de un proceso los ve cualquiera que liste procesos.
#
# --clean --if-exists para que el volcado sea restaurable sobre una base que ya
# tiene el esquema. --no-owner y --no-privileges porque los roles (app_backend)
# los crea db/rls.sql, no el volcado.
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" zenstay-postgres \
  pg_dump -U postgres -d zenstay --clean --if-exists --no-owner --no-privileges \
  | gzip -9 > "$DUMP"

# pg_dump puede fallar y aun asi dejar un .gz valido pero vacio, porque gzip
# comprime la nada sin protestar.
TAM=$(wc -c < "$DUMP")
if [[ "$TAM" -lt 2048 ]]; then
  echo "ERROR: el volcado pesa $TAM bytes. Se borra para no dar por buena una copia vacia." >&2
  rm -f "$DUMP"
  exit 1
fi

# Y que ademas traiga el esquema: un volcado de una base VACIA pesa mas de 2 KB
# y pasaria la prueba de arriba tan campante.
#
# `grep -c` y no `grep -q`: grep -q sale en cuanto acierta y le manda SIGPIPE a
# gunzip; con `pipefail` la tuberia devolveria 141 aun habiendo encontrado la
# tabla, y este guardia borraria un respaldo BUENO.
CUENTA_TABLA="$(gunzip -c "$DUMP" | grep -c "CREATE TABLE public.reservations" || true)"
if [[ "$CUENTA_TABLA" -eq 0 ]]; then
  echo "ERROR: el volcado no trae la tabla reservations. Base equivocada o vacia." >&2
  rm -f "$DUMP"
  exit 1
fi

echo "[$(date '+%F %T')] Volcado OK: $DUMP ($(du -h "$DUMP" | cut -f1))"

# ─── Fuera del servidor ──────────────────────────────────────────────────────
# Una copia que vive en el mismo disco que la base no protege del fallo que mas
# probablemente ocurra: que el disco o el VPS se pierdan enteros.
if [[ -n "${RESPALDO_REMOTO:-}" ]]; then
  echo "[$(date '+%F %T')] Subiendo a $RESPALDO_REMOTO..."
  # rclone vive en /usr/local/bin y cron trae un PATH corto: por eso el crontab
  # define PATH. Si aun asi no esta, se avisa en vez de dar la subida por hecha.
  if command -v rclone >/dev/null; then
    rclone copy "$DUMP" "$RESPALDO_REMOTO/" --no-traverse
    echo "[$(date '+%F %T')] Subida OK"
  else
    echo "AVISO: rclone no esta en el PATH. La copia queda SOLO en este disco." >&2
  fi
else
  echo "AVISO: RESPALDO_REMOTO sin definir. La copia queda SOLO en este disco." >&2
fi

# ─── Rotacion ────────────────────────────────────────────────────────────────
# Local: se conservan DIAS_CONSERVAR dias. El remoto NO se toca desde aqui:
# borrar en remoto desde el mismo script que sube es como se pierden los
# respaldos de golpe cuando el script tiene un bug.
find "$DESTINO" -name 'zenstay-*.sql.gz' -mtime "+$DIAS_CONSERVAR" -delete
echo "[$(date '+%F %T')] Copias locales: $(find "$DESTINO" -name 'zenstay-*.sql.gz' | wc -l)"
