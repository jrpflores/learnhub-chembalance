# UML Gap Analysis: Legacy Diagram vs Current ChemBalance

This document captures the gap between the legacy UML draft and the currently implemented ChemBalance system.

## 1) Missing Core Entities

The legacy diagram omitted key implemented entities:

- `Lesson`: primary teacher-authored learning unit.
- `Quiz`: assessment unit linked to lessons.
- `QuestionBankEntry` and `QuestionOption`: reusable question model for quiz composition.
- `QuizQuestion`: join/composition model (ordering, points, required flags).
- `QuizAttempt`: runtime student attempt lifecycle and scoring outcome.
- `AttemptAnswer`: per-question answer + grading output.
- `AIGradingJob`: offline AI grading queue/status/result tracking.
- `QuizGenerationJob`: AI-generated question queue/status/result tracking.
- `ActivityLog`: audit trail, including teacher grading overrides.
- `SystemSetting`: admin-controlled behavior and feature toggles.
- `TeacherStudentAssignment`: active teacher-student mapping.

## 2) Incorrect Modeling

- `Assignment` is not part of current ChemBalance and must be removed.
- `AI` should be modeled as service/infrastructure (`AIService`, worker, offline grader provider), not as a business entity.
- `ChemicalEquation` should not be a top-level entity. It is represented by:
  - question type/content,
  - deterministic validator behavior for structured answers.
- `Admin`, `Teacher`, and `Student` are role specializations of one persisted `User` model.

## 3) Missing Relationships

Critical relationships that must exist:

- `Teacher -> Lesson` (owns/creates)
- `Lesson -> Quiz` (contains)
- `Quiz -> QuizQuestion -> QuestionBankEntry`
- `QuizAttempt -> AttemptAnswer`
- `Student -> QuizAttempt`
- `AttemptAnswer -> AIGradingJob (0..1)`
- `Teacher -> QuizGenerationJob`
- `Teacher <-> Student` via `TeacherStudentAssignment`

## 4) Missing Runtime Concepts

The legacy diagram did not model:

- AI generation queue lifecycle
- AI grading queue lifecycle
- teacher review/override grading flow
- attempt score recalculation after override
- submission review workflow (`Submissions -> Attempt Review`)
- auditability via `ActivityLog`

## 5) Corrected Target Model

Use the class diagram in:

- `/docs/uml-class-diagram.md`

That model reflects:

- real persisted domain entities,
- real runtime queue entities,
- service-layer AI abstraction,
- implemented teacher and student workflows.

## 6) Optional Enhancements (Future)

- rubric-first grading fields on `QuestionBankEntry`
- immutable `answer_grading_events` history table
- richer analytics read-model entities
- deeper concept/misconception tracking structures

