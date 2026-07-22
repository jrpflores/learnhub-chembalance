# LearnHub Change Checklists

Apply these checklists after choosing the target feature slice.

## A. New DB-Backed Feature

1. Add or update tables/columns/indexes in `db/schema.sql`.
2. Add compatibility and backfill logic in `scripts/db/migrate.ts`.
3. Mirror critical runtime-safe migration logic in `src/lib/db.ts` when required.
4. Add or update query functions in `src/server/queries/**`.
5. Add or update input schemas in `src/lib/validators.ts`.
6. Add or update API routes in `src/app/api/**`.
7. Add or update role pages/components in `src/app/**` and `src/components/**`.
8. Run `npm run lint`, `npm run build`, and DB commands needed by the change.

## B. API Endpoint Change

1. Require roles with `requireApiAuth([...])`.
2. Parse request payload with `safeParse` using schema from `src/lib/validators.ts`.
3. Return `400` for invalid payload, `401` for unauthenticated, `403` for forbidden.
4. Keep business logic in query/service modules, not route handlers.
5. Preserve response shape stability unless caller updates are included.
6. Update client component usage if contract fields changed.

## C. Teacher-Scoped Data Change

1. Enforce ownership checks in routes and query filters.
2. Recheck subject/section assignment constraints for teacher actions.
3. Ensure admin paths remain functional if admin shares endpoint access.
4. Confirm teacher cannot mutate data outside assigned scope.

## D. Student Experience Change

1. Keep flow aligned with dashboard -> activity -> result progression.
2. Preserve attempt rules (`timeLimitSec=0`, `maxAttempts=0`) semantics.
3. Keep mobile usability and readable card-first interaction.
4. Confirm result pages still reflect deterministic and teacher-reviewed outcomes.

## E. Grading and AI Path Change

1. Preserve deterministic-first grading for objective question types.
2. Keep fallback behavior when offline grader or model is unavailable.
3. Maintain confidence-based teacher review path for uncertain answers.
4. Verify queue mode behavior if `AI_GRADING_MODE=queue`.
5. Check grading metadata remains audit-friendly.

## F. Validation Sequence

1. Run `npm run lint`.
2. Run `npm run build`.
3. If schema changed, run `npm run db:migrate`.
4. If seed behavior changed, run `npm run db:seed`.
5. If worker/grader changed, run affected service commands and inspect logs.

## G. Handoff Requirements

1. Summarize behavior impact, not only file edits.
2. List all changed files.
3. Report which validation commands ran and their outcomes.
4. Call out residual risk areas and suggested follow-up checks.

