import { getDb, toBoolean } from "@/lib/db";
import type { LessonStatus, PaginatedResult, QuizStatus } from "@/domain/types";

type TeacherSubjectContext = {
  subject: {
    id: string;
    code: string;
    name: string;
    description: string | null;
  };
  teacher: {
    id: string;
    fullName: string;
  };
  sections: Array<{
    id: string;
    name: string;
    gradeLevel: string;
    schoolYear: string;
    teacherAssignmentId: string;
    studentCount: number;
  }>;
};

function safePage(page?: number) {
  return Math.max(1, page ?? 1);
}

function safePageSize(pageSize?: number, max = 50, fallback = 10) {
  return Math.min(max, Math.max(1, pageSize ?? fallback));
}

export function getTeacherSubjectContext(teacherId: string, subjectId: string): TeacherSubjectContext | null {
  const db = getDb();
  const subject = db
    .prepare<
      {
        id: string;
        code: string;
        name: string;
        description: string | null;
        teacher_id: string;
        teacher_name: string;
      }
    >(
      `SELECT
        s.id,
        s.code,
        s.name,
        s.description,
        u.id AS teacher_id,
        u.full_name AS teacher_name
      FROM subjects s
      JOIN users u ON u.id = ?
      WHERE s.id = ?
        AND s.is_active = 1
        AND EXISTS (
          SELECT 1
          FROM section_subject_teachers sst
          JOIN sections sec ON sec.id = sst.section_id
          WHERE sst.teacher_id = u.id
            AND sst.subject_id = s.id
            AND sst.is_active = 1
            AND sec.status = 'ACTIVE'
        )
      LIMIT 1`,
    )
    .get(teacherId, subjectId);

  if (!subject) {
    return null;
  }

  const sections = db
    .prepare<
      {
        id: string;
        name: string;
        grade_level: string;
        school_year: string;
        teacher_assignment_id: string;
        student_count: number;
      }[]
    >(
      `SELECT
        sec.id,
        sec.name,
        sec.grade_level,
        sec.school_year,
        MIN(sst.id) AS teacher_assignment_id,
        (
          SELECT COUNT(*)
          FROM section_students ss
          WHERE ss.section_id = sec.id AND ss.is_active = 1
        ) AS student_count
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id
      WHERE sst.teacher_id = ?
        AND sst.subject_id = ?
        AND sst.is_active = 1
        AND sec.status = 'ACTIVE'
      GROUP BY sec.id
      ORDER BY sec.name ASC`,
    )
    .all(teacherId, subjectId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      gradeLevel: row.grade_level,
      schoolYear: row.school_year,
      teacherAssignmentId: row.teacher_assignment_id,
      studentCount: row.student_count,
    }));

  return {
    subject: {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      description: subject.description,
    },
    teacher: {
      id: subject.teacher_id,
      fullName: subject.teacher_name,
    },
    sections,
  };
}

