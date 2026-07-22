import crypto from "node:crypto";
import { getDb, parseJson } from "@/lib/db";
import type { DifficultyLevel, QuestionType } from "@/domain/types";

export function listQuestions(params: {
  teacherId?: string;
  accessibleTeacherId?: string;
  search?: string;
  subject?: string;
  topic?: string;
  difficulty?: DifficultyLevel;
  type?: QuestionType;
}) {
  const db = getDb();

  const where: string[] = ["is_archived = 0"];
  const values: unknown[] = [];

  if (params.teacherId) {
    where.push("teacher_id = ?");
    values.push(params.teacherId);
  }

  if (params.accessibleTeacherId) {
    where.push(`EXISTS (
      SELECT 1
      FROM teacher_subjects ts
      JOIN subjects s ON s.id = ts.subject_id
      WHERE ts.teacher_id = ?
        AND ts.is_active = 1
        AND lower(s.name) = lower(question_bank_entries.subject)
    )`);
    values.push(params.accessibleTeacherId);
  }

  if (params.search) {
    where.push("(prompt_markdown LIKE ? OR subject LIKE ? OR topic LIKE ?)");
    values.push(`%${params.search}%`, `%${params.search}%`, `%${params.search}%`);
  }

  if (params.subject) {
    where.push("subject = ?");
    values.push(params.subject);
  }

  if (params.topic) {
    where.push("topic = ?");
    values.push(params.topic);
  }

  if (params.difficulty) {
    where.push("difficulty = ?");
    values.push(params.difficulty);
  }

  if (params.type) {
    where.push("type = ?");
    values.push(params.type);
  }

  const rows = db
    .prepare<
      {
        id: string;
        subject: string;
        topic: string;
        difficulty: DifficultyLevel;
        type: QuestionType;
        prompt_markdown: string;
        explanation_markdown: string | null;
        hint_markdown: string | null;
        reference_answer: string | null;
        grading_keywords_json: string | null;
        version: number;
        updated_at: string;
      }[]
    >(
      `SELECT
         id, subject, topic, difficulty, type, prompt_markdown,
         explanation_markdown, hint_markdown, reference_answer, grading_keywords_json,
         version, updated_at
       FROM question_bank_entries
       WHERE ${where.join(" AND ")}
       ORDER BY updated_at DESC`,
    )
    .all(...values);

  const optionRows = db
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
       WHERE question_id IN (${rows.map(() => "?").join(",") || "''"})
       ORDER BY position ASC`,
    )
    .all(...rows.map((row) => row.id));

  const optionMap = new Map<string, typeof optionRows>();
  optionRows.forEach((option) => {
    const list = optionMap.get(option.question_id) ?? [];
    list.push(option);
    optionMap.set(option.question_id, list);
  });

  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    topic: row.topic,
    difficulty: row.difficulty,
    type: row.type,
    promptMarkdown: row.prompt_markdown,
    explanationMarkdown: row.explanation_markdown,
    hintMarkdown: row.hint_markdown,
    referenceAnswer: row.reference_answer,
    gradingKeywords: parseJson<string[]>(row.grading_keywords_json, []),
    version: row.version,
    updatedAt: row.updated_at,
    options: (optionMap.get(row.id) ?? []).map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      isCorrect: option.is_correct === 1,
      position: option.position,
    })),
  }));
}

export function getQuestionById(questionId: string) {
  const db = getDb();

  const question = db
    .prepare<{
      id: string;
      teacher_id: string;
      subject: string;
      topic: string;
      difficulty: DifficultyLevel;
      type: QuestionType;
      prompt_markdown: string;
      explanation_markdown: string | null;
      hint_markdown: string | null;
      reference_answer: string | null;
      grading_keywords_json: string | null;
      version: number;
      is_archived: number;
      image_url: string | null;
    }>(
      `SELECT
         id, teacher_id, subject, topic, difficulty, type,
         prompt_markdown, explanation_markdown, hint_markdown,
         reference_answer, grading_keywords_json, version, is_archived, image_url
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
        label: string;
        value: string;
        is_correct: number;
        position: number;
      }[]
    >(
      `SELECT id, label, value, is_correct, position
       FROM question_options
       WHERE question_id = ?
       ORDER BY position ASC`,
    )
    .all(questionId)
    .map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      isCorrect: option.is_correct === 1,
      position: option.position,
    }));

  return {
    id: question.id,
    teacherId: question.teacher_id,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
    promptMarkdown: question.prompt_markdown,
    explanationMarkdown: question.explanation_markdown,
    hintMarkdown: question.hint_markdown,
    referenceAnswer: question.reference_answer,
    gradingKeywords: parseJson<string[]>(question.grading_keywords_json, []),
    version: question.version,
    isArchived: question.is_archived === 1,
    imageUrl: question.image_url,
    options,
  };
}

