# ChemBalance Docker Deployment Guide (Offline-First)

## 1) Deployment Model

ChemBalance is deployed as a multi-service Docker stack:

- `lms`: main web + API runtime
- `ollama`: local model runtime
- `offline-grader`: local AI-assisted grading service
- `worker`: async grading processor for queue mode
- `db`: persistence sidecar for shared DB volume lifecycle

All services run on internal Docker network `learnhub-internal`.

## 2) Prerequisites

- Docker Engine 24+
- Docker Compose v2+
- local disk space for persistent volumes and model files

## 3) Configuration

Copy and edit environment values:

```bash
cp .env.example .env
```

Critical variables:

- `COMPOSE_PROJECT_NAME` (container/volume/network prefix, recommended: `chembalance`)
- `LMS_HOST_PORT`, `OFFLINE_GRADER_HOST_PORT`, `OLLAMA_HOST_PORT` (host port bindings)
- `JWT_SECRET`
- `SESSION_COOKIE_SECURE` (`true` for HTTPS production; set `false` only for LAN HTTP testing)
- `DATABASE_FILE`
- `UPLOADS_DIR`, `LOGS_DIR`, `AI_MODELS_DIR`
- `OFFLINE_AI_ENABLED`
- `OFFLINE_GRADER_URL`
- `OFFLINE_GRADER_TIMEOUT_MS`
- `GRADER_PROVIDER` (`auto` or `heuristic` or `ollama`)
- `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `OLLAMA_TIMEOUT_MS`, `OLLAMA_TEMPERATURE`
- `OLLAMA_FALLBACK_MODELS` (optional comma-separated fallback model list; leave empty unless preloaded)
- `AI_GRADING_MODE` (`sync` or `queue`)
- `AI_FALLBACK_BEHAVIOR` (`manual_review` or `rule_based`)
- `AI_CONFIDENCE_HIGH`, `AI_CONFIDENCE_MEDIUM`

## 4) Start and Stop

Start full stack:

```bash
docker compose up --build -d

# Optional dynamic prefix per environment
# COMPOSE_PROJECT_NAME=school-a docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Stop and wipe volumes:

```bash
docker compose down -v
```

Image-only deployment (no `build` step, uses preloaded images):

```bash
docker compose -f docker-compose.images.yml up -d --no-build

# Optional dynamic prefix per environment
# COMPOSE_PROJECT_NAME=school-a docker compose -f docker-compose.images.yml up -d --no-build

# Optional dynamic prefix + custom host ports for parallel stacks
# COMPOSE_PROJECT_NAME=school-a LMS_HOST_PORT=3100 OFFLINE_GRADER_HOST_PORT=8101 OLLAMA_HOST_PORT=12434 \
#   docker compose -f docker-compose.images.yml up -d --no-build
```

Fresh-install test with isolated volumes:

```bash
./compose-images.sh fresh-up school-a
# creates separate volumes like school-a_db-data, school-a_uploads-data, etc.

./compose-images.sh fresh-down school-a -v
```

Stop image-only stack:

```bash
docker compose -f docker-compose.images.yml down
```

### Do I need to save images to `.tar`?

Short answer: **only for offline/air-gapped transfer**.

- **No tar needed**:
  - you deploy on the same machine where images were built
  - or your target machine can pull from a container registry
- **Tar needed**:
  - your target machine has no internet / no registry access
  - you want portable image transfer via file copy (USB/LAN share)

## 5) Image-Only Deployment Modes

### A) Same machine (already built images)

```bash
docker compose -f docker-compose.images.yml up -d --no-build
```

### B) Another machine with registry access

Build and push from build machine:

```bash
docker tag learnhub/lms:local <registry>/chembalance-lms:latest
docker tag learnhub/lms-ops:local <registry>/chembalance-worker:latest
docker tag learnhub/offline-grader:local <registry>/chembalance-offline-grader:latest

docker push <registry>/chembalance-lms:latest
docker push <registry>/chembalance-worker:latest
docker push <registry>/chembalance-offline-grader:latest
```

