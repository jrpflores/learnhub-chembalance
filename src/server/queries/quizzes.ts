import crypto from "node:crypto";
import { getDb, parseJson, stringifyJson, toBoolean } from "@/lib/db";
import type {
  ExplanationMode,
  FeedbackMode,
  QuestionType,
  QuizStatus,
  Role,
} from "@/domain/types";

export function listQuizzes(params: {
  teacherId?: string;
  accessibleTeacherId?: string;
  lessonId?: string;
  status?: QuizStatus;
  search?: string;
}) {
  const db = getDb();

  const where: string[] = [];
  const values: unknown[] = [];

  if (params.teacherId) {
    where.push("q.teacher_id = ?");
    values.push(params.teacherId);
  }

  if (params.accessibleTeacherId) {
    where.push(`EXISTS (
      SELECT 1
      FROM lessons l_access
      JOIN teacher_subjects ts ON ts.is_active = 1
      JOIN subjects s ON s.id = ts.subject_id
      WHERE l_access.id = q.lesson_id
        AND ts.teacher_id = ?
        AND (
          l_access.subject_id = ts.subject_id
          OR lower(l_access.subject) = lower(s.name)
        )
    )`);
    values.push(params.accessibleTeacherId);
  }

  if (params.lessonId) {
    where.push("q.lesson_id = ?");
    values.push(params.lessonId);
  }

  if (params.status) {
    where.push("q.status = ?");
    values.push(params.status);
  }

  if (params.search) {
    where.push("(q.title LIKE ? OR q.description LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  return db
    .prepare<
      {
        id: string;
        title: string;
        description: string;
        passing_score: number;
        time_limit_sec: number | null;
        max_attempts: number;
        status: QuizStatus;
        available_from: string | null;
        available_until: string | null;
        randomize_questions: number;
        randomize_options: number;
        feedback_mode: FeedbackMode;
        explanation_mode: ExplanationMode;
        show_answer_key: number;
        lesson_id: string | null;
        lesson_title: string | null;
        teacher_id: string;
        teacher_name: string;
        updated_at: string;
        question_count: number;
      }[]
    >(
      `SELECT
         q.id,
         q.title,
         q.description,
         q.passing_score,
         q.time_limit_sec,
         q.max_attempts,
         q.status,
         q.available_from,
         q.available_until,
         q.randomize_questions,
         q.randomize_options,
         q.feedback_mode,
         q.explanation_mode,
         q.show_answer_key,
         q.lesson_id,
         l.title AS lesson_title,
         q.teacher_id,
         u.full_name AS teacher_name,
         q.updated_at,
         COUNT(qq.id) AS question_count
       FROM quizzes q
       JOIN users u ON u.id = q.teacher_id
       LEFT JOIN lessons l ON l.id = q.lesson_id
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       ${whereSql}
       GROUP BY q.id
       ORDER BY q.updated_at DESC`,
    )
    .all(...values)
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      passingScore: row.passing_score,
      timeLimitSec: row.time_limit_sec,
      maxAttempts: row.max_attempts,
      status: row.status,
      availableFrom: row.available_from,
      availableUntil: row.available_until,
      randomizeQuestions: toBoolean(row.randomize_questions),
      randomizeOptions: toBoolean(row.randomize_options),
      feedbackMode: row.feedback_mode,
      explanationMode: row.explanation_mode,
      showAnswerKey: toBoolean(row.show_answer_key),
      lessonId: row.lesson_id,
      lessonTitle: row.lesson_title,
      teacherId: row.teacher_id,
      teacherName: row.teacher_name,
      updatedAt: row.updated_at,
      questionCount: row.question_count,
    }));
}

export function getQuizById(quizId: string) {
  const db = getDb();

  const quiz = db
    .prepare<{
      id: string;
      teacher_id: string;
      lesson_id: string | null;
      title: string;
      description: string;
      instructions: string | null;
      passing_score: number;
      time_limit_sec: number | null;
      max_attempts: number;
      status: QuizStatus;
      available_from: string | null;
      available_until: string | null;
      randomize_questions: number;
      randomize_options: number;
      feedback_mode: FeedbackMode;
      explanation_mode: ExplanationMode;
      show_answer_key: number;
      lesson_title: string | null;
      teacher_name: string;
      published_at: string | null;
    }>(
      `SELECT
        q.id,
        q.teacher_id,
        q.lesson_id,
        q.title,
        q.description,
        q.instructions,
        q.passing_score,
        q.time_limit_sec,
        q.max_attempts,
        q.status,
        q.available_from,
        q.available_until,
        q.randomize_questions,
        q.randomize_options,
        q.feedback_mode,
        q.explanation_mode,
        q.show_answer_key,
        q.published_at,
        l.title AS lesson_title,
        u.full_name AS teacher_name
      FROM quizzes q
      JOIN users u ON u.id = q.teacher_id
      LEFT JOIN lessons l ON l.id = q.lesson_id
      WHERE q.id = ?
      LIMIT 1`,
    )
    .get(quizId);

  if (!quiz) {
    return null;
  }

  const questions = db
    .prepare<
      {
        quiz_question_id: string;
        question_id: string;
        position: number;
        points: number;
        is_required: number;
        subject: string;
        topic: string;
        difficulty: string;
        type: QuestionType;
        prompt_markdown: string;
        explanation_markdown: string | null;
        hint_markdown: string | null;
        reference_answer: string | null;
        grading_keywords_json: string | null;
      }[]
    >(
      `SELECT
        qq.id AS quiz_question_id,
        qq.question_id,
        qq.position,
        qq.points,
        qq.is_required,
        qb.subject,
        qb.topic,
        qb.difficulty,
        qb.type,
        qb.prompt_markdown,
        qb.explanation_markdown,
        qb.hint_markdown,
        qb.reference_answer,
        qb.grading_keywords_json
      FROM quiz_questions qq
      JOIN question_bank_entries qb ON qb.id = qq.question_id
      WHERE qq.quiz_id = ?
      ORDER BY qq.position ASC`,
    )
    .all(quizId);

  const options = db
    .prepare<
      {
        id: string;
        question_id: string;
        label: string;
        value: string;
        is_correct: number;
        position: number;
      }[]
    >(
      `SELECT id, question_id, label, value, is_correct, position
       FROM question_options
       WHERE question_id IN (${questions.map(() => "?").join(",") || "''"})
       ORDER BY position ASC`,
    )
    .all(...questions.map((q) => q.question_id));

  const optionsByQuestion = new Map<string, typeof options>();
  options.forEach((option) => {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  });

  return {
    id: quiz.id,
    teacherId: quiz.teacher_id,
    lessonId: quiz.lesson_id,
    lessonTitle: quiz.lesson_title,
    teacherName: quiz.teacher_name,
    title: quiz.title,
    description: quiz.description,
    instructions: quiz.instructions,
    passingScore: quiz.passing_score,
    timeLimitSec: quiz.time_limit_sec,
    maxAttempts: quiz.max_attempts,
    status: quiz.status,
    availableFrom: quiz.available_from,
    availableUntil: quiz.available_until,
    randomizeQuestions: toBoolean(quiz.randomize_questions),
    randomizeOptions: toBoolean(quiz.randomize_options),
    feedbackMode: quiz.feedback_mode,
    explanationMode: quiz.explanation_mode,
    showAnswerKey: toBoolean(quiz.show_answer_key),
    publishedAt: quiz.published_at,
    questions: questions.map((question) => ({
      quizQuestionId: question.quiz_question_id,
      questionId: question.question_id,
      position: question.position,
      points: question.points,
      isRequired: toBoolean(question.is_required),
      subject: question.subject,
      topic: question.topic,
      difficulty: question.difficulty,
      type: question.type,
      promptMarkdown: question.prompt_markdown,
      explanationMarkdown: question.explanation_markdown,
      hintMarkdown: question.hint_markdown,
      referenceAnswer: question.reference_answer,
      gradingKeywords: parseJson<string[]>(question.grading_keywords_json, []),
      options: (optionsByQuestion.get(question.question_id) ?? []).map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        isCorrect: toBoolean(option.is_correct),
        position: option.position,
      })),
    })),
  };
}

