#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCKERHUB_USER="${DOCKERHUB_USER:-olryts}"
VERSION="${VERSION:-1.0.0}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64/v8}"
BUILDER_NAME="${BUILDER_NAME:-chembalance-multiarch}"
BUILDER_DRIVER="${BUILDER_DRIVER:-docker-container}"
NODE_IMAGE="${NODE_IMAGE:-node:20-slim}"
PYTHON_IMAGE="${PYTHON_IMAGE:-python:3.12-slim}"
PULL_BASE_IMAGES="${PULL_BASE_IMAGES:-false}"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/ops/publish-dockerhub-multiarch.sh [version]

Environment overrides:
  DOCKERHUB_USER  Docker Hub namespace (default: olryts)
  VERSION         Version tag (default: 1.0.0)
  PLATFORMS       Buildx platforms (default: linux/amd64,linux/arm64/v8)
  BUILDER_NAME    Buildx builder name (default: chembalance-multiarch)
  BUILDER_DRIVER  Buildx driver (default: docker-container, option: docker)
  NODE_IMAGE      Base node image (default: node:20-slim)
  PYTHON_IMAGE    Base python image (default: python:3.12-slim)
  PULL_BASE_IMAGES true|false for buildx --pull (default: false)

Examples:
  ./scripts/ops/publish-dockerhub-multiarch.sh
  ./scripts/ops/publish-dockerhub-multiarch.sh 1.0.1
  DOCKERHUB_USER=olryts VERSION=1.0.0 ./scripts/ops/publish-dockerhub-multiarch.sh
  NODE_IMAGE=public.ecr.aws/docker/library/node:20-slim \
  PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.12-slim \
  ./scripts/ops/publish-dockerhub-multiarch.sh 1.0.0
  BUILDER_DRIVER=docker PLATFORMS=linux/amd64 PULL_BASE_IMAGES=false \
  ./scripts/ops/publish-dockerhub-multiarch.sh 1.0.0
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage
  exit 1
fi

if [[ $# -eq 1 ]]; then
  VERSION="$1"
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required but not installed."
  exit 1
fi

if ! docker buildx version >/dev/null 2>&1; then
  echo "docker buildx is required. Install Docker Buildx and retry."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "docker daemon is not reachable."
  exit 1
fi

if [[ "${BUILDER_DRIVER}" != "docker-container" && "${BUILDER_DRIVER}" != "docker" ]]; then
  echo "BUILDER_DRIVER must be one of: docker-container, docker"
  exit 1
fi

if ! docker buildx inspect "${BUILDER_NAME}" >/dev/null 2>&1; then
  echo "Creating buildx builder: ${BUILDER_NAME}"
  docker buildx create --name "${BUILDER_NAME}" --driver "${BUILDER_DRIVER}" --use
else
  docker buildx use "${BUILDER_NAME}"
fi

if [[ "${BUILDER_DRIVER}" == "docker-container" ]]; then
  docker buildx inspect --bootstrap >/dev/null
fi

if [[ "${PULL_BASE_IMAGES}" != "true" && "${PULL_BASE_IMAGES}" != "false" ]]; then
  echo "PULL_BASE_IMAGES must be true or false"
  exit 1
fi

run_buildx() {
  if [[ "${PULL_BASE_IMAGES}" == "true" ]]; then
    docker buildx build --pull "$@"
  else
    docker buildx build "$@"
  fi
}

LMS_REPO="${DOCKERHUB_USER}/chembalance-lms"
WORKER_REPO="${DOCKERHUB_USER}/chembalance-worker"
OFFLINE_GRADER_REPO="${DOCKERHUB_USER}/chembalance-offline-grader"

echo "Publishing multi-arch images for user=${DOCKERHUB_USER}, version=${VERSION}"
echo "Platforms: ${PLATFORMS}"
echo "Builder driver: ${BUILDER_DRIVER}"
echo "Node base image: ${NODE_IMAGE}"
echo "Python base image: ${PYTHON_IMAGE}"
echo "Pull base images: ${PULL_BASE_IMAGES}"
echo

run_buildx \
  --platform "${PLATFORMS}" \
  --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
  -f "${ROOT_DIR}/Dockerfile" \
  -t "${LMS_REPO}:${VERSION}" \
  -t "${LMS_REPO}:latest" \
  --push \
  "${ROOT_DIR}"

run_buildx \
  --platform "${PLATFORMS}" \
  --build-arg "NODE_IMAGE=${NODE_IMAGE}" \
  -f "${ROOT_DIR}/Dockerfile.ops" \
  -t "${WORKER_REPO}:${VERSION}" \
  -t "${WORKER_REPO}:latest" \
  --push \
  "${ROOT_DIR}"

run_buildx \
  --platform "${PLATFORMS}" \
  --build-arg "PYTHON_IMAGE=${PYTHON_IMAGE}" \
  -f "${ROOT_DIR}/services/offline-grader/Dockerfile" \
  -t "${OFFLINE_GRADER_REPO}:${VERSION}" \
  -t "${OFFLINE_GRADER_REPO}:latest" \
  --push \
  "${ROOT_DIR}/services/offline-grader"

cat <<EOF

Published:
  ${LMS_REPO}:${VERSION}
  ${LMS_REPO}:latest
  ${WORKER_REPO}:${VERSION}
  ${WORKER_REPO}:latest
  ${OFFLINE_GRADER_REPO}:${VERSION}
  ${OFFLINE_GRADER_REPO}:latest

Deploy commands:
  export CHEMBALANCE_LMS_IMAGE=${LMS_REPO}:${VERSION}
  export CHEMBALANCE_WORKER_IMAGE=${WORKER_REPO}:${VERSION}
  export CHEMBALANCE_OFFLINE_GRADER_IMAGE=${OFFLINE_GRADER_REPO}:${VERSION}
  docker compose -f docker-compose.images.yml pull lms worker offline-grader
  docker compose -f docker-compose.images.yml up -d --no-build
EOF
