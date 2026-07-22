# ChemBalance Context + Ownership Migration TODOs

## Scope Guardrails
- [ ] Keep `Assignment` feature excluded.
- [ ] Keep `Announcement` feature excluded.
- [ ] Preserve teacher flow: `Lesson -> Quiz -> Question`.

## Phase 1: Teacher Subject/Section Context UX
- [x] Add teacher subject detail route: `/teacher/subjects/[subjectId]`.
- [x] Add subject header: name, code, description, assigned teacher.
- [x] Add conditional section filter for assigned sections in subject context.
- [x] Auto-select section when exactly one assigned section exists.
- [x] Show explicit active section badge when only one section is assigned.
- [x] Add friendly empty state when no section is assigned for subject.
- [x] Add 3 subject tabs:
  - [x] Class Roster / Students
  - [x] Lessons
  - [x] Quizzes
- [x] Add contextual breadcrumb inside subject detail:
  - [x] `Subjects > <Subject> > <Section>`
- [x] Add quiz action icon linking to quiz management in-context.

## Phase 2: Section Menu + Context Persistence
- [x] Update section list interactions to redirect to `Subjects` with `sectionId`.
- [x] Pre-filter subject list by active section context when `sectionId` is present.
- [x] Preserve selected section context in subject links via query params.
- [ ] Add persistent section context store (cookie/session key) as fallback when query param is absent.
- [ ] Add explicit “clear section context” action in teacher subject list.

## Phase 3: Context-Aware Filtering (Current Schema)
- [x] Add server query module for teacher subject context:
  - [x] subject + teacher context
  - [x] assigned sections for subject
  - [x] roster search/pagination
  - [x] lessons search/filter/pagination
  - [x] quizzes search/filter/pagination
- [x] Filter all subject detail tab data by:
  - [x] teacher
  - [x] subject
  - [x] active section
- [x] Restrict section filter options to teacher’s active section assignments only.
- [ ] Add unit/integration tests for context queries and authorization boundary cases.

## Phase 4: Target Data Model Migration (Delivery Ownership)
- [ ] Add `section_subjects` table.
- [ ] Add `teacher_assignments` table (one `is_primary` per `section_subject`).
- [ ] Add unique indexes and partial constraints:
  - [ ] `section_subject` uniqueness across section/subject/year/term.
  - [ ] single primary assignment per section-subject.
- [ ] Add `lesson_libraries` and `quiz_libraries`.
- [ ] Add `teacher_assignment_lessons` and `teacher_assignment_quizzes` snapshot tables.
- [ ] Add lineage fields:
  - [ ] `source_*_id`
  - [ ] `source_version`
  - [ ] `cloned_from_*`
- [ ] Add migration backfill strategy from `lessons/quizzes + section links` to teacher-assignment snapshots.

## Phase 5: Clone-on-Import + Same-Subject Validation
- [ ] Add import service layer for lesson/quiz clone-on-import.
- [ ] Enforce same-subject import rule:
  - [ ] source subject must equal target subject.
- [ ] Add provenance/audit entries for import lineage.
- [ ] Add explicit “refresh from library” action with audit trail.
- [ ] Prevent implicit mutation of published delivery snapshots from library edits.

## Phase 6: Student Visibility and Primary Assignment Delivery
- [ ] Resolve visible delivery context by:
  - [ ] student section enrollment
  - [ ] section_subject
  - [ ] primary teacher_assignment
- [ ] Ensure students only see:
  - [ ] published assignment lessons
  - [ ] published assignment quizzes
  - [ ] content for enrolled section context only
- [ ] Block access to unrelated section/subject content.

## Phase 7: Operational Hardening
- [ ] Add query-level pagination defaults and max limits across all list APIs.
- [ ] Add end-to-end tests for:
  - [ ] section -> subjects context handoff
  - [ ] tab context persistence during pagination/search
  - [ ] quiz management deep links with context params
- [ ] Add authorization tests for teacher-only assigned contexts.
- [ ] Add performance indexes for new ownership tables.
- [ ] Add migration rollback strategy and data verification scripts.

## Phase 8: Cleanup and Deprecation
- [ ] Deprecate legacy direct `subject` ownership on lesson/quiz delivery.
- [ ] Mark legacy section-target tables for controlled sunset after backfill.
- [ ] Document final ownership model in architecture docs.