export function createQuiz(payload: {
  teacherId: string;
  lessonId?: string;
  title: string;
  description: string;
  instructions?: string;
  passingScore?: number;
  timeLimitSec?: number;
  maxAttempts?: number;
  status?: QuizStatus;
  availableFrom?: string;
  availableUntil?: string;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  feedbackMode?: FeedbackMode;
  explanationMode?: ExplanationMode;
  showAnswerKey?: boolean;
}) {
  const db = getDb();
  const quizId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO quizzes (
      id, teacher_id, lesson_id, title, description, instructions,
      passing_score, time_limit_sec, max_attempts, status,
      available_from, available_until, randomize_questions, randomize_options,
      feedback_mode, explanation_mode, show_answer_key, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    quizId,
    payload.teacherId,
    payload.lessonId ?? null,
    payload.title,
    payload.description,
    payload.instructions ?? null,
    payload.passingScore ?? 70,
    payload.timeLimitSec ?? null,
    payload.maxAttempts ?? 3,
    payload.status ?? "DRAFT",
    payload.availableFrom ?? null,
    payload.availableUntil ?? null,
    payload.randomizeQuestions ? 1 : 0,
    payload.randomizeOptions ? 1 : 0,
    payload.feedbackMode ?? "INSTANT",
    payload.explanationMode ?? "AFTER_SUBMISSION",
    payload.showAnswerKey === undefined ? 1 : payload.showAnswerKey ? 1 : 0,
    payload.status === "PUBLISHED" ? now : null,
    now,
    now,
  );

  return quizId;
}

export function updateQuiz(
  quizId: string,
  payload: {
    lessonId?: string | null;
    title?: string;
    description?: string;
    instructions?: string | null;
    passingScore?: number;
    timeLimitSec?: number | null;
    maxAttempts?: number;
    status?: QuizStatus;
    availableFrom?: string | null;
    availableUntil?: string | null;
    randomizeQuestions?: boolean;
    randomizeOptions?: boolean;
    feedbackMode?: FeedbackMode;
    explanationMode?: ExplanationMode;
    showAnswerKey?: boolean;
  },
) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.lessonId !== undefined) {
    updates.push("lesson_id = ?");
    values.push(payload.lessonId);
  }

  if (payload.title !== undefined) {
    updates.push("title = ?");
    values.push(payload.title);
  }

  if (payload.description !== undefined) {
    updates.push("description = ?");
    values.push(payload.description);
  }

  if (payload.instructions !== undefined) {
    updates.push("instructions = ?");
    values.push(payload.instructions);
  }

  if (payload.passingScore !== undefined) {
    updates.push("passing_score = ?");
    values.push(payload.passingScore);
  }

  if (payload.timeLimitSec !== undefined) {
    updates.push("time_limit_sec = ?");
    values.push(payload.timeLimitSec);
  }

  if (payload.maxAttempts !== undefined) {
    updates.push("max_attempts = ?");
    values.push(payload.maxAttempts);
  }

  if (payload.status !== undefined) {
    updates.push("status = ?");
    values.push(payload.status);
    if (payload.status === "PUBLISHED") {
      updates.push("published_at = COALESCE(published_at, ?)");
      values.push(new Date().toISOString());
    }
  }

  if (payload.availableFrom !== undefined) {
    updates.push("available_from = ?");
    values.push(payload.availableFrom);
  }

  if (payload.availableUntil !== undefined) {
    updates.push("available_until = ?");
    values.push(payload.availableUntil);
  }

  if (payload.randomizeQuestions !== undefined) {
    updates.push("randomize_questions = ?");
    values.push(payload.randomizeQuestions ? 1 : 0);
  }

  if (payload.randomizeOptions !== undefined) {
    updates.push("randomize_options = ?");
    values.push(payload.randomizeOptions ? 1 : 0);
  }

  if (payload.feedbackMode !== undefined) {
    updates.push("feedback_mode = ?");
    values.push(payload.feedbackMode);
  }

  if (payload.explanationMode !== undefined) {
    updates.push("explanation_mode = ?");
    values.push(payload.explanationMode);
  }

  if (payload.showAnswerKey !== undefined) {
    updates.push("show_answer_key = ?");
    values.push(payload.showAnswerKey ? 1 : 0);
  }

  if (updates.length === 0) {
    return;
  }

  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(quizId);

  db.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ?`).run(...values);
}

export function archiveQuiz(quizId: string) {
  const db = getDb();
  db.prepare("UPDATE quizzes SET status = 'ARCHIVED', updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    quizId,
  );
}

export function deleteQuiz(quizId: string) {
  const db = getDb();
  // recommendations.quiz_id has no ON DELETE CASCADE — clear first.
  db.transaction(() => {
    db.prepare("DELETE FROM recommendations WHERE quiz_id = ?").run(quizId);
    db.prepare("DELETE FROM quizzes WHERE id = ?").run(quizId);
  })();
}

export function setQuizQuestions(
  quizId: string,
  questionAssignments: { questionId: string; position: number; points: number; isRequired: boolean }[],
) {
  const db = getDb();
  const now = new Date().toISOString();
  const POSITION_OFFSET = 10_000;

  const seenQuestionIds = new Set<string>();
  const seenPositions = new Set<number>();
  for (const assignment of questionAssignments) {
    if (seenQuestionIds.has(assignment.questionId)) {
      throw new Error("Duplicate question assignment is not allowed.");
    }
    if (seenPositions.has(assignment.position)) {
      throw new Error("Duplicate question position is not allowed.");
    }
    seenQuestionIds.add(assignment.questionId);
    seenPositions.add(assignment.position);
  }

  const tx = db.transaction(() => {
    const existingRows = db
      .prepare<
        {
          id: string;
          question_id: string;
        }[]
      >(
        `SELECT id, question_id
         FROM quiz_questions
         WHERE quiz_id = ?`,
      )
      .all(quizId);

    const existingByQuestionId = new Map(existingRows.map((row) => [row.question_id, row]));

    for (const assignment of questionAssignments) {
      const existing = existingByQuestionId.get(assignment.questionId);
      if (existing) {
        // Stage position updates to avoid UNIQUE(quiz_id, position) collisions during reorder.
        db.prepare(
          `UPDATE quiz_questions
           SET position = ?, points = ?, is_required = ?
           WHERE id = ?`,
        ).run(
          assignment.position + POSITION_OFFSET,
          assignment.points,
          assignment.isRequired ? 1 : 0,
          existing.id,
        );
      } else {
        db.prepare(
          `INSERT INTO quiz_questions (
            id, quiz_id, question_id, position, points, is_required
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          quizId,
          assignment.questionId,
          assignment.position + POSITION_OFFSET,
          assignment.points,
          assignment.isRequired ? 1 : 0,
        );
      }
    }

    const incomingQuestionIds = questionAssignments.map((assignment) => assignment.questionId);
    if (incomingQuestionIds.length > 0) {
      const placeholders = incomingQuestionIds.map(() => "?").join(", ");
      db.prepare(
        `DELETE FROM quiz_questions
         WHERE quiz_id = ?
           AND question_id NOT IN (${placeholders})`,
      ).run(quizId, ...incomingQuestionIds);
    } else {
      db.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(quizId);
    }

    for (const assignment of questionAssignments) {
      db.prepare(
        `UPDATE quiz_questions
         SET position = ?
         WHERE quiz_id = ? AND question_id = ?`,
      ).run(assignment.position, quizId, assignment.questionId);
    }

    db.prepare("UPDATE quizzes SET updated_at = ? WHERE id = ?").run(now, quizId);
  });

  tx();
}

