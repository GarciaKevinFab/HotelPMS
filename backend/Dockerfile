# El contexto de build es la RAIZ del repo, no backend/ (ver docker-compose.yml).
# Hace falta para copiar frontend/build dentro de la imagen: este contenedor
# sirve la SPA ademas de la API, igual que FletePro y LicitaPro sirven las suyas.
# Asi el dominio del tunel apunta a un solo puerto y no hace falta proxy delante.
FROM python:3.11-slim

WORKDIR /app

# No hace falta build-essential: asyncpg trae ruedas precompiladas para
# linux/amd64. Solo se instala lo que reportlab necesita para generar los PDF de
# los comprobantes, y curl para el healthcheck del compose.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    zlib1g \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# La SPA compilada. server.py la busca en ROOT_DIR.parent/frontend/build, y
# ROOT_DIR es /app, asi que el destino es /frontend/build. Si ese directorio no
# existe, server.py deja un aviso en el log y la raiz del dominio devuelve 404
# -- que es justo lo que pasaba antes de este despliegue.
#
# El build llega ya compilado desde fuera. No se compila aca a proposito: es un
# VPS de dos nucleos que ademas corre otros tres proyectos en produccion, y un
# build de CRA lo deja pegado varios minutos degradando a los vecinos.
COPY frontend/build /frontend/build

EXPOSE 8002

# Un solo proceso, sin --workers: el pool de asyncpg vive dentro del proceso, y
# varios workers multiplicarian las conexiones a Postgres sin que la carga de un
# hotel lo justifique.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002"]
