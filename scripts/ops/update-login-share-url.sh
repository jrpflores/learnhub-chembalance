#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
COMPOSE_FILE="${1:-${ROOT_DIR}/docker-compose.yml}"
SERVICE_NAME="${2:-lms}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}"
  exit 1
fi

trim_quotes() {
  local value="${1:-}"
  value="${value%\"}"
  value="${value#\"}"
  echo "${value}"
}

extract_env_value() {
  local key="$1"
  local raw
  raw="$(awk -F= -v k="${key}" '$1==k {print substr($0, index($0, "=")+1); exit}' "${ENV_FILE}" || true)"
  trim_quotes "${raw}"
}

priority_for_ip() {
  local ip="$1"
  if [[ "${ip}" =~ ^192\.168\. ]]; then
    echo 1
    return
  fi
  if [[ "${ip}" =~ ^10\. ]]; then
    echo 2
    return
  fi
  if [[ "${ip}" =~ ^172\.([1][6-9]|2[0-9]|3[0-1])\. ]]; then
    echo 3
    return
  fi
  echo 9
}

collect_candidate_ips() {
  if [[ -n "${LOGIN_SHARE_IP:-}" ]]; then
    echo "${LOGIN_SHARE_IP}"
    return
  fi

  if command -v ipconfig >/dev/null 2>&1; then
    for iface in en0 en1 en2 eth0 wlan0; do
      local ip
      ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
      if [[ -n "${ip}" ]]; then
        echo "${ip}"
      fi
    done
  fi

  if command -v ip >/dev/null 2>&1; then
    ip -o -4 addr show up scope global 2>/dev/null \
      | awk '$2 !~ /^(docker|br-|veth|lo|cni|flannel|utun|awdl)/ {print $4}' \
      | cut -d/ -f1
  fi

  if command -v hostname >/dev/null 2>&1; then
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}

select_best_ip() {
  local best_ip=""
  local best_priority=99
  while IFS= read -r ip; do
    ip="$(echo "${ip}" | xargs)"
    [[ -z "${ip}" ]] && continue
    [[ "${ip}" == "127.0.0.1" ]] && continue
    [[ "${ip}" == "0.0.0.0" ]] && continue
    [[ "${ip}" =~ ^169\.254\. ]] && continue
    if [[ ! "${ip}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      continue
    fi

    local p
    p="$(priority_for_ip "${ip}")"
    if (( p < best_priority )); then
      best_priority="${p}"
      best_ip="${ip}"
    fi
  done < <(collect_candidate_ips | awk 'NF' | sort -u)

  echo "${best_ip}"
}

LAN_IP="$(select_best_ip)"
if [[ -z "${LAN_IP}" ]]; then
  echo "Unable to detect LAN IPv4 address. Set LOGIN_SHARE_IP and retry."
  exit 1
fi

LMS_PORT="$(extract_env_value "LMS_HOST_PORT")"
if [[ -z "${LMS_PORT}" ]]; then
  LMS_PORT="3000"
fi

LOGIN_URL="http://${LAN_IP}:${LMS_PORT}/login"
TMP_FILE="${ENV_FILE}.tmp"

awk -v url="${LOGIN_URL}" '
BEGIN {
  updated = 0
}
/^LOGIN_SHARE_URL=/ {
  if (updated == 0) {
    print "LOGIN_SHARE_URL=\"" url "\""
    updated = 1
  }
  next
}
{
  print
}
END {
  if (updated == 0) {
    print "LOGIN_SHARE_URL=\"" url "\""
  }
}
' "${ENV_FILE}" > "${TMP_FILE}"

mv "${TMP_FILE}" "${ENV_FILE}"

echo "Updated LOGIN_SHARE_URL=${LOGIN_URL} in ${ENV_FILE}"
echo "Rebuilding service '${SERVICE_NAME}' using ${COMPOSE_FILE}..."
docker compose -f "${COMPOSE_FILE}" up -d --build --force-recreate "${SERVICE_NAME}"
echo "Done. Login URL: ${LOGIN_URL}"
