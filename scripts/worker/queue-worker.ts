import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  GENERATION_JOB_OFFLINE_AI_DISABLED_MESSAGE,
  GENERATION_JOB_STALE_REQUEUE_MESSAGE,
  GRADING_JOB_MAX_REQUEUE_ATTEMPTS,
  GRADING_JOB_STALE_FAILED_MESSAGE,
  formatGradingRequeueMessage,
  generationJobStaleBeforeIso,
  gradingJobStaleBeforeIso,
  parseGradingRequeueCount,
} from "@/server/services/ai-generation-jobs";
import { gradeShortAnswerWithOfflineAi } from "@/server/services/ai-short-answer-grading";
import { generateLessonDraft, validateGeneratedLessonDraftForInsert } from "@/server/services/ollama-lesson-generator";
import { generateQuizFromLesson } from "@/server/services/ollama-quiz-generator";
import { finalizeSubmittedAttemptIfReady } from "@/server/services/quiz-service";

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const databaseFile = process.env.DATABASE_FILE ?? "./data/learnhub.db";
const offlineGraderUrl = process.env.OFFLINE_GRADER_URL ?? "http://offline-grader:8001";
const offlineAiEnabled = process.env.OFFLINE_AI_ENABLED !== "false";
const timeoutMs = toNumber(process.env.OFFLINE_GRADER_TIMEOUT_MS, 5000);

const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "http://ollama:11434").replace(/\/$/, "");
const ollamaTimeoutMs = toNumber(process.env.OLLAMA_TIMEOUT_MS, 240000);

const resolvedDbFile = path.isAbsolute(databaseFile)
  ? databaseFile
  : path.resolve(process.cwd(), databaseFile);

fs.mkdirSync(path.dirname(resolvedDbFile), { recursive: true });

const db = new Database(resolvedDbFile);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  quiz_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  question_count INTEGER NOT NULL,
  question_types_json TEXT NOT NULL,
  generated_questions_json TEXT,
  created_question_ids_json TEXT,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_generation_jobs_lesson_status_queue
  ON quiz_generation_jobs(lesson_id, status, queued_at);

