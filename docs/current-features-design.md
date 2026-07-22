# ChemBalance Current Features and Design (Implemented)

This document reflects the currently implemented state of ChemBalance as of March 8, 2026.

## 1) Implemented Product Modules

### Authentication and Access

- JWT cookie-based auth with role-guarded routes
- Role-specific portals:
  - `ADMIN`
  - `TEACHER`
  - `STUDENT`
- API authorization checks (`requireApiAuth`) + teacher ownership checks for content and grading actions

### Admin

- User management (create/update/deactivate/reset password)
- Analytics dashboards
- Settings panel for platform behavior and feature toggles
- Oversight views for lessons/quizzes

### Teacher

- Students management
- Lessons management:
  - create/edit/archive/publish
  - rich content with MathJax-friendly editor
  - media upload support
  - lesson detail tabs: content, quizzes, generation jobs
- Quiz management in lesson context:
  - create quiz from lesson page
  - attach existing quiz
  - manage quiz settings (including no-time-limit and unlimited attempts)
  - manage questions inside quiz
- Question authoring:
  - multiple choice
  - true/false
  - short answer
  - drag-and-drop reorder
- AI generation:
  - queue-based “Generate Questions” from lesson content
  - generation jobs tracking tab
- Submission review workflow:
  - list submitted quiz attempts per lesson quiz
  - review submitted answers per attempt
  - teacher can mark answer correct/incorrect
  - attempt score/outcome recalculated immediately
  - review action logged to `activity_logs`

### Student

- Dashboard with recommendations and progress summaries
- Lesson list and lesson detail tabs
- Quiz list and quiz detail
- Guided one-question-at-a-time attempt player
- Result history and detailed answer review
- Achievements/profile pages

## 2) Grading Behavior (Current)

### Deterministic First

- Objective types (MCQ/TF/Multi-select) graded deterministically
- Short-answer path starts with deterministic normalization and checks

### AI Assist (Offline)

- Offline grader service is used for unresolved short answers
- Ollama-backed inference is used through local service abstraction
- Queue mode supported for constrained hardware

### Teacher Fallback and Override

- If AI is unavailable or low confidence, answers can be marked for teacher review
- Teacher override is available from submission review pages
- Recalculation updates:
  - `quiz_attempts.score_percent`
  - `quiz_attempts.correct_count`
  - `quiz_attempts.wrong_count`
  - `quiz_attempts.outcome`

## 3) Quiz Runtime Rules (Current)

- `timeLimitSec = 0` means **No Time Limit**
- `maxAttempts = 0` means **Unlimited Attempts**
- Student views and start logic respect these rules

## 4) Current UX / Design System Patterns

### Design Tokens and Theme

- Tailwind CSS v4 + CSS variables in `src/app/globals.css`
- Brand palette aligned to current green-forward ChemBalance theme
- Shared primitives:
  - `Button`
  - `Card`
  - `Chip`
  - `Modal`
  - `MathTextEditor`
  - `MarkdownContent`

### Teacher Action Pattern

- Teacher lesson and quiz cards use a compact **top-right 3-dot action menu**
- Actions are grouped in menu sections (workflows, status changes, destructive actions)
- Desktop: anchored dropdown
- Mobile: responsive constrained panel width

### Student Experience Pattern

- Card-first layouts over dense tables
- Strong CTA hierarchy (`Take Quiz`, `Continue Lesson`, `Try Again`)
- Progress + supportive copy across dashboard/attempt/result screens
- Green CTA buttons always use white text for contrast

## 5) Navigation and Flow (Current)

### Teacher primary flow

`Lessons` -> `Lesson Detail` -> `Linked Quiz` -> `Manage Questions` -> `Submissions` -> `Attempt Review`

### Student primary flow

`Dashboard` -> `Lesson/Quiz` -> `Attempt Player` -> `Results` -> `Retry/Review`

## 6) Offline and Docker Runtime (Current)

- Dockerized services:
  - `lms`
  - `db`
  - `offline-grader`
  - `ollama`
  - `worker`
- Internal Docker networking for local-only inference calls
- Persisted volumes for database, uploads, logs, model assets
- Runtime supports no-internet operation after image/model preparation

## 7) Known Next Improvements

- richer rubric schema columns for concept-level scoring traces
- immutable grading event history table
- bulk teacher review tools for high-volume classes
- expanded question type validators (matching/fill/sequencing/image-based)

## 8) Additional Domain Features

### Subject Management

- Add a subject catalog for normalized academic organization (for example, Science, Mathematics, English).
- Link subjects to teacher ownership and lesson templates.
- Enforce subject references on lessons, quizzes, question banks, and analytics filters.

### Section / Class Grouping

- Introduce `Section` (class group) as a first-class entity for class-level operations.
- Support section metadata such as grade level, adviser/teacher owner, school year, and status.
- Allow lessons and quizzes to be targeted to one or more sections.

### Section Student Management

- Add teacher tools to assign and remove students from sections.
- Support bulk enrollment flows (manual multi-select and CSV import in future increment).
- Preserve assignment history for auditability and roster changes across terms.

### Section-Level Analytics

- Provide section-scoped metrics for lesson completion, quiz participation, pass rate, and average score.
- Add section heatmaps for weak topics and frequent misconceptions.
- Add intervention lists (students needing attention) at section scope.

### Chemical Equation Domain Model

- Add `ChemicalEquation` entity for structured chemistry content and deterministic validation.
- Include fields such as canonical formula, balanced form, difficulty, topic tags, and hint metadata.
- Link equation records to lesson and question authoring workflows.

### Student Chemical Equation Practice Mode

- Add a dedicated practice flow outside quiz attempts for equation balancing drills.
- Track `PracticeSession` and `PracticeAttempt` for iterative learning without affecting quiz scores.
- Provide immediate correctness feedback and mastery progression by topic.

### AI Equation Solving and Validation

- Extend AI service capabilities with equation-specific operations:
  - solve equation step-by-step
  - validate student-balanced equations
  - generate targeted hints
- Keep deterministic validators as primary checks for structured equation correctness.
- Route low-confidence AI outcomes to teacher-reviewable feedback paths.

### Chemical Equation Library Management

- Add admin/teacher tools to maintain a reusable equation library.
- Support CRUD, difficulty tagging, curriculum alignment, and archival controls.
- Enable equation reuse in quiz generation and practice recommendations.
