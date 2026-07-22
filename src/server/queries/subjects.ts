import crypto from "node:crypto";
import { getDb, nowIso, toBoolean } from "@/lib/db";

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
  lesson_count: number;
  quiz_count: number;
  teacher_count: number;
};

function mapSubject(row: SubjectRow) {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: toBoolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lessonCount: row.lesson_count,
    quizCount: row.quiz_count,
    teacherCount: row.teacher_count,
  };
}

export function listSubjects(params?: { search?: string; isActive?: boolean }) {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];

  if (params?.search) {
    where.push("(s.name LIKE ? OR s.code LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`);
  }

  if (params?.isActive !== undefined) {
    where.push("s.is_active = ?");
    values.push(params.isActive ? 1 : 0);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare<SubjectRow[]>(
      `SELECT
        s.id,
        s.name,
        s.code,
        s.description,
        s.is_active,
        s.created_at,
        s.updated_at,
        (
          SELECT COUNT(*)
          FROM lessons l
          WHERE lower(l.subject) = lower(s.name)
        ) AS lesson_count,
        (
          SELECT COUNT(*)
          FROM quizzes q
          JOIN lessons l ON l.id = q.lesson_id
          WHERE lower(l.subject) = lower(s.name)
        ) AS quiz_count,
        (
          SELECT COUNT(*)
          FROM teacher_subjects ts
          WHERE ts.subject_id = s.id AND ts.is_active = 1
        ) AS teacher_count
      FROM subjects s
      ${whereSql}
      ORDER BY s.name ASC`,
    )
    .all(...values);

  return rows.map(mapSubject);
}

export function listTeacherSubjects(teacherId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        name: string;
        code: string;
      }[]
    >(
      `SELECT DISTINCT s.id, s.name, s.code
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id
      JOIN subjects s ON s.id = sst.subject_id
      WHERE sst.teacher_id = ?
        AND sst.is_active = 1
        AND sec.status = 'ACTIVE'
        AND s.is_active = 1
      ORDER BY s.name ASC`,
    )
    .all(teacherId);
}

export function listTeacherSubjectSummaries(teacherId: string, sectionId?: string) {
  const db = getDb();
  const normalizedSectionId = sectionId?.trim();
  const sectionCountFilter = normalizedSectionId ? " AND sst.section_id = ?" : "";
  const lessonSectionFilter = normalizedSectionId ? " AND sec.id = ?" : "";
  const existsSectionFilter = normalizedSectionId ? " AND sst.section_id = ?" : "";

  const values: unknown[] = [teacherId];
  if (normalizedSectionId) {
    values.push(normalizedSectionId);
  }
  values.push(teacherId, teacherId);
  if (normalizedSectionId) {
    values.push(normalizedSectionId);
  }
  values.push(teacherId);
  if (normalizedSectionId) {
    values.push(normalizedSectionId);
  }

  return db
    .prepare<
      {
        id: string;
        name: string;
        code: string;
        description: string | null;
        section_count: number;
        lesson_count: number;
      }[]
    >(
      `SELECT
        s.id,
        s.name,
        s.code,
        s.description,
        (
          SELECT COUNT(DISTINCT sec.id)
          FROM sections sec
          JOIN section_subject_teachers sst ON sst.section_id = sec.id
          WHERE sst.subject_id = s.id
            AND sec.status = 'ACTIVE'
            AND sst.teacher_id = ?
            AND sst.is_active = 1
            ${sectionCountFilter}
        ) AS section_count,
        (
          SELECT COUNT(DISTINCT l.id)
          FROM lessons l
          JOIN lesson_sections ls ON ls.lesson_id = l.id
          JOIN sections sec ON sec.id = ls.section_id AND sec.status = 'ACTIVE'
          JOIN section_subject_teachers sst ON sst.section_id = sec.id
          WHERE l.teacher_id = ?
            AND sst.teacher_id = ?
            AND sst.subject_id = s.id
            AND sst.is_active = 1
            AND (
              l.subject_id = s.id
              OR lower(l.subject) = lower(s.name)
            )
            ${lessonSectionFilter}
        ) AS lesson_count
      FROM subjects s
      WHERE s.is_active = 1
        AND EXISTS (
          SELECT 1
          FROM section_subject_teachers sst
          JOIN sections sec ON sec.id = sst.section_id
          WHERE sst.teacher_id = ?
            AND sst.subject_id = s.id
            AND sst.is_active = 1
            AND sec.status = 'ACTIVE'
            ${existsSectionFilter}
        )
      ORDER BY s.name ASC`,
    )
    .all(...values)
    .map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      description: row.description,
      sectionCount: row.section_count,
      lessonCount: row.lesson_count,
    }));
}