export function isTeacherQuizOwner(teacherId: string, quizId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>("SELECT COUNT(*) as total FROM quizzes WHERE id = ? AND teacher_id = ?")
    .get(quizId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function canTeacherAccessQuiz(teacherId: string, quizId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM quizzes q
       JOIN lessons l ON l.id = q.lesson_id
       WHERE q.id = ?
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
    .get(quizId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function countQuizzesByTeacher(teacherId: string) {
  const db = getDb();
  return (
    db
      .prepare<{ total: number }>(
        `SELECT COUNT(*) as total
         FROM quizzes q
         WHERE EXISTS (
           SELECT 1
           FROM lessons l
           JOIN teacher_subjects ts ON ts.is_active = 1
           JOIN subjects s ON s.id = ts.subject_id
           WHERE l.id = q.lesson_id
             AND ts.teacher_id = ?
             AND (
               l.subject_id = ts.subject_id
               OR lower(l.subject) = lower(s.name)
             )
         )`,
      )
      .get(teacherId)?.total ?? 0
  );
}

export function countPublishedQuizzes() {
  const db = getDb();
  return (
    db.prepare<{ total: number }>("SELECT COUNT(*) as total FROM quizzes WHERE status = 'PUBLISHED'").get()
      ?.total ?? 0
  );
}

export function listStudentQuizzes(studentId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        id: string;
        title: string;
        description: string;
        lesson_id: string | null;
        lesson_title: string | null;
        passing_score: number;
        time_limit_sec: number | null;
        max_attempts: number;
        available_from: string | null;
        available_until: string | null;
        question_count: number;
        attempts_used: number;
        in_progress_count: number;
        best_score: number | null;
        latest_outcome: string | null;
        latest_attempt_id: string | null;
      }[]
    >(
      `SELECT
        q.id,
        q.title,
        q.description,
        q.lesson_id,
        l.title AS lesson_title,
        q.passing_score,
        q.time_limit_sec,
        q.max_attempts,
        q.available_from,
        q.available_until,
        COUNT(DISTINCT qq.id) AS question_count,
        COUNT(DISTINCT CASE WHEN qa.status != 'ABANDONED' THEN qa.id END) AS attempts_used,
        COUNT(DISTINCT CASE WHEN qa.status = 'IN_PROGRESS' THEN qa.id END) AS in_progress_count,
        MAX(qa.score_percent) AS best_score,
        (
          SELECT qa2.outcome
          FROM quiz_attempts qa2
          WHERE qa2.quiz_id = q.id AND qa2.student_id = ?
          ORDER BY qa2.created_at DESC
          LIMIT 1
        ) AS latest_outcome,
        (
          SELECT qa2.id
          FROM quiz_attempts qa2
          WHERE qa2.quiz_id = q.id AND qa2.student_id = ?
          ORDER BY qa2.created_at DESC
          LIMIT 1
        ) AS latest_attempt_id
      FROM quizzes q
      JOIN lessons l ON l.id = q.lesson_id AND l.status = 'PUBLISHED'
      JOIN subjects sub ON sub.is_active = 1 AND (sub.id = l.subject_id OR sub.name = l.subject)
      LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
      LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.student_id = ?
      WHERE q.status = 'PUBLISHED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss
          JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
          LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
          LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
          WHERE ss.student_id = ?
            AND ss.is_active = 1
            AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
        )
      GROUP BY q.id
      ORDER BY q.published_at DESC`,
    )
    .all(studentId, studentId, studentId, studentId)
    .map((row) => {
      const maxAttempts = Number.isFinite(row.max_attempts) ? row.max_attempts : 3;
      const unlimited = maxAttempts <= 0;
      const attemptsUsed = row.attempts_used;
      const hasInProgress = row.in_progress_count > 0;
      const canStartNew = unlimited || attemptsUsed < maxAttempts;
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        lessonId: row.lesson_id,
        lessonTitle: row.lesson_title,
        passingScore: row.passing_score,
        timeLimitSec: row.time_limit_sec,
        maxAttempts,
        availableFrom: row.available_from,
        availableUntil: row.available_until,
        questionCount: row.question_count,
        attemptsUsed,
        hasInProgress,
        bestScore: row.best_score,
        latestOutcome: row.latest_outcome,
        latestAttemptId: row.latest_attempt_id,
        // Allow resume even when the open attempt already filled the last slot.
        canAttempt: canStartNew || hasInProgress,
      };
    });
}

export function listStudentAttempts(studentId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        id: string;
        quiz_id: string;
        quiz_title: string;
        attempt_number: number;
        outcome: string;
        score_percent: number | null;
        time_spent_sec: number | null;
        created_at: string;
      }[]
    >(
      `SELECT
        qa.id,
        qa.quiz_id,
        q.title AS quiz_title,
        qa.attempt_number,
        qa.outcome,
        qa.score_percent,
        qa.time_spent_sec,
        qa.created_at
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      WHERE qa.student_id = ?
        AND q.status != 'ARCHIVED'
        AND l.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss
          JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
          LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
          LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
          WHERE ss.student_id = qa.student_id
            AND ss.is_active = 1
            AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
        )
      ORDER BY qa.created_at DESC`,
    )
    .all(studentId)
    .map((row) => ({
      id: row.id,
      quizId: row.quiz_id,
      quizTitle: row.quiz_title,
      attemptNumber: row.attempt_number,
      outcome: row.outcome,
      scorePercent: row.score_percent,
      timeSpentSec: row.time_spent_sec,
      createdAt: row.created_at,
    }));
}

export function getAttemptById(attemptId: string) {
  const db = getDb();

  const attempt = db
    .prepare<{
      id: string;
      quiz_id: string;
      student_id: string;
      attempt_number: number;
      status: string;
      outcome: string;
      started_at: string;
      submitted_at: string | null;
      graded_at: string | null;
      time_spent_sec: number | null;
      score_percent: number | null;
      correct_count: number | null;
      wrong_count: number | null;
      pass_threshold: number | null;
      xp_awarded: number;
      quiz_title: string;
      quiz_description: string;
      explanation_mode: ExplanationMode;
      feedback_mode: FeedbackMode;
      show_answer_key: number;
      passing_score: number;
    }>(
      `SELECT
        qa.id,
        qa.quiz_id,
        qa.student_id,
        qa.attempt_number,
        qa.status,
        qa.outcome,
        qa.started_at,
        qa.submitted_at,
        qa.graded_at,
        qa.time_spent_sec,
        qa.score_percent,
        qa.correct_count,
        qa.wrong_count,
        qa.pass_threshold,
        qa.xp_awarded,
        q.title AS quiz_title,
        q.description AS quiz_description,
        q.explanation_mode,
        q.feedback_mode,
        q.show_answer_key,
        q.passing_score
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.id = ?
      LIMIT 1`,
    )
    .get(attemptId);

  if (!attempt) {
    return null;
  }

  const answers = db
    .prepare<
      {
        id: string;
        quiz_question_id: string;
        question_id: string;
        selected_option_ids_json: string | null;
        answer_text: string | null;
        is_correct: number | null;
        earned_points: number | null;
        max_points: number;
        feedback: string | null;
        graded_by_ai: number;
        topic_snapshot: string | null;
        prompt_markdown: string;
        type: QuestionType;
        explanation_markdown: string | null;
        dynamic_explanation_markdown: string | null;
        reference_answer: string | null;
      }[]
    >(
      `SELECT
        aa.id,
        aa.quiz_question_id,
        aa.question_id,
        aa.selected_option_ids_json,
        aa.answer_text,
        aa.is_correct,
        aa.earned_points,
        aa.max_points,
        aa.feedback,
        aa.graded_by_ai,
        aa.topic_snapshot,
        qb.prompt_markdown,
        qb.type,
        qb.explanation_markdown,
        qb.reference_answer,
        CASE
          WHEN qb.type = 'SHORT_ANSWER' AND qb.explanation_markdown IS NOT NULL AND trim(qb.explanation_markdown) <> ''
            THEN qb.explanation_markdown
          WHEN qb.type = 'SHORT_ANSWER' AND aa.feedback IS NOT NULL AND trim(aa.feedback) <> ''
            THEN aa.feedback
          ELSE qb.explanation_markdown
        END AS dynamic_explanation_markdown
      FROM attempt_answers aa
      JOIN question_bank_entries qb ON qb.id = aa.question_id
      WHERE aa.attempt_id = ?
      ORDER BY aa.created_at ASC`,
    )
    .all(attemptId);

  const questionIds = answers.map((answer) => answer.question_id);

  const options = questionIds.length
    ? db
        .prepare<
          {
            id: string;
            question_id: string;
            label: string;
            value: string;
            is_correct: number;
            position: number;
          }[]
        >(
          `SELECT id, question_id, label, value, is_correct, position
           FROM question_options
           WHERE question_id IN (${questionIds.map(() => "?").join(",")})
           ORDER BY position ASC`,
        )
        .all(...questionIds)
    : [];

  const optionsMap = new Map<string, typeof options>();
  options.forEach((option) => {
    const list = optionsMap.get(option.question_id) ?? [];
    list.push(option);
    optionsMap.set(option.question_id, list);
  });

  return {
    id: attempt.id,
    quizId: attempt.quiz_id,
    studentId: attempt.student_id,
    attemptNumber: attempt.attempt_number,
    status: attempt.status,
    outcome: attempt.outcome,
    startedAt: attempt.started_at,
    submittedAt: attempt.submitted_at,
    gradedAt: attempt.graded_at,
    timeSpentSec: attempt.time_spent_sec,
    scorePercent: attempt.score_percent,
    correctCount: attempt.correct_count,
    wrongCount: attempt.wrong_count,
    passThreshold: attempt.pass_threshold,
    xpAwarded: attempt.xp_awarded,
    quizTitle: attempt.quiz_title,
    quizDescription: attempt.quiz_description,
    explanationMode: attempt.explanation_mode,
    feedbackMode: attempt.feedback_mode,
    showAnswerKey: toBoolean(attempt.show_answer_key),
    passingScore: attempt.passing_score,
    answers: answers.map((answer) => ({
      id: answer.id,
      quizQuestionId: answer.quiz_question_id,
      questionId: answer.question_id,
      selectedOptionIds: parseJson<string[]>(answer.selected_option_ids_json, []),
      answerText: answer.answer_text,
      isCorrect: answer.is_correct === null ? null : toBoolean(answer.is_correct),
      earnedPoints: answer.earned_points,
      maxPoints: answer.max_points,
      feedback: answer.feedback,
      gradedByAi: toBoolean(answer.graded_by_ai),
      topicSnapshot: answer.topic_snapshot,
      promptMarkdown: answer.prompt_markdown,
      type: answer.type,
      referenceAnswer: answer.reference_answer,
      explanationMarkdown: answer.dynamic_explanation_markdown ?? answer.explanation_markdown,
      options: (optionsMap.get(answer.question_id) ?? []).map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        isCorrect: toBoolean(option.is_correct),
        position: option.position,
      })),
    })),
  };
}

