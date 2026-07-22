#!/bin/sh
set -e

DB_FILE="${DATABASE_FILE:-/app/data/learnhub.db}"
UPLOADS_DIR="${UPLOADS_DIR:-/app/storage/uploads}"
LOGS_DIR="${LOGS_DIR:-/app/storage/logs}"
AI_MODELS_DIR="${AI_MODELS_DIR:-/app/storage/models}"
AUTO_SEED="${LEARNHUB_AUTO_SEED:-false}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p /tmp
  chmod 1777 /tmp
fi

mkdir -p "$(dirname "$DB_FILE")" "$UPLOADS_DIR" "$LOGS_DIR" "$AI_MODELS_DIR"

# Use persistent writable temp storage instead of /tmp (which may be full in constrained hosts).
export TMPDIR="$LOGS_DIR/tmp"
mkdir -p "$TMPDIR"

DB_EXISTS="false"
if [ -f "$DB_FILE" ]; then
  DB_EXISTS="true"
fi

npm run db:migrate

if [ "$AUTO_SEED" = "true" ] && [ "$DB_EXISTS" = "false" ]; then
  npm run db:seed
fi

exec node server.js
