import crypto from "node:crypto";
import { getDb, parseJson } from "@/lib/db";

export type QuizGenerationJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type QuizGenerationQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

type QuizGenerationJobRow = {
  id: string;
  teacher_id: string;
  lesson_id: string;
  quiz_id: string;
  quiz_title: string;
  status: QuizGenerationJobStatus;
  question_count: number;
  question_types_json: string;
  generated_questions_json: string | null;
  created_question_ids_json: string | null;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const ensureQuizGenerationJobsSql = `
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
`;

function ensureQuizGenerationJobsTable() {
  getDb().exec(ensureQuizGenerationJobsSql);
}

function mapQuizGenerationJob(row: QuizGenerationJobRow) {
  const createdQuestionIds = parseJson<string[]>(row.created_question_ids_json, []);
  return {
    id: row.id,
    teacherId: row.teacher_id,
    lessonId: row.lesson_id,
    quizId: row.quiz_id,
    quizTitle: row.quiz_title,
    status: row.status,
    questionCount: row.question_count,
    questionTypes: parseJson<QuizGenerationQuestionType[]>(row.question_types_json, []),
    generatedQuestions: parseJson<unknown[]>(row.generated_questions_json, []),
    createdQuestionIds,
    createdCount: createdQuestionIds.length,
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function createQuizGenerationJob(payload: {
  teacherId: string;
  lessonId: string;
  quizId: string;
  questionCount: number;
  questionTypes: QuizGenerationQuestionType[];
}) {
  const db = getDb();
  ensureQuizGenerationJobsTable();
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO quiz_generation_jobs (
      id, teacher_id, lesson_id, quiz_id, status, question_count, question_types_json, queued_at
    ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
  ).run(
    id,
    payload.teacherId,
    payload.lessonId,
    payload.quizId,
    payload.questionCount,
    JSON.stringify(payload.questionTypes),
    new Date().toISOString(),
  );

  return id;
}

export function listQuizGenerationJobsByLesson(payload: {
  lessonId: string;
  teacherId?: string;
  limit?: number;
}) {
  const db = getDb();
  ensureQuizGenerationJobsTable();
  const where = ["qgj.lesson_id = ?"];
  const values: unknown[] = [payload.lessonId];

  if (payload.teacherId) {
    where.push("qgj.teacher_id = ?");
    values.push(payload.teacherId);
  }

  const rows = db
    .prepare<QuizGenerationJobRow[]>(
      `SELECT
         qgj.id,
         qgj.teacher_id,
         qgj.lesson_id,
         qgj.quiz_id,
         q.title AS quiz_title,
         qgj.status,
         qgj.question_count,
         qgj.question_types_json,
         qgj.generated_questions_json,
         qgj.created_question_ids_json,
         qgj.error_message,
         qgj.queued_at,
         qgj.started_at,
         qgj.completed_at
       FROM quiz_generation_jobs qgj
       JOIN quizzes q ON q.id = qgj.quiz_id
       WHERE ${where.join(" AND ")}
       ORDER BY qgj.queued_at DESC
       LIMIT ?`,
    )
    .all(...values, payload.limit ?? 30);

  return rows.map(mapQuizGenerationJob);
}