export function createQuestion(payload: {
  teacherId: string;
  subject: string;
  topic: string;
  difficulty: DifficultyLevel;
  type: QuestionType;
  promptMarkdown: string;
  explanationMarkdown?: string;
  hintMarkdown?: string;
  referenceAnswer?: string;
  gradingKeywords?: string[];
  imageUrl?: string;
  options?: { label: string; value: string; isCorrect: boolean }[];
}) {
  const db = getDb();
  const questionId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO question_bank_entries (
      id, teacher_id, subject, topic, difficulty, type,
      prompt_markdown, explanation_markdown, hint_markdown,
      reference_answer, grading_keywords_json, image_url,
      version, is_archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
  ).run(
    questionId,
    payload.teacherId,
    payload.subject,
    payload.topic,
    payload.difficulty,
    payload.type,
    payload.promptMarkdown,
    payload.explanationMarkdown ?? null,
    payload.hintMarkdown ?? null,
    payload.referenceAnswer ?? null,
    payload.gradingKeywords ? JSON.stringify(payload.gradingKeywords) : null,
    payload.imageUrl ?? null,
    now,
    now,
  );

  (payload.options ?? []).forEach((option, index) => {
    db.prepare(
      `INSERT INTO question_options (
        id, question_id, label, value, is_correct, position, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      crypto.randomUUID(),
      questionId,
      option.label,
      option.value,
      option.isCorrect ? 1 : 0,
      index,
      now,
    );
  });

  return questionId;
}

export function updateQuestion(
  questionId: string,
  payload: {
    subject?: string;
    topic?: string;
    difficulty?: DifficultyLevel;
    type?: QuestionType;
    promptMarkdown?: string;
    explanationMarkdown?: string | null;
    hintMarkdown?: string | null;
    referenceAnswer?: string | null;
    gradingKeywords?: string[] | null;
    imageUrl?: string | null;
    options?: { label: string; value: string; isCorrect: boolean }[];
  },
) {
  const db = getDb();
  const updates: string[] = [];
  const values: unknown[] = [];

  if (payload.subject !== undefined) {
    updates.push("subject = ?");
    values.push(payload.subject);
  }
  if (payload.topic !== undefined) {
    updates.push("topic = ?");
    values.push(payload.topic);
  }
  if (payload.difficulty !== undefined) {
    updates.push("difficulty = ?");
    values.push(payload.difficulty);
  }
  if (payload.type !== undefined) {
    updates.push("type = ?");
    values.push(payload.type);
  }
  if (payload.promptMarkdown !== undefined) {
    updates.push("prompt_markdown = ?");
    values.push(payload.promptMarkdown);
  }
  if (payload.explanationMarkdown !== undefined) {
    updates.push("explanation_markdown = ?");
    values.push(payload.explanationMarkdown);
  }
  if (payload.hintMarkdown !== undefined) {
    updates.push("hint_markdown = ?");
    values.push(payload.hintMarkdown);
  }
  if (payload.referenceAnswer !== undefined) {
    updates.push("reference_answer = ?");
    values.push(payload.referenceAnswer);
  }
  if (payload.gradingKeywords !== undefined) {
    updates.push("grading_keywords_json = ?");
    values.push(payload.gradingKeywords ? JSON.stringify(payload.gradingKeywords) : null);
  }
  if (payload.imageUrl !== undefined) {
    updates.push("image_url = ?");
    values.push(payload.imageUrl);
  }

  updates.push("version = version + 1");
  updates.push("updated_at = ?");
  values.push(new Date().toISOString());
  values.push(questionId);

  db.prepare(`UPDATE question_bank_entries SET ${updates.join(", ")} WHERE id = ?`).run(...values);

  if (payload.options) {
    db.prepare("DELETE FROM question_options WHERE question_id = ?").run(questionId);

    payload.options.forEach((option, index) => {
      db.prepare(
        `INSERT INTO question_options (
          id, question_id, label, value, is_correct, position, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        questionId,
        option.label,
        option.value,
        option.isCorrect ? 1 : 0,
        index,
        new Date().toISOString(),
      );
    });
  }
}