export function listTeacherSectionRoster(params: {
  teacherId: string;
  subjectId: string;
  sectionId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult<{ id: string; fullName: string; email: string; isActive: boolean; enrolledAt: string }> {
  const db = getDb();
  const page = safePage(params.page);
  const pageSize = safePageSize(params.pageSize, 50, 10);
  const offset = (page - 1) * pageSize;

  const filters: string[] = [
    "ss.section_id = ?",
    "ss.is_active = 1",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      WHERE sst.section_id = ss.section_id
        AND sst.subject_id = ?
        AND sst.teacher_id = ?
        AND sst.is_active = 1
    )`,
  ];
  const values: unknown[] = [params.sectionId, params.subjectId, params.teacherId];

  if (params.search?.trim()) {
    filters.push("(u.full_name LIKE ? OR u.email LIKE ?)");
    values.push(`%${params.search.trim()}%`, `%${params.search.trim()}%`);
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const total =
    db.prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM section_students ss
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
        enrolled_at: string;
      }[]
    >(
      `SELECT
        u.id,
        u.full_name,
        u.email,
        u.is_active,
        ss.enrolled_at
      FROM section_students ss
      JOIN users u ON u.id = ss.student_id
      ${whereSql}
      ORDER BY u.full_name ASC
      LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, offset)
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      email: row.email,
      isActive: toBoolean(row.is_active),
      enrolledAt: row.enrolled_at,
    }));

  return {
    data: rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export function listTeacherSectionLessons(params: {
  teacherId: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  status?: LessonStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult<{
  id: string;
  title: string;
  topic: string;
  status: LessonStatus;
  updatedAt: string;
  estimatedMinutes: number | null;
}> {
  const db = getDb();
  const page = safePage(params.page);
  const pageSize = safePageSize(params.pageSize, 50, 10);
  const offset = (page - 1) * pageSize;

  const filters: string[] = [
    "sec.id = ?",
    "EXISTS (SELECT 1 FROM section_subject_teachers sst WHERE sst.section_id = sec.id AND sst.subject_id = ? AND sst.teacher_id = ? AND sst.is_active = 1)",
    "(l.subject_id = ? OR lower(l.subject) = lower(?))",
  ];
  const values: unknown[] = [
    params.sectionId,
    params.subjectId,
    params.teacherId,
    params.subjectId,
    params.subjectName,
  ];

  if (params.status) {
    filters.push("l.status = ?");
    values.push(params.status);
  }
  if (params.search?.trim()) {
    filters.push("(l.title LIKE ? OR l.short_description LIKE ?)");
    values.push(`%${params.search.trim()}%`, `%${params.search.trim()}%`);
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const total =
    db.prepare<{ total: number }>(
      `SELECT COUNT(DISTINCT l.id) AS total
       FROM lessons l
       JOIN lesson_sections ls ON ls.lesson_id = l.id
       JOIN sections sec ON sec.id = ls.section_id
       ${whereSql}`,
    ).get(...values)?.total ?? 0;

  const rows = db
    .prepare<
      {
        id: string;
        title: string;
        topic: string;
        status: LessonStatus;
        updated_at: string;
        estimated_minutes: number | null;
      }[]
    >(
      `SELECT
        l.id,
        l.title,
        l.topic,
        l.status,
        l.updated_at,
        l.estimated_minutes
      FROM lessons l
      JOIN lesson_sections ls ON ls.lesson_id = l.id
      JOIN sections sec ON sec.id = ls.section_id
      ${whereSql}
      GROUP BY l.id
      ORDER BY l.updated_at DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, offset)
    .map((row) => ({
      id: row.id,
      title: row.title,
      topic: row.topic,
      status: row.status,
      updatedAt: row.updated_at,
      estimatedMinutes: row.estimated_minutes,
    }));

  return {
    data: rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export function listTeacherSectionQuizzes(params: {
  teacherId: string;
  subjectId: string;
  subjectName: string;
  sectionId: string;
  status?: QuizStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}): PaginatedResult<{
  id: string;
  title: string;
  status: QuizStatus;
  updatedAt: string;
  lessonId: string | null;
  lessonTitle: string | null;
  passingScore: number;
  timeLimitSec: number | null;
  maxAttempts: number;
  questionCount: number;
  showAnswerKey: boolean;
}> {
  const db = getDb();
  const page = safePage(params.page);
  const pageSize = safePageSize(params.pageSize, 50, 10);
  const offset = (page - 1) * pageSize;

  const filters: string[] = [
    "EXISTS (SELECT 1 FROM section_subject_teachers sst WHERE sst.section_id = ? AND sst.subject_id = ? AND sst.teacher_id = ? AND sst.is_active = 1)",
    "(l.subject_id = ? OR lower(l.subject) = lower(?))",
    `(
      EXISTS (SELECT 1 FROM quiz_sections qs WHERE qs.quiz_id = q.id AND qs.section_id = ?)
      OR EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = q.lesson_id AND ls.section_id = ?)
    )`,
  ];
  const values: unknown[] = [
    params.sectionId,
    params.subjectId,
    params.teacherId,
    params.subjectId,
    params.subjectName,
    params.sectionId,
    params.sectionId,
  ];

  if (params.status) {
    filters.push("q.status = ?");
    values.push(params.status);
  }
  if (params.search?.trim()) {
    filters.push("(q.title LIKE ? OR q.description LIKE ?)");
    values.push(`%${params.search.trim()}%`, `%${params.search.trim()}%`);
  }

  const whereSql = `WHERE ${filters.join(" AND ")}`;
  const total =
    db.prepare<{ total: number }>(
      `SELECT COUNT(DISTINCT q.id) AS total
       FROM quizzes q
       LEFT JOIN lessons l ON l.id = q.lesson_id
       ${whereSql}`,
    ).get(...values)?.total ?? 0;

  const rows = db
    .prepare<
      {
        id: string;
        title: string;
        status: QuizStatus;
        updated_at: string;
        lesson_id: string | null;
        lesson_title: string | null;
        passing_score: number;
        time_limit_sec: number | null;
        max_attempts: number;
        question_count: number;
        show_answer_key: number;
      }[]
    >(
      `SELECT
        q.id,
        q.title,
        q.status,
        q.updated_at,
        q.lesson_id,
        l.title AS lesson_title,
        q.passing_score,
        q.time_limit_sec,
        q.max_attempts,
        COUNT(qq.id) AS question_count,
        q.show_answer_key
      FROM quizzes q
      LEFT JOIN lessons l ON l.id = q.lesson_id
      LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
      ${whereSql}
      GROUP BY q.id
      ORDER BY q.updated_at DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...values, pageSize, offset)
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      updatedAt: row.updated_at,
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      passingScore: row.passing_score,
      timeLimitSec: row.time_limit_sec,
      maxAttempts: row.max_attempts,
      questionCount: row.question_count,
      showAnswerKey: toBoolean(row.show_answer_key),
    }));

  return {
    data: rows,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}
