import { getDb, toBoolean } from "@/lib/db";
import type { DbUser, PaginatedResult, Role, SessionUser } from "@/domain/types";
import crypto from "node:crypto";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: Role;
  is_active: number;
  streak_days: number;
  timezone: string | null;
  locale: string | null;
};

function mapUser(row: UserRow): DbUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    fullName: row.full_name,
    role: row.role,
    isActive: toBoolean(row.is_active),
    streakDays: row.streak_days,
    timezone: row.timezone,
    locale: row.locale,
  };
}

export function getUserByEmail(email: string): DbUser | null {
  const db = getDb();
  const row = db
    .prepare<UserRow>(
      `SELECT id, email, password_hash, full_name, role, is_active, streak_days, timezone, locale
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`,
    )
    .get(email);

  return row ? mapUser(row) : null;
}

export function getUserById(id: string): DbUser | null {
  const db = getDb();
  const row = db
    .prepare<UserRow>(
      `SELECT id, email, password_hash, full_name, role, is_active, streak_days, timezone, locale
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .get(id);

  return row ? mapUser(row) : null;
}

export function touchLastLogin(userId: string) {
  const db = getDb();
  db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    new Date().toISOString(),
    userId,
  );
}

export function listUsers(params: {
  role?: Role;
  search?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult<SessionUser & { streakDays: number }> {
  const db = getDb();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const values: unknown[] = [];

  if (params.role) {
    where.push("role = ?");
    values.push(params.role);
  }

  if (params.search) {
    where.push("(full_name LIKE ? OR email LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const totalRow = db
    .prepare<{ total: number }>(`SELECT COUNT(*) as total FROM users ${whereSql}`)
    .get(...values);
  const total = totalRow?.total ?? 0;

  const rows = db
    .prepare<
      {
        id: string;
        email: string;
        full_name: string;
        role: Role;
        is_active: number;
        streak_days: number;
      }[]
    >(
      `SELECT id, email, full_name, role, is_active, streak_days
       FROM users
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, offset);

  return {
    data: rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      isActive: toBoolean(row.is_active),
      streakDays: row.streak_days,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export function createUser(payload: {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: Role;
  createdById?: string;
}) {
  const db = getDb();

  db.prepare(
    `INSERT INTO users (
      id, email, password_hash, full_name, role, is_active, created_by_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(
    payload.id,
    payload.email,
    payload.passwordHash,
    payload.fullName,
    payload.role,
    payload.createdById ?? null,
    new Date().toISOString(),
    new Date().toISOString(),
  );
}

export function updateUser(payload: {
  id: string;
  fullName?: string;
  email?: string;
  role?: Role;
  isActive?: boolean;
}) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.fullName !== undefined) {
    updates.push("full_name = ?");
    values.push(payload.fullName);
  }
  if (payload.email !== undefined) {
    updates.push("email = ?");
    values.push(payload.email);
  }
  if (payload.role !== undefined) {
    updates.push("role = ?");
    values.push(payload.role);
  }
  if (payload.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(payload.isActive ? 1 : 0);
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(payload.id);

  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function resetUserPassword(userId: string, passwordHash: string) {
  const db = getDb();
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash,
    new Date().toISOString(),
    userId,
  );
}

export function upsertTeacherAssignment(payload: {
  teacherId: string;
  studentId: string;
  assignedById?: string;
}) {
  const db = getDb();

  db.prepare(
    `UPDATE teacher_student_assignments
     SET is_active = 0, ended_at = ?
     WHERE student_id = ? AND is_active = 1`,
  ).run(new Date().toISOString(), payload.studentId);

  db.prepare(
    `INSERT INTO teacher_student_assignments (
      id, teacher_id, student_id, assigned_by_id, is_active, assigned_at
    ) VALUES (?, ?, ?, ?, 1, ?)`,
  ).run(
    crypto.randomUUID(),
    payload.teacherId,
    payload.studentId,
    payload.assignedById ?? null,
    new Date().toISOString(),
  );
}

export function listTeacherStudents(teacherId: string, search?: string) {
  const db = getDb();

  const params: unknown[] = [teacherId];
  const searchSql = search
    ? "AND (u.full_name LIKE ? OR u.email LIKE ?)"
    : "";

  if (search) {
    params.push(`%${search}%`, `%${search}%`);
  }

  return db
    .prepare<
      {
        id: string;
        full_name: string;
        email: string;
        is_active: number;
        streak_days: number;
        assigned_at: string;
      }[]
    >(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.is_active,
        u.streak_days,
        MIN(ss.enrolled_at) AS assigned_at
       FROM section_subject_teachers sst
       JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
       JOIN section_students ss ON ss.section_id = sec.id AND ss.is_active = 1
       JOIN users u ON u.id = ss.student_id
       WHERE sst.teacher_id = ? AND sst.is_active = 1
       ${searchSql}
       GROUP BY u.id
       ORDER BY u.full_name ASC`,
    )
    .all(...params)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      isActive: toBoolean(row.is_active),
      streakDays: row.streak_days,
      assignedAt: row.assigned_at,
    }));
}

