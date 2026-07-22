#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.images.yml"

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}"
  exit 1
fi

usage() {
  cat <<'EOF'
Usage:
  ./compose-images.sh <command> [args...]

Commands:
  up [services...]         Start image-only stack in detached mode (--no-build).
  fresh-up [name] [svc..]  Start isolated stack with new project/volume prefix.
  fresh-down <name> [args] Stop isolated stack by project name.
  down [args...]           Stop stack (pass -v to remove volumes).
  pull [services...]       Pull image tags defined in env/compose.
  export [file.tar]        Export compose images to a tar archive.
  restart [services...]    Restart one or more services.
  logs [services...]       Follow service logs.
  ps                       Show service status.
  config                   Render resolved compose config.
  migrate                  Run DB migrations inside lms container.
  seed                     Run DB seed inside lms container.
  exec <svc> <cmd...>      Run arbitrary command in a running service.

Environment:
  COMPOSE_PROJECT_NAME     Optional docker compose project/prefix
                           (set in shell or .env; default comes from directory name).

Examples:
  COMPOSE_PROJECT_NAME=school-a ./compose-images.sh up
  ./compose-images.sh fresh-up
  ./compose-images.sh fresh-up school-a
  ./compose-images.sh fresh-down school-a -v
  ./compose-images.sh up
  ./compose-images.sh pull lms worker offline-grader
  ./compose-images.sh export
  ./compose-images.sh export ./exports/learnhub-images.tar
  ./compose-images.sh logs lms worker
  ./compose-images.sh down -v
EOF
}

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

command_name="$1"
shift || true

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

case "${command_name}" in
  up)
    compose up -d --no-build "$@"
    ;;
  fresh-up)
    project_name="${1:-}"
    if [[ -n "${project_name}" ]]; then
      shift
    else
      project_name="chembalance-test-$(date +%Y%m%d%H%M%S)"
    fi
    echo "Using COMPOSE_PROJECT_NAME=${project_name}"
    COMPOSE_PROJECT_NAME="${project_name}" compose up -d --no-build "$@"
    echo "Created isolated volumes with prefix: ${project_name}_"
    ;;
  fresh-down)
    if [[ $# -lt 1 ]]; then
      echo "Usage: ./compose-images.sh fresh-down <project-name> [down-args...]"
      exit 1
    fi
    project_name="$1"
    shift
    COMPOSE_PROJECT_NAME="${project_name}" compose down "$@"
    ;;
  down)
    compose down "$@"
    ;;
  pull)
    compose pull "$@"
    ;;
  export)
    output_file="${ROOT_DIR}/learnhub-images-$(date +%Y%m%d-%H%M%S).tar"
    if [[ $# -gt 0 && "$1" == *.tar ]]; then
      output_file="$1"
      shift
    fi

    mapfile -t images < <(compose config --images "$@" | awk 'NF' | sort -u)
    if [[ ${#images[@]} -eq 0 ]]; then
      echo "No images found to export from ${COMPOSE_FILE}"
      exit 1
    fi

    mkdir -p "$(dirname "${output_file}")"
    echo "Exporting ${#images[@]} images to ${output_file}..."
    docker image save -o "${output_file}" "${images[@]}"
    echo "Export complete: ${output_file}"
    ;;
  restart)
    compose restart "$@"
    ;;
  logs)
    compose logs -f --tail=200 "$@"
    ;;
  ps)
    compose ps
    ;;
  config)
    compose config
    ;;
  migrate)
    compose exec lms npm run db:migrate
    ;;
  seed)
    compose exec lms npm run db:seed
    ;;
  exec)
    if [[ $# -lt 2 ]]; then
      echo "Usage: ./compose-images.sh exec <service> <command...>"
      exit 1
    fi
    service="$1"
    shift
    compose exec "${service}" "$@"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: ${command_name}"
    usage
    exit 1
    ;;
esac
