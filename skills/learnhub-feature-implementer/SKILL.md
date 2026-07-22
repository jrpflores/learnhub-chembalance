---
name: learnhub-feature-implementer
description: End-to-end delivery workflow for LearnHub features and fixes in the Next.js LMS codebase. Use when work requires scanning the repository, analyzing impact, planning changes, implementing across DB/query/API/UI layers, and validating results while preserving RBAC, Zod validation, and offline-first grading behavior.
---

# LearnHub Feature Implementer

## Overview

Use this skill to execute complete LearnHub development tasks with a strict sequence: scan, analyze, plan, implement, and validate.
Prefer minimal, safe edits that preserve existing role boundaries, deterministic-first grading, and offline runtime assumptions.

## Workflow

### 1. Scan the target slice

Identify the affected feature slice before editing:

- Determine actor scope: `ADMIN`, `TEACHER`, `STUDENT`, or multi-role.
- Determine data scope: lessons, quizzes, attempts, subjects, sections, equations, or settings.
- Determine runtime scope: sync APIs only, queue worker, or offline grader integration.
- Load `references/file-map.md` to locate the exact files quickly.

Read only what is needed for the request. Avoid broad file loading when the feature is localized.

### 2. Analyze behavior and constraints

Trace the full execution path:

- Request payload and validation in `src/lib/validators.ts`.
- Auth and role checks in `src/lib/rbac.ts` and middleware.
- Data read/write path in `src/server/queries/**` and `src/server/services/**`.
- UI interaction path in `src/components/**` and `src/app/**`.

Check for existing invariants:

- Teacher ownership restrictions for teacher-scoped data.
- Deterministic-first grading behavior for quiz answers.
- Offline fallback behavior when AI grading is unavailable.
- Existing schema/backfill assumptions in runtime and migrate scripts.

### 3. Plan file-level changes

Write a short implementation plan before edits:

- List target files in dependency order (DB -> query/service -> API -> UI).
- Mark each file action: add, update, or no-change.
- Define validation commands to run after edits.
- Load `references/change-checklists.md` for task-specific checklists.

### 4. Implement in dependency order

#### 4.1 Database and schema

- Update `db/schema.sql` for durable schema changes.
- Mirror compatibility logic in `scripts/db/migrate.ts` and `src/lib/db.ts` runtime migrations when needed.
- Add indexes for high-frequency access paths.
- Add backfill SQL when introducing new non-null semantics from existing data.

#### 4.2 Query and service layer

- Keep SQL in `src/server/queries/**` deterministic and role-safe.
- Map DB rows to stable return shapes.
- Use `parseJson` and `toBoolean` helpers where needed.
- Keep grading/business orchestration in `src/server/services/**`.

#### 4.3 API route layer

- Use `requireApiAuth` with explicit role list.
- Validate request bodies with `zod` schemas from `src/lib/validators.ts`.
- Return consistent JSON error shapes for invalid payload and forbidden access.
- Delegate data operations to queries/services instead of embedding business logic in route handlers.

#### 4.4 UI layer

- Preserve existing role-specific navigation and layout patterns.
- Reuse established UI primitives in `src/components/ui/**`.
- Keep teacher workflows action-menu driven and student workflows card/CTA driven.
- Preserve accessibility and mobile behavior.

### 5. Validate and regressions-check

Run only relevant checks, then broaden if risk is high:

1. `npm run lint`
2. `npm run build`
3. If schema changed: `npm run db:migrate`
4. If seed-dependent paths changed: `npm run db:seed`
5. If queue/grader paths changed: run the impacted service commands and sanity-check logs

Confirm no RBAC regressions and no API contract drift for existing clients.

### 6. Report outcome

Return:

- What changed and why
- File list with key behavior impact
- Validation commands run and outcomes
- Residual risks or follow-ups

## Trigger Phrases and Fit

Treat requests like these as direct triggers for this skill:

- "Scan, analyze, plan, and implement this LearnHub feature"
- "Add a new module spanning schema, API, and UI"
- "Fix this LearnHub bug safely across all layers"
- "Refactor this flow without breaking role permissions"

## References

- `references/file-map.md`: High-signal architecture file map for fast scanning.
- `references/change-checklists.md`: Layered implementation and validation checklists.
