import crypto from "node:crypto";
import { getDb, parseJson, toBoolean } from "@/lib/db";
import { countPublishedLessons } from "@/server/queries/lessons";
import { countPublishedQuizzes } from "@/server/queries/quizzes";

export function adminOverview() {
  const db = getDb();

  const userCounts = db
    .prepare<{
      admins: number;
      teachers: number;
      students: number;
      inactive: number;
    }>(
      `SELECT
         SUM(CASE WHEN role = 'ADMIN' THEN 1 ELSE 0 END) AS admins,
         SUM(CASE WHEN role = 'TEACHER' THEN 1 ELSE 0 END) AS teachers,
         SUM(CASE WHEN role = 'STUDENT' THEN 1 ELSE 0 END) AS students,
         SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) AS inactive
       FROM users`,
    )
    .get();

  const participation = db
    .prepare<{
      active_students: number;
      attempts_this_week: number;
      lessons_viewed_this_week: number;
    }>(
      `SELECT
         (SELECT COUNT(*) FROM users WHERE role = 'STUDENT' AND is_active = 1) AS active_students,
         (SELECT COUNT(*) FROM quiz_attempts WHERE created_at >= datetime('now', '-7 days')) AS attempts_this_week,
         (SELECT COUNT(*) FROM lesson_views WHERE viewed_at >= datetime('now', '-7 days')) AS lessons_viewed_this_week`,
    )
    .get();

  const teacherActivity = db
    .prepare<
      {
        teacher_id: string;
        teacher_name: string;
        lesson_count: number;
        quiz_count: number;
        last_activity: string | null;
      }[]
    >(
      `SELECT
         u.id AS teacher_id,
         u.full_name AS teacher_name,
         COUNT(DISTINCT l.id) AS lesson_count,
         COUNT(DISTINCT q.id) AS quiz_count,
         MAX(al.created_at) AS last_activity
       FROM users u
       LEFT JOIN lessons l ON l.teacher_id = u.id
       LEFT JOIN quizzes q ON q.teacher_id = u.id
       LEFT JOIN activity_logs al ON al.user_id = u.id
       WHERE u.role = 'TEACHER'
       GROUP BY u.id
       ORDER BY lesson_count DESC, quiz_count DESC`,
    )
    .all();

  return {
    users: {
      admins: userCounts?.admins ?? 0,
      teachers: userCounts?.teachers ?? 0,
      students: userCounts?.students ?? 0,
      inactive: userCounts?.inactive ?? 0,
    },
    content: {
      lessons: countPublishedLessons(),
      quizzes: countPublishedQuizzes(),
    },
    participation: {
      activeStudents: participation?.active_students ?? 0,
      attemptsThisWeek: participation?.attempts_this_week ?? 0,
      lessonsViewedThisWeek: participation?.lessons_viewed_this_week ?? 0,
    },
    teacherActivity: teacherActivity.map((row) => ({
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      lessonCount: row.lesson_count,
      quizCount: row.quiz_count,
      lastActivity: row.last_activity,
    })),
  };
}

export function getSystemSettings() {
  const db = getDb();

  return db
    .prepare<
      {
        id: string;
        key: string;
        value_json: string;
        description: string | null;
        updated_at: string;
      }[]
    >(
      `SELECT id, key, value_json, description, updated_at
       FROM system_settings
       ORDER BY key ASC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      key: row.key,
      value: parseJson(row.value_json, {}),
      description: row.description,
      updatedAt: row.updated_at,
    }));
}

export function getSettingValue<T>(key: string, fallback: T): T {
  const db = getDb();
  const row = db
    .prepare<{ value_json: string }>(
      "SELECT value_json FROM system_settings WHERE key = ? LIMIT 1",
    )
    .get(key);

  if (!row) {
    return fallback;
  }

  return parseJson(row.value_json, fallback);
}

export function upsertSystemSetting(payload: {
  key: string;
  value: unknown;
  description?: string;
  updatedById?: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare<{ id: string }>("SELECT id FROM system_settings WHERE key = ? LIMIT 1")
    .get(payload.key);

  if (!existing) {
    db.prepare(
      `INSERT INTO system_settings (
        id, key, value_json, description, updated_by_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      payload.key,
      JSON.stringify(payload.value),
      payload.description ?? null,
      payload.updatedById ?? null,
      now,
      now,
    );
    return;
  }

  db.prepare(
    `UPDATE system_settings
     SET value_json = ?, description = ?, updated_by_id = ?, updated_at = ?
     WHERE key = ?`,
  ).run(
    JSON.stringify(payload.value),
    payload.description ?? null,
    payload.updatedById ?? null,
    now,
    payload.key,
  );
}

export function getLeaderboardVisibility() {
  const features = getSettingValue("features.gamification", {
    leaderboardEnabled: true,
  });

  return Boolean((features as { leaderboardEnabled?: boolean }).leaderboardEnabled ?? true);
}

export function getUserActivitySummaries() {
  const db = getDb();

  return db
    .prepare<
      {
        id: string;
        full_name: string;
        role: string;
        is_active: number;
        attempts: number;
        xp: number;
        lessons_completed: number;
      }[]
    >(
      `SELECT
        u.id,
        u.full_name,
        u.role,
        u.is_active,
        (SELECT COUNT(*) FROM quiz_attempts qa WHERE qa.student_id = u.id) AS attempts,
        (SELECT COALESCE(SUM(x.amount), 0) FROM xp_events x WHERE x.user_id = u.id) AS xp,
        (SELECT COUNT(*) FROM lesson_progress lp WHERE lp.student_id = u.id AND lp.status = 'COMPLETED') AS lessons_completed
      FROM users u
      ORDER BY u.role ASC, u.full_name ASC`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      role: row.role,
      isActive: toBoolean(row.is_active),
      attempts: row.attempts,
      xp: row.xp,
      lessonsCompleted: row.lessons_completed,
    }));
}