export function createAttempt(payload: {
  quizId: string;
  studentId: string;
  attemptNumber: number;
}) {
  const db = getDb();
  const attemptId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO quiz_attempts (
      id, quiz_id, student_id, attempt_number, status, outcome,
      started_at, pass_threshold, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'IN_PROGRESS', 'PENDING', ?,
      (SELECT passing_score FROM quizzes WHERE id = ?), ?, ?)`,
  ).run(attemptId, payload.quizId, payload.studentId, payload.attemptNumber, now, payload.quizId, now, now);

  return attemptId;
}

export function saveAttemptAnswer(payload: {
  attemptId: string;
  quizQuestionId: string;
  questionId: string;
  selectedOptionIds?: string[];
  answerText?: string;
  maxPoints: number;
  topicSnapshot?: string;
}) {
  const db = getDb();
  const existing = db
    .prepare<{ id: string }>(
      `SELECT id FROM attempt_answers
       WHERE attempt_id = ? AND quiz_question_id = ?
       LIMIT 1`,
    )
    .get(payload.attemptId, payload.quizQuestionId);

  const now = new Date().toISOString();

  if (!existing) {
    db.prepare(
      `INSERT INTO attempt_answers (
        id, attempt_id, quiz_question_id, question_id,
        selected_option_ids_json, answer_text, max_points,
        topic_snapshot, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      payload.attemptId,
      payload.quizQuestionId,
      payload.questionId,
      payload.selectedOptionIds ? stringifyJson(payload.selectedOptionIds) : null,
      payload.answerText ?? null,
      payload.maxPoints,
      payload.topicSnapshot ?? null,
      now,
      now,
    );
  } else {
    db.prepare(
      `UPDATE attempt_answers
       SET selected_option_ids_json = ?, answer_text = ?, max_points = ?, topic_snapshot = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      payload.selectedOptionIds ? stringifyJson(payload.selectedOptionIds) : null,
      payload.answerText ?? null,
      payload.maxPoints,
      payload.topicSnapshot ?? null,
      now,
      existing.id,
    );
  }
}

export function finalizeAttempt(payload: {
  attemptId: string;
  scorePercent: number;
  correctCount: number;
  wrongCount: number;
  outcome: "PASSED" | "FAILED";
  xpAwarded: number;
  timeSpentSec: number;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE quiz_attempts
     SET status = 'GRADED',
         outcome = ?,
         submitted_at = ?,
         graded_at = ?,
         time_spent_sec = ?,
         score_percent = ?,
         correct_count = ?,
         wrong_count = ?,
         xp_awarded = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    payload.outcome,
    now,
    now,
    payload.timeSpentSec,
    payload.scorePercent,
    payload.correctCount,
    payload.wrongCount,
    payload.xpAwarded,
    now,
    payload.attemptId,
  );
}

export function markAttemptSubmitted(payload: {
  attemptId: string;
  timeSpentSec: number;
}) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE quiz_attempts
     SET status = 'SUBMITTED',
         outcome = 'PENDING',
         submitted_at = ?,
         time_spent_sec = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(now, payload.timeSpentSec, now, payload.attemptId);
}

export function listQuizAnalytics(teacherId: string, filters?: { sectionId?: string; subjectId?: string }) {
  const db = getDb();
  const sectionId = filters?.sectionId?.trim();
  const subjectId = filters?.subjectId?.trim();

  const attemptJoinConditions = ["qa.quiz_id = q.id", "qa.status = 'GRADED'"];
  const joinValues: unknown[] = [];
  attemptJoinConditions.push(
    `EXISTS (
      SELECT 1
      FROM section_students ss_attempt
      JOIN sections sec_attempt ON sec_attempt.id = ss_attempt.section_id AND sec_attempt.status = 'ACTIVE'
      JOIN section_subject_teachers sst_attempt ON sst_attempt.section_id = ss_attempt.section_id
      WHERE ss_attempt.student_id = qa.student_id
        AND ss_attempt.is_active = 1
        AND sst_attempt.teacher_id = ?
        AND sst_attempt.is_active = 1
        AND (
          EXISTS (SELECT 1 FROM quiz_sections qs_attempt WHERE qs_attempt.quiz_id = q.id AND qs_attempt.section_id = ss_attempt.section_id)
          OR EXISTS (SELECT 1 FROM lesson_sections ls_attempt WHERE ls_attempt.lesson_id = q.lesson_id AND ls_attempt.section_id = ss_attempt.section_id)
        )
    )`,
  );
  joinValues.push(teacherId);
  if (sectionId) {
    attemptJoinConditions.push(
      `EXISTS (
        SELECT 1
        FROM section_students ss_attempt
        WHERE ss_attempt.student_id = qa.student_id
          AND ss_attempt.section_id = ?
          AND ss_attempt.is_active = 1
      )`,
    );
    joinValues.push(sectionId);
  }

  const where: string[] = [
    "q.status != 'ARCHIVED'",
    "l.status != 'ARCHIVED'",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
      JOIN subjects s ON s.id = sst.subject_id
      WHERE sst.teacher_id = ?
        AND sst.is_active = 1
        AND (
          l.subject_id = sst.subject_id
          OR lower(l.subject) = lower(s.name)
        )
        AND (
          EXISTS (SELECT 1 FROM quiz_sections qs_ctx WHERE qs_ctx.quiz_id = q.id AND qs_ctx.section_id = sst.section_id)
          OR EXISTS (SELECT 1 FROM lesson_sections ls_ctx WHERE ls_ctx.lesson_id = q.lesson_id AND ls_ctx.section_id = sst.section_id)
        )
    )`,
  ];
  const whereValues: unknown[] = [teacherId];

  if (sectionId) {
    where.push(
      `(
        EXISTS (SELECT 1 FROM quiz_sections qs WHERE qs.quiz_id = q.id AND qs.section_id = ?)
        OR EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = q.lesson_id AND ls.section_id = ?)
      )`,
    );
    whereValues.push(sectionId, sectionId);
  }

  if (subjectId) {
    where.push(
      "(EXISTS (SELECT 1 FROM lessons l_sub WHERE l_sub.id = q.lesson_id AND l_sub.subject_id = ?) OR EXISTS (SELECT 1 FROM lessons l_sub JOIN subjects s_sub ON s_sub.id = ? WHERE l_sub.id = q.lesson_id AND lower(l_sub.subject) = lower(s_sub.name)))",
    );
    whereValues.push(subjectId, subjectId);
  }

  return db
    .prepare<
      {
        quiz_id: string;
        title: string;
        taken_count: number;
        passed_count: number;
        failed_count: number;
        pass_rate: number;
        avg_score: number;
        highest_score: number;
        lowest_score: number;
        avg_time_spent: number;
      }[]
    >(
      `SELECT
        q.id AS quiz_id,
        q.title,
        COUNT(qa.id) AS taken_count,
        SUM(CASE WHEN qa.outcome = 'PASSED' THEN 1 ELSE 0 END) AS passed_count,
        SUM(CASE WHEN qa.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
        COALESCE(AVG(CASE WHEN qa.outcome = 'PASSED' THEN 100 ELSE 0 END), 0) AS pass_rate,
        COALESCE(AVG(qa.score_percent), 0) AS avg_score,
        COALESCE(MAX(qa.score_percent), 0) AS highest_score,
        COALESCE(MIN(qa.score_percent), 0) AS lowest_score,
        COALESCE(AVG(qa.time_spent_sec), 0) AS avg_time_spent
      FROM quizzes q
      JOIN lessons l ON l.id = q.lesson_id
      LEFT JOIN quiz_attempts qa ON ${attemptJoinConditions.join(" AND ")}
      WHERE ${where.join(" AND ")}
      GROUP BY q.id
      ORDER BY q.updated_at DESC`,
    )
    .all(...joinValues, ...whereValues)
    .map((row) => ({
      quizId: row.quiz_id,
      title: row.title,
      takenCount: row.taken_count,
      passedCount: row.passed_count,
      failedCount: row.failed_count,
      passRate: Number(row.pass_rate.toFixed(1)),
      averageScore: Number(row.avg_score.toFixed(1)),
      highestScore: Number(row.highest_score.toFixed(1)),
      lowestScore: Number(row.lowest_score.toFixed(1)),
      averageTimeSpentSec: Math.round(row.avg_time_spent),
    }));
}

