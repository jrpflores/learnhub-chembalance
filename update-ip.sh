#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${ROOT_DIR}/scripts/ops/update-login-share-url.sh"

if [[ ! -f "${TARGET}" ]]; then
  echo "Missing script: ${TARGET}"
  exit 1
fi

exec "${TARGET}" "$@"
