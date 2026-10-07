import crypto from "node:crypto";
import { getDb, parseJson, toBoolean } from "@/lib/db";
import type { DifficultyLevel, LessonStatus } from "@/domain/types";

type LessonRow = {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string | null;
  title: string;
  short_description: string;
  content_markdown: string;
  cover_image_url: string | null;
  difficulty: DifficultyLevel | null;
  subject: string;
  topic: string;
  unit: string | null;
  status: LessonStatus;
  estimated_minutes: number | null;
  tags_json: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapLesson(row: LessonRow) {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    subjectId: row.subject_id,
    title: row.title,
    shortDescription: row.short_description,
    contentMarkdown: row.content_markdown,
    coverImageUrl: row.cover_image_url,
    difficulty: row.difficulty,
    subject: row.subject,
    topic: row.topic,
    unit: row.unit,
    status: row.status,
    estimatedMinutes: row.estimated_minutes,
    tags: parseJson<string[]>(row.tags_json, []),
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listLessons(params?: {
  teacherId?: string;
  accessibleTeacherId?: string;
  sectionId?: string;
  status?: LessonStatus;
  subject?: string;
  topic?: string;
  search?: string;
}) {
  const db = getDb();

  const where: string[] = [];
  const values: unknown[] = [];
  const sectionId = params?.sectionId?.trim();
  const scopedTeacherId = params?.accessibleTeacherId ?? params?.teacherId;

  if (params?.teacherId) {
    where.push("l.teacher_id = ?");
    values.push(params.teacherId);
  }

  if (params?.accessibleTeacherId) {
    where.push(`EXISTS (
      SELECT 1
      FROM teacher_subjects ts
      JOIN subjects s ON s.id = ts.subject_id
      WHERE ts.teacher_id = ?
        AND ts.is_active = 1
        AND (
          l.subject_id = ts.subject_id
          OR lower(l.subject) = lower(s.name)
        )
    )`);
    values.push(params.accessibleTeacherId);
  }

  if (params?.status) {
    where.push("l.status = ?");
    values.push(params.status);
  }

  if (params?.subject) {
    where.push("l.subject = ?");
    values.push(params.subject);
  }

  if (params?.topic) {
    where.push("l.topic = ?");
    values.push(params.topic);
  }

  if (params?.search) {
    where.push("(l.title LIKE ? OR l.short_description LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`);
  }

  if (sectionId) {
    where.push("EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = l.id AND ls.section_id = ?)");
    values.push(sectionId);

    if (scopedTeacherId) {
      where.push(`EXISTS (
        SELECT 1
        FROM section_subject_teachers sst
        JOIN subjects s ON s.id = sst.subject_id
        WHERE sst.section_id = ?
          AND sst.teacher_id = ?
          AND sst.is_active = 1
          AND (
            l.subject_id = sst.subject_id
            OR lower(l.subject) = lower(s.name)
          )
      )`);
      values.push(sectionId, scopedTeacherId);
    }
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare<LessonRow[]>(
      `SELECT
         l.id,
         l.teacher_id,
         u.full_name AS teacher_name,
         l.subject_id,
         l.title,
         l.short_description,
         l.content_markdown,
         l.cover_image_url,
         l.difficulty,
         l.subject,
         l.topic,
         l.unit,
         l.status,
         l.estimated_minutes,
         l.tags_json,
         l.published_at,
         l.created_at,
         l.updated_at
       FROM lessons l
       JOIN users u ON u.id = l.teacher_id
       ${whereSql}
       ORDER BY l.updated_at DESC`,
    )
    .all(...values);

  return rows.map(mapLesson);
}

export function listImportableLessonsForSection(params: {
  teacherId: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  search?: string;
  limit?: number;
}) {
  const db = getDb();
  const limit = Math.max(1, Math.min(100, params.limit ?? 50));
  const where: string[] = [
    "l.status != 'ARCHIVED'",
    "(l.subject_id = ? OR lower(l.subject) = lower(?))",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      WHERE sst.section_id = ?
        AND sst.subject_id = ?
        AND sst.teacher_id = ?
        AND sst.is_active = 1
    )`,
    `EXISTS (
      SELECT 1
      FROM teacher_subjects ts
      JOIN subjects s ON s.id = ts.subject_id
      WHERE ts.teacher_id = ?
        AND ts.is_active = 1
        AND (
          l.subject_id = ts.subject_id
          OR lower(l.subject) = lower(s.name)
        )
    )`,
    "NOT EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = l.id AND ls.section_id = ?)",
    `NOT EXISTS (
      SELECT 1
      FROM lesson_sections ls
      JOIN lessons existing ON existing.id = ls.lesson_id
      WHERE ls.section_id = ?
        AND lower(existing.title) = lower(l.title)
        AND lower(existing.topic) = lower(l.topic)
        AND (
          (l.subject_id IS NOT NULL AND existing.subject_id = l.subject_id)
          OR lower(existing.subject) = lower(l.subject)
        )
    )`,
  ];
  const values: unknown[] = [
    params.subjectId,
    params.subjectName,
    params.sectionId,
    params.subjectId,
    params.teacherId,
    params.teacherId,
    params.sectionId,
    params.sectionId,
  ];

  if (params.search?.trim()) {
    where.push("(l.title LIKE ? OR l.short_description LIKE ? OR u.full_name LIKE ?)");
    values.push(
      `%${params.search.trim()}%`,
      `%${params.search.trim()}%`,
      `%${params.search.trim()}%`,
    );
  }

  return db
    .prepare<
      {
        id: string;
        title: string;
        short_description: string;
        topic: string;
        status: LessonStatus;
        updated_at: string;
        teacher_name: string;
      }[]
    >(
      `SELECT
        l.id,
        l.title,
        l.short_description,
        l.topic,
        l.status,
        l.updated_at,
        u.full_name AS teacher_name
      FROM lessons l
      JOIN users u ON u.id = l.teacher_id
      WHERE ${where.join(" AND ")}
      ORDER BY l.updated_at DESC
      LIMIT ?`,
    )
    .all(...values, limit)
    .map((row) => ({
      id: row.id,
      title: row.title,
      shortDescription: row.short_description,
      topic: row.topic,
      status: row.status,
      updatedAt: row.updated_at,
      teacherName: row.teacher_name,
    }));
}

export function canTeacherAttachLessonToSection(payload: {
  teacherId: string;
  lessonId: string;
  sectionId: string;
}) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM lessons l
       WHERE l.id = ?
         AND EXISTS (
           SELECT 1
           FROM section_subject_teachers sst
           JOIN subjects s ON s.id = sst.subject_id
           JOIN sections sec ON sec.id = sst.section_id
           WHERE sst.section_id = ?
             AND sst.teacher_id = ?
             AND sst.is_active = 1
             AND sec.status = 'ACTIVE'
             AND (
               l.subject_id = sst.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )
       LIMIT 1`,
    )
    .get(payload.lessonId, payload.sectionId, payload.teacherId);

  return (row?.total ?? 0) > 0;
}

export function attachLessonToSection(lessonId: string, sectionId: string, assignedById?: string) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO lesson_sections (id, lesson_id, section_id, assigned_by_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), lessonId, sectionId, assignedById ?? null, new Date().toISOString());
}

export function getLessonById(lessonId: string) {
  const db = getDb();

  const row = db
    .prepare<LessonRow>(
      `SELECT
         l.id,
         l.teacher_id,
         u.full_name AS teacher_name,
         l.subject_id,
         l.title,
         l.short_description,
         l.content_markdown,
         l.cover_image_url,
         l.difficulty,
         l.subject,
         l.topic,
         l.unit,
         l.status,
         l.estimated_minutes,
         l.tags_json,
         l.published_at,
         l.created_at,
         l.updated_at
       FROM lessons l
       JOIN users u ON u.id = l.teacher_id
       WHERE l.id = ?
       LIMIT 1`,
    )
    .get(lessonId);

  return row ? mapLesson(row) : null;
}

export function createLesson(payload: {
  teacherId: string;
  subjectId?: string;
  title: string;
  shortDescription: string;
  contentMarkdown: string;
  coverImageUrl?: string;
  difficulty?: DifficultyLevel;
  subject: string;
  topic: string;
  unit?: string;
  status?: LessonStatus;
  estimatedMinutes?: number;
  tags?: string[];
}) {
  const db = getDb();
  const lessonId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO lessons (
      id, teacher_id, subject_id, title, short_description, content_markdown, cover_image_url,
      difficulty, subject, topic, unit, status, estimated_minutes, tags_json,
      published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    lessonId,
    payload.teacherId,
    payload.subjectId ?? null,
    payload.title,
    payload.shortDescription,
    payload.contentMarkdown,
    payload.coverImageUrl ?? null,
    payload.difficulty ?? null,
    payload.subject,
    payload.topic,
    payload.unit ?? null,
    payload.status ?? "DRAFT",
    payload.estimatedMinutes ?? null,
    JSON.stringify(payload.tags ?? []),
    payload.status === "PUBLISHED" ? now : null,
    now,
    now,
  );

  return lessonId;
}

export function updateLesson(
  lessonId: string,
  payload: {
    subjectId?: string | null;
    title?: string;
    shortDescription?: string;
    contentMarkdown?: string;
    coverImageUrl?: string | null;
    difficulty?: DifficultyLevel | null;
    subject?: string;
    topic?: string;
    unit?: string | null;
    status?: LessonStatus;
    estimatedMinutes?: number | null;
    tags?: string[];
  },
) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.title !== undefined) {
    updates.push("title = ?");
    values.push(payload.title);
  }
  if (payload.shortDescription !== undefined) {
    updates.push("short_description = ?");
    values.push(payload.shortDescription);
  }
  if (payload.contentMarkdown !== undefined) {
    updates.push("content_markdown = ?");
    values.push(payload.contentMarkdown);
  }
  if (payload.coverImageUrl !== undefined) {
    updates.push("cover_image_url = ?");
    values.push(payload.coverImageUrl);
  }
  if (payload.subjectId !== undefined) {
    updates.push("subject_id = ?");
    values.push(payload.subjectId);
  }
  if (payload.difficulty !== undefined) {
    updates.push("difficulty = ?");
    values.push(payload.difficulty);
  }
  if (payload.subject !== undefined) {
    updates.push("subject = ?");
    values.push(payload.subject);
  }
  if (payload.topic !== undefined) {
    updates.push("topic = ?");
    values.push(payload.topic);
  }
  if (payload.unit !== undefined) {
    updates.push("unit = ?");
    values.push(payload.unit);
  }
  if (payload.status !== undefined) {
    updates.push("status = ?");
    values.push(payload.status);
    if (payload.status === "PUBLISHED") {
      updates.push("published_at = COALESCE(published_at, ?)");
      values.push(new Date().toISOString());
    }
  }
  if (payload.estimatedMinutes !== undefined) {
    updates.push("estimated_minutes = ?");
    values.push(payload.estimatedMinutes);
  }
  if (payload.tags !== undefined) {
    updates.push("tags_json = ?");
    values.push(JSON.stringify(payload.tags));
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(lessonId);

  db.prepare(`UPDATE lessons SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function archiveLesson(lessonId: string) {
  const db = getDb();
  db.prepare("UPDATE lessons SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    lessonId,
  );
}

export function deleteLesson(lessonId: string) {
  const db = getDb();

  // quizzes.lesson_id and recommendations.* lack ON DELETE CASCADE — clean dependents first.
  db.transaction(() => {
    db.prepare("DELETE FROM recommendations WHERE lesson_id = ?").run(lessonId);

    const quizIds = db
      .prepare<{ id: string }[]>("SELECT id FROM quizzes WHERE lesson_id = ?")
      .all(lessonId)
      .map((row) => row.id);

    for (const quizId of quizIds) {
      db.prepare("DELETE FROM recommendations WHERE quiz_id = ?").run(quizId);
      db.prepare("DELETE FROM quizzes WHERE id = ?").run(quizId);
    }

    db.prepare("DELETE FROM lessons WHERE id = ?").run(lessonId);
  })();
}

export function recordLessonView(payload: {
  lessonId: string;
  studentId: string;
  timeSpentSec?: number;
  completionPercent?: number;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO lesson_views (id, lesson_id, student_id, viewed_at, time_spent_sec)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    payload.lessonId,
    payload.studentId,
    now,
    payload.timeSpentSec ?? 0,
  );

  const existing = db
    .prepare<{
      id: string;
      completion_percent: number;
      time_spent_sec: number;
    }>(
      `SELECT id, completion_percent, time_spent_sec
       FROM lesson_progress
       WHERE lesson_id = ? AND student_id = ?
       LIMIT 1`,
    )
    .get(payload.lessonId, payload.studentId);

  const nextCompletion = Math.max(existing?.completion_percent ?? 0, payload.completionPercent ?? 0);
  const nextTime = (existing?.time_spent_sec ?? 0) + (payload.timeSpentSec ?? 0);
  const status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" =
    nextCompletion >= 100 ? "COMPLETED" : nextCompletion > 0 ? "IN_PROGRESS" : "NOT_STARTED";

  if (!existing) {
    db.prepare(
      `INSERT INTO lesson_progress (
        id, lesson_id, student_id, status, completion_percent, time_spent_sec,
        last_viewed_at, completed_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      payload.lessonId,
      payload.studentId,
      status,
      nextCompletion,
      nextTime,
      now,
      status === "COMPLETED" ? now : null,
      now,
      now,
    );
    return;
  }

  db.prepare(
    `UPDATE lesson_progress
     SET status = ?, completion_percent = ?, time_spent_sec = ?,
         last_viewed_at = ?, completed_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    status,
    nextCompletion,
    nextTime,
    now,
    status === "COMPLETED" ? now : null,
    now,
    existing.id,
  );
}

export function getLessonProgressForStudent(studentId: string, lessonId: string) {
  const db = getDb();
  const row = db
    .prepare<{
      status: string;
      completion_percent: number;
      time_spent_sec: number;
      last_viewed_at: string | null;
      completed_at: string | null;
    }>(
      `SELECT status, completion_percent, time_spent_sec, last_viewed_at, completed_at
       FROM lesson_progress
       WHERE student_id = ? AND lesson_id = ?
       LIMIT 1`,
    )
    .get(studentId, lessonId);

  if (!row) {
    return {
      status: "NOT_STARTED",
      completionPercent: 0,
      timeSpentSec: 0,
      lastViewedAt: null,
      completedAt: null,
    };
  }

  return {
    status: row.status,
    completionPercent: row.completion_percent,
    timeSpentSec: row.time_spent_sec,
    lastViewedAt: row.last_viewed_at,
    completedAt: row.completed_at,
  };
}

export function listLessonAnalytics(teacherId: string, filters?: { sectionId?: string; subjectId?: string }) {
  const db = getDb();
  const sectionId = filters?.sectionId?.trim();
  const subjectId = filters?.subjectId?.trim();
  const studentScope: string[] = [
    "sst_scope.teacher_id = ?",
    "sst_scope.is_active = 1",
    "sec_scope.status = 'ACTIVE'",
    "ss_scope.is_active = 1",
    "(l.subject_id = sst_scope.subject_id OR lower(l.subject) = lower(sub_scope.name))",
    "EXISTS (SELECT 1 FROM lesson_sections ls_scope WHERE ls_scope.lesson_id = l.id AND ls_scope.section_id = sst_scope.section_id)",
  ];
  const studentScopeValues: unknown[] = [teacherId];
  const where: string[] = [
    "l.status != 'ARCHIVED'",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id
      JOIN subjects s ON s.id = sst.subject_id
      WHERE sec.status = 'ACTIVE'
        AND sst.teacher_id = ?
        AND sst.is_active = 1
        AND (
          l.subject_id = sst.subject_id
          OR lower(l.subject) = lower(s.name)
        )
        AND EXISTS (SELECT 1 FROM lesson_sections ls_match WHERE ls_match.lesson_id = l.id AND ls_match.section_id = sst.section_id)
    )`,
  ];
  const values: unknown[] = [teacherId];

  if (sectionId) {
    where.push("EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = l.id AND ls.section_id = ?)");
    values.push(sectionId);
    studentScope.push("sst_scope.section_id = ?");
    studentScopeValues.push(sectionId);
  }

  if (subjectId) {
    where.push("(l.subject_id = ? OR EXISTS (SELECT 1 FROM subjects s2 WHERE s2.id = ? AND lower(l.subject) = lower(s2.name)))");
    values.push(subjectId, subjectId);
    studentScope.push("sst_scope.subject_id = ?");
    studentScopeValues.push(subjectId);
  }
  const studentScopeSql = studentScope.join(" AND ");

  return db
    .prepare<
      {
        lesson_id: string;
        title: string;
        views: number;
        unique_students: number;
        completion_rate: number;
        avg_time_spent: number;
        quiz_participation: number;
        quiz_pass_rate: number;
      }[]
    >(
      `SELECT
        l.id AS lesson_id,
        l.title,
        COUNT(lv.id) AS views,
        COUNT(DISTINCT lv.student_id) AS unique_students,
        COALESCE(AVG(CASE WHEN lp.status = 'COMPLETED' THEN 100 ELSE lp.completion_percent END), 0) AS completion_rate,
        COALESCE(AVG(lp.time_spent_sec), 0) AS avg_time_spent,
        COALESCE(COUNT(DISTINCT qa.student_id), 0) AS quiz_participation,
        COALESCE(AVG(CASE WHEN qa.outcome = 'PASSED' THEN 100 ELSE 0 END), 0) AS quiz_pass_rate
      FROM lessons l
      LEFT JOIN lesson_views lv ON lv.lesson_id = l.id
        AND EXISTS (
          SELECT 1
          FROM section_students ss_scope
          JOIN section_subject_teachers sst_scope ON sst_scope.section_id = ss_scope.section_id
          JOIN sections sec_scope ON sec_scope.id = sst_scope.section_id
          JOIN subjects sub_scope ON sub_scope.id = sst_scope.subject_id
          WHERE ss_scope.student_id = lv.student_id
            AND ${studentScopeSql}
        )
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
        AND EXISTS (
          SELECT 1
          FROM section_students ss_scope
          JOIN section_subject_teachers sst_scope ON sst_scope.section_id = ss_scope.section_id
          JOIN sections sec_scope ON sec_scope.id = sst_scope.section_id
          JOIN subjects sub_scope ON sub_scope.id = sst_scope.subject_id
          WHERE ss_scope.student_id = lp.student_id
            AND ${studentScopeSql}
        )
      LEFT JOIN quizzes q ON q.lesson_id = l.id AND q.status != 'ARCHIVED'
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.status = 'GRADED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss_scope
          JOIN section_subject_teachers sst_scope ON sst_scope.section_id = ss_scope.section_id
          JOIN sections sec_scope ON sec_scope.id = sst_scope.section_id
          JOIN subjects sub_scope ON sub_scope.id = sst_scope.subject_id
          WHERE ss_scope.student_id = qa.student_id
            AND ${studentScopeSql}
            AND (
              EXISTS (SELECT 1 FROM quiz_sections qs_scope WHERE qs_scope.quiz_id = q.id AND qs_scope.section_id = sst_scope.section_id)
              OR EXISTS (SELECT 1 FROM lesson_sections ls_scope_q WHERE ls_scope_q.lesson_id = q.lesson_id AND ls_scope_q.section_id = sst_scope.section_id)
            )
        )
      WHERE ${where.join(" AND ")}
      GROUP BY l.id
      ORDER BY l.updated_at DESC`,
    )
    .all(...studentScopeValues, ...studentScopeValues, ...studentScopeValues, ...values)
    .map((row) => ({
      lessonId: row.lesson_id,
      title: row.title,
      views: row.views,
      uniqueStudents: row.unique_students,
      completionRate: Number(row.completion_rate.toFixed(1)),
      avgTimeSpentSec: Math.round(row.avg_time_spent),
      quizParticipation: row.quiz_participation,
      quizPassRate: Number(row.quiz_pass_rate.toFixed(1)),
    }));
}

