#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./scripts/ops/publish-dockerhub.sh <dockerhub_user> <version> [--no-build]

Examples:
  ./scripts/ops/publish-dockerhub.sh olryts 1.0.0
  ./scripts/ops/publish-dockerhub.sh olryts 1.0.1 --no-build

What it does:
  - Builds images (unless --no-build)
  - Tags each image with <version> and latest
  - Pushes to Docker Hub

Images pushed:
  <user>/chembalance-lms:<version>, latest
  <user>/chembalance-worker:<version>, latest
  <user>/chembalance-offline-grader:<version>, latest
EOF
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 1
fi

DOCKERHUB_USER="$1"
VERSION="$2"
NO_BUILD="${3:-}"

if [[ -z "$DOCKERHUB_USER" || -z "$VERSION" ]]; then
  usage
  exit 1
fi

if [[ "$NO_BUILD" != "" && "$NO_BUILD" != "--no-build" ]]; then
  echo "Unknown option: $NO_BUILD"
  usage
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed."
  exit 1
fi

if [[ "$NO_BUILD" != "--no-build" ]]; then
  echo "Building lms, worker, and offline-grader images..."
  docker compose build lms worker offline-grader
else
  echo "Skipping build (--no-build)."
fi

LOCAL_LMS_IMAGE="learnhub/lms:local"
LOCAL_WORKER_IMAGE="learnhub/lms-ops:local"
LOCAL_OFFLINE_GRADER_IMAGE="learnhub/offline-grader:local"

REMOTE_LMS_IMAGE="${DOCKERHUB_USER}/chembalance-lms"
REMOTE_WORKER_IMAGE="${DOCKERHUB_USER}/chembalance-worker"
REMOTE_OFFLINE_GRADER_IMAGE="${DOCKERHUB_USER}/chembalance-offline-grader"

push_image() {
  local local_image="$1"
  local remote_image="$2"

  docker image inspect "$local_image" >/dev/null 2>&1 || {
    echo "Local image not found: $local_image"
    echo "Build first or remove --no-build."
    exit 1
  }

  echo "Tagging ${local_image} -> ${remote_image}:${VERSION}, ${remote_image}:latest"
  docker tag "$local_image" "${remote_image}:${VERSION}"
  docker tag "$local_image" "${remote_image}:latest"

  echo "Pushing ${remote_image}:${VERSION}"
  docker push "${remote_image}:${VERSION}"
  echo "Pushing ${remote_image}:latest"
  docker push "${remote_image}:latest"
}

echo "Publishing images to Docker Hub user: ${DOCKERHUB_USER}"
push_image "$LOCAL_LMS_IMAGE" "$REMOTE_LMS_IMAGE"
push_image "$LOCAL_WORKER_IMAGE" "$REMOTE_WORKER_IMAGE"
push_image "$LOCAL_OFFLINE_GRADER_IMAGE" "$REMOTE_OFFLINE_GRADER_IMAGE"

cat <<EOF

Done.
Deploy with version-pinned images:
  export CHEMBALANCE_LMS_IMAGE=${REMOTE_LMS_IMAGE}:${VERSION}
  export CHEMBALANCE_WORKER_IMAGE=${REMOTE_WORKER_IMAGE}:${VERSION}
  export CHEMBALANCE_OFFLINE_GRADER_IMAGE=${REMOTE_OFFLINE_GRADER_IMAGE}:${VERSION}
  docker compose -f docker-compose.images.yml pull lms worker offline-grader
  docker compose -f docker-compose.images.yml up -d --no-build
EOF
