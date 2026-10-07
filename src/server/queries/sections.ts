import crypto from "node:crypto";
import { getDb, nowIso } from "@/lib/db";
import type { SectionStatus } from "@/domain/types";
import { getUserById } from "@/server/queries/users";

type SectionRow = {
  id: string;
  teacher_id: string;
  teacher_name: string;
  subject_id: string | null;
  subject_name: string | null;
  subject_ids: string | null;
  name: string;
  grade_level: string;
  school_year: string;
  status: SectionStatus;
  description: string | null;
  created_at: string;
  updated_at: string;
  student_count: number;
};

type SubjectTeacherAssignment = {
  subjectId: string;
  teacherId: string;
};

function mapSection(row: SectionRow) {
  const subjectIds = row.subject_ids
    ? row.subject_ids
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    subjectId: row.subject_id ?? subjectIds[0] ?? null,
    subjectName: row.subject_name,
    subjectIds,
    name: row.name,
    gradeLevel: row.grade_level,
    schoolYear: row.school_year,
    status: row.status,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    studentCount: row.student_count,
  };
}

function normalizeSubjectTeacherAssignments(payload: {
  subjectTeacherAssignments?: SubjectTeacherAssignment[];
  subjectIds?: string[];
  subjectId?: string | null;
  teacherId?: string | null;
}) {
  if (payload.subjectTeacherAssignments) {
    const map = new Map<string, string>();
    for (const assignment of payload.subjectTeacherAssignments) {
      const subjectId = assignment.subjectId?.trim();
      const teacherId = assignment.teacherId?.trim();
      if (!subjectId || !teacherId) {
        continue;
      }
      map.set(subjectId, teacherId);
    }
    return Array.from(map.entries()).map(([subjectId, teacherId]) => ({ subjectId, teacherId }));
  }

  const fallbackTeacherId = payload.teacherId?.trim();
  const subjectIds = Array.from(
    new Set((payload.subjectIds?.length ? payload.subjectIds : payload.subjectId ? [payload.subjectId] : []).filter(Boolean)),
  )
    .map((subjectId) => subjectId.trim())
    .filter(Boolean);

  if (!fallbackTeacherId || subjectIds.length === 0) {
    return [] as SubjectTeacherAssignment[];
  }

  return subjectIds.map((subjectId) => ({
    subjectId,
    teacherId: fallbackTeacherId,
  }));
}