export function duplicateQuestion(questionId: string, teacherId: string) {
  const current = getQuestionById(questionId);
  if (!current) {
    throw new Error("Question not found");
  }

  return createQuestion({
    teacherId,
    subject: current.subject,
    topic: current.topic,
    difficulty: current.difficulty,
    type: current.type,
    promptMarkdown: `${current.promptMarkdown}\n\n_(Copy)_`,
    explanationMarkdown: current.explanationMarkdown ?? undefined,
    hintMarkdown: current.hintMarkdown ?? undefined,
    referenceAnswer: current.referenceAnswer ?? undefined,
    gradingKeywords: current.gradingKeywords,
    imageUrl: current.imageUrl ?? undefined,
    options: current.options.map((option) => ({
      label: option.label,
      value: option.value,
      isCorrect: option.isCorrect,
    })),
  });
}

export function archiveQuestion(questionId: string) {
  const db = getDb();
  db.prepare("UPDATE question_bank_entries SET is_archived = 1, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    questionId,
  );
}

export function isTeacherQuestionOwner(teacherId: string, questionId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      "SELECT COUNT(*) as total FROM question_bank_entries WHERE id = ? AND teacher_id = ?",
    )
    .get(questionId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function canTeacherAccessQuestionBySubject(teacherId: string, questionId: string) {
  const db = getDb();
  const row = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM question_bank_entries qb
       WHERE qb.id = ?
         AND EXISTS (
           SELECT 1
           FROM teacher_subjects ts
           JOIN subjects s ON s.id = ts.subject_id
           WHERE ts.teacher_id = ?
             AND ts.is_active = 1
             AND lower(s.name) = lower(qb.subject)
         )`,
    )
    .get(questionId, teacherId);

  return (row?.total ?? 0) > 0;
}

export function questionBankStats(teacherId: string, subjectScoped = false) {
  const db = getDb();
  const whereSql = subjectScoped
    ? `WHERE EXISTS (
        SELECT 1
        FROM teacher_subjects ts
        JOIN subjects s ON s.id = ts.subject_id
        WHERE ts.teacher_id = ?
          AND ts.is_active = 1
          AND lower(s.name) = lower(question_bank_entries.subject)
      )`
    : "WHERE teacher_id = ?";

  const totals = db
    .prepare<{
      total: number;
      archived: number;
      short_answer: number;
      multiple_choice: number;
      true_false: number;
    }>(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN is_archived = 1 THEN 1 ELSE 0 END) AS archived,
         SUM(CASE WHEN type = 'SHORT_ANSWER' THEN 1 ELSE 0 END) AS short_answer,
         SUM(CASE WHEN type = 'MULTIPLE_CHOICE' THEN 1 ELSE 0 END) AS multiple_choice,
         SUM(CASE WHEN type = 'TRUE_FALSE' THEN 1 ELSE 0 END) AS true_false
      FROM question_bank_entries
      ${whereSql}`,
    )
    .get(teacherId);

  return {
    total: totals?.total ?? 0,
    archived: totals?.archived ?? 0,
    shortAnswer: totals?.short_answer ?? 0,
    multipleChoice: totals?.multiple_choice ?? 0,
    trueFalse: totals?.true_false ?? 0,
  };
}
