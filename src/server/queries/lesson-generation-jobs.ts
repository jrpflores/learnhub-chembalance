import crypto from "node:crypto";
import { getDb, parseJson } from "@/lib/db";

export type LessonGenerationJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

type LessonGenerationJobRow = {
  id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  subject_name: string;
  section_name: string;
  status: LessonGenerationJobStatus;
  prompt_text: string;
  preferred_title: string | null;
  preferred_topic: string | null;
  preferred_difficulty: "EASY" | "MEDIUM" | "HARD" | null;
  preferred_estimated_minutes: number | null;
  generated_lesson_json: string | null;
  created_lesson_id: string | null;
  created_lesson_title: string | null;
  error_message: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const ensureLessonGenerationJobsSql = `
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
`;

function ensureLessonGenerationJobsTable() {
  getDb().exec(ensureLessonGenerationJobsSql);
}

function mapLessonGenerationJob(row: LessonGenerationJobRow) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    subjectId: row.subject_id,
    sectionId: row.section_id,
    subjectName: row.subject_name,
    sectionName: row.section_name,
    status: row.status,
    promptText: row.prompt_text,
    preferredTitle: row.preferred_title,
    preferredTopic: row.preferred_topic,
    preferredDifficulty: row.preferred_difficulty,
    preferredEstimatedMinutes: row.preferred_estimated_minutes,
    generatedLesson: parseJson<Record<string, unknown> | null>(row.generated_lesson_json, null),
    createdLessonId: row.created_lesson_id,
    createdLessonTitle: row.created_lesson_title,
    errorMessage: row.error_message,
    queuedAt: row.queued_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function findActiveLessonGenerationJobForContext(payload: {
  teacherId: string;
  subjectId: string;
  sectionId: string;
}) {
  const db = getDb();
  ensureLessonGenerationJobsTable();
  const row = db
    .prepare<{ id: string }>(
      `SELECT id
       FROM lesson_generation_jobs
       WHERE teacher_id = ?
         AND subject_id = ?
         AND section_id = ?
         AND status IN ('PENDING', 'PROCESSING')
       ORDER BY queued_at DESC
       LIMIT 1`,
    )
    .get(payload.teacherId, payload.subjectId, payload.sectionId);
  return row?.id ?? null;
}

export function createLessonGenerationJob(payload: {
  teacherId: string;
  subjectId: string;
  sectionId: string;
  promptText: string;
  preferredTitle?: string;
  preferredTopic?: string;
  preferredDifficulty?: "EASY" | "MEDIUM" | "HARD";
  preferredEstimatedMinutes?: number;
}) {
  const db = getDb();
  ensureLessonGenerationJobsTable();

  const activeJobId = findActiveLessonGenerationJobForContext({
    teacherId: payload.teacherId,
    subjectId: payload.subjectId,
    sectionId: payload.sectionId,
  });
  if (activeJobId) {
    return { jobId: null as null, conflictJobId: activeJobId };
  }

  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO lesson_generation_jobs (
      id,
      teacher_id,
      subject_id,
      section_id,
      status,
      prompt_text,
      preferred_title,
      preferred_topic,
      preferred_difficulty,
      preferred_estimated_minutes,
      queued_at
    ) VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    payload.teacherId,
    payload.subjectId,
    payload.sectionId,
    payload.promptText.trim(),
    payload.preferredTitle?.trim() || null,
    payload.preferredTopic?.trim() || null,
    payload.preferredDifficulty ?? null,
    payload.preferredEstimatedMinutes ?? null,
    new Date().toISOString(),
  );

  return { jobId: id, conflictJobId: null as null };
}

export function listLessonGenerationJobsByContext(payload: {
  teacherId: string;
  subjectId: string;
  sectionId: string;
  limit?: number;
  statuses?: LessonGenerationJobStatus[];
}) {
  const db = getDb();
  ensureLessonGenerationJobsTable();
  const limit = Math.max(1, Math.min(payload.limit ?? 10, 50));
  const filters = [
    "lgj.teacher_id = ?",
    "lgj.subject_id = ?",
    "lgj.section_id = ?",
  ];
  const values: unknown[] = [payload.teacherId, payload.subjectId, payload.sectionId];
  const statuses = payload.statuses?.length ? Array.from(new Set(payload.statuses)) : [];

  if (statuses.length > 0) {
    filters.push(`lgj.status IN (${statuses.map(() => "?").join(", ")})`);
    values.push(...statuses);
  }

  const rows = db
    .prepare<LessonGenerationJobRow[]>(
      `SELECT
         lgj.id,
         lgj.teacher_id,
         lgj.subject_id,
         lgj.section_id,
         subj.name AS subject_name,
         sec.name AS section_name,
         lgj.status,
         lgj.prompt_text,
         lgj.preferred_title,
         lgj.preferred_topic,
         lgj.preferred_difficulty,
         lgj.preferred_estimated_minutes,
         lgj.generated_lesson_json,
         lgj.created_lesson_id,
         l.title AS created_lesson_title,
         lgj.error_message,
         lgj.queued_at,
         lgj.started_at,
         lgj.completed_at
       FROM lesson_generation_jobs lgj
       JOIN subjects subj ON subj.id = lgj.subject_id
       JOIN sections sec ON sec.id = lgj.section_id
       LEFT JOIN lessons l ON l.id = lgj.created_lesson_id
       WHERE ${filters.join(" AND ")}
       ORDER BY lgj.queued_at DESC
       LIMIT ?`,
    )
    .all(...values, limit);

  return rows.map(mapLessonGenerationJob);
}
