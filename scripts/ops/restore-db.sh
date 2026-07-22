#!/bin/sh
set -e

ARCHIVE_PATH="$1"
if [ -z "$ARCHIVE_PATH" ]; then
  echo "Usage: ./scripts/ops/restore-db.sh <backup-tar.gz>"
  exit 1
fi

if [ ! -f "$ARCHIVE_PATH" ]; then
  echo "Backup archive not found: $ARCHIVE_PATH"
  exit 1
fi

docker run --rm \
  -v learnhub_db-data:/db-data \
  -v "$(pwd)":/workspace \
  alpine:3.20 \
  sh -c "rm -rf /db-data/* && tar -xzf /workspace/${ARCHIVE_PATH#./} -C /db-data"

echo "Database restored from ${ARCHIVE_PATH}"