export function getSubjectById(subjectId: string) {
  const db = getDb();
  const row = db
    .prepare<
      {
        id: string;
        name: string;
        code: string;
        description: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    >(
      `SELECT id, name, code, description, is_active, created_at, updated_at
       FROM subjects
       WHERE id = ?
       LIMIT 1`,
    )
    .get(subjectId);

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: toBoolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getSubjectByName(subjectName: string) {
  const db = getDb();
  const row = db
    .prepare<
      {
        id: string;
        name: string;
        code: string;
        description: string | null;
        is_active: number;
        created_at: string;
        updated_at: string;
      }
    >(
      `SELECT id, name, code, description, is_active, created_at, updated_at
       FROM subjects
       WHERE lower(name) = lower(?)
       LIMIT 1`,
    )
    .get(subjectName.trim());

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: toBoolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listStudentAssignedSubjects(studentId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        name: string;
        code: string;
      }[]
    >(
      `SELECT DISTINCT sub.id, sub.name, sub.code
      FROM section_students ss
      JOIN sections sec ON sec.id = ss.section_id
      JOIN section_subjects ssub ON ssub.section_id = sec.id
      JOIN subjects sub ON sub.id = ssub.subject_id
      WHERE ss.student_id = ?
        AND ss.is_active = 1
        AND sec.status = 'ACTIVE'
        AND sub.is_active = 1
      ORDER BY sub.name ASC`,
    )
    .all(studentId);
}

export function createSubject(payload: {
  name: string;
  code: string;
  description?: string;
  isActive?: boolean;
  createdById?: string;
}) {
  const db = getDb();
  const now = nowIso();
  const subjectId = crypto.randomUUID();

  db.prepare(
    `INSERT INTO subjects (
      id, name, code, description, is_active, created_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    subjectId,
    payload.name.trim(),
    payload.code.trim().toUpperCase(),
    payload.description?.trim() || null,
    payload.isActive === false ? 0 : 1,
    payload.createdById ?? null,
    now,
    now,
  );

  return subjectId;
}

export function updateSubject(
  subjectId: string,
  payload: {
    name?: string;
    code?: string;
    description?: string | null;
    isActive?: boolean;
  },
) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.name !== undefined) {
    updates.push("name = ?");
    values.push(payload.name.trim());
  }
  if (payload.code !== undefined) {
    updates.push("code = ?");
    values.push(payload.code.trim().toUpperCase());
  }
  if (payload.description !== undefined) {
    updates.push("description = ?");
    values.push(payload.description?.trim() || null);
  }
  if (payload.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(payload.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(nowIso(), subjectId);
  db.prepare(`UPDATE subjects SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function deleteSubjectById(subjectId: string) {
  const db = getDb();

  const existing = db
    .prepare<{ id: string; name: string; code: string }>(
      `SELECT id, name, code
       FROM subjects
       WHERE id = ?
       LIMIT 1`,
    )
    .get(subjectId);

  if (!existing) {
    return {
      success: false as const,
      status: 404 as const,
      error: "Subject not found.",
    };
  }

  try {
    // FK rules: assignments/jobs CASCADE; lessons/sections/equations SET NULL.
    db.prepare("DELETE FROM subjects WHERE id = ?").run(subjectId);
    return {
      success: true as const,
      subject: existing,
    };
  } catch {
    return {
      success: false as const,
      status: 409 as const,
      error: "Unable to delete subject because dependent records still reference it.",
    };
  }
}

export function setTeacherSubjects(teacherId: string, subjectIds: string[], assignedById?: string) {
  const db = getDb();
  const now = nowIso();
  const ids = Array.from(new Set(subjectIds.filter(Boolean)));

  db.transaction(() => {
    db.prepare(
      "UPDATE teacher_subjects SET is_active = 0, ended_at = ? WHERE teacher_id = ? AND is_active = 1",
    ).run(now, teacherId);

    for (const subjectId of ids) {
      db.prepare(
        `INSERT INTO teacher_subjects (
          id, teacher_id, subject_id, assigned_by_id, is_active, assigned_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), teacherId, subjectId, assignedById ?? null, now);
    }
  })();
}

export function listSubjectTeachers(subjectId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        full_name: string;
        email: string;
        is_active: number;
      }[]
    >(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.is_active
      FROM teacher_subjects ts
      JOIN users u ON u.id = ts.teacher_id
      WHERE ts.subject_id = ? AND ts.is_active = 1 AND u.role = 'TEACHER'
      ORDER BY u.full_name ASC`,
    )
    .all(subjectId)
    .map((teacher) => ({
      id: teacher.id,
      fullName: teacher.full_name,
      email: teacher.email,
      isActive: toBoolean(teacher.is_active),
    }));
}

export function teacherHasSubjectAssignment(teacherId: string, subjectId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM section_subject_teachers sst
       JOIN sections sec ON sec.id = sst.section_id
       WHERE sst.teacher_id = ?
         AND sst.subject_id = ?
         AND sst.is_active = 1
         AND sec.status = 'ACTIVE'`,
    )
    .get(teacherId, subjectId);

  return (row?.total ?? 0) > 0;
}

export function teacherHasSubjectNameAssignment(teacherId: string, subjectName: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM section_subject_teachers sst
       JOIN sections sec ON sec.id = sst.section_id
       JOIN subjects s ON s.id = sst.subject_id
       WHERE sst.teacher_id = ?
         AND sst.is_active = 1
         AND sec.status = 'ACTIVE'
         AND lower(s.name) = lower(?)`,
    )
    .get(teacherId, subjectName.trim());

  return (row?.total ?? 0) > 0;
}

export function listSubjectTeacherAssignments(subjectIds?: string[]) {
  const db = getDb();
  const hasSubjectFilter = Array.isArray(subjectIds) && subjectIds.length > 0;
  const placeholders = hasSubjectFilter ? subjectIds.map(() => "?").join(", ") : "";
  const whereSql = hasSubjectFilter ? `AND ts.subject_id IN (${placeholders})` : "";
  const rows = db
    .prepare<
      {
        subject_id: string;
        teacher_id: string;
        full_name: string;
        email: string;
        is_active: number;
      }[]
    >(
      `SELECT
        ts.subject_id,
        u.id AS teacher_id,
        u.full_name,
        u.email,
        u.is_active
      FROM teacher_subjects ts
      JOIN users u ON u.id = ts.teacher_id
      WHERE ts.is_active = 1 AND u.role = 'TEACHER'
      ${whereSql}
      ORDER BY ts.subject_id ASC, u.full_name ASC`,
    )
    .all(...(hasSubjectFilter ? subjectIds : []));

  const mapping: Record<string, { id: string; fullName: string; email: string; isActive: boolean }[]> = {};

  for (const row of rows) {
    if (!mapping[row.subject_id]) {
      mapping[row.subject_id] = [];
    }
    mapping[row.subject_id].push({
      id: row.teacher_id,
      fullName: row.full_name,
      email: row.email,
      isActive: toBoolean(row.is_active),
    });
  }

  return mapping;
}

export function addTeacherSubjectAssignment(subjectId: string, teacherId: string, assignedById?: string) {
  const db = getDb();
  const now = nowIso();
  const active = db
    .prepare<{ total: number }>(
      "SELECT COUNT(*) AS total FROM teacher_subjects WHERE teacher_id = ? AND subject_id = ? AND is_active = 1",
    )
    .get(teacherId, subjectId);

  if ((active?.total ?? 0) > 0) {
    return;
  }

  db.prepare(
    `INSERT INTO teacher_subjects (
      id, teacher_id, subject_id, assigned_by_id, is_active, assigned_at
    ) VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(crypto.randomUUID(), teacherId, subjectId, assignedById ?? null, now);
}

export function removeTeacherSubjectAssignment(subjectId: string, teacherId: string) {
  const db = getDb();
  db.prepare(
    `UPDATE teacher_subjects
     SET is_active = 0, ended_at = ?
     WHERE subject_id = ? AND teacher_id = ? AND is_active = 1`,
  ).run(nowIso(), subjectId, teacherId);
}