export function listTeacherStudentsPaginated(params: {
  teacherId: string;
  sectionId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult<{
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  streakDays: number;
  assignedAt: string;
}> {
  const db = getDb();
  const rawPage = params.page ?? 1;
  const rawPageSize = params.pageSize ?? 20;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? Math.min(100, Math.floor(rawPageSize)) : 20;
  const offset = (page - 1) * pageSize;

  const where: string[] = ["sst.teacher_id = ?", "sst.is_active = 1", "sec.status = 'ACTIVE'", "ss.is_active = 1"];
  const values: unknown[] = [params.teacherId];

  if (params.sectionId?.trim()) {
    where.push("sec.id = ?");
    values.push(params.sectionId.trim());
  }

  if (params.search?.trim()) {
    where.push("(u.full_name LIKE ? OR u.email LIKE ?)");
    values.push(`%${params.search.trim()}%`, `%${params.search.trim()}%`);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;

  const total =
    db.prepare<{ total: number }>(
      `SELECT COUNT(DISTINCT u.id) AS total
       FROM section_subject_teachers sst
       JOIN sections sec ON sec.id = sst.section_id
       JOIN section_students ss ON ss.section_id = sec.id
       JOIN users u ON u.id = ss.student_id
       ${whereSql}`,
    ).get(...values)?.total ?? 0;

  const rows = db
    .prepare<
      {
        id: string;
        full_name: string;
        email: string;
        is_active: number;
        streak_days: number;
        assigned_at: string;
      }[]
    >(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.is_active,
        u.streak_days,
        MIN(ss.enrolled_at) AS assigned_at
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id
      JOIN section_students ss ON ss.section_id = sec.id
      JOIN users u ON u.id = ss.student_id
      ${whereSql}
      GROUP BY u.id
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, offset)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      isActive: toBoolean(row.is_active),
      streakDays: row.streak_days,
      assignedAt: row.assigned_at,
    }));

  return {
    data: rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export function getUserActivitySummary(userId: string) {
  const db = getDb();

  const attempts = db
    .prepare<{ total: number }>("SELECT COUNT(*) as total FROM quiz_attempts WHERE student_id = ?")
    .get(userId)?.total;

  const lessonsCompleted = db
    .prepare<{ total: number }>(
      "SELECT COUNT(*) as total FROM lesson_progress WHERE student_id = ? AND status = 'COMPLETED'",
    )
    .get(userId)?.total;

  const xp = db
    .prepare<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM xp_events WHERE user_id = ?")
    .get(userId)?.total;

  return {
    attempts: attempts ?? 0,
    lessonsCompleted: lessonsCompleted ?? 0,
    totalXp: xp ?? 0,
  };
}

export function isStudentAssignedToTeacher(teacherId: string, studentId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM section_teachers st
       JOIN sections sec ON sec.id = st.section_id AND sec.status = 'ACTIVE'
       JOIN section_students ss ON ss.section_id = sec.id AND ss.is_active = 1
       WHERE st.teacher_id = ? AND ss.student_id = ? AND st.is_active = 1`,
    )
    .get(teacherId, studentId);

  return (row?.total ?? 0) > 0;
}

export function deleteUserById(userId: string) {
  const db = getDb();

  const existing = db
    .prepare<{ id: string }>(
      `SELECT id
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .get(userId);

  if (!existing) {
    return {
      success: false as const,
      status: 404 as const,
      error: "User not found.",
    };
  }

  try {
    const tx = db.transaction(() => {
      // Remove or nullify references where this user may appear.
      db.prepare("UPDATE users SET created_by_id = NULL WHERE created_by_id = ?").run(userId);
      db.prepare("UPDATE system_settings SET updated_by_id = NULL WHERE updated_by_id = ?").run(userId);
      db.prepare("UPDATE ai_grading_jobs SET reviewed_by_id = NULL WHERE reviewed_by_id = ?").run(userId);
      db.prepare("UPDATE teacher_student_assignments SET assigned_by_id = NULL WHERE assigned_by_id = ?").run(userId);
      db.prepare("DELETE FROM teacher_student_assignments WHERE teacher_id = ? OR student_id = ?").run(userId, userId);
      db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    });

    tx();

    return {
      success: true as const,
    };
  } catch {
    return {
      success: false as const,
      status: 409 as const,
      error:
        "User cannot be deleted because dependent records exist. Deactivate the account or remove dependent content first.",
    };
  }
}
