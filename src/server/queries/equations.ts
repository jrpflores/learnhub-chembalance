import crypto from "node:crypto";
import { getDb, nowIso, parseJson, stringifyJson, toBoolean } from "@/lib/db";
import type { DifficultyLevel, PracticeSessionStatus, Role } from "@/domain/types";

type EquationRow = {
  id: string;
  subject_id: string | null;
  subject_name: string | null;
  teacher_id: string | null;
  teacher_name: string | null;
  title: string;
  formula: string;
  balanced_formula: string | null;
  difficulty: DifficultyLevel;
  topic: string;
  hints_json: string | null;
  explanation_markdown: string | null;
  tags_json: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

function mapEquation(row: EquationRow) {
  return {
    id: row.id,
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    title: row.title,
    formula: row.formula,
    balancedFormula: row.balanced_formula,
    difficulty: row.difficulty,
    topic: row.topic,
    hints: parseJson<string[]>(row.hints_json, []),
    explanationMarkdown: row.explanation_markdown,
    tags: parseJson<string[]>(row.tags_json, []),
    isArchived: toBoolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChemicalEquations(params?: {
  teacherId?: string;
  includeGlobal?: boolean;
  includeArchived?: boolean;
  topic?: string;
  search?: string;
}) {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];

  if (params?.teacherId) {
    if (params.includeGlobal) {
      where.push("(e.teacher_id = ? OR e.teacher_id IS NULL)");
      values.push(params.teacherId);
    } else {
      where.push("e.teacher_id = ?");
      values.push(params.teacherId);
    }
  }

  if (!params?.includeArchived) {
    where.push("e.is_archived = 0");
  }

  if (params?.topic) {
    where.push("e.topic = ?");
    values.push(params.topic);
  }

  if (params?.search) {
    where.push("(e.title LIKE ? OR e.formula LIKE ? OR e.topic LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare<EquationRow[]>(
      `SELECT
        e.id,
        e.subject_id,
        s.name AS subject_name,
        e.teacher_id,
        u.full_name AS teacher_name,
        e.title,
        e.formula,
        e.balanced_formula,
        e.difficulty,
        e.topic,
        e.hints_json,
        e.explanation_markdown,
        e.tags_json,
        e.is_archived,
        e.created_at,
        e.updated_at
      FROM chemical_equations e
      LEFT JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN users u ON u.id = e.teacher_id
      ${whereSql}
      ORDER BY e.updated_at DESC`,
    )
    .all(...values);

  return rows.map(mapEquation);
}

export function getChemicalEquationById(equationId: string) {
  const db = getDb();
  const row = db
    .prepare<EquationRow>(
      `SELECT
        e.id,
        e.subject_id,
        s.name AS subject_name,
        e.teacher_id,
        u.full_name AS teacher_name,
        e.title,
        e.formula,
        e.balanced_formula,
        e.difficulty,
        e.topic,
        e.hints_json,
        e.explanation_markdown,
        e.tags_json,
        e.is_archived,
        e.created_at,
        e.updated_at
      FROM chemical_equations e
      LEFT JOIN subjects s ON s.id = e.subject_id
      LEFT JOIN users u ON u.id = e.teacher_id
      WHERE e.id = ?
      LIMIT 1`,
    )
    .get(equationId);

  return row ? mapEquation(row) : null;
}

export function createChemicalEquation(payload: {
  teacherId?: string | null;
  subjectId?: string | null;
  title: string;
  formula: string;
  balancedFormula?: string | null;
  difficulty?: DifficultyLevel;
  topic: string;
  hints?: string[];
  explanationMarkdown?: string | null;
  tags?: string[];
  isArchived?: boolean;
}) {
  const db = getDb();
  const equationId = crypto.randomUUID();
  const now = nowIso();

  db.prepare(
    `INSERT INTO chemical_equations (
      id, subject_id, teacher_id, title, formula, balanced_formula, difficulty, topic, hints_json,
      explanation_markdown, tags_json, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    equationId,
    payload.subjectId ?? null,
    payload.teacherId ?? null,
    payload.title.trim(),
    payload.formula.trim(),
    payload.balancedFormula?.trim() || null,
    payload.difficulty ?? "MEDIUM",
    payload.topic.trim(),
    stringifyJson(payload.hints ?? []),
    payload.explanationMarkdown?.trim() || null,
    stringifyJson(payload.tags ?? []),
    payload.isArchived ? 1 : 0,
    now,
    now,
  );

  return equationId;
}

export function updateChemicalEquation(
  equationId: string,
  payload: {
    subjectId?: string | null;
    title?: string;
    formula?: string;
    balancedFormula?: string | null;
    difficulty?: DifficultyLevel;
    topic?: string;
    hints?: string[];
    explanationMarkdown?: string | null;
    tags?: string[];
    isArchived?: boolean;
  },
) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.subjectId !== undefined) {
    updates.push("subject_id = ?");
    values.push(payload.subjectId);
  }
  if (payload.title !== undefined) {
    updates.push("title = ?");
    values.push(payload.title.trim());
  }
  if (payload.formula !== undefined) {
    updates.push("formula = ?");
    values.push(payload.formula.trim());
  }
  if (payload.balancedFormula !== undefined) {
    updates.push("balanced_formula = ?");
    values.push(payload.balancedFormula?.trim() || null);
  }
  if (payload.difficulty !== undefined) {
    updates.push("difficulty = ?");
    values.push(payload.difficulty);
  }
  if (payload.topic !== undefined) {
    updates.push("topic = ?");
    values.push(payload.topic.trim());
  }
  if (payload.hints !== undefined) {
    updates.push("hints_json = ?");
    values.push(stringifyJson(payload.hints));
  }
  if (payload.explanationMarkdown !== undefined) {
    updates.push("explanation_markdown = ?");
    values.push(payload.explanationMarkdown?.trim() || null);
  }
  if (payload.tags !== undefined) {
    updates.push("tags_json = ?");
    values.push(stringifyJson(payload.tags));
  }
  if (payload.isArchived !== undefined) {
    updates.push("is_archived = ?");
    values.push(payload.isArchived ? 1 : 0);
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(nowIso(), equationId);
  db.prepare(`UPDATE chemical_equations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function canTeacherManageEquation(teacherId: string, equationId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      "SELECT COUNT(*) AS total FROM chemical_equations WHERE id = ? AND (teacher_id = ? OR teacher_id IS NULL)",
    )
    .get(equationId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function createPracticeSession(payload: {
  studentId: string;
  sectionId?: string;
  topic?: string;
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = nowIso();

  // Close any leftover open sessions so the list does not stay stuck on IN_PROGRESS.
  abandonOpenPracticeSessions(payload.studentId);

  db.prepare(
    `INSERT INTO equation_practice_sessions (
      id, student_id, section_id, topic, status, started_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`,
  ).run(id, payload.studentId, payload.sectionId ?? null, payload.topic ?? null, now, now, now);

  return id;
}

export function abandonOpenPracticeSessions(studentId: string, exceptSessionId?: string) {
  const db = getDb();
  const now = nowIso();
  if (exceptSessionId) {
    db.prepare(
      `UPDATE equation_practice_sessions
       SET status = 'ABANDONED', completed_at = COALESCE(completed_at, ?), updated_at = ?
       WHERE student_id = ? AND status = 'IN_PROGRESS' AND id != ?`,
    ).run(now, now, studentId, exceptSessionId);
    return;
  }

  db.prepare(
    `UPDATE equation_practice_sessions
     SET status = 'ABANDONED', completed_at = COALESCE(completed_at, ?), updated_at = ?
     WHERE student_id = ? AND status = 'IN_PROGRESS'`,
  ).run(now, now, studentId);
}

export function getPracticeSessionById(sessionId: string, studentId?: string) {
  const db = getDb();
  const where = studentId ? "WHERE s.id = ? AND s.student_id = ?" : "WHERE s.id = ?";
  const row = db
    .prepare<
      {
        id: string;
        student_id: string;
        section_id: string | null;
        topic: string | null;
        status: PracticeSessionStatus;
        started_at: string;
        completed_at: string | null;
        updated_at: string;
      }
    >(
      `SELECT id, student_id, section_id, topic, status, started_at, completed_at, updated_at
      FROM equation_practice_sessions s
      ${where}
      LIMIT 1`,
    )
    .get(...(studentId ? [sessionId, studentId] : [sessionId]));

  if (!row) {
    return null;
  }

  const attempts = db
    .prepare<
      {
        id: string;
        equation_id: string;
        student_answer: string;
        normalized_answer: string | null;
        is_correct: number | null;
        confidence: number | null;
        feedback: string | null;
        hint: string | null;
        ai_provider: string | null;
        grading_metadata_json: string | null;
        created_at: string;
        title: string;
        formula: string;
        balanced_formula: string | null;
      }[]
    >(
      `SELECT
        a.id,
        a.equation_id,
        a.student_answer,
        a.normalized_answer,
        a.is_correct,
        a.confidence,
        a.feedback,
        a.hint,
        a.ai_provider,
        a.grading_metadata_json,
        a.created_at,
        e.title,
        e.formula,
        e.balanced_formula
      FROM equation_practice_attempts a
      JOIN chemical_equations e ON e.id = a.equation_id
      WHERE a.session_id = ?
      ORDER BY a.created_at ASC`,
    )
    .all(sessionId)
    .map((entry) => ({
      id: entry.id,
      equationId: entry.equation_id,
      equationTitle: entry.title,
      formula: entry.formula,
      balancedFormula: entry.balanced_formula,
      studentAnswer: entry.student_answer,
      normalizedAnswer: entry.normalized_answer,
      isCorrect: entry.is_correct === null ? null : toBoolean(entry.is_correct),
      confidence: entry.confidence,
      feedback: entry.feedback,
      hint: entry.hint,
      aiProvider: entry.ai_provider,
      gradingMetadata: parseJson<Record<string, unknown>>(entry.grading_metadata_json, {}),
      createdAt: entry.created_at,
    }));

  return {
    id: row.id,
    studentId: row.student_id,
    sectionId: row.section_id,
    topic: row.topic,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
    attempts,
  };
}

export function addPracticeAttempt(payload: {
  sessionId: string;
  equationId: string;
  studentAnswer: string;
  normalizedAnswer?: string;
  isCorrect: boolean;
  confidence?: number;
  feedback?: string;
  hint?: string;
  aiProvider?: string;
  gradingMetadata?: Record<string, unknown>;
}) {
  const db = getDb();
  const attemptId = crypto.randomUUID();
  const now = nowIso();
  db.prepare(
    `INSERT INTO equation_practice_attempts (
      id, session_id, equation_id, student_answer, normalized_answer, is_correct, confidence, feedback, hint,
      ai_provider, grading_metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    attemptId,
    payload.sessionId,
    payload.equationId,
    payload.studentAnswer,
    payload.normalizedAnswer ?? null,
    payload.isCorrect ? 1 : 0,
    payload.confidence ?? null,
    payload.feedback ?? null,
    payload.hint ?? null,
    payload.aiProvider ?? null,
    stringifyJson(payload.gradingMetadata ?? {}),
    now,
  );

  db.prepare("UPDATE equation_practice_sessions SET updated_at = ? WHERE id = ?").run(now, payload.sessionId);
  return attemptId;
}

export function completePracticeSession(sessionId: string) {
  const db = getDb();
  const now = nowIso();
  db.prepare(
    `UPDATE equation_practice_sessions
     SET status = 'COMPLETED', completed_at = ?, updated_at = ?
     WHERE id = ? AND status = 'IN_PROGRESS'`,
  ).run(now, now, sessionId);
}

export function listStudentPracticeSessions(studentId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        topic: string | null;
        status: PracticeSessionStatus;
        started_at: string;
        completed_at: string | null;
        total_attempts: number;
        correct_attempts: number;
      }[]
    >(
      `SELECT
        s.id,
        s.topic,
        s.status,
        s.started_at,
        s.completed_at,
        COUNT(a.id) AS total_attempts,
        SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct_attempts
      FROM equation_practice_sessions s
      LEFT JOIN equation_practice_attempts a ON a.session_id = s.id
      WHERE s.student_id = ?
      GROUP BY s.id
      ORDER BY s.started_at DESC
      LIMIT 20`,
    )
    .all(studentId)
    .map((row) => ({
      id: row.id,
      topic: row.topic,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalAttempts: row.total_attempts,
      correctAttempts: row.correct_attempts,
    }));
}

export function getPracticeEquationsPool(params: {
  topic?: string;
  limit?: number;
  studentId?: string;
}) {
  const db = getDb();
  const where = ["is_archived = 0"];
  const values: unknown[] = [];
  if (params.topic) {
    where.push("topic = ?");
    values.push(params.topic);
  }

  const limit = Math.min(25, Math.max(1, params.limit ?? 10));
  const rows = db
    .prepare<
      {
        id: string;
        title: string;
        formula: string;
        balanced_formula: string | null;
        topic: string;
        difficulty: DifficultyLevel;
        hints_json: string | null;
      }[]
    >(
      `SELECT id, title, formula, balanced_formula, topic, difficulty, hints_json
      FROM chemical_equations
      WHERE ${where.join(" AND ")}
      ORDER BY RANDOM()
      LIMIT ?`,
    )
    .all(...values, limit);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    formula: row.formula,
    balancedFormula: row.balanced_formula,
    topic: row.topic,
    difficulty: row.difficulty,
    hints: parseJson<string[]>(row.hints_json, []),
  }));
}

export function equationLibraryAnalytics(scope: { role: Role; userId: string }) {
  const db = getDb();
  const where = scope.role === "TEACHER" ? "WHERE e.teacher_id = ?" : "";
  const values = scope.role === "TEACHER" ? [scope.userId] : [];

  const overview = db
    .prepare<{
      total_equations: number;
      active_equations: number;
      avg_attempt_accuracy: number;
    }>(
      `SELECT
        COUNT(*) AS total_equations,
        SUM(CASE WHEN e.is_archived = 0 THEN 1 ELSE 0 END) AS active_equations,
        COALESCE(AVG(CASE WHEN a.is_correct = 1 THEN 100 ELSE 0 END), 0) AS avg_attempt_accuracy
      FROM chemical_equations e
      LEFT JOIN equation_practice_attempts a ON a.equation_id = e.id
      ${where}`,
    )
    .get(...values);

  const hardest = db
    .prepare<
      {
        equation_id: string;
        title: string;
        topic: string;
        total: number;
        correct: number;
      }[]
    >(
      `SELECT
        e.id AS equation_id,
        e.title,
        e.topic,
        COUNT(a.id) AS total,
        SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct
      FROM chemical_equations e
      LEFT JOIN equation_practice_attempts a ON a.equation_id = e.id
      ${where}
      GROUP BY e.id
      HAVING total > 0
      ORDER BY (1.0 * correct / total) ASC
      LIMIT 8`,
    )
    .all(...values)
    .map((row) => ({
      equationId: row.equation_id,
      title: row.title,
      topic: row.topic,
      totalAttempts: row.total,
      accuracy: Number(((row.correct / row.total) * 100).toFixed(1)),
    }));

  return {
    totalEquations: overview?.total_equations ?? 0,
    activeEquations: overview?.active_equations ?? 0,
    averageAttemptAccuracy: Number((overview?.avg_attempt_accuracy ?? 0).toFixed(1)),
    hardestEquations: hardest,
  };
}
