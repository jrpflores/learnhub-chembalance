import crypto from "node:crypto";
import { getDb } from "@/lib/db";

type SourceLessonRow = {
  id: string;
  teacher_id: string;
  subject_id: string | null;
  title: string;
  short_description: string;
  content_markdown: string;
  cover_image_url: string | null;
  difficulty: string | null;
  subject: string;
  topic: string;
  unit: string | null;
  status: string;
  estimated_minutes: number | null;
  tags_json: string | null;
  published_at: string | null;
};

type SourceQuizRow = {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  passing_score: number;
  time_limit_sec: number | null;
  max_attempts: number;
  status: string;
  available_from: string | null;
  available_until: string | null;
  randomize_questions: number;
  randomize_options: number;
  feedback_mode: string;
  explanation_mode: string;
  show_answer_key: number;
  published_at: string | null;
};

type SourceQuizQuestionRow = {
  question_id: string;
  position: number;
  points: number;
  is_required: number;
};

/**
 * Copy a lesson + its quizzes into a section as new rows.
 * Does not copy attempts, answers, progress, or practice history.
 */
export function importLessonIntoSection(payload: {
  sourceLessonId: string;
  sectionId: string;
  teacherId: string;
  assignedById?: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  const source = db
    .prepare<SourceLessonRow>(
      `SELECT
         id, teacher_id, subject_id, title, short_description, content_markdown,
         cover_image_url, difficulty, subject, topic, unit, status,
         estimated_minutes, tags_json, published_at
       FROM lessons
       WHERE id = ?
       LIMIT 1`,
    )
    .get(payload.sourceLessonId);

  if (!source) {
    return {
      success: false as const,
      status: 404 as const,
      error: "Lesson not found.",
    };
  }

  const alreadyLinked = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM lesson_sections
       WHERE lesson_id = ? AND section_id = ?`,
    )
    .get(payload.sourceLessonId, payload.sectionId);
  if ((alreadyLinked?.total ?? 0) > 0) {
    return {
      success: false as const,
      status: 409 as const,
      error: "Lesson is already available in this section.",
    };
  }

  // Soft duplicate guard: same title + topic already present in target section.
  const duplicateCopy = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM lesson_sections ls
       JOIN lessons l ON l.id = ls.lesson_id
       WHERE ls.section_id = ?
         AND lower(l.title) = lower(?)
         AND lower(l.topic) = lower(?)
         AND (
           (? IS NOT NULL AND l.subject_id = ?)
           OR lower(l.subject) = lower(?)
         )`,
    )
    .get(
      payload.sectionId,
      source.title,
      source.topic,
      source.subject_id,
      source.subject_id,
      source.subject,
    );
  if ((duplicateCopy?.total ?? 0) > 0) {
    return {
      success: false as const,
      status: 409 as const,
      error: "A matching lesson is already imported into this section.",
    };
  }

  const quizzes = db
    .prepare<SourceQuizRow[]>(
      `SELECT
         id, title, description, instructions, passing_score, time_limit_sec,
         max_attempts, status, available_from, available_until,
         randomize_questions, randomize_options, feedback_mode, explanation_mode,
         show_answer_key, published_at
       FROM quizzes
       WHERE lesson_id = ?
       ORDER BY created_at ASC`,
    )
    .all(payload.sourceLessonId);

  const newLessonId = crypto.randomUUID();

  try {
    const tx = db.transaction(() => {
      db.prepare(
        `INSERT INTO lessons (
          id, teacher_id, subject_id, title, short_description, content_markdown, cover_image_url,
          difficulty, subject, topic, unit, status, estimated_minutes, tags_json,
          published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newLessonId,
        payload.teacherId,
        source.subject_id,
        source.title,
        source.short_description,
        source.content_markdown,
        source.cover_image_url,
        source.difficulty,
        source.subject,
        source.topic,
        source.unit,
        source.status,
        source.estimated_minutes,
        source.tags_json ?? "[]",
        source.status === "PUBLISHED" ? (source.published_at ?? now) : null,
        now,
        now,
      );

      for (const quiz of quizzes) {
        const newQuizId = crypto.randomUUID();
        db.prepare(
          `INSERT INTO quizzes (
            id, teacher_id, lesson_id, title, description, instructions,
            passing_score, time_limit_sec, max_attempts, status,
            available_from, available_until, randomize_questions, randomize_options,
            feedback_mode, explanation_mode, show_answer_key, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newQuizId,
          payload.teacherId,
          newLessonId,
          quiz.title,
          quiz.description,
          quiz.instructions,
          quiz.passing_score,
          quiz.time_limit_sec,
          quiz.max_attempts,
          quiz.status,
          quiz.available_from,
          quiz.available_until,
          quiz.randomize_questions,
          quiz.randomize_options,
          quiz.feedback_mode,
          quiz.explanation_mode,
          quiz.show_answer_key,
          quiz.status === "PUBLISHED" ? (quiz.published_at ?? now) : null,
          now,
          now,
        );

        const questions = db
          .prepare<SourceQuizQuestionRow[]>(
            `SELECT question_id, position, points, is_required
             FROM quiz_questions
             WHERE quiz_id = ?
             ORDER BY position ASC`,
          )
          .all(quiz.id);

        for (const question of questions) {
          db.prepare(
            `INSERT INTO quiz_questions (
              id, quiz_id, question_id, position, points, is_required
            ) VALUES (?, ?, ?, ?, ?, ?)`,
          ).run(
            crypto.randomUUID(),
            newQuizId,
            question.question_id,
            question.position,
            question.points,
            question.is_required,
          );
        }

        // Scope quiz to target section only (fresh assignment, no attempt history).
        db.prepare(
          `INSERT OR IGNORE INTO quiz_sections (id, quiz_id, section_id, assigned_by_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          newQuizId,
          payload.sectionId,
          payload.assignedById ?? payload.teacherId,
          now,
        );
      }

      db.prepare(
        `INSERT INTO lesson_sections (id, lesson_id, section_id, assigned_by_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        newLessonId,
        payload.sectionId,
        payload.assignedById ?? payload.teacherId,
        now,
      );
    });

    tx();
  } catch {
    return {
      success: false as const,
      status: 409 as const,
      error: "Unable to import lesson because dependent records could not be copied.",
    };
  }

  return {
    success: true as const,
    lessonId: newLessonId,
    quizCount: quizzes.length,
  };
}