export function countPublishedLessons() {
  const db = getDb();
  return (
    db.prepare<{ total: number }>("SELECT COUNT(*) as total FROM lessons WHERE status = 'PUBLISHED'").get()
      ?.total ?? 0
  );
}

export function countLessonsByTeacher(teacherId: string) {
  const db = getDb();
  return (
    db
      .prepare<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM lessons l
         WHERE EXISTS (
           SELECT 1
           FROM teacher_subjects ts
           JOIN subjects s ON s.id = ts.subject_id
           WHERE ts.teacher_id = ?
             AND ts.is_active = 1
             AND (
               l.subject_id = ts.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )`,
      )
      .get(teacherId)?.total ?? 0
  );
}

export function listStudentLessons(studentId: string, params?: { subject?: string }) {
  const db = getDb();
  const where: string[] = ["l.status = 'PUBLISHED'"];
  const values: unknown[] = [studentId, studentId];
  if (params?.subject) {
    where.push("lower(l.subject) = lower(?)");
    values.push(params.subject);
  }

  const rows = db
    .prepare<
      {
        id: string;
        title: string;
        short_description: string;
        subject: string;
        topic: string;
        difficulty: DifficultyLevel | null;
        cover_image_url: string | null;
        teacher_name: string;
        estimated_minutes: number | null;
        progress_status: string | null;
        completion_percent: number | null;
        quiz_count: number;
      }[]
    >(
      `SELECT
        l.id,
        l.title,
        l.short_description,
        l.subject,
        l.topic,
        l.difficulty,
        l.cover_image_url,
        u.full_name AS teacher_name,
        l.estimated_minutes,
        lp.status AS progress_status,
        lp.completion_percent,
        COUNT(q.id) AS quiz_count
      FROM lessons l
      JOIN lesson_sections ls ON ls.lesson_id = l.id
      JOIN section_students ss ON ss.section_id = ls.section_id AND ss.student_id = ? AND ss.is_active = 1
      JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
      JOIN section_subjects ssub ON ssub.section_id = sec.id
      JOIN subjects sub ON sub.id = ssub.subject_id
        AND sub.is_active = 1
        AND (l.subject_id = sub.id OR lower(l.subject) = lower(sub.name))
      JOIN users u ON u.id = l.teacher_id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = ?
      LEFT JOIN quizzes q ON q.lesson_id = l.id AND q.status = 'PUBLISHED'
      WHERE ${where.join(" AND ")}
      GROUP BY l.id
      ORDER BY l.published_at DESC`,
    )
    .all(...values);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    shortDescription: row.short_description,
    subject: row.subject,
    topic: row.topic,
    difficulty: row.difficulty,
    coverImageUrl: row.cover_image_url,
    teacherName: row.teacher_name,
    estimatedMinutes: row.estimated_minutes,
    quizCount: row.quiz_count,
    progressStatus: row.progress_status ?? "NOT_STARTED",
    completionPercent: row.completion_percent ?? 0,
  }));
}

export function canStudentAccessLesson(studentId: string, lessonId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM lessons l
       JOIN lesson_sections ls ON ls.lesson_id = l.id
       JOIN section_students ss ON ss.section_id = ls.section_id
       JOIN sections sec ON sec.id = ss.section_id
       JOIN section_subjects ssub ON ssub.section_id = sec.id
       JOIN subjects sub ON sub.id = ssub.subject_id
         AND sub.is_active = 1
         AND (l.subject_id = sub.id OR lower(l.subject) = lower(sub.name))
       WHERE l.id = ?
         AND l.status = 'PUBLISHED'
         AND ss.student_id = ?
         AND ss.is_active = 1
         AND sec.status = 'ACTIVE'`,
    )
    .get(lessonId, studentId);

  return (row?.total ?? 0) > 0;
}

export function studentLessonStats(studentId: string) {
  const db = getDb();
  const row = db
    .prepare<{
      total_lessons: number;
      completed_lessons: number;
      avg_completion: number;
    }>(
      `SELECT
         (
           SELECT COUNT(DISTINCT l.id)
           FROM lessons l
           JOIN lesson_sections ls ON ls.lesson_id = l.id
           JOIN section_students ss ON ss.section_id = ls.section_id
           JOIN sections sec ON sec.id = ss.section_id
           JOIN section_subjects ssub ON ssub.section_id = sec.id
           JOIN subjects sub ON sub.id = ssub.subject_id
             AND sub.is_active = 1
             AND (l.subject_id = sub.id OR lower(l.subject) = lower(sub.name))
           WHERE l.status = 'PUBLISHED'
             AND ss.student_id = ?
             AND ss.is_active = 1
             AND sec.status = 'ACTIVE'
         ) as total_lessons,
         COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) as completed_lessons,
         COALESCE(AVG(completion_percent), 0) as avg_completion
       FROM lesson_progress
       WHERE student_id = ?`,
    )
    .get(studentId, studentId);

  return {
    totalLessons: row?.total_lessons ?? 0,
    completedLessons: row?.completed_lessons ?? 0,
    averageCompletion: Number((row?.avg_completion ?? 0).toFixed(1)),
  };
}

export function isTeacherLessonOwner(teacherId: string, lessonId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      "SELECT COUNT(*) as total FROM lessons WHERE id = ? AND teacher_id = ?",
    )
    .get(lessonId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function canTeacherAccessLesson(teacherId: string, lessonId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM lessons l
       WHERE l.id = ?
         AND EXISTS (
           SELECT 1
           FROM teacher_subjects ts
           JOIN subjects s ON s.id = ts.subject_id
           WHERE ts.teacher_id = ?
             AND ts.is_active = 1
             AND (
               l.subject_id = ts.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )`,
    )
    .get(lessonId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function isPublishedLesson(lessonId: string) {
  const db = getDb();
  const row = db
    .prepare<{ is_published: number }>(
      "SELECT CASE WHEN status = 'PUBLISHED' THEN 1 ELSE 0 END AS is_published FROM lessons WHERE id = ?",
    )
    .get(lessonId);

  return row ? toBoolean(row.is_published) : false;
}