On target machine, set image env vars and run:

```bash
export CHEMBALANCE_LMS_IMAGE=<registry>/chembalance-lms:latest
export CHEMBALANCE_WORKER_IMAGE=<registry>/chembalance-worker:latest
export CHEMBALANCE_OFFLINE_GRADER_IMAGE=<registry>/chembalance-offline-grader:latest
docker compose -f docker-compose.images.yml up -d --no-build
```

### C) Another machine without registry/internet (tar workflow)

On build machine:

```bash
docker save \
  learnhub/lms:local \
  learnhub/lms-ops:local \
  learnhub/offline-grader:local \
  ollama/ollama:latest \
  alpine:3.20 \
  -o chembalance-images.tar
```

Optional but recommended for fully offline runtime: export pre-pulled Ollama models volume.

```bash
docker run --rm -v ${COMPOSE_PROJECT_NAME:-chembalance}_ai-models:/from -v "$PWD":/backup alpine:3.20 \
  sh -c "cd /from && tar czf /backup/ai-models.tar.gz ."
```

Transfer `chembalance-images.tar`, optional `ai-models.tar.gz`, plus:
- `docker-compose.images.yml`
- `.env` (or equivalent environment settings)

On target machine:

```bash
docker load -i chembalance-images.tar
docker compose -f docker-compose.images.yml up -d --no-build
```

If you exported models, restore them:

```bash
docker compose -f docker-compose.images.yml down
docker volume create ${COMPOSE_PROJECT_NAME:-chembalance}_ai-models
docker run --rm -v ${COMPOSE_PROJECT_NAME:-chembalance}_ai-models:/to -v "$PWD":/backup alpine:3.20 \
  sh -c "cd /to && tar xzf /backup/ai-models.tar.gz"
docker compose -f docker-compose.images.yml up -d --no-build
```

## 6) Persistence Layout

Named volumes:

- `db-data`: database file storage
- `uploads-data`: lesson/media uploads
- `logs-data`: runtime logs
- `ai-models`: offline model assets

Container restarts do not lose these datasets.

## 7) Health Checks and Dependencies

- `lms` health: `GET /api/health`
- `ollama` health: `ollama list` container healthcheck
- `offline-grader` health: `GET /health`
- `depends_on` ensures ordered startup against healthy services

## 8) Offline/Air-Gapped Deployment

On connected staging machine:

```bash
docker compose build
docker save learnhub/lms:local learnhub/lms-ops:local learnhub/offline-grader:local ollama/ollama:latest alpine:3.20 -o learnhub-images.tar
```

Transfer `learnhub-images.tar` and project files to offline host.

On offline host:

```bash
docker load -i learnhub-images.tar
docker compose up -d
```

Model preload before moving to air-gapped runtime:

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2-vision:11b
docker compose exec ollama ollama pull llama3.2:3b
```

Runtime requires no internet for login, content, quizzes, grading, analytics, recommendations, or gamification.

## 9) Failure Handling Policy

If `offline-grader` is unavailable:

- deterministic grading continues
- non-deterministic subjective answers are queued or marked for teacher review based on settings
- LMS remains operational for all non-AI features

If `ollama` is unavailable:

- `offline-grader` falls back to deterministic heuristic scoring (`heuristic_fallback`)
- teacher-review recommendation remains driven by confidence thresholds
- LMS remains operational

## 10) Backup and Restore

Backup database volume:

```bash
./scripts/ops/backup-db.sh
```

Restore database volume:

```bash
./scripts/ops/restore-db.sh <backup-file.tar.gz>
```

Recommended backup cadence:

- daily DB backup
- weekly uploads/logs archival
- model volume snapshot on model updates

## 11) Operational Notes

- keep `.env` under local secret management
- pin image tags for controlled rollouts
- use queue mode on low-resource servers
- keep model assets preloaded in `ai-models` volume for offline inference startup