export function listSections(params?: {
  teacherId?: string;
  status?: SectionStatus;
  search?: string;
  schoolYear?: string;
}) {
  const db = getDb();
  const where: string[] = [];
  const values: unknown[] = [];

  if (params?.teacherId) {
    where.push(
      "EXISTS (SELECT 1 FROM section_subject_teachers sst WHERE sst.section_id = s.id AND sst.teacher_id = ? AND sst.is_active = 1)",
    );
    values.push(params.teacherId);
  }
  if (params?.status) {
    where.push("s.status = ?");
    values.push(params.status);
  }
  if (params?.schoolYear) {
    where.push("s.school_year = ?");
    values.push(params.schoolYear);
  }
  if (params?.search) {
    where.push(
      `(s.name LIKE ? OR s.grade_level LIKE ? OR EXISTS (
        SELECT 1
        FROM section_subjects sss
        JOIN subjects subj ON subj.id = sss.subject_id
        WHERE sss.section_id = s.id AND subj.name LIKE ?
      ))`,
    );
    values.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = db
    .prepare<SectionRow[]>(
      `SELECT
        s.id,
        s.teacher_id,
        COALESCE(
          (
            SELECT group_concat(teacher_names.full_name, ', ')
            FROM (
              SELECT DISTINCT tu.full_name AS full_name
              FROM section_subject_teachers sst
              JOIN users tu ON tu.id = sst.teacher_id
              WHERE sst.section_id = s.id AND sst.is_active = 1
              ORDER BY tu.full_name ASC
            ) teacher_names
          ),
          t.full_name
        ) AS teacher_name,
        s.subject_id,
        COALESCE(
          (
            SELECT group_concat(subj.name, ', ')
            FROM section_subjects sss
            JOIN subjects subj ON subj.id = sss.subject_id
            WHERE sss.section_id = s.id
          ),
          sub.name
        ) AS subject_name,
        (
          SELECT group_concat(sss.subject_id, ',')
          FROM section_subjects sss
          WHERE sss.section_id = s.id
        ) AS subject_ids,
        s.name,
        s.grade_level,
        s.school_year,
        s.status,
        s.description,
        s.created_at,
        s.updated_at,
        (
          SELECT COUNT(*)
          FROM section_students ss
          WHERE ss.section_id = s.id AND ss.is_active = 1
        ) AS student_count
      FROM sections s
      JOIN users t ON t.id = s.teacher_id
      LEFT JOIN subjects sub ON sub.id = s.subject_id
      ${whereSql}
      ORDER BY s.updated_at DESC`,
    )
    .all(...values);

  return rows.map(mapSection);
}

export function getSectionById(sectionId: string) {
  const db = getDb();
  const row = db
    .prepare<SectionRow>(
      `SELECT
        s.id,
        s.teacher_id,
        COALESCE(
          (
            SELECT group_concat(teacher_names.full_name, ', ')
            FROM (
              SELECT DISTINCT tu.full_name AS full_name
              FROM section_subject_teachers sst
              JOIN users tu ON tu.id = sst.teacher_id
              WHERE sst.section_id = s.id AND sst.is_active = 1
              ORDER BY tu.full_name ASC
            ) teacher_names
          ),
          t.full_name
        ) AS teacher_name,
        s.subject_id,
        COALESCE(
          (
            SELECT group_concat(subj.name, ', ')
            FROM section_subjects sss
            JOIN subjects subj ON subj.id = sss.subject_id
            WHERE sss.section_id = s.id
          ),
          sub.name
        ) AS subject_name,
        (
          SELECT group_concat(sss.subject_id, ',')
          FROM section_subjects sss
          WHERE sss.section_id = s.id
        ) AS subject_ids,
        s.name,
        s.grade_level,
        s.school_year,
        s.status,
        s.description,
        s.created_at,
        s.updated_at,
        (
          SELECT COUNT(*)
          FROM section_students ss
          WHERE ss.section_id = s.id AND ss.is_active = 1
        ) AS student_count
      FROM sections s
      JOIN users t ON t.id = s.teacher_id
      LEFT JOIN subjects sub ON sub.id = s.subject_id
      WHERE s.id = ?
      LIMIT 1`,
    )
    .get(sectionId);

  if (!row) {
    return null;
  }

  const students = db
    .prepare<
      {
        student_id: string;
        full_name: string;
        email: string;
        enrolled_at: string;
      }[]
    >(
      `SELECT
        u.id AS student_id,
        u.full_name,
        u.email,
        ss.enrolled_at
      FROM section_students ss
      JOIN users u ON u.id = ss.student_id
      WHERE ss.section_id = ? AND ss.is_active = 1
      ORDER BY u.full_name ASC`,
    )
    .all(sectionId)
    .map((entry) => ({
      studentId: entry.student_id,
      fullName: entry.full_name,
      email: entry.email,
      enrolledAt: entry.enrolled_at,
    }));

  const subjects = db
    .prepare<
      {
        subject_id: string;
        subject_name: string;
        subject_code: string;
        teacher_id: string | null;
        teacher_name: string | null;
      }[]
    >(
      `SELECT
        subj.id AS subject_id,
        subj.name AS subject_name,
        subj.code AS subject_code,
        sst.teacher_id,
        tu.full_name AS teacher_name
      FROM section_subjects ss
      JOIN subjects subj ON subj.id = ss.subject_id
      LEFT JOIN section_subject_teachers sst ON sst.id = (
        SELECT sst2.id
        FROM section_subject_teachers sst2
        WHERE sst2.section_id = ss.section_id
          AND sst2.subject_id = ss.subject_id
          AND sst2.is_active = 1
        ORDER BY sst2.assigned_at DESC
        LIMIT 1
      )
      LEFT JOIN users tu ON tu.id = sst.teacher_id
      WHERE ss.section_id = ?
      ORDER BY subj.name ASC`,
    )
    .all(sectionId)
    .map((entry) => ({
      subjectId: entry.subject_id,
      name: entry.subject_name,
      code: entry.subject_code,
      teacherId: entry.teacher_id,
      teacherName: entry.teacher_name,
    }));

  return {
    ...mapSection(row),
    subjects,
    students,
  };
}

export function createSection(payload: {
  teacherId: string;
  subjectId?: string | null;
  subjectIds?: string[];
  subjectTeacherAssignments?: SubjectTeacherAssignment[];
  name: string;
  gradeLevel: string;
  schoolYear: string;
  status?: SectionStatus;
  description?: string | null;
  studentIds?: string[];
  assignedById?: string;
}) {
  const db = getDb();
  const sectionId = crypto.randomUUID();
  const now = nowIso();
  const studentIds = Array.from(new Set((payload.studentIds ?? []).filter(Boolean)));
  assertStudentsAvailableForSection(null, studentIds);
  const subjectTeacherAssignments = normalizeSubjectTeacherAssignments(payload);
  const subjectIds = Array.from(new Set(subjectTeacherAssignments.map((assignment) => assignment.subjectId)));
  const uniqueTeacherIds = Array.from(new Set(subjectTeacherAssignments.map((assignment) => assignment.teacherId)));
  const primarySubjectId = subjectIds[0] ?? payload.subjectId ?? null;
  const primaryTeacherId = subjectTeacherAssignments[0]?.teacherId ?? payload.teacherId;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO sections (
        id, teacher_id, subject_id, name, grade_level, school_year, status, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      sectionId,
      primaryTeacherId,
      primarySubjectId,
      payload.name.trim(),
      payload.gradeLevel.trim(),
      payload.schoolYear.trim(),
      payload.status ?? "ACTIVE",
      payload.description?.trim() || null,
      now,
      now,
    );

    for (const studentId of studentIds) {
      db.prepare(
        `INSERT INTO section_students (
          id, section_id, student_id, assigned_by_id, is_active, enrolled_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), sectionId, studentId, payload.assignedById ?? null, now);
    }

    for (const teacherId of uniqueTeacherIds) {
      db.prepare(
        `INSERT INTO section_teachers (
          id, section_id, teacher_id, assigned_by_id, is_active, assigned_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), sectionId, teacherId, payload.assignedById ?? null, now);
    }

    for (const subjectId of subjectIds) {
      db.prepare(
        `INSERT INTO section_subjects (
          id, section_id, subject_id, assigned_by_id, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), sectionId, subjectId, payload.assignedById ?? null, now);

    }

    for (const assignment of subjectTeacherAssignments) {
      db.prepare(
        `INSERT INTO section_subject_teachers (
          id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL)`,
      ).run(
        crypto.randomUUID(),
        sectionId,
        assignment.subjectId,
        assignment.teacherId,
        payload.assignedById ?? null,
        now,
      );
    }
  })();

  return sectionId;
}

export function updateSection(
  sectionId: string,
  payload: {
    teacherId?: string;
    subjectId?: string | null;
    subjectIds?: string[];
    subjectTeacherAssignments?: SubjectTeacherAssignment[];
    name?: string;
    gradeLevel?: string;
    schoolYear?: string;
    status?: SectionStatus;
    description?: string | null;
  },
) {
  const db = getDb();
  const currentSection =
    db.prepare<{ teacher_id: string | null; subject_id: string | null }>(
      `SELECT teacher_id, subject_id FROM sections WHERE id = ? LIMIT 1`,
    ).get(sectionId) ?? null;
  if (!currentSection) {
    return;
  }

  const normalizedAssignments =
    payload.subjectTeacherAssignments !== undefined
      ? normalizeSubjectTeacherAssignments({
          subjectTeacherAssignments: payload.subjectTeacherAssignments,
          teacherId: payload.teacherId ?? undefined,
        })
      : undefined;

  const subjectPatchRequested =
    payload.subjectTeacherAssignments !== undefined || payload.subjectIds !== undefined || payload.subjectId !== undefined;
  const fallbackSubjectIds =
    payload.subjectIds !== undefined
      ? Array.from(new Set(payload.subjectIds.filter(Boolean)))
      : payload.subjectId !== undefined
        ? payload.subjectId
          ? [payload.subjectId]
          : []
        : undefined;
  const nextSubjectIds =
    normalizedAssignments !== undefined
      ? Array.from(new Set(normalizedAssignments.map((assignment) => assignment.subjectId)))
      : fallbackSubjectIds;
  const nextPrimarySubjectId =
    nextSubjectIds !== undefined ? nextSubjectIds[0] ?? null : payload.subjectId !== undefined ? payload.subjectId : undefined;
  const teacherPatchRequested = payload.teacherId !== undefined || payload.subjectTeacherAssignments !== undefined;
  const nextPrimaryTeacherId =
    normalizedAssignments !== undefined
      ? payload.teacherId?.trim() || normalizedAssignments[0]?.teacherId || currentSection.teacher_id
      : payload.teacherId;

  const updates: string[] = [];
  const values: unknown[] = [];
  const now = nowIso();

  if (teacherPatchRequested && nextPrimaryTeacherId !== undefined) {
    updates.push("teacher_id = ?");
    values.push(nextPrimaryTeacherId);
  }
  if (subjectPatchRequested) {
    updates.push("subject_id = ?");
    values.push(nextPrimarySubjectId);
  }
  if (payload.name !== undefined) {
    updates.push("name = ?");
    values.push(payload.name.trim());
  }
  if (payload.gradeLevel !== undefined) {
    updates.push("grade_level = ?");
    values.push(payload.gradeLevel.trim());
  }
  if (payload.schoolYear !== undefined) {
    updates.push("school_year = ?");
    values.push(payload.schoolYear.trim());
  }
  if (payload.status !== undefined) {
    updates.push("status = ?");
    values.push(payload.status);
  }
  if (payload.description !== undefined) {
    updates.push("description = ?");
    values.push(payload.description?.trim() || null);
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(now, sectionId);

  db.transaction(() => {
    db.prepare(`UPDATE sections SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    if (normalizedAssignments !== undefined) {
      const uniqueTeacherIds = Array.from(new Set(normalizedAssignments.map((assignment) => assignment.teacherId)));
      const uniqueSubjectIds = Array.from(new Set(normalizedAssignments.map((assignment) => assignment.subjectId)));

      db.prepare(`DELETE FROM section_teachers WHERE section_id = ?`).run(sectionId);
      for (const teacherId of uniqueTeacherIds) {
        db.prepare(
          `INSERT INTO section_teachers (
            id, section_id, teacher_id, assigned_by_id, is_active, assigned_at
          ) VALUES (?, ?, ?, NULL, 1, ?)`,
        ).run(crypto.randomUUID(), sectionId, teacherId, now);
      }

      db.prepare(`DELETE FROM section_subjects WHERE section_id = ?`).run(sectionId);
      for (const subjectId of uniqueSubjectIds) {
        db.prepare(
          `INSERT INTO section_subjects (
            id, section_id, subject_id, assigned_by_id, created_at
          ) VALUES (?, ?, ?, NULL, ?)`,
        ).run(crypto.randomUUID(), sectionId, subjectId, now);
      }

      db.prepare(`DELETE FROM section_subject_teachers WHERE section_id = ?`).run(sectionId);
      for (const assignment of normalizedAssignments) {
        db.prepare(
          `INSERT INTO section_subject_teachers (
            id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at
          ) VALUES (?, ?, ?, ?, NULL, 1, ?, NULL)`,
        ).run(crypto.randomUUID(), sectionId, assignment.subjectId, assignment.teacherId, now);
      }
      return;
    }

    if (payload.teacherId !== undefined) {
      db.prepare(`DELETE FROM section_teachers WHERE section_id = ?`).run(sectionId);
      db.prepare(
        `INSERT INTO section_teachers (
          id, section_id, teacher_id, assigned_by_id, is_active, assigned_at
        ) VALUES (?, ?, ?, NULL, 1, ?)`,
      ).run(crypto.randomUUID(), sectionId, payload.teacherId, now);
    }

    if (payload.subjectIds !== undefined) {
      db.prepare(`DELETE FROM section_subjects WHERE section_id = ?`).run(sectionId);
      for (const subjectId of Array.from(new Set(payload.subjectIds.filter(Boolean)))) {
        db.prepare(
          `INSERT INTO section_subjects (
            id, section_id, subject_id, assigned_by_id, created_at
          ) VALUES (?, ?, ?, NULL, ?)`,
        ).run(crypto.randomUUID(), sectionId, subjectId, now);
      }
    } else if (payload.subjectId !== undefined) {
      db.prepare(`DELETE FROM section_subjects WHERE section_id = ?`).run(sectionId);
      if (payload.subjectId) {
        db.prepare(
          `INSERT INTO section_subjects (
            id, section_id, subject_id, assigned_by_id, created_at
          ) VALUES (?, ?, ?, NULL, ?)`,
        ).run(crypto.randomUUID(), sectionId, payload.subjectId, now);
      }
    }

    if (payload.teacherId !== undefined || payload.subjectIds !== undefined || payload.subjectId !== undefined) {
      const effectiveTeacherId = payload.teacherId ?? currentSection.teacher_id;
      const effectiveSubjectIds = db
        .prepare<{ subject_id: string }[]>(
          `SELECT subject_id
           FROM section_subjects
           WHERE section_id = ?`,
        )
        .all(sectionId)
        .map((entry) => entry.subject_id)
        .filter(Boolean);

      db.prepare(`DELETE FROM section_subject_teachers WHERE section_id = ?`).run(sectionId);
      if (effectiveTeacherId) {
        for (const subjectId of Array.from(new Set(effectiveSubjectIds))) {
          db.prepare(
            `INSERT INTO section_subject_teachers (
              id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at
            ) VALUES (?, ?, ?, ?, NULL, 1, ?, NULL)`,
          ).run(crypto.randomUUID(), sectionId, subjectId, effectiveTeacherId, now);
        }
      }
    }
  })();
}

export function setSectionStudents(sectionId: string, studentIds: string[], assignedById?: string) {
  const db = getDb();
  const now = nowIso();
  const ids = Array.from(new Set(studentIds.filter(Boolean)));
  // Roster members already on this section stay. Only new adds must be free of an active section.
  const existingStudentIds = new Set(
    db
      .prepare<{ student_id: string }[]>(
        `SELECT student_id
         FROM section_students
         WHERE section_id = ? AND is_active = 1`,
      )
      .all(sectionId)
      .map((row) => row.student_id),
  );
  const newcomers = ids.filter((studentId) => !existingStudentIds.has(studentId));
  assertStudentsAvailableForSection(sectionId, newcomers);

  db.transaction(() => {
    db.prepare(`DELETE FROM section_students WHERE section_id = ?`).run(sectionId);

    for (const studentId of ids) {
      db.prepare(
        `INSERT INTO section_students (
          id, section_id, student_id, assigned_by_id, is_active, enrolled_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), sectionId, studentId, assignedById ?? null, now);
    }

    db.prepare("UPDATE sections SET updated_at = ? WHERE id = ?").run(now, sectionId);
  })();
}

/** Students with no active-section enrollment, plus students already on this roster. Archived enrollment does not block assignment. */
export function listStudentsAvailableForSection(sectionId: string) {
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
      `SELECT u.id, u.full_name, u.email, u.is_active
       FROM users u
       WHERE u.role = 'STUDENT'
         AND u.is_active = 1
         AND (
           NOT EXISTS (
             SELECT 1
             FROM section_students ss
             JOIN sections sec ON sec.id = ss.section_id
             WHERE ss.student_id = u.id
               AND ss.is_active = 1
               AND sec.status = 'ACTIVE'
           )
           OR EXISTS (
             SELECT 1
             FROM section_students ss
             WHERE ss.student_id = u.id
               AND ss.is_active = 1
               AND ss.section_id = ?
           )
         )
       ORDER BY u.full_name ASC`,
    )
    .all(sectionId)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      isActive: Boolean(row.is_active),
    }));
}

function assertStudentsAvailableForSection(sectionId: string | null, studentIds: string[]) {
  if (studentIds.length === 0) {
    return;
  }

  const db = getDb();
  const placeholders = studentIds.map(() => "?").join(", ");
  const values: unknown[] = [...studentIds];
  let excludeClause = "";
  if (sectionId) {
    excludeClause = " AND ss.section_id != ?";
    values.push(sectionId);
  }

  const conflicts = db
    .prepare<
      {
        student_id: string;
        full_name: string;
        section_name: string;
      }[]
    >(
      `SELECT ss.student_id, u.full_name, s.name AS section_name
       FROM section_students ss
       JOIN users u ON u.id = ss.student_id
       JOIN sections s ON s.id = ss.section_id
       WHERE ss.is_active = 1
         AND s.status = 'ACTIVE'
         AND ss.student_id IN (${placeholders})${excludeClause}
       ORDER BY u.full_name ASC`,
    )
    .all(...values);

  if (conflicts.length === 0) {
    return;
  }

  const details = conflicts
    .map((row) => `${row.full_name} (already in ${row.section_name})`)
    .join("; ");
  throw new Error(`Each student can only belong to one active section. ${details}`);
}

export function listSectionSubjectIds(sectionId: string) {
  const db = getDb();
  return db
    .prepare<{ subject_id: string }[]>(
      `SELECT subject_id
       FROM section_subjects
       WHERE section_id = ?
       ORDER BY created_at ASC`,
    )
    .all(sectionId)
    .map((row) => row.subject_id);
}

export function listTeacherSectionSubjectIds(sectionId: string, teacherId: string) {
  const db = getDb();
  return db
    .prepare<{ subject_id: string }[]>(
      `SELECT DISTINCT sst.subject_id
       FROM section_subject_teachers sst
       JOIN sections sec ON sec.id = sst.section_id
       WHERE sst.section_id = ?
         AND sst.teacher_id = ?
         AND sst.is_active = 1
         AND sec.status = 'ACTIVE'
       ORDER BY sst.assigned_at ASC`,
    )
    .all(sectionId, teacherId)
    .map((row) => row.subject_id);
}

export function setLessonSections(lessonId: string, sectionIds: string[], assignedById?: string) {
  const db = getDb();
  const ids = Array.from(new Set(sectionIds.filter(Boolean)));
  db.transaction(() => {
    db.prepare("DELETE FROM lesson_sections WHERE lesson_id = ?").run(lessonId);
    for (const sectionId of ids) {
      db.prepare(
        `INSERT INTO lesson_sections (id, lesson_id, section_id, assigned_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), lessonId, sectionId, assignedById ?? null, nowIso());
    }
  })();
}

export function setQuizSections(quizId: string, sectionIds: string[], assignedById?: string) {
  const db = getDb();
  const ids = Array.from(new Set(sectionIds.filter(Boolean)));
  db.transaction(() => {
    db.prepare("DELETE FROM quiz_sections WHERE quiz_id = ?").run(quizId);
    for (const sectionId of ids) {
      db.prepare(
        `INSERT INTO quiz_sections (id, quiz_id, section_id, assigned_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), quizId, sectionId, assignedById ?? null, nowIso());
    }
  })();
}

export function listLessonSections(lessonId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        section_id: string;
        name: string;
      }[]
    >(
      `SELECT s.id AS section_id, s.name
       FROM lesson_sections ls
       JOIN sections s ON s.id = ls.section_id
       WHERE ls.lesson_id = ?
       ORDER BY s.name ASC`,
    )
    .all(lessonId)
    .map((entry) => ({
      sectionId: entry.section_id,
      name: entry.name,
    }));
}

export function listQuizSections(quizId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        section_id: string;
        name: string;
      }[]
    >(
      `SELECT s.id AS section_id, s.name
       FROM quiz_sections qs
       JOIN sections s ON s.id = qs.section_id
       WHERE qs.quiz_id = ?
       ORDER BY s.name ASC`,
    )
    .all(quizId)
    .map((entry) => ({
      sectionId: entry.section_id,
      name: entry.name,
    }));
}

export function getSectionTargets(sectionId: string) {
  const db = getDb();
  const lessons = db
    .prepare<
      {
        lesson_id: string;
        title: string;
      }[]
    >(
      `SELECT l.id AS lesson_id, l.title
       FROM lesson_sections ls
       JOIN lessons l ON l.id = ls.lesson_id
       WHERE ls.section_id = ?
       ORDER BY l.title ASC`,
    )
    .all(sectionId)
    .map((entry) => ({
      lessonId: entry.lesson_id,
      title: entry.title,
    }));

  const quizzes = db
    .prepare<
      {
        quiz_id: string;
        title: string;
      }[]
    >(
      `SELECT q.id AS quiz_id, q.title
       FROM quiz_sections qs
       JOIN quizzes q ON q.id = qs.quiz_id
       WHERE qs.section_id = ?
       ORDER BY q.title ASC`,
    )
    .all(sectionId)
    .map((entry) => ({
      quizId: entry.quiz_id,
      title: entry.title,
    }));

  return { lessons, quizzes };
}

export function setSectionLessonTargets(sectionId: string, lessonIds: string[], assignedById?: string) {
  const db = getDb();
  const ids = Array.from(new Set(lessonIds.filter(Boolean)));
  const now = nowIso();
  db.transaction(() => {
    db.prepare("DELETE FROM lesson_sections WHERE section_id = ?").run(sectionId);
    for (const lessonId of ids) {
      db.prepare(
        `INSERT INTO lesson_sections (id, lesson_id, section_id, assigned_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), lessonId, sectionId, assignedById ?? null, now);
    }
  })();
}

export function setSectionQuizTargets(sectionId: string, quizIds: string[], assignedById?: string) {
  const db = getDb();
  const ids = Array.from(new Set(quizIds.filter(Boolean)));
  const now = nowIso();
  db.transaction(() => {
    db.prepare("DELETE FROM quiz_sections WHERE section_id = ?").run(sectionId);
    for (const quizId of ids) {
      db.prepare(
        `INSERT INTO quiz_sections (id, quiz_id, section_id, assigned_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(crypto.randomUUID(), quizId, sectionId, assignedById ?? null, now);
    }
  })();
}

export function listTeacherAssignableStudents(teacherId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        full_name: string;
        email: string;
      }[]
    >(
      `SELECT DISTINCT u.id, u.full_name, u.email
       FROM section_subject_teachers sst
       JOIN sections s ON s.id = sst.section_id AND s.status = 'ACTIVE'
       JOIN section_students ss ON ss.section_id = s.id AND ss.is_active = 1
       JOIN users u ON u.id = ss.student_id
       WHERE sst.teacher_id = ? AND sst.is_active = 1 AND u.is_active = 1
       ORDER BY u.full_name ASC`,
    )
    .all(teacherId)
    .map((entry) => ({
      id: entry.id,
      fullName: entry.full_name,
      email: entry.email,
    }));
}

export function sectionAnalytics(teacherId: string, sectionId?: string) {
  const db = getDb();
  const values: unknown[] = [teacherId];
  let sectionWhere = "";
  if (sectionId) {
    sectionWhere = " AND s.id = ?";
    values.push(sectionId);
  }

  const summary = db
    .prepare<
      {
        section_id: string;
        section_name: string;
        student_count: number;
        lesson_completion_rate: number;
        quiz_attempts: number;
        pass_rate: number;
        avg_score: number;
      }[]
    >(
      `SELECT
        s.id AS section_id,
        s.name AS section_name,
        COUNT(DISTINCT ss.student_id) AS student_count,
        COALESCE(AVG(lp.completion_percent), 0) AS lesson_completion_rate,
        COUNT(DISTINCT qa.id) AS quiz_attempts,
        COALESCE(
          100.0 * SUM(CASE WHEN qa.outcome = 'PASSED' THEN 1 ELSE 0 END) / NULLIF(COUNT(qa.id), 0),
          0
        ) AS pass_rate,
        COALESCE(AVG(qa.score_percent), 0) AS avg_score
      FROM sections s
      LEFT JOIN section_students ss ON ss.section_id = s.id AND ss.is_active = 1
      LEFT JOIN lesson_progress lp ON lp.student_id = ss.student_id
      LEFT JOIN quiz_attempts qa ON qa.student_id = ss.student_id
      WHERE EXISTS (
        SELECT 1
        FROM section_subject_teachers sst
        WHERE sst.section_id = s.id AND sst.teacher_id = ? AND sst.is_active = 1
      )${sectionWhere}
      GROUP BY s.id
      ORDER BY s.updated_at DESC`,
    )
    .all(...values)
    .map((entry) => ({
      sectionId: entry.section_id,
      sectionName: entry.section_name,
      studentCount: entry.student_count,
      lessonCompletionRate: Number(entry.lesson_completion_rate.toFixed(1)),
      quizAttempts: entry.quiz_attempts,
      passRate: Number(entry.pass_rate.toFixed(1)),
      averageScore: Number(entry.avg_score.toFixed(1)),
    }));

  const misconceptionRows = db
    .prepare<
      {
        topic: string;
        wrong_count: number;
        total_count: number;
      }[]
    >(
      `SELECT
        COALESCE(aa.topic_snapshot, qb.topic) AS topic,
        SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_count,
        COUNT(*) AS total_count
      FROM sections s
      JOIN section_students ss ON ss.section_id = s.id AND ss.is_active = 1
      JOIN quiz_attempts qa ON qa.student_id = ss.student_id
      JOIN attempt_answers aa ON aa.attempt_id = qa.id
      JOIN question_bank_entries qb ON qb.id = aa.question_id
      WHERE EXISTS (
        SELECT 1
        FROM section_subject_teachers sst
        WHERE sst.section_id = s.id AND sst.teacher_id = ? AND sst.is_active = 1
      )${sectionWhere}
      GROUP BY topic
      HAVING total_count > 0
      ORDER BY wrong_count DESC, total_count DESC
      LIMIT 8`,
    )
    .all(...values)
    .map((entry) => ({
      topic: entry.topic || "General",
      wrongCount: entry.wrong_count,
      totalCount: entry.total_count,
      errorRate: Number(((entry.wrong_count / Math.max(entry.total_count, 1)) * 100).toFixed(1)),
    }));

  const attentionRows = db
    .prepare<
      {
        student_id: string;
        full_name: string;
        average_score: number;
        failed_count: number;
      }[]
    >(
      `SELECT
        u.id AS student_id,
        u.full_name,
        COALESCE(AVG(qa.score_percent), 0) AS average_score,
        SUM(CASE WHEN qa.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
      FROM sections s
      JOIN section_students ss ON ss.section_id = s.id AND ss.is_active = 1
      JOIN users u ON u.id = ss.student_id
      LEFT JOIN quiz_attempts qa ON qa.student_id = u.id
      WHERE EXISTS (
        SELECT 1
        FROM section_subject_teachers sst
        WHERE sst.section_id = s.id AND sst.teacher_id = ? AND sst.is_active = 1
      )${sectionWhere}
      GROUP BY u.id
      HAVING average_score < 70 OR failed_count >= 2
      ORDER BY average_score ASC, failed_count DESC
      LIMIT 12`,
    )
    .all(...values)
    .map((entry) => ({
      studentId: entry.student_id,
      fullName: entry.full_name,
      averageScore: Number(entry.average_score.toFixed(1)),
      failedCount: entry.failed_count,
    }));

  return {
    summary,
    misconceptionTopics: misconceptionRows,
    studentsNeedingAttention: attentionRows,
  };
}

export function canTeacherAccessSection(teacherId: string, sectionId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM section_subject_teachers
       WHERE section_id = ? AND teacher_id = ? AND is_active = 1
       LIMIT 1`,
    )
    .get(sectionId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function studentHasActiveSection(studentId: string) {
  return studentSectionMembership(studentId).length > 0;
}

export function studentSectionMembership(studentId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        section_id: string;
        section_name: string;
        teacher_name: string;
      }[]
    >(
      `SELECT
        s.id AS section_id,
        s.name AS section_name,
        t.full_name AS teacher_name
      FROM section_students ss
      JOIN sections s ON s.id = ss.section_id
      JOIN users t ON t.id = s.teacher_id
      WHERE ss.student_id = ? AND ss.is_active = 1 AND s.status = 'ACTIVE'
      ORDER BY s.updated_at DESC`,
    )
    .all(studentId)
    .map((entry) => ({
      sectionId: entry.section_id,
      sectionName: entry.section_name,
      teacherName: entry.teacher_name,
    }));
}

export function findActiveSectionsByName(name: string) {
  const db = getDb();
  const trimmed = name.trim();
  if (!trimmed) {
    return [] as { id: string; name: string }[];
  }

  return db
    .prepare<{ id: string; name: string }[]>(
      `SELECT id, name
       FROM sections
       WHERE status = 'ACTIVE' AND lower(trim(name)) = lower(trim(?))
       ORDER BY updated_at DESC`,
    )
    .all(trimmed);
}

/** Add one student to a section roster without replacing existing members. */
export function addStudentToSection(sectionId: string, studentId: string, assignedById?: string) {
  const db = getDb();
  const now = nowIso();

  const existing = db
    .prepare<{ id: string }>(
      `SELECT id
       FROM section_students
       WHERE section_id = ? AND student_id = ? AND is_active = 1
       LIMIT 1`,
    )
    .get(sectionId, studentId);

  if (existing) {
    return;
  }

  assertStudentsAvailableForSection(sectionId, [studentId]);

  db.prepare(
    `INSERT INTO section_students (
      id, section_id, student_id, assigned_by_id, is_active, enrolled_at
    ) VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(crypto.randomUUID(), sectionId, studentId, assignedById ?? null, now);

  db.prepare("UPDATE sections SET updated_at = ? WHERE id = ?").run(now, sectionId);
}

/** Link a teacher to a section and its subjects without removing other teachers. */
export function assignTeacherToSection(sectionId: string, teacherId: string, assignedById?: string) {
  const db = getDb();
  const now = nowIso();

  db.transaction(() => {
    const teacherLink = db
      .prepare<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM section_teachers
         WHERE section_id = ? AND teacher_id = ? AND is_active = 1`,
      )
      .get(sectionId, teacherId);

    if ((teacherLink?.total ?? 0) === 0) {
      db.prepare(
        `INSERT INTO section_teachers (
          id, section_id, teacher_id, assigned_by_id, is_active, assigned_at
        ) VALUES (?, ?, ?, ?, 1, ?)`,
      ).run(crypto.randomUUID(), sectionId, teacherId, assignedById ?? null, now);
    }

    const subjectIds = listSectionSubjectIds(sectionId);
    for (const subjectId of subjectIds) {
      const subjectTeacherLink = db
        .prepare<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM section_subject_teachers
           WHERE section_id = ? AND subject_id = ? AND teacher_id = ? AND is_active = 1`,
        )
        .get(sectionId, subjectId, teacherId);

      if ((subjectTeacherLink?.total ?? 0) === 0) {
        db.prepare(
          `INSERT INTO section_subject_teachers (
            id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, NULL)`,
        ).run(crypto.randomUUID(), sectionId, subjectId, teacherId, assignedById ?? null, now);
      }

      const globalSubjectLink = db
        .prepare<{ total: number }>(
          `SELECT COUNT(*) AS total
           FROM teacher_subjects
           WHERE teacher_id = ? AND subject_id = ? AND is_active = 1`,
        )
        .get(teacherId, subjectId);

      if ((globalSubjectLink?.total ?? 0) === 0) {
        db.prepare(
          `INSERT INTO teacher_subjects (
            id, teacher_id, subject_id, assigned_by_id, is_active, assigned_at
          ) VALUES (?, ?, ?, ?, 1, ?)`,
        ).run(crypto.randomUUID(), teacherId, subjectId, assignedById ?? null, now);
      }
    }

    db.prepare("UPDATE sections SET updated_at = ? WHERE id = ?").run(now, sectionId);
  })();
}

function defaultImportSchoolYear() {
  return String(new Date().getFullYear());
}

/**
 * Owner for auto-created import sections.
 * Prefers the teacher on the row, then any active teacher, then the importing admin/user.
 */
export function findDefaultSectionOwnerTeacherId(preferredTeacherId?: string, fallbackUserId?: string) {
  if (preferredTeacherId) {
    const preferred = getUserById(preferredTeacherId);
    if (preferred?.role === "TEACHER" && preferred.isActive) {
      return preferredTeacherId;
    }
  }

  const db = getDb();
  const row = db
    .prepare<{ id: string }>(
      `SELECT id
       FROM users
       WHERE role = 'TEACHER' AND is_active = 1
       ORDER BY created_at ASC
       LIMIT 1`,
    )
    .get();

  if (row?.id) {
    return row.id;
  }

  if (fallbackUserId) {
    const fallback = getUserById(fallbackUserId);
    if (fallback?.isActive) {
      return fallbackUserId;
    }
  }

  return null;
}

export function getOrCreateActiveSectionForImport(params: {
  name: string;
  ownerTeacherId: string;
  assignedById?: string;
  gradeLevel?: string;
  schoolYear?: string;
}) {
  const trimmedName = params.name.trim();
  const matches = findActiveSectionsByName(trimmedName);

  if (matches.length > 1) {
    throw new Error(`Multiple active sections named "${trimmedName}".`);
  }

  if (matches.length === 1) {
    return { sectionId: matches[0]!.id, sectionName: matches[0]!.name, created: false };
  }

  const sectionId = createSection({
    teacherId: params.ownerTeacherId,
    name: trimmedName,
    gradeLevel: params.gradeLevel ?? "General",
    schoolYear: params.schoolYear ?? defaultImportSchoolYear(),
    status: "ACTIVE",
    description: "Created automatically from user import.",
    assignedById: params.assignedById,
  });

  return { sectionId, sectionName: trimmedName, created: true };
}
