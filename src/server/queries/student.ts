import { getDb } from "@/lib/db";
import { studentLessonStats, listStudentLessons } from "@/server/queries/lessons";
import { attemptTrend, getLatestLeaderboard, listStudentAttempts, listStudentQuizzes, studentQuizStats } from "@/server/queries/quizzes";
import { getSettingValue } from "@/server/queries/admin";
import { getStudentRecommendations } from "@/server/services/quiz-service";

export function studentDashboardData(studentId: string) {
  const lessonStats = studentLessonStats(studentId);
  const quizStats = studentQuizStats(studentId);

  const db = getDb();

  const badgeRows = db
    .prepare<
      {
        id: string;
        title: string;
        description: string;
        icon: string;
        awarded_at: string;
      }[]
    >(
      `SELECT
        b.id,
        b.title,
        b.description,
        b.icon,
        ub.awarded_at
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY ub.awarded_at DESC
      LIMIT 8`,
    )
    .all(studentId);

  const xp = db
    .prepare<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM xp_events WHERE user_id = ?")
    .get(studentId)?.total;

  const streak = db
    .prepare<{ streak_days: number }>("SELECT streak_days FROM users WHERE id = ?")
    .get(studentId)?.streak_days;

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
    .all(studentId)
    .map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      createdAt: row.created_at,
    }));

  const recommendations = getStudentRecommendations(studentId);

  const recentQuizzes = listStudentAttempts(studentId).slice(0, 5);

  const topRecommended = recommendations[0] ?? null;

  return {
    cards: {
      totalLessons: lessonStats.totalLessons,
      totalQuizzes: quizStats.totalQuizzes,
      completedQuizzes: quizStats.completedQuizzes,
      averageScore: quizStats.averageScore,
      streakDays: streak ?? 0,
      totalXp: xp ?? 0,
      completedLessons: lessonStats.completedLessons,
    },
    badges: badgeRows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      icon: row.icon,
      awardedAt: row.awarded_at,
    })),
    recentActivity,
    recommendations,
    recommendedNext: topRecommended,
    recentQuizzes,
    trend: attemptTrend(studentId),
    messages: getSettingValue("student.messages", {
      dashboardGreeting: "Ready for your next challenge?",
      encouragement: "Keep building your streak.",
      retry: "Review and try again.",
    }),
  };
}

export function studentLearningData(studentId: string) {
  return {
    lessons: listStudentLessons(studentId),
    quizzes: listStudentQuizzes(studentId),
    attempts: listStudentAttempts(studentId),
  };
}

export function leaderboardForStudent(studentId: string) {
  const visibility = getSettingValue("features.gamification", {
    leaderboardEnabled: true,
  }) as { leaderboardEnabled?: boolean };

  if (visibility.leaderboardEnabled === false) {
    return {
      enabled: false,
      entries: [],
      currentStudentRank: null,
    };
  }

  const settings = getSettingValue("leaderboard.settings", {
    mode: "XP",
    topOnly: true,
    topCount: 10,
    anonymizeLowerRanks: true,
  }) as {
    mode?: "XP" | "QUIZ_COMPLETION" | "STREAK";
    topOnly?: boolean;
    topCount?: number;
    anonymizeLowerRanks?: boolean;
  };

  const mode = settings.mode ?? "XP";
  const entries = getLatestLeaderboard(mode);
  const db = getDb();

  const displayEntries = entries
    .slice(0, settings.topOnly ? settings.topCount ?? 10 : entries.length)
    .map((entry) => {
      const user = db
        .prepare<{ full_name: string }>("SELECT full_name FROM users WHERE id = ?")
        .get(entry.userId);

      const isCurrent = entry.userId === studentId;
      const shouldAnonymize = Boolean(settings.anonymizeLowerRanks && entry.rank > 3 && !isCurrent);

      return {
        rank: entry.rank,
        userId: entry.userId,
        score: entry.score,
        name: shouldAnonymize ? anonymize(user?.full_name ?? "Student") : user?.full_name ?? "Student",
        isCurrent,
      };
    });

  const currentStudentRank = displayEntries.find((entry) => entry.userId === studentId) ?? null;

  return {
    enabled: true,
    mode,
    entries: displayEntries,
    currentStudentRank,
  };
}

function anonymize(fullName: string) {
  if (fullName.length <= 2) {
    return fullName;
  }

  const parts = fullName.split(" ").filter(Boolean);
  const first = parts[0] ?? "S";
  return `${first[0]}***`;
}

export function studentProfileData(studentId: string) {
  const db = getDb();

  const user = db
    .prepare<{
      id: string;
      full_name: string;
      email: string;
      streak_days: number;
      timezone: string | null;
      locale: string | null;
      created_at: string;
    }>(
      `SELECT id, full_name, email, streak_days, timezone, locale, created_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
    )
    .get(studentId);

  if (!user) {
    return null;
  }

  const xpEvents = db
    .prepare<
      {
        id: string;
        source: string;
        amount: number;
        description: string | null;
        created_at: string;
      }[]
    >(
      `SELECT id, source, amount, description, created_at
       FROM xp_events
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 12`,
    )
    .all(studentId);

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    streakDays: user.streak_days,
    timezone: user.timezone,
    locale: user.locale,
    createdAt: user.created_at,
    xpEvents: xpEvents.map((event) => ({
      id: event.id,
      source: event.source,
      amount: event.amount,
      description: event.description,
      createdAt: event.created_at,
    })),
  };
}

export function getStudentWeakStrongTopics(studentId: string) {
  const db = getDb();

  const topics = db
    .prepare<
      {
        topic: string;
        correct_answers: number;
        wrong_answers: number;
      }[]
    >(
      `SELECT
        COALESCE(aa.topic_snapshot, qb.topic) AS topic,
        SUM(CASE WHEN aa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers,
        SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_answers
      FROM attempt_answers aa
      JOIN quiz_attempts qa ON qa.id = aa.attempt_id
      JOIN question_bank_entries qb ON qb.id = aa.question_id
      WHERE qa.student_id = ?
      GROUP BY topic`,
    )
    .all(studentId)
    .map((row) => ({
      topic: row.topic,
      correct: row.correct_answers,
      wrong: row.wrong_answers,
      accuracy:
        row.correct_answers + row.wrong_answers > 0
          ? Number(((row.correct_answers / (row.correct_answers + row.wrong_answers)) * 100).toFixed(1))
          : 0,
    }));

  return {
    strengths: topics
      .filter((topic) => topic.accuracy >= 70)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5),
    weakAreas: topics
      .filter((topic) => topic.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5),
  };
}

export function getStudentMessageConfig() {
  return getSettingValue("student.messages", {
    dashboardGreeting: "Ready to level up your learning?",
    encouragement: "Great progress. Keep going!",
    retry: "Nice effort. Review and try again.",
  });
}
