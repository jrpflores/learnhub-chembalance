# ChemBalance Implementation Roadmap

## Phase 0: Foundation and Planning

- finalize architecture, data model, Docker topology
- define role boundaries and RBAC matrix
- define deterministic-first grading policy and fallback rules
- define acceptance criteria for offline runtime

## Phase 1: Platform Core

- authentication + secure session handling
- RBAC middleware + API authorization checks
- user management (admin + teacher scope)
- system settings service

## Phase 2: Learning Authoring

- lesson management (draft/publish/archive)
- question bank with reusable items
- quiz builder with scheduling/randomization/attempt rules
- rich text and media support for lesson/question content

## Phase 3: Student Learning Experience

- student dashboard with progress, activity, recommendations
- lesson list/detail and completion tracking
- interactive quiz flow (one-question focus, progress UX)
- results and history experience with supportive feedback

## Phase 4: Grading and Intelligence (Offline-First)

- deterministic grading for objective/structured answers
- short-answer AI-assisted grading via local service abstraction
- queue worker for asynchronous grading mode
- confidence-based review routing and teacher fallback workflow

## Phase 5: Analytics and Engagement

- teacher analytics dashboards (quiz/question/student/lesson)
- weak-topic and misconception surfacing
- gamification (XP, badges, streaks)
- optional leaderboard modes with safe visibility controls

## Phase 6: Docker Operations and Hardening

- multi-service compose stack and health checks
- persistence volumes, backups, restore procedures
- air-gapped image packaging (`docker save/load`)
- fail-safe handling when AI service is degraded

## Phase 7: Quality and Release

- lint/build/test automation
- seed/demo data completeness checks
- security review and RBAC audit
- production documentation and runbook finalization

## Current Status Snapshot

- core LMS modules: implemented
- offline grader service + queue worker: implemented
- dockerized multi-service stack: implemented
- docs for architecture/schema/deployment: updated
- teacher submission review UI + answer override with score recalculation: implemented
- advanced rubric schema extension + immutable grading-history event model: planned next increment
