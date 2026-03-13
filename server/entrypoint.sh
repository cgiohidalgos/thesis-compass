#!/bin/sh
set -e

# Rebuild native modules for this Node.js version
npm rebuild --build-from-source 2>/dev/null || true

# Crea la carpeta de datos si no existe
if [ ! -d /app/data ]; then
  mkdir -p /app/data
  chmod 777 /app/data
fi

# Crea el archivo de base de datos si no existe
if [ ! -f /app/data/data.sqlite ]; then
  touch /app/data/data.sqlite
  chmod 666 /app/data/data.sqlite
fi

# Crea la carpeta de uploads si no existe
if [ ! -d /app/uploads ]; then
  mkdir -p /app/uploads
  chmod 777 /app/uploads
fi


# El esquema se crea automáticamente al importar db.js en index.js

exec "$@"