CREATE TABLE IF NOT EXISTS lesson_generation_jobs (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  prompt_text TEXT NOT NULL,
  preferred_title TEXT,
  preferred_topic TEXT,
  preferred_difficulty TEXT CHECK (preferred_difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  preferred_estimated_minutes INTEGER,
  generated_lesson_json TEXT,
  created_lesson_id TEXT,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_generation_jobs_context_queue
  ON lesson_generation_jobs(teacher_id, subject_id, section_id, status, queued_at);
`);

const ALLOWED_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as const;
type AllowedQuestionType = (typeof ALLOWED_QUESTION_TYPES)[number];
const MAX_GENERATION_QUESTIONS = 10;

type PendingGradingJob = {
  id: string;
  attempt_answer_id: string;
  request_payload_json: string | null;
};

type AnswerContext = {
  answer_text: string | null;
  max_points: number;
  prompt_markdown: string;
  explanation_markdown: string | null;
  reference_answer: string | null;
  grading_keywords_json: string | null;
};

type PendingQuizGenerationJob = {
  id: string;
  teacher_id: string;
  lesson_id: string;
  quiz_id: string;
  question_count: number;
  question_types_json: string;
};

type QuizGenerationContext = {
  title: string;
  subject: string;
  topic: string;
  content_markdown: string;
};

type PendingLessonGenerationJob = {
  id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  prompt_text: string;
  preferred_title: string | null;
  preferred_topic: string | null;
  preferred_difficulty: "EASY" | "MEDIUM" | "HARD" | null;
  preferred_estimated_minutes: number | null;
};

type LessonGenerationContext = {
  subject_name: string;
  subject_description: string | null;
  section_name: string;
  grade_level: string;
  school_year: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeQuestionType(value: string): AllowedQuestionType {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized.includes("TRUE") || normalized.includes("FALSE")) {
    return "TRUE_FALSE";
  }
  if (normalized.includes("SHORT")) {
    return "SHORT_ANSWER";
  }
  return "MULTIPLE_CHOICE";
}

function parseRequestedTypes(value: string): AllowedQuestionType[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [...ALLOWED_QUESTION_TYPES];
    }

    const normalized = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeQuestionType(item))
      .filter((item, index, list) => list.indexOf(item) === index);

    return normalized.length > 0 ? normalized : [...ALLOWED_QUESTION_TYPES];
  } catch {
    return [...ALLOWED_QUESTION_TYPES];
  }
}

function reclaimStuckGenerationJobs() {
  const staleBefore = generationJobStaleBeforeIso(ollamaTimeoutMs);
  db.prepare(
    `UPDATE quiz_generation_jobs
     SET status = 'PENDING', started_at = NULL, error_message = ?
     WHERE status = 'PROCESSING'
       AND started_at IS NOT NULL
       AND started_at < ?`,
  ).run(GENERATION_JOB_STALE_REQUEUE_MESSAGE, staleBefore);

  db.prepare(
    `UPDATE lesson_generation_jobs
     SET status = 'PENDING', started_at = NULL, error_message = ?
     WHERE status = 'PROCESSING'
       AND started_at IS NOT NULL
       AND started_at < ?`,
  ).run(GENERATION_JOB_STALE_REQUEUE_MESSAGE, staleBefore);
}

function reclaimStuckGradingJobs() {
  const staleBefore = gradingJobStaleBeforeIso(timeoutMs);
  const stuck = db
    .prepare<
      [string],
      { id: string; attempt_answer_id: string; error_message: string | null }
    >(
      `SELECT id, attempt_answer_id, error_message
       FROM ai_grading_jobs
       WHERE status = 'PROCESSING'
         AND started_at IS NOT NULL
         AND started_at < ?`,
    )
    .all(staleBefore);

  const now = new Date().toISOString();
  for (const job of stuck) {
    const requeueCount = parseGradingRequeueCount(job.error_message);
    if (requeueCount >= GRADING_JOB_MAX_REQUEUE_ATTEMPTS) {
      db.prepare(
        `UPDATE ai_grading_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(GRADING_JOB_STALE_FAILED_MESSAGE, now, job.id);

      db.prepare(
        `UPDATE attempt_answers
         SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
         WHERE id = ?`,
      ).run(GRADING_JOB_STALE_FAILED_MESSAGE, now, job.attempt_answer_id);
      continue;
    }

    db.prepare(
      `UPDATE ai_grading_jobs
       SET status = 'PENDING', started_at = NULL, error_message = ?
       WHERE id = ?`,
    ).run(formatGradingRequeueMessage(requeueCount + 1), job.id);
  }
}

