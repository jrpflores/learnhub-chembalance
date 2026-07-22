# LearnHub File Map

Use this map to localize work before editing.

## Product and Architecture Context

- `README.md`: Project summary, services, run commands, demo accounts.
- `docs/architecture.md`: Layered architecture and grading pipeline.
- `docs/current-features-design.md`: Implemented features and UX conventions.
- `docs/schema.md`: Domain model and table intent.
- `docs/deployment.md`: Docker runtime and offline constraints.

## Core App Layout

- `src/app/**`: App Router pages and API endpoints.
- `src/components/**`: UI components by role and shared primitives.
- `src/domain/types.ts`: shared domain enums and type unions.
- `src/lib/**`: auth, RBAC, env config, DB helpers, validators, utility helpers.
- `src/server/queries/**`: DB query functions (read/write persistence logic).
- `src/server/services/**`: business workflows and orchestration logic.

## Auth and RBAC

- `middleware.ts`: route-level access control and role redirects.
- `src/lib/auth.ts`: JWT session create/verify, cookie session resolution.
- `src/lib/rbac.ts`: API authorization gate (`requireApiAuth`).

## Validation and Errors

- `src/lib/validators.ts`: Zod schemas for API payloads.
- `src/lib/api-error.ts`: API error extraction and UI-facing message shaping.

## Database and Migrations

- `db/schema.sql`: canonical schema.
- `scripts/db/migrate.ts`: schema bootstrap and migration/backfill logic.
- `scripts/db/seed.ts`: initial datasets and dev/test setup data.
- `src/lib/db.ts`: runtime DB setup, pragmas, runtime safety migrations.

## Role-Specific Feature Surfaces

- Admin pages and APIs: `src/app/admin/**`, `src/app/api/admin/**`, `src/components/admin/**`.
- Teacher pages and APIs: `src/app/teacher/**`, `src/app/api/teacher/**`, `src/components/teacher/**`.
- Student pages and APIs: `src/app/student/**`, `src/app/api/student/**`, `src/components/student/**`.

## Async and Offline AI Paths

- `scripts/worker/queue-worker.ts`: async grading queue worker.
- `services/offline-grader/app/main.py`: local AI grading endpoint.
- `src/server/services/offline-grader-service.ts`: LMS integration with grader endpoint.
- `src/server/services/ollama-quiz-generator.ts`: local model quiz generation path.

## Operations and Runtime

- `docker-compose.yml`: service graph and volume/network wiring.
- `Dockerfile`, `Dockerfile.ops`: app and ops images.
- `scripts/ops/backup-db.sh`, `scripts/ops/restore-db.sh`: persistence ops.

