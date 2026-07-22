import { getDb } from "@/lib/db";
import { quizQuestionAnalytics, listQuizAnalytics } from "@/server/queries/quizzes";

export function teacherDashboardSummary(teacherId: string, sectionId?: string) {
  const db = getDb();
  const sectionFilter = sectionId ? " AND sst.section_id = ?" : "";
  const sectionParams: unknown[] = sectionId ? [sectionId] : [];
  const linkedScopeFilter = sectionId ? " AND sst_link.section_id = ?" : "";
  const linkedScopeParams: unknown[] = sectionId ? [sectionId] : [];

  const studentStats = db
    .prepare<{
      total_students: number;
      active_students: number;
      avg_streak: number;
    }>(
      `SELECT
         COUNT(*) AS total_students,
         SUM(CASE WHEN students.is_active = 1 THEN 1 ELSE 0 END) AS active_students,
         COALESCE(AVG(students.streak_days), 0) AS avg_streak
       FROM (
         SELECT DISTINCT u.id, u.is_active, u.streak_days
         FROM section_subject_teachers sst
         JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
         JOIN section_students ss ON ss.section_id = sec.id AND ss.is_active = 1
         JOIN users u ON u.id = ss.student_id
         WHERE sst.teacher_id = ? AND sst.is_active = 1${sectionFilter}
       ) students`,
    )
    .get(teacherId, ...sectionParams);

  const studentsNeedingAttention = db
    .prepare<
      {
        id: string;
        full_name: string;
        average_score: number;
        failed_count: number;
      }[]
    >(
      `SELECT
        s.id,
        s.full_name,
        COALESCE(AVG(CASE WHEN lq.id IS NOT NULL THEN qa.score_percent END), 0) AS average_score,
        SUM(CASE WHEN lq.id IS NOT NULL AND qa.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
      FROM (
        SELECT DISTINCT u.id, u.full_name
        FROM section_subject_teachers sst
        JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
        JOIN section_students ss ON ss.section_id = sec.id AND ss.is_active = 1
        JOIN users u ON u.id = ss.student_id
        WHERE sst.teacher_id = ? AND sst.is_active = 1${sectionFilter}
      ) s
      LEFT JOIN quiz_attempts qa ON qa.student_id = s.id AND qa.status = 'GRADED'
      LEFT JOIN quizzes q ON q.id = qa.quiz_id AND q.status != 'ARCHIVED'
      LEFT JOIN lessons lq ON lq.id = q.lesson_id
        AND lq.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss_link
          JOIN section_subject_teachers sst_link ON sst_link.section_id = ss_link.section_id AND sst_link.is_active = 1
          JOIN sections sec_link ON sec_link.id = sst_link.section_id AND sec_link.status = 'ACTIVE'
          JOIN subjects sub_link ON sub_link.id = sst_link.subject_id
          WHERE ss_link.student_id = s.id
            AND ss_link.is_active = 1
            AND sst_link.teacher_id = ?
            ${linkedScopeFilter}
            AND (
              lq.subject_id = sst_link.subject_id
              OR lower(lq.subject) = lower(sub_link.name)
            )
            AND (
              EXISTS (SELECT 1 FROM quiz_sections qs_link WHERE qs_link.quiz_id = q.id AND qs_link.section_id = sst_link.section_id)
              OR EXISTS (SELECT 1 FROM lesson_sections ls_link WHERE ls_link.lesson_id = q.lesson_id AND ls_link.section_id = sst_link.section_id)
            )
        )
      GROUP BY s.id, s.full_name
      HAVING average_score < 70 OR failed_count >= 2
      ORDER BY average_score ASC
      LIMIT 8`,
    )
    .all(teacherId, ...sectionParams, teacherId, ...linkedScopeParams)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      averageScore: Number(row.average_score.toFixed(1)),
      failedCount: row.failed_count,
    }));

  const hardestQuizzes = listQuizAnalytics(teacherId, { sectionId })
    .filter((quiz) => quiz.takenCount > 0)
    .sort((a, b) => a.passRate - b.passRate)
    .slice(0, 5);

  const questionInsights = quizQuestionAnalytics(teacherId, { sectionId }).slice(0, 6);

  const lowEngagementLessons = db
    .prepare<
      {
        id: string;
        title: string;
        viewer_count: number;
        completion_rate: number;
      }[]
    >(
      `SELECT
        l.id,
        l.title,
        COUNT(DISTINCT lv.student_id) AS viewer_count,
        COALESCE(AVG(lp.completion_percent), 0) AS completion_rate
      FROM lessons l
      LEFT JOIN quizzes q ON q.lesson_id = l.id AND q.status != 'ARCHIVED'
      LEFT JOIN lesson_views lv ON lv.lesson_id = l.id
      LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id
      WHERE l.status != 'ARCHIVED'
        AND EXISTS (
        SELECT 1
        FROM section_subject_teachers sst
        JOIN sections sec ON sec.id = sst.section_id
        JOIN subjects s ON s.id = sst.subject_id
        WHERE sst.teacher_id = ?
          AND sst.is_active = 1
          AND sec.status = 'ACTIVE'
          ${sectionId ? "AND sst.section_id = ?" : ""}
          AND (
            l.subject_id = sst.subject_id
            OR lower(l.subject) = lower(s.name)
          )
      )
      GROUP BY l.id
      ORDER BY completion_rate ASC, viewer_count ASC
      LIMIT 6`,
    )
    .all(teacherId, ...sectionParams)
    .map((row) => ({
      id: row.id,
      title: row.title,
      viewerCount: row.viewer_count,
      completionRate: Number(row.completion_rate.toFixed(1)),
    }));

  const recentActivity = db
    .prepare<
      {
        id: string;
        action: string;
        entity_type: string;
        created_at: string;
      }[]
    >(
      `SELECT id, action, entity_type, created_at
       FROM activity_logs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 8`,
    )
    .all(teacherId)
    .map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      createdAt: row.created_at,
    }));

  const lessonCount =
    db
     .prepare<{ total: number }>(
        `SELECT COUNT(DISTINCT l.id) AS total
         FROM lessons l
         WHERE l.status != 'ARCHIVED'
           AND EXISTS (
           SELECT 1
           FROM section_subject_teachers sst
           JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
           JOIN subjects s ON s.id = sst.subject_id
           WHERE sst.teacher_id = ?
             AND sst.is_active = 1
             ${sectionId ? "AND sst.section_id = ?" : ""}
             AND (
               l.subject_id = sst.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )`,
      )
      .get(teacherId, ...sectionParams)?.total ?? 0;

  const quizCount =
    db
      .prepare<{ total: number }>(
        `SELECT COUNT(DISTINCT q.id) AS total
         FROM quizzes q
         JOIN lessons l ON l.id = q.lesson_id
         WHERE q.status != 'ARCHIVED'
           AND l.status != 'ARCHIVED'
           AND EXISTS (
           SELECT 1
           FROM section_subject_teachers sst
           JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
           JOIN subjects s ON s.id = sst.subject_id
           WHERE sst.teacher_id = ?
             AND sst.is_active = 1
             ${sectionId ? "AND sst.section_id = ?" : ""}
             AND (
               l.subject_id = sst.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )`,
      )
      .get(teacherId, ...sectionParams)?.total ?? 0;

  return {
    cards: {
      students: {
        total: studentStats?.total_students ?? 0,
        active: studentStats?.active_students ?? 0,
        avgStreak: Number((studentStats?.avg_streak ?? 0).toFixed(1)),
      },
      lessons: lessonCount,
      quizzes: quizCount,
    },
    studentsNeedingAttention,
    hardestQuizzes,
    lowEngagementLessons,
    questionInsights,
    recentActivity,
  };
}
