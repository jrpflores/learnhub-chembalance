# ChemBalance

ChemBalance is a Docker-deployable LMS for junior high school with offline-first grading support.

## What is Included

- Role portals: Admin, Teacher, Student
- Lessons, question bank, quizzes, attempts, analytics, gamification
- Deterministic grading for objective questions
- Offline AI-assisted grading for explanation/concept answers
- Teacher-review fallback when AI is unavailable or confidence is low
- Docker orchestration for app, database service, offline AI service, and worker

## Services (Docker)

- `lms`: main ChemBalance web/API service
- `db`: SQLite persistence service container (shared persistent volume)
- `ollama`: local model runtime (offline AI inference engine)
- `offline-grader`: local FastAPI grading inference endpoint
- `worker`: background grading queue processor

## Key Paths

- LMS app: `/src`
- SQL schema: `/db/schema.sql`
- DB scripts: `/scripts/db`
- Worker: `/scripts/worker/queue-worker.ts`
- Offline grader service: `/services/offline-grader`
- Compose stack: `/docker-compose.yml`
- Architecture plan: `/docs/architecture.md`
- Data model plan: `/docs/schema.md`
- Implementation roadmap: `/docs/implementation-roadmap.md`
- Deployment runbook: `/docs/deployment.md`
- Current features and design: `/docs/current-features-design.md`
- UML class diagram (current): `/docs/uml-class-diagram.md`
- UML gap analysis: `/docs/uml-gap-analysis.md`

## Local Development

```bash
npm install
npm run setup
npm run dev
```

Open: `http://localhost:3000`

## Demo Accounts

- Admin: `admin@learnhub.local` / `Admin123!`
- Teacher: `teacher@learnhub.local` / `Teacher123!`
- Student: `student1@learnhub.local` / `Student123!`

## Docker Deployment

### Start full stack

```bash
docker compose up --build
```

### Stop stack

```bash
docker compose down
```

### Reset all persisted data

```bash
docker compose down -v
```

## Offline Runtime Guarantee

After images are built/preloaded, runtime does not require internet:

- authentication, lessons, quizzes, grading, analytics, recommendations, gamification remain local
- AI grading calls internal `offline-grader` endpoint, which uses local `ollama` when enabled
- no cloud AI dependency in grading path

## Air-Gapped / Offline Image Preparation

On a connected machine:

```bash
docker compose build
docker save learnhub/lms:local learnhub/lms-ops:local learnhub/offline-grader:local ollama/ollama:latest alpine:3.20 -o learnhub-images.tar
```

On offline server:

```bash
docker load -i learnhub-images.tar
docker compose up -d
```

Model preload on a connected machine (one-time):

```bash
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2-vision:11b
docker compose exec ollama ollama pull llama3.2:3b
```

The model is persisted in `ai-models` volume and can be transported with volume backup or preloaded image/host data.

## Persistent Volumes

- `db-data`: database files
- `uploads-data`: lesson/media uploads
- `logs-data`: runtime/service logs
- `ai-models`: local AI model assets

## Health Checks

- LMS health: `GET /api/health`
- Offline grader health: `GET /health`

## Environment Configuration

Use `.env` (see `.env-example`) for:

- database path
- storage paths
- auth cookie behavior (`SESSION_COOKIE_SECURE`; keep `true` for HTTPS, set `false` only for LAN HTTP)
- offline AI endpoint and timeout
- offline grader provider mode (`GRADER_PROVIDER=auto|heuristic|ollama`)
- Ollama runtime endpoint/model/timeouts
- optional Ollama fallback model list (`OLLAMA_FALLBACK_MODELS`) for low-memory environments
- AI grading mode (`sync` or `queue`)
- fallback behavior when AI is unavailable
- confidence thresholds

## Backup / Restore

- Backup DB volume: `./scripts/ops/backup-db.sh`
- Restore DB volume: `./scripts/ops/restore-db.sh <archive>`

## Verification

```bash
npm run lint
npm run build
```
