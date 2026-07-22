#!/bin/sh
set -e

BACKUP_DIR="${1:-./backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="${BACKUP_DIR}/learnhub-db-${STAMP}.tar.gz"

mkdir -p "$BACKUP_DIR"

docker run --rm \
  -v learnhub_db-data:/db-data \
  -v "$(pwd)/${BACKUP_DIR}":/backup \
  alpine:3.20 \
  sh -c "cd /db-data && tar -czf /backup/learnhub-db-${STAMP}.tar.gz ."

echo "Backup created at ${TARGET}"