async function processPendingGradingJobs() {
  const jobs = db
    .prepare<[], PendingGradingJob>(
      `SELECT id, attempt_answer_id, request_payload_json
       FROM ai_grading_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 10`,
    )
    .all();

  const attemptIdsToFinalize = new Set<string>();

  for (const job of jobs) {
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE ai_grading_jobs
       SET status = 'PROCESSING', started_at = ?
       WHERE id = ?`,
    ).run(now, job.id);

    try {
      const context = db
        .prepare<[string], AnswerContext>(
          `SELECT
             aa.answer_text,
             aa.max_points,
             qb.prompt_markdown,
             qb.explanation_markdown,
             qb.reference_answer,
             qb.grading_keywords_json
           FROM attempt_answers aa
           JOIN question_bank_entries qb ON qb.id = aa.question_id
           WHERE aa.id = ?
           LIMIT 1`,
        )
        .get(job.attempt_answer_id);

      if (!context) {
        throw new Error("Attempt answer context not found");
      }

      const studentAnswer = (context.answer_text ?? "").trim();
      if (!studentAnswer) {
        db.prepare(
          `UPDATE attempt_answers
           SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
           WHERE id = ?`,
        ).run("No answer submitted.", now, job.attempt_answer_id);

        db.prepare(
          `UPDATE ai_grading_jobs
           SET status = 'COMPLETED', score = 0, feedback = ?, completed_at = ?
           WHERE id = ?`,
        ).run("No answer submitted.", now, job.id);
        continue;
      }

      if (!offlineAiEnabled) {
        db.prepare(
          `UPDATE ai_grading_jobs
           SET status = 'FAILED', error_message = ?, completed_at = ?
           WHERE id = ?`,
        ).run("Offline AI disabled. Requires teacher review.", now, job.id);

        db.prepare(
          `UPDATE attempt_answers
           SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
           WHERE id = ?`,
        ).run("Queued for teacher review: offline AI is disabled.", now, job.attempt_answer_id);
        continue;
      }

      const keywords = (() => {
        if (!context.grading_keywords_json) {
          return [] as string[];
        }
        try {
          const parsed = JSON.parse(context.grading_keywords_json) as unknown;
          return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
        } catch {
          return [] as string[];
        }
      })();

      const applied = await gradeShortAnswerWithOfflineAi({
        prompt: context.prompt_markdown,
        studentAnswer,
        referenceAnswer: context.reference_answer,
        keywords,
        maxPoints: context.max_points,
        rubric: context.explanation_markdown,
        explanationMarkdown: context.explanation_markdown,
      });

      db.prepare(
        `UPDATE attempt_answers
         SET is_correct = ?, earned_points = ?, feedback = ?, graded_by_ai = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        applied.isCorrect ? 1 : 0,
        applied.earnedPoints,
        applied.feedback,
        applied.gradedByAi ? 1 : 0,
        now,
        job.attempt_answer_id,
      );

      db.prepare(
        `UPDATE ai_grading_jobs
         SET status = 'COMPLETED', score = ?, feedback = ?, response_payload_json = ?, completed_at = ?
         WHERE id = ?`,
      ).run(
        applied.normalizedScore,
        applied.feedback,
        JSON.stringify(applied.responsePayload),
        now,
        job.id,
      );

      const attemptRow = db
        .prepare<[string], { attempt_id: string }>(`SELECT attempt_id FROM attempt_answers WHERE id = ? LIMIT 1`)
        .get(job.attempt_answer_id);
      if (attemptRow?.attempt_id) {
        attemptIdsToFinalize.add(attemptRow.attempt_id);
      }
    } catch (error) {
      db.prepare(
        `UPDATE ai_grading_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown error", now, job.id);

      db.prepare(
        `UPDATE attempt_answers
         SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
         WHERE id = ?`,
      ).run("Queued for teacher review due to offline AI processing failure.", now, job.attempt_answer_id);
    }
  }

  for (const attemptId of attemptIdsToFinalize) {
    try {
      finalizeSubmittedAttemptIfReady(attemptId);
    } catch (error) {
      console.error(`Failed to finalize attempt ${attemptId}:`, error);
    }
  }

  return jobs.length;
}

async function processPendingQuizGenerationJobs() {
  const jobs = db
    .prepare<[], PendingQuizGenerationJob>(
      `SELECT id, teacher_id, lesson_id, quiz_id, question_count, question_types_json
       FROM quiz_generation_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 4`,
    )
    .all();

  for (const job of jobs) {
    if (!offlineAiEnabled) {
      db.prepare(
        `UPDATE quiz_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(GENERATION_JOB_OFFLINE_AI_DISABLED_MESSAGE, new Date().toISOString(), job.id);
      continue;
    }

    const startedAt = new Date().toISOString();
    db.prepare(
      `UPDATE quiz_generation_jobs
       SET status = 'PROCESSING', started_at = ?, error_message = NULL
       WHERE id = ?`,
    ).run(startedAt, job.id);

    try {
      const context = db
        .prepare<[string], QuizGenerationContext>(
          `SELECT l.title, l.subject, l.topic, l.content_markdown
           FROM quiz_generation_jobs qgj
           JOIN lessons l ON l.id = qgj.lesson_id
           JOIN quizzes q ON q.id = qgj.quiz_id
           WHERE qgj.id = ?
             AND q.lesson_id = l.id
             AND q.teacher_id = qgj.teacher_id
           LIMIT 1`,
        )
        .get(job.id);

      if (!context) {
        throw new Error("Lesson/quiz context not found for generation job.");
      }

      const generatedQuestions = await generateQuizFromLesson({
        lessonTitle: context.title,
        lessonSubject: context.subject,
        lessonTopic: context.topic,
        lessonContent: context.content_markdown,
        questionCount: Math.max(1, Math.min(job.question_count, MAX_GENERATION_QUESTIONS)),
        questionTypes: parseRequestedTypes(job.question_types_json),
      });

      if (generatedQuestions.length === 0) {
        throw new Error("No valid questions generated.");
      }

      const createdQuestionIds = db.transaction(() => {
        const maxPosition =
          db
            .prepare<[string], { max_position: number | null }>(
              `SELECT MAX(position) AS max_position
               FROM quiz_questions
               WHERE quiz_id = ?`,
            )
            .get(job.quiz_id)?.max_position ?? 0;

        let nextPosition = maxPosition;
        const createdIds: string[] = [];

        for (const generated of generatedQuestions) {
          const questionId = crypto.randomUUID();
          const now = new Date().toISOString();

          db.prepare(
            `INSERT INTO question_bank_entries (
              id, teacher_id, subject, topic, difficulty, type,
              prompt_markdown, explanation_markdown, reference_answer, grading_keywords_json,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'MEDIUM', ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            questionId,
            job.teacher_id,
            context.subject,
            context.topic,
            generated.questionType,
            generated.questionText,
            generated.explanation,
            generated.questionType === "SHORT_ANSWER" ? generated.correctAnswer : null,
            generated.questionType === "SHORT_ANSWER"
              ? JSON.stringify(
                  generated.correctAnswer
                    .split(/[^a-zA-Z0-9]+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                )
              : null,
            now,
            now,
          );

          if (generated.questionType !== "SHORT_ANSWER") {
            const normalizedOptions =
              generated.questionType === "TRUE_FALSE" ? ["True", "False"] : generated.choices.slice(0, 4);

            for (let index = 0; index < normalizedOptions.length; index += 1) {
              const value = normalizedOptions[index];
              const label = String.fromCharCode(65 + index);
              const isCorrect =
                value.trim().toLowerCase() === generated.correctAnswer.trim().toLowerCase() ||
                label.toLowerCase() === generated.correctAnswer.trim().toLowerCase();

              db.prepare(
                `INSERT INTO question_options (
                  id, question_id, label, value, is_correct, position, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              ).run(crypto.randomUUID(), questionId, label, value, isCorrect ? 1 : 0, index + 1, now);
            }
          }

          nextPosition += 1;
          db.prepare(
            `INSERT INTO quiz_questions (
              id, quiz_id, question_id, position, points, is_required
            ) VALUES (?, ?, ?, ?, 1, 1)`,
          ).run(crypto.randomUUID(), job.quiz_id, questionId, nextPosition);

          createdIds.push(questionId);
        }

        return createdIds;
      })();

      db.prepare(
        `UPDATE quiz_generation_jobs
         SET status = 'COMPLETED',
             generated_questions_json = ?,
             created_question_ids_json = ?,
             completed_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify(generatedQuestions),
        JSON.stringify(createdQuestionIds),
        new Date().toISOString(),
        job.id,
      );
    } catch (error) {
      db.prepare(
        `UPDATE quiz_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown generation error", new Date().toISOString(), job.id);
    }
  }

  return jobs.length;
}