export function quizQuestionAnalytics(teacherId: string, filters?: { sectionId?: string; subjectId?: string }) {
  const db = getDb();
  const sectionId = filters?.sectionId?.trim();
  const subjectId = filters?.subjectId?.trim();

  const attemptJoinConditions = ["qa.id = aa.attempt_id", "qa.status = 'GRADED'"];
  const joinValues: unknown[] = [];
  attemptJoinConditions.push(
    `EXISTS (
      SELECT 1
      FROM section_students ss_attempt
      JOIN sections sec_attempt ON sec_attempt.id = ss_attempt.section_id AND sec_attempt.status = 'ACTIVE'
      JOIN section_subject_teachers sst_attempt ON sst_attempt.section_id = ss_attempt.section_id
      WHERE ss_attempt.student_id = qa.student_id
        AND ss_attempt.is_active = 1
        AND sst_attempt.teacher_id = ?
        AND sst_attempt.is_active = 1
        AND (
          EXISTS (SELECT 1 FROM quiz_sections qs_attempt WHERE qs_attempt.quiz_id = q.id AND qs_attempt.section_id = ss_attempt.section_id)
          OR EXISTS (SELECT 1 FROM lesson_sections ls_attempt WHERE ls_attempt.lesson_id = q.lesson_id AND ls_attempt.section_id = ss_attempt.section_id)
        )
    )`,
  );
  joinValues.push(teacherId);
  if (sectionId) {
    attemptJoinConditions.push(
      `EXISTS (
        SELECT 1
        FROM section_students ss_attempt
        WHERE ss_attempt.student_id = qa.student_id
          AND ss_attempt.section_id = ?
          AND ss_attempt.is_active = 1
      )`,
    );
    joinValues.push(sectionId);
  }

  const where: string[] = [
    "q.status != 'ARCHIVED'",
    "l.status != 'ARCHIVED'",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
      JOIN subjects s ON s.id = sst.subject_id
      WHERE sst.teacher_id = ?
        AND sst.is_active = 1
        AND (
          l.subject_id = sst.subject_id
          OR lower(l.subject) = lower(s.name)
        )
        AND (
          EXISTS (SELECT 1 FROM quiz_sections qs_ctx WHERE qs_ctx.quiz_id = q.id AND qs_ctx.section_id = sst.section_id)
          OR EXISTS (SELECT 1 FROM lesson_sections ls_ctx WHERE ls_ctx.lesson_id = q.lesson_id AND ls_ctx.section_id = sst.section_id)
        )
    )`,
  ];
  const whereValues: unknown[] = [teacherId];

  if (sectionId) {
    where.push(
      `(
        EXISTS (SELECT 1 FROM quiz_sections qs WHERE qs.quiz_id = q.id AND qs.section_id = ?)
        OR EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = q.lesson_id AND ls.section_id = ?)
      )`,
    );
    whereValues.push(sectionId, sectionId);
  }

  if (subjectId) {
    where.push(
      "(EXISTS (SELECT 1 FROM lessons l_sub WHERE l_sub.id = q.lesson_id AND l_sub.subject_id = ?) OR EXISTS (SELECT 1 FROM lessons l_sub JOIN subjects s_sub ON s_sub.id = ? WHERE l_sub.id = q.lesson_id AND lower(l_sub.subject) = lower(s_sub.name)))",
    );
    whereValues.push(subjectId, subjectId);
  }

  return db
    .prepare<
      {
        question_id: string;
        prompt_markdown: string;
        topic: string;
        total_answers: number;
        incorrect_answers: number;
        accuracy: number;
      }[]
    >(
      `SELECT
        qb.id AS question_id,
        qb.prompt_markdown,
        qb.topic,
        SUM(CASE WHEN qa.id IS NOT NULL THEN 1 ELSE 0 END) AS total_answers,
        SUM(CASE WHEN qa.id IS NOT NULL AND aa.is_correct = 0 THEN 1 ELSE 0 END) AS incorrect_answers,
        COALESCE(AVG(CASE WHEN qa.id IS NOT NULL THEN CASE WHEN aa.is_correct = 1 THEN 100 ELSE 0 END END), 0) AS accuracy
      FROM question_bank_entries qb
      JOIN quiz_questions qq ON qq.question_id = qb.id
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      LEFT JOIN attempt_answers aa ON aa.quiz_question_id = qq.id
      LEFT JOIN quiz_attempts qa ON ${attemptJoinConditions.join(" AND ")}
      WHERE ${where.join(" AND ")}
      GROUP BY qb.id
      ORDER BY accuracy ASC`,
    )
    .all(...joinValues, ...whereValues)
    .map((row) => ({
      questionId: row.question_id,
      promptMarkdown: row.prompt_markdown,
      topic: row.topic,
      totalAnswers: row.total_answers,
      incorrectAnswers: row.incorrect_answers,
      accuracy: Number(row.accuracy.toFixed(1)),
    }));
}

export function teacherStudentAnalytics(teacherId: string, filters?: { sectionId?: string; subjectId?: string }) {
  const db = getDb();
  const sectionId = filters?.sectionId?.trim();
  const subjectId = filters?.subjectId?.trim();
  const where: string[] = ["sst.teacher_id = ?", "sst.is_active = 1", "sec.status = 'ACTIVE'", "ss.is_active = 1"];
  const values: unknown[] = [teacherId];
  const quizScope: string[] = ["sst_q.teacher_id = ?", "sst_q.is_active = 1", "sec_q.status = 'ACTIVE'"];
  const quizScopeValues: unknown[] = [teacherId];
  const lessonScope: string[] = ["sst_l.teacher_id = ?", "sst_l.is_active = 1", "sec_l.status = 'ACTIVE'"];
  const lessonScopeValues: unknown[] = [teacherId];

  if (sectionId) {
    where.push("sst.section_id = ?");
    values.push(sectionId);
    quizScope.push("sst_q.section_id = ?");
    quizScopeValues.push(sectionId);
    lessonScope.push("sst_l.section_id = ?");
    lessonScopeValues.push(sectionId);
  }

  if (subjectId) {
    where.push("sst.subject_id = ?");
    values.push(subjectId);
    quizScope.push("sst_q.subject_id = ?");
    quizScopeValues.push(subjectId);
    lessonScope.push("sst_l.subject_id = ?");
    lessonScopeValues.push(subjectId);
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const quizScopeSql = quizScope.join(" AND ");
  const lessonScopeSql = lessonScope.join(" AND ");

  return db
    .prepare<
      {
        student_id: string;
        full_name: string;
        quizzes_taken: number;
        average_score: number;
        passed_count: number;
        failed_count: number;
        completed_lessons: number;
        in_progress_lessons: number;
        streak_days: number;
      }[]
    >(
      `SELECT
        s.id AS student_id,
        s.full_name,
        COUNT(DISTINCT CASE WHEN lq.id IS NOT NULL THEN qa.id END) AS quizzes_taken,
        COALESCE(AVG(CASE WHEN lq.id IS NOT NULL THEN qa.score_percent END), 0) AS average_score,
        SUM(CASE WHEN lq.id IS NOT NULL AND qa.outcome = 'PASSED' THEN 1 ELSE 0 END) AS passed_count,
        SUM(CASE WHEN lq.id IS NOT NULL AND qa.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN l_progress.id IS NOT NULL AND lp.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_lessons,
        SUM(CASE WHEN l_progress.id IS NOT NULL AND lp.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress_lessons,
        s.streak_days
      FROM (
        SELECT DISTINCT u.id, u.full_name, u.streak_days
        FROM section_subject_teachers sst
        JOIN sections sec ON sec.id = sst.section_id
        JOIN section_students ss ON ss.section_id = sec.id AND ss.is_active = 1
        JOIN users u ON u.id = ss.student_id
        ${whereSql}
      ) s
      LEFT JOIN quiz_attempts qa ON qa.student_id = s.id AND qa.status = 'GRADED'
      LEFT JOIN quizzes q ON q.id = qa.quiz_id AND q.status != 'ARCHIVED'
      LEFT JOIN lessons lq ON lq.id = q.lesson_id
        AND lq.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss_q
          JOIN section_subject_teachers sst_q ON sst_q.section_id = ss_q.section_id
          JOIN sections sec_q ON sec_q.id = sst_q.section_id
          JOIN subjects sub_q ON sub_q.id = sst_q.subject_id
          WHERE ss_q.student_id = s.id
            AND ss_q.is_active = 1
            AND ${quizScopeSql}
            AND (
              lq.subject_id = sst_q.subject_id
              OR lower(lq.subject) = lower(sub_q.name)
            )
            AND (
              EXISTS (SELECT 1 FROM quiz_sections qs_q WHERE qs_q.quiz_id = q.id AND qs_q.section_id = sst_q.section_id)
              OR EXISTS (SELECT 1 FROM lesson_sections ls_q WHERE ls_q.lesson_id = q.lesson_id AND ls_q.section_id = sst_q.section_id)
            )
        )
      LEFT JOIN lesson_progress lp ON lp.student_id = s.id
      LEFT JOIN lessons l_progress ON l_progress.id = lp.lesson_id
        AND l_progress.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss_l
          JOIN section_subject_teachers sst_l ON sst_l.section_id = ss_l.section_id
          JOIN sections sec_l ON sec_l.id = sst_l.section_id
          JOIN subjects sub_l ON sub_l.id = sst_l.subject_id
          JOIN lesson_sections ls_l ON ls_l.lesson_id = l_progress.id AND ls_l.section_id = sst_l.section_id
          WHERE ss_l.student_id = s.id
            AND ss_l.is_active = 1
            AND ${lessonScopeSql}
            AND (
              l_progress.subject_id = sst_l.subject_id
              OR lower(l_progress.subject) = lower(sub_l.name)
            )
        )
      GROUP BY s.id, s.full_name, s.streak_days
      ORDER BY average_score ASC`,
    )
    .all(...values, ...quizScopeValues, ...lessonScopeValues)
    .map((row) => ({
      studentId: row.student_id,
      fullName: row.full_name,
      quizzesTaken: row.quizzes_taken,
      averageScore: Number(row.average_score.toFixed(1)),
      passedCount: row.passed_count,
      failedCount: row.failed_count,
      completedLessons: row.completed_lessons,
      inProgressLessons: row.in_progress_lessons,
      streakDays: row.streak_days,
    }));
}

export function studentQuizStats(studentId: string) {
  const db = getDb();

  const row = db
    .prepare<{
      total_quizzes: number;
      completed_quizzes: number;
      average_score: number;
      passed_quizzes: number;
      failed_quizzes: number;
    }>(
      `SELECT
        (
          SELECT COUNT(DISTINCT q.id)
          FROM quizzes q
          JOIN lessons l ON l.id = q.lesson_id AND l.status = 'PUBLISHED'
          JOIN subjects sub ON sub.is_active = 1 AND (sub.id = l.subject_id OR sub.name = l.subject)
          WHERE q.status = 'PUBLISHED'
            AND EXISTS (
              SELECT 1
              FROM section_students ss
              JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
              LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
              LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
              WHERE ss.student_id = ?
                AND ss.is_active = 1
                AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
            )
        ) AS total_quizzes,
        COUNT(DISTINCT qa.id) AS completed_quizzes,
        COALESCE(AVG(qa.score_percent), 0) AS average_score,
        SUM(CASE WHEN qa.outcome = 'PASSED' THEN 1 ELSE 0 END) AS passed_quizzes,
        SUM(CASE WHEN qa.outcome = 'FAILED' THEN 1 ELSE 0 END) AS failed_quizzes
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      WHERE qa.student_id = ?
        AND qa.status = 'GRADED'
        AND q.status != 'ARCHIVED'
        AND l.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss
          JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
          LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
          LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
          WHERE ss.student_id = qa.student_id
            AND ss.is_active = 1
            AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
        )`,
    )
    .get(studentId, studentId);

  return {
    totalQuizzes: row?.total_quizzes ?? 0,
    completedQuizzes: row?.completed_quizzes ?? 0,
    averageScore: Number((row?.average_score ?? 0).toFixed(1)),
    passedQuizzes: row?.passed_quizzes ?? 0,
    failedQuizzes: row?.failed_quizzes ?? 0,
  };
}

export function attemptTrend(studentId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        created_at: string;
        score_percent: number;
      }[]
    >(
      `SELECT qa.created_at, qa.score_percent
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE qa.student_id = ?
         AND qa.status = 'GRADED'
         AND q.status != 'ARCHIVED'
         AND l.status != 'ARCHIVED'
         AND EXISTS (
           SELECT 1
           FROM section_students ss
           JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
           LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
           LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
           WHERE ss.student_id = qa.student_id
             AND ss.is_active = 1
             AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
         )
       ORDER BY qa.created_at ASC`,
    )
    .all(studentId)
    .map((row) => ({
      date: row.created_at,
      score: row.score_percent,
    }));
}

export function getNextAttemptNumber(quizId: string, studentId: string) {
  const db = getDb();

  const row = db
    .prepare<{ max_attempt: number | null }>(
      `SELECT MAX(attempt_number) AS max_attempt
       FROM quiz_attempts
       WHERE quiz_id = ? AND student_id = ?`,
    )
    .get(quizId, studentId);

  return (row?.max_attempt ?? 0) + 1;
}

export function getInProgressAttempt(quizId: string, studentId: string) {
  const db = getDb();

  return (
    db
      .prepare<{ id: string; attempt_number: number }>(
        `SELECT id, attempt_number
         FROM quiz_attempts
         WHERE quiz_id = ? AND student_id = ? AND status = 'IN_PROGRESS'
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(quizId, studentId) ?? null
  );
}

