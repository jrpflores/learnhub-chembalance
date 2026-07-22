# ChemBalance Architecture Plan

## 1) Goals and Constraints

ChemBalance is designed for junior high school delivery with these non-negotiables:

- role-safe LMS workflows for `ADMIN`, `TEACHER`, `STUDENT`
- engaging, mobile-first student experience
- deterministic-first grading for objective answers
- offline AI-assisted grading for subjective answers
- full offline runtime after Docker image preparation
- modular architecture that can evolve without rewrites

## 2) Technology Decisions

- **Web App**: Next.js 16 (App Router, TypeScript)
- **Data Store**: SQLite via `better-sqlite3` (file-based, durable volume)
- **Offline AI Grader**: FastAPI service (`services/offline-grader`)
- **Validation**: Zod on API boundaries
- **Auth**: signed JWT session cookie + HTTP-only cookie policy
- **Styling/UI**: Tailwind CSS v4 with role-specific UI patterns

Why this stack:

- low operational overhead for school-local deployment
- easy container packaging for air-gapped environments
- straightforward vertical-slice modularity
- predictable performance for small-to-medium school footprints

## 3) Runtime Container Topology (Docker)

Compose services:

- `lms`: Next.js app + API
- `ollama`: local model runtime for offline inference
- `offline-grader`: local grading inference endpoint
- `worker`: async AI grading queue processor
- `db`: persistence sidecar that owns shared database volume lifecycle

Shared persistent volumes:

- `db-data` -> SQLite data (`/app/data`)
- `uploads-data` -> uploaded assets (`/app/storage/uploads`)
- `logs-data` -> logs (`/app/storage/logs`)
- `ai-models` -> local model files (`/app/storage/models` and `/models`)

Networking:

- all services communicate on internal Docker network `learnhub-internal`
- LMS and grader can be published to LAN ports while retaining internal service-to-service paths

## 4) Clean Architecture Mapping

### Interface Layer

- `src/app/**`: UI routes by role
- `src/app/api/**`: API handlers
- `middleware.ts`: route-level RBAC guard

### Application Layer

- `src/server/services/**`: business workflows (attempt lifecycle, recommendations, gamification)
- `scripts/worker/queue-worker.ts`: async grading orchestration

### Domain Layer

- `src/domain/types.ts`: roles, question types, status enums

### Infrastructure Layer

- `src/lib/db.ts`: DB lifecycle + primitives
- `src/lib/auth.ts`: hashing/session token primitives
- `src/lib/env.ts`: deploy-time configuration surface
- `services/offline-grader/app/main.py`: local grading provider
  - provider modes: `heuristic`, `ollama`, `auto`

## 5) Grading Architecture (Deterministic First)

Pipeline per answer:

1. normalize answer text/value
2. deterministic checks (choice/true-false/multi-select, exact match, keyword-heavy fast pass/fail)
3. if unresolved and eligible, enqueue/call offline AI grader
   - offline grader runs deterministic heuristic gate before invoking Ollama
   - Ollama returns strict JSON contract for rubric-aligned short-answer scoring
4. combine score + confidence
5. auto-finalize high-confidence outcomes
6. mark low-confidence/unavailable-AI answers for teacher review
7. retain grading job and answer metadata for audit trail
8. allow teacher override from submission-review UI and recalculate attempt summary

Fallback policy:

- if AI is unavailable, objective grading still completes
- subjective answers either queue or fall back to teacher review depending on settings
- LMS never hard-fails core quiz submission because AI is down

Current teacher-review implementation:

- teacher can review submissions per quiz
- teacher can mark answer correct/incorrect
- attempt score/outcome are recalculated immediately
- override events are logged to `activity_logs`

## 6) Security Model

- endpoint-level role checks (`requireApiAuth`)
- ownership checks on teacher/student resources
- bcrypt password hashing
- signed session cookies (HTTP-only)
- strict request validation and coercion at API boundary
- local-only grading path (no external AI API calls)

## 7) Performance and Operations

- indexed schema for high-frequency read/write paths
- health endpoint (`/api/health`) checks DB, storage dirs, AI service health
- queue mode for constrained hardware (`AI_GRADING_MODE=queue`)
- startup migration/seed via container entrypoint
- offline image transport supported via `docker save` / `docker load`

## 8) Extensibility Plan

- grading provider abstraction allows swapping heuristic grader for local LLM runtime
- question/quiz metadata structured for new grading modes and richer rubric criteria
- services are modular enough to move SQLite -> PostgreSQL later with repository/query adaptation
