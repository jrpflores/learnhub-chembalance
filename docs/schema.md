# ChemBalance Data Model Plan

## 1) Core Domain Tables

### Identity and Access

- `users`: platform identity (`ADMIN`, `TEACHER`, `STUDENT`), account status, locale/timezone, streak counters
- `teacher_student_assignments`: active teacher-student mapping with assignment history
- `activity_logs`: audit trail for major system actions and role snapshots

### Learning Content

- `lessons`: authored lesson content, subject/topic/unit, publication state
- `lesson_progress`: per-student completion and time tracking
- `lesson_views`: event-level lesson engagement records

### Assessment Authoring

- `question_bank_entries`: reusable questions with type, difficulty, reference answer, keyword metadata
- `question_options`: options for objective question types
- `quizzes`: quiz configuration (attempt limits, windows, randomization, feedback rules)
- `quiz_questions`: composition table from quiz -> question bank entry + points/order

### Assessment Runtime

- `quiz_attempts`: attempt lifecycle, grading outcome, score, timing, XP awarded
- `attempt_answers`: per-question submitted answer, points earned, correctness, feedback, AI-graded flag
- `ai_grading_jobs`: queue/result table for offline AI processing and failure tracking

### Engagement and Motivation

- `badges`, `user_badges`: achievement catalog + awarded badges
- `xp_events`: XP ledger for transparent gamification accounting
- `leaderboard_snapshots`: persisted leaderboard views
- `recommendations`: adaptive next-action recommendations

### System Configuration

- `system_settings`: admin-managed settings and feature toggles

## 2) Relationship Highlights

- one teacher -> many lessons/quizzes/questions
- many students <- active assignment rows -> one or many teachers
- one quiz -> many `quiz_questions` -> many `question_bank_entries`
- one attempt -> many `attempt_answers`
- one `attempt_answer` -> zero/one `ai_grading_jobs`
- one student -> many progress, attempts, xp events, badges, recommendations

## 3) Analytics-Ready Design

Current schema supports:

- quiz-level pass/fail, average score, completion time
- question-level miss rates and topic difficulty
- student-level trends (attempt history + lesson progress)
- recommendation generation from weak topics
- AI grading queue success/failure visibility

Key indexes already included for:

- role/status user lookups
- teacher-scoped content queries
- quiz attempt and answer retrieval
- recommendation priority retrieval
- grading queue polling by status/time

## 4) Offline AI Grading Data Contract (Current)

### Question-side fields in use

- `type`
- `reference_answer`
- `grading_keywords_json`
- `topic`

### Answer/job-side fields in use

- `answer_text`
- `is_correct`
- `earned_points`
- `feedback`
- `graded_by_ai`
- `ai_grading_jobs.status`
- `ai_grading_jobs.request_payload_json`
- `ai_grading_jobs.response_payload_json`
- `ai_grading_jobs.error_message`
- `activity_logs.metadata_json` for teacher override trace events

This supports deterministic-first grading + AI-assist + queue/failure fallback today.

Current teacher override behavior uses:

- `attempt_answers.is_correct`
- `attempt_answers.earned_points`
- `attempt_answers.feedback`
- recalculation and update of `quiz_attempts.score_percent`, `correct_count`, `wrong_count`, `outcome`

## 5) Planned Schema Extension for Advanced Rubric AI

To support richer rubric-first subjective grading and teacher override auditability at higher fidelity, the next migration should add:

### `question_bank_entries` extension

- `grading_mode` (`exact_match`, `numeric_tolerance`, `keyword_match`, `concept_match`, `rubric_ai`, `hybrid`, `manual_review`)
- `accepted_answers_json`
- `numeric_tolerance`
- `required_concepts_json`
- `optional_concepts_json`
- `misconceptions_json`
- `rubric_definition_json`
- `review_threshold`
- `manual_review_required`
- `ai_enabled`

### `attempt_answers` extension

- `raw_answer`, `normalized_answer`
- `auto_score`, `final_score`
- `ai_verdict`, `ai_feedback`, `ai_confidence`
- `matched_concepts_json`, `missing_concepts_json`
- `teacher_review_required`
- `teacher_override_score`, `teacher_override_feedback`
- `grading_source`, `grading_metadata_json`
- `graded_at`

### optional history table

- `answer_grading_events` for immutable grading-change history (AI suggestion, teacher override, finalization)

## 6) Migration Strategy

1. add nullable/new-default columns (non-breaking)
2. backfill from existing answer/job rows
3. switch service layer to write new grading fields
4. expose teacher review/audit UI over new trace data