export function getQuizAttemptUsage(quizId: string, studentId: string) {
  const db = getDb();

  const row = db
    .prepare<{ used: number; in_progress: number; max_attempts: number | null }>(
      `SELECT
         (SELECT COUNT(*) FROM quiz_attempts
          WHERE quiz_id = ? AND student_id = ? AND status != 'ABANDONED') AS used,
         (SELECT COUNT(*) FROM quiz_attempts
          WHERE quiz_id = ? AND student_id = ? AND status = 'IN_PROGRESS') AS in_progress,
         (SELECT max_attempts FROM quizzes WHERE id = ?) AS max_attempts`,
    )
    .get(quizId, studentId, quizId, studentId, quizId);

  // 0 means unlimited; null/invalid falls back to schema default (3), not unlimited.
  const maxAttempts = row?.max_attempts == null || !Number.isFinite(row.max_attempts) ? 3 : row.max_attempts;
  const used = row?.used ?? 0;
  const hasInProgress = (row?.in_progress ?? 0) > 0;
  const unlimited = maxAttempts <= 0;
  const remaining = unlimited ? null : Math.max(0, maxAttempts - used);
  const canStartNew = unlimited || (remaining ?? 0) > 0;

  return {
    used,
    maxAttempts,
    remaining,
    unlimited,
    hasInProgress,
    canStartNew,
    canAttempt: canStartNew || hasInProgress,
  };
}

export function getQuizForAttemptStart(studentId: string, quizId: string) {
  const db = getDb();

  return db
    .prepare<{
      id: string;
      title: string;
      status: QuizStatus;
      max_attempts: number;
      passing_score: number;
      available_from: string | null;
      available_until: string | null;
      time_limit_sec: number | null;
    }>(
      `SELECT q.id, q.title, q.status, q.max_attempts, q.passing_score, q.available_from, q.available_until, q.time_limit_sec
       FROM quizzes q
       JOIN lessons l ON l.id = q.lesson_id AND l.status = 'PUBLISHED'
       JOIN subjects sub ON sub.is_active = 1 AND (sub.id = l.subject_id OR sub.name = l.subject)
       WHERE q.id = ?
         AND q.status = 'PUBLISHED'
         AND EXISTS (
           SELECT 1
           FROM section_students ss
           JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
           LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
           LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
           WHERE ss.student_id = ?
             AND ss.is_active = 1
             AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
         )
       LIMIT 1`,
    )
    .get(quizId, studentId);
}

export function canStudentAccessQuiz(studentId: string, quizId: string) {
  return Boolean(getQuizForAttemptStart(studentId, quizId));
}

