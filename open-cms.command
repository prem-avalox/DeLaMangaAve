#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${PORT:-8000}"
CMS_URL="http://localhost:${PORT}/admin.html"

cd "$PROJECT_DIR"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  open "$CMS_URL"
  exit 0
fi

(
  sleep 1
  open "$CMS_URL"
) &

echo "De La Manga CMS local"
echo "Proyecto: $PROJECT_DIR"
echo "URL: $CMS_URL"
echo
echo "Cierra esta ventana o presiona Ctrl+C para detener el servidor."
echo

exec node server.js