async function processPendingLessonGenerationJobs() {
  const jobs = db
    .prepare<[], PendingLessonGenerationJob>(
      `SELECT
         id,
         teacher_id,
         subject_id,
         section_id,
         prompt_text,
         preferred_title,
         preferred_topic,
         preferred_difficulty,
         preferred_estimated_minutes
       FROM lesson_generation_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 3`,
    )
    .all();

  for (const job of jobs) {
    if (!offlineAiEnabled) {
      db.prepare(
        `UPDATE lesson_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(GENERATION_JOB_OFFLINE_AI_DISABLED_MESSAGE, new Date().toISOString(), job.id);
      continue;
    }

    const startedAt = new Date().toISOString();
    db.prepare(
      `UPDATE lesson_generation_jobs
       SET status = 'PROCESSING', started_at = ?, error_message = NULL
       WHERE id = ?`,
    ).run(startedAt, job.id);

    try {
      const context = db
        .prepare<[string], LessonGenerationContext>(
          `SELECT
             subj.name AS subject_name,
             subj.description AS subject_description,
             sec.name AS section_name,
             sec.grade_level,
             sec.school_year
           FROM lesson_generation_jobs lgj
           JOIN subjects subj ON subj.id = lgj.subject_id
           JOIN sections sec ON sec.id = lgj.section_id
           WHERE lgj.id = ?
             AND sec.status = 'ACTIVE'
             AND EXISTS (
               SELECT 1
               FROM section_subject_teachers sst
               WHERE sst.section_id = lgj.section_id
                 AND sst.subject_id = lgj.subject_id
                 AND sst.teacher_id = lgj.teacher_id
                 AND sst.is_active = 1
             )
           LIMIT 1`,
        )
        .get(job.id);

      if (!context) {
        throw new Error("Subject/section context not found for lesson generation job.");
      }

      const generatedLesson = await generateLessonDraft({
        subjectName: context.subject_name,
        subjectDescription: context.subject_description,
        sectionName: context.section_name,
        gradeLevel: context.grade_level,
        schoolYear: context.school_year,
        promptText: job.prompt_text,
        preferredTitle: job.preferred_title,
        preferredTopic: job.preferred_topic,
        preferredDifficulty: job.preferred_difficulty,
        preferredEstimatedMinutes: job.preferred_estimated_minutes,
      });

      const validation = validateGeneratedLessonDraftForInsert(generatedLesson);
      if (!validation.ok) {
        db.prepare(
          `UPDATE lesson_generation_jobs
           SET status = 'FAILED',
               generated_lesson_json = ?,
               error_message = ?,
               completed_at = ?
           WHERE id = ?`,
        ).run(JSON.stringify(generatedLesson), validation.reason, new Date().toISOString(), job.id);
        continue;
      }

      const createdLessonId = db.transaction(() => {
        const now = new Date().toISOString();
        const lessonId = crypto.randomUUID();

        db.prepare(
          `INSERT INTO lessons (
            id, teacher_id, subject_id, title, short_description, content_markdown, cover_image_url,
            difficulty, subject, topic, unit, status, estimated_minutes, tags_json,
            published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, NULL, ?, ?)`,
        ).run(
          lessonId,
          job.teacher_id,
          job.subject_id,
          generatedLesson.title,
          generatedLesson.shortDescription,
          generatedLesson.contentMarkdown,
          null,
          generatedLesson.difficulty,
          context.subject_name,
          generatedLesson.topic,
          generatedLesson.unit,
          generatedLesson.estimatedMinutes,
          JSON.stringify(generatedLesson.tags),
          now,
          now,
        );

        db.prepare(
          `INSERT OR IGNORE INTO lesson_sections (
             id, lesson_id, section_id, assigned_by_id, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), lessonId, job.section_id, job.teacher_id, now);

        return lessonId;
      })();

      db.prepare(
        `UPDATE lesson_generation_jobs
         SET status = 'COMPLETED',
             generated_lesson_json = ?,
             created_lesson_id = ?,
             completed_at = ?
         WHERE id = ?`,
      ).run(JSON.stringify(generatedLesson), createdLessonId, new Date().toISOString(), job.id);
    } catch (error) {
      db.prepare(
        `UPDATE lesson_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown lesson generation error", new Date().toISOString(), job.id);
    }
  }

  return jobs.length;
}

async function main() {
  console.log("ChemBalance worker started.");
  console.log(`Database: ${resolvedDbFile}`);
  console.log(`Offline grader: ${offlineGraderUrl}`);
  console.log(`Ollama: ${ollamaBaseUrl}`);

  for (;;) {
    reclaimStuckGenerationJobs();
    reclaimStuckGradingJobs();
    const gradingProcessed = await processPendingGradingJobs();
    const generationProcessed = await processPendingQuizGenerationJobs();
    const lessonGenerationProcessed = await processPendingLessonGenerationJobs();

    if (gradingProcessed > 0 || generationProcessed > 0 || lessonGenerationProcessed > 0) {
      console.log(
        `Processed jobs - grading: ${gradingProcessed}, quiz-generation: ${generationProcessed}, lesson-generation: ${lessonGenerationProcessed}`,
      );
    }

    await sleep(5000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