export function listQuizSubmissionsForTeacher(teacherId: string, quizId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        attempt_id: string;
        student_id: string;
        student_name: string;
        attempt_number: number;
        status: string;
        outcome: string;
        score_percent: number | null;
        correct_count: number | null;
        wrong_count: number | null;
        time_spent_sec: number | null;
        submitted_at: string | null;
        graded_at: string | null;
        created_at: string;
        answer_count: number;
        review_flag_count: number | null;
      }[]
    >(
      `SELECT
        qa.id AS attempt_id,
        qa.student_id,
        u.full_name AS student_name,
        qa.attempt_number,
        qa.status,
        qa.outcome,
        qa.score_percent,
        qa.correct_count,
        qa.wrong_count,
        qa.time_spent_sec,
        qa.submitted_at,
        qa.graded_at,
        qa.created_at,
        COUNT(DISTINCT aa.id) AS answer_count,
        SUM(CASE WHEN aj.status = 'FAILED' THEN 1 ELSE 0 END) AS review_flag_count
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN users u ON u.id = qa.student_id
      LEFT JOIN attempt_answers aa ON aa.attempt_id = qa.id
      LEFT JOIN ai_grading_jobs aj ON aj.attempt_answer_id = aa.id
      WHERE qa.quiz_id = ?
        AND EXISTS (
          SELECT 1
          FROM lessons l
          JOIN teacher_subjects ts ON ts.is_active = 1
          JOIN subjects s ON s.id = ts.subject_id
          WHERE l.id = q.lesson_id
            AND ts.teacher_id = ?
            AND (
              l.subject_id = ts.subject_id
              OR lower(l.subject) = lower(s.name)
            )
        )
        AND qa.status IN ('SUBMITTED', 'GRADED')
      GROUP BY qa.id
      ORDER BY qa.created_at DESC`,
    )
    .all(quizId, teacherId)
    .map((row) => ({
      attemptId: row.attempt_id,
      studentId: row.student_id,
      studentName: row.student_name,
      attemptNumber: row.attempt_number,
      status: row.status,
      outcome: row.outcome,
      scorePercent: row.score_percent,
      correctCount: row.correct_count,
      wrongCount: row.wrong_count,
      timeSpentSec: row.time_spent_sec,
      submittedAt: row.submitted_at,
      gradedAt: row.graded_at,
      createdAt: row.created_at,
      answerCount: row.answer_count,
      reviewFlagCount: row.review_flag_count ?? 0,
    }));
}

export function getTeacherAttemptReviewById(teacherId: string, attemptId: string) {
  const db = getDb();
  const row = db
    .prepare<{
      quiz_id: string;
      lesson_id: string | null;
      student_name: string;
    }>(
      `SELECT
        qa.quiz_id,
        q.lesson_id,
        u.full_name AS student_name
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN users u ON u.id = qa.student_id
      WHERE qa.id = ?
        AND EXISTS (
          SELECT 1
          FROM lessons l
          JOIN teacher_subjects ts ON ts.is_active = 1
          JOIN subjects s ON s.id = ts.subject_id
          WHERE l.id = q.lesson_id
            AND ts.teacher_id = ?
            AND (
              l.subject_id = ts.subject_id
              OR lower(l.subject) = lower(s.name)
            )
        )
      LIMIT 1`,
    )
    .get(attemptId, teacherId);

  if (!row) {
    return null;
  }

  const attempt = getAttemptById(attemptId);
  if (!attempt) {
    return null;
  }

  return {
    ...attempt,
    lessonId: row.lesson_id,
    studentName: row.student_name,
  };
}

export function updateAttemptSummaryAfterTeacherReview(payload: {
  attemptId: string;
  scorePercent: number;
  correctCount: number;
  wrongCount: number;
  outcome: "PASSED" | "FAILED";
}) {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE quiz_attempts
     SET status = 'GRADED',
         outcome = ?,
         graded_at = ?,
         score_percent = ?,
         correct_count = ?,
         wrong_count = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(
    payload.outcome,
    now,
    payload.scorePercent,
    payload.correctCount,
    payload.wrongCount,
    now,
    payload.attemptId,
  );
}

export function getAttemptAnswers(attemptId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        id: string;
        quiz_question_id: string;
        question_id: string;
        selected_option_ids_json: string | null;
        answer_text: string | null;
        max_points: number;
      }[]
    >(
      `SELECT id, quiz_question_id, question_id, selected_option_ids_json, answer_text, max_points
       FROM attempt_answers
       WHERE attempt_id = ?`,
    )
    .all(attemptId)
    .map((row) => ({
      id: row.id,
      quizQuestionId: row.quiz_question_id,
      questionId: row.question_id,
      selectedOptionIds: parseJson<string[]>(row.selected_option_ids_json, []),
      answerText: row.answer_text,
      maxPoints: row.max_points,
    }));
}

export function markAttemptAnswerGraded(payload: {
  answerId: string;
  isCorrect: boolean;
  earnedPoints: number;
  feedback?: string;
  gradedByAi?: boolean;
}) {
  const db = getDb();

  db.prepare(
    `UPDATE attempt_answers
     SET is_correct = ?, earned_points = ?, feedback = ?, graded_by_ai = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    payload.isCorrect ? 1 : 0,
    payload.earnedPoints,
    payload.feedback ?? null,
    payload.gradedByAi ? 1 : 0,
    new Date().toISOString(),
    payload.answerId,
  );
}

export function markAttemptAnswerPendingAi(payload: {
  answerId: string;
  feedback?: string;
}) {
  const db = getDb();
  db.prepare(
    `UPDATE attempt_answers
     SET is_correct = NULL, earned_points = NULL, feedback = ?, graded_by_ai = 0, updated_at = ?
     WHERE id = ?`,
  ).run(payload.feedback ?? "Queued for offline AI grading.", new Date().toISOString(), payload.answerId);
}

export function getAttemptAiJobStats(attemptId: string) {
  const db = getDb();
  const row =
    db.prepare<{
      total: number;
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    }>(
      `SELECT
         COUNT(aj.id) AS total,
         SUM(CASE WHEN aj.status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN aj.status = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
         SUM(CASE WHEN aj.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN aj.status = 'FAILED' THEN 1 ELSE 0 END) AS failed
       FROM attempt_answers aa
       LEFT JOIN ai_grading_jobs aj ON aj.attempt_answer_id = aa.id
       WHERE aa.attempt_id = ?`,
    ).get(attemptId) ?? {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

  return {
    total: row.total ?? 0,
    pending: row.pending ?? 0,
    processing: row.processing ?? 0,
    completed: row.completed ?? 0,
    failed: row.failed ?? 0,
  };
}

export function summarizeAttemptAnswerScores(attemptId: string) {
  const db = getDb();
  const row =
    db.prepare<{
      total_possible: number;
      total_earned: number;
      correct_count: number;
      wrong_count: number;
      unanswered_count: number;
    }>(
      `SELECT
         COALESCE(SUM(max_points), 0) AS total_possible,
         COALESCE(SUM(COALESCE(earned_points, 0)), 0) AS total_earned,
         COALESCE(SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct_count,
         COALESCE(SUM(CASE WHEN is_correct = 0 THEN 1 ELSE 0 END), 0) AS wrong_count,
         COALESCE(SUM(CASE WHEN is_correct IS NULL THEN 1 ELSE 0 END), 0) AS unanswered_count
       FROM attempt_answers
       WHERE attempt_id = ?`,
    ).get(attemptId) ?? {
      total_possible: 0,
      total_earned: 0,
      correct_count: 0,
      wrong_count: 0,
      unanswered_count: 0,
    };

  return {
    totalPossible: row.total_possible ?? 0,
    totalEarned: row.total_earned ?? 0,
    correctCount: row.correct_count ?? 0,
    wrongCount: row.wrong_count ?? 0,
    unansweredCount: row.unanswered_count ?? 0,
  };
}

export function getQuestionForGrading(questionId: string) {
  const db = getDb();

  const question = db
    .prepare<{
      id: string;
      type: QuestionType;
      prompt_markdown: string;
      explanation_markdown: string | null;
      reference_answer: string | null;
      grading_keywords_json: string | null;
      topic: string;
    }>(
      `SELECT id, type, prompt_markdown, explanation_markdown, reference_answer, grading_keywords_json, topic
       FROM question_bank_entries
       WHERE id = ?
       LIMIT 1`,
    )
    .get(questionId);

  if (!question) {
    return null;
  }

  const options = db
    .prepare<
      {
        id: string;
        is_correct: number;
      }[]
    >(
      `SELECT id, is_correct
       FROM question_options
       WHERE question_id = ?`,
    )
    .all(questionId);

  return {
    id: question.id,
    type: question.type,
    promptMarkdown: question.prompt_markdown,
    explanationMarkdown: question.explanation_markdown,
    referenceAnswer: question.reference_answer,
    gradingKeywords: parseJson<string[]>(question.grading_keywords_json, []),
    topic: question.topic,
    correctOptionIds: options.filter((option) => option.is_correct === 1).map((option) => option.id),
  };
}

export function createAiGradingJob(payload: {
  attemptAnswerId: string;
  requestPayload: unknown;
}) {
  const db = getDb();
  const jobId = crypto.randomUUID();

  db.prepare(
    `INSERT OR REPLACE INTO ai_grading_jobs (
      id, attempt_answer_id, status, request_payload_json, queued_at
    ) VALUES (?, ?, 'PENDING', ?, ?)`,
  ).run(jobId, payload.attemptAnswerId, JSON.stringify(payload.requestPayload), new Date().toISOString());

  return jobId;
}

export function completeAiGradingJob(payload: {
  attemptAnswerId: string;
  status: "COMPLETED" | "FAILED";
  score?: number;
  feedback?: string;
  responsePayload?: unknown;
  errorMessage?: string;
}) {
  const db = getDb();

  db.prepare(
    `UPDATE ai_grading_jobs
     SET status = ?, score = ?, feedback = ?, response_payload_json = ?,
         error_message = ?, completed_at = ?
     WHERE attempt_answer_id = ?`,
  ).run(
    payload.status,
    payload.score ?? null,
    payload.feedback ?? null,
    payload.responsePayload ? JSON.stringify(payload.responsePayload) : null,
    payload.errorMessage ?? null,
    new Date().toISOString(),
    payload.attemptAnswerId,
  );
}

export function createXpEvent(payload: {
  userId: string;
  source: string;
  amount: number;
  description: string;
  referenceId?: string;
}) {
  const db = getDb();

  db.prepare(
    `INSERT INTO xp_events (id, user_id, source, amount, description, reference_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    payload.userId,
    payload.source,
    payload.amount,
    payload.description,
    payload.referenceId ?? null,
    new Date().toISOString(),
  );
}

export function getStudentXp(studentId: string) {
  const db = getDb();
  return (
    db.prepare<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM xp_events WHERE user_id = ?").get(
      studentId,
    )?.total ?? 0
  );
}

export function upsertLeaderboardSnapshot(mode: "XP" | "QUIZ_COMPLETION" | "STREAK", entries: unknown[]) {
  const db = getDb();

  db.prepare(
    `INSERT INTO leaderboard_snapshots (id, mode, scope, period_start, period_end, entries_json, created_at)
     VALUES (?, ?, 'GLOBAL', ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    mode,
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    new Date().toISOString(),
    JSON.stringify(entries),
    new Date().toISOString(),
  );
}

export function getLatestLeaderboard(mode: "XP" | "QUIZ_COMPLETION" | "STREAK") {
  const db = getDb();

  const snapshot = db
    .prepare<{
      entries_json: string;
    }>(
      `SELECT entries_json
       FROM leaderboard_snapshots
       WHERE mode = ?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(mode);

  if (snapshot) {
    return parseJson<{ userId: string; rank: number; score: number }[]>(snapshot.entries_json, []);
  }

  if (mode === "XP") {
    return db
      .prepare<
        {
          user_id: string;
          full_name: string;
          score: number;
        }[]
      >(
        `SELECT
           u.id AS user_id,
           u.full_name,
           COALESCE(SUM(x.amount), 0) AS score
         FROM users u
         LEFT JOIN xp_events x ON x.user_id = u.id
         WHERE u.role = 'STUDENT'
         GROUP BY u.id
         ORDER BY score DESC
         LIMIT 20`,
      )
      .all()
      .map((row, index) => ({
        userId: row.user_id,
        fullName: row.full_name,
        rank: index + 1,
        score: row.score,
      }));
  }

  return [];
}

export function getStudentWeakTopics(studentId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        topic: string;
        misses: number;
      }[]
    >(
      `SELECT
        COALESCE(aa.topic_snapshot, qb.topic) AS topic,
        SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS misses
      FROM attempt_answers aa
      JOIN quiz_attempts qa ON qa.id = aa.attempt_id AND qa.status = 'GRADED'
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      JOIN question_bank_entries qb ON qb.id = aa.question_id
      WHERE qa.student_id = ?
        AND q.status != 'ARCHIVED'
        AND l.status != 'ARCHIVED'
        AND EXISTS (
          SELECT 1
          FROM section_students ss
          JOIN sections sec ON sec.id = ss.section_id AND sec.status = 'ACTIVE'
          LEFT JOIN quiz_sections qs ON qs.section_id = sec.id AND qs.quiz_id = q.id
          LEFT JOIN lesson_sections ls ON ls.section_id = sec.id AND ls.lesson_id = q.lesson_id
          WHERE ss.student_id = qa.student_id
            AND ss.is_active = 1
            AND (qs.id IS NOT NULL OR ls.id IS NOT NULL)
        )
      GROUP BY topic
      HAVING misses > 0
      ORDER BY misses DESC`,
    )
    .all(studentId)
    .map((row) => ({
      topic: row.topic,
      misses: row.misses,
    }));
}

export function getTeacherTopicWeakness(teacherId: string, filters?: { sectionId?: string; subjectId?: string }) {
  const db = getDb();
  const sectionId = filters?.sectionId?.trim();
  const subjectId = filters?.subjectId?.trim();
  const where: string[] = [
    "q.status != 'ARCHIVED'",
    "l.status != 'ARCHIVED'",
    `EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      JOIN sections sec ON sec.id = sst.section_id AND sec.status = 'ACTIVE'
      JOIN subjects s ON s.id = sst.subject_id
      WHERE sst.teacher_id = ?
        AND sst.is_active = 1
        AND (
          l.subject_id = sst.subject_id
          OR lower(l.subject) = lower(s.name)
        )
        AND (
          EXISTS (SELECT 1 FROM quiz_sections qs_ctx WHERE qs_ctx.quiz_id = q.id AND qs_ctx.section_id = sst.section_id)
          OR EXISTS (SELECT 1 FROM lesson_sections ls_ctx WHERE ls_ctx.lesson_id = q.lesson_id AND ls_ctx.section_id = sst.section_id)
        )
    )`,
  ];
  const values: unknown[] = [teacherId];

  if (sectionId) {
    where.push("EXISTS (SELECT 1 FROM lesson_sections ls WHERE ls.lesson_id = l.id AND ls.section_id = ?)");
    values.push(sectionId);
  }

  if (subjectId) {
    where.push(
      "(l.subject_id = ? OR EXISTS (SELECT 1 FROM subjects s2 WHERE s2.id = ? AND lower(l.subject) = lower(s2.name)))",
    );
    values.push(subjectId, subjectId);
  }

  return db
    .prepare<
      {
        topic: string;
        wrong_answers: number;
        total_answers: number;
      }[]
    >(
      `SELECT
        qb.topic,
        SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_answers,
        COUNT(aa.id) AS total_answers
      FROM attempt_answers aa
      JOIN quiz_questions qq ON qq.id = aa.quiz_question_id
      JOIN quizzes q ON q.id = qq.quiz_id
      JOIN lessons l ON l.id = q.lesson_id
      JOIN quiz_attempts qa ON qa.id = aa.attempt_id AND qa.status = 'GRADED'
      JOIN question_bank_entries qb ON qb.id = aa.question_id
      WHERE ${where.join(" AND ")}
      GROUP BY qb.topic
      ORDER BY wrong_answers DESC`,
    )
    .all(...values)
    .map((row) => ({
      topic: row.topic,
      wrongAnswers: row.wrong_answers,
      totalAnswers: row.total_answers,
      errorRate: row.total_answers > 0 ? Number(((row.wrong_answers / row.total_answers) * 100).toFixed(1)) : 0,
    }));
}

export function listRecentActivities(limit = 10, role?: Role) {
  const db = getDb();
  const normalizedLimit = Math.min(10, Math.max(1, Math.floor(limit)));
  if (role) {
    return db
      .prepare<
        {
          id: string;
          action: string;
          entity_type: string;
          created_at: string;
          role_snapshot: string | null;
          user_name: string | null;
        }[]
      >(
        `SELECT
          al.id,
          al.action,
          al.entity_type,
          al.created_at,
          al.role_snapshot,
          u.full_name AS user_name
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.role_snapshot = ?
        ORDER BY al.created_at DESC
        LIMIT ?`,
      )
      .all(role, normalizedLimit)
      .map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        createdAt: row.created_at,
        role: row.role_snapshot,
        userName: row.user_name,
      }));
  }

  return db
    .prepare<
      {
        id: string;
        action: string;
        entity_type: string;
        created_at: string;
        role_snapshot: string | null;
        user_name: string | null;
      }[]
    >(
      `SELECT
        al.id,
        al.action,
        al.entity_type,
        al.created_at,
        al.role_snapshot,
        u.full_name AS user_name
      FROM activity_logs al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
      LIMIT ?`,
    )
    .all(normalizedLimit)
    .map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entity_type,
      createdAt: row.created_at,
      role: row.role_snapshot,
      userName: row.user_name,
    }));
}
