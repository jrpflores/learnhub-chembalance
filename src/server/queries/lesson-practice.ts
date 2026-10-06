import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export type LessonPracticeMessageRole = "STUDENT" | "ASSISTANT";

type LessonPracticeConversationRow = {
  id: string;
  lesson_id: string;
  student_id: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  message_count?: number;
  last_message_markdown?: string | null;
};

type LessonPracticeMessageRow = {
  id: string;
  lesson_id: string;
  student_id: string;
  conversation_id: string;
  role: LessonPracticeMessageRole;
  content_markdown: string;
  created_at: string;
};

const ensureLessonPracticeSql = `
CREATE TABLE IF NOT EXISTS lesson_practice_conversations (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_practice_conversations_active_unique
  ON lesson_practice_conversations(lesson_id, student_id)
  WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_lesson_practice_conversations_lesson_student_updated
  ON lesson_practice_conversations(lesson_id, student_id, updated_at);

CREATE TABLE IF NOT EXISTS lesson_practice_messages (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'ASSISTANT')),
  content_markdown TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES lesson_practice_conversations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_practice_messages_lesson_student_created
  ON lesson_practice_messages(lesson_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lesson_practice_messages_conversation_created
  ON lesson_practice_messages(conversation_id, created_at);
`;

function hasColumn(tableName: string, columnName: string) {
  const rows = getDb().prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return rows.some((row) => row.name === columnName);
}

function ensureLessonPracticeTable() {
  const db = getDb();
  db.exec(ensureLessonPracticeSql);

  if (!hasColumn("lesson_practice_messages", "conversation_id")) {
    db.exec("ALTER TABLE lesson_practice_messages ADD COLUMN conversation_id TEXT");
  }

  db.exec(`
    INSERT INTO lesson_practice_conversations (id, lesson_id, student_id, is_active, created_at, updated_at, last_message_at)
    SELECT
      lower(hex(randomblob(16))),
      src.lesson_id,
      src.student_id,
      1,
      src.first_message_at,
      src.last_message_at,
      src.last_message_at
    FROM (
      SELECT
        lpm.lesson_id,
        lpm.student_id,
        MIN(lpm.created_at) AS first_message_at,
        MAX(lpm.created_at) AS last_message_at
      FROM lesson_practice_messages lpm
      GROUP BY lpm.lesson_id, lpm.student_id
    ) AS src
    WHERE NOT EXISTS (
      SELECT 1
      FROM lesson_practice_conversations lpc
      WHERE lpc.lesson_id = src.lesson_id
        AND lpc.student_id = src.student_id
    )
  `);

  db.exec(`
    UPDATE lesson_practice_messages
    SET conversation_id = (
      SELECT lpc.id
      FROM lesson_practice_conversations lpc
      WHERE lpc.lesson_id = lesson_practice_messages.lesson_id
        AND lpc.student_id = lesson_practice_messages.student_id
      ORDER BY lpc.is_active DESC, lpc.updated_at DESC, lpc.created_at DESC
      LIMIT 1
    )
    WHERE conversation_id IS NULL
  `);

  db.exec(`
    UPDATE lesson_practice_conversations
    SET
      last_message_at = (
        SELECT MAX(lpm.created_at)
        FROM lesson_practice_messages lpm
        WHERE lpm.conversation_id = lesson_practice_conversations.id
      ),
      updated_at = COALESCE(
        (
          SELECT MAX(lpm.created_at)
          FROM lesson_practice_messages lpm
          WHERE lpm.conversation_id = lesson_practice_conversations.id
        ),
        lesson_practice_conversations.updated_at
      )
  `);
}

function mapLessonPracticeConversation(row: LessonPracticeConversationRow) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    isActive: Number(row.is_active) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    messageCount: Number(row.message_count ?? 0),
    lastMessageMarkdown: row.last_message_markdown ?? null,
  };
}

function summarizePreview(markdown: string | null, maxLength = 120) {
  if (!markdown) {
    return "";
  }
  const compact = markdown.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - 1)}…`;
}

function mapLessonPracticeMessage(row: LessonPracticeMessageRow) {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    conversationId: row.conversation_id,
    role: row.role,
    contentMarkdown: row.content_markdown,
    createdAt: row.created_at,
  };
}

export function getLessonPracticeConversation(payload: {
  lessonId: string;
  studentId: string;
  conversationId: string;
}) {
  const db = getDb();
  ensureLessonPracticeTable();

  const row = db
    .prepare<LessonPracticeConversationRow>(
      `SELECT
         id,
         lesson_id,
         student_id,
         is_active,
         created_at,
         updated_at,
         last_message_at
       FROM lesson_practice_conversations
       WHERE id = ?
         AND lesson_id = ?
         AND student_id = ?
       LIMIT 1`,
    )
    .get(payload.conversationId, payload.lessonId, payload.studentId);

  return row ? mapLessonPracticeConversation(row) : null;
}

export function getActiveLessonPracticeConversation(payload: {
  lessonId: string;
  studentId: string;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const row = db
    .prepare<LessonPracticeConversationRow>(
      `SELECT
         id,
         lesson_id,
         student_id,
         is_active,
         created_at,
         updated_at,
         last_message_at
       FROM lesson_practice_conversations
       WHERE lesson_id = ?
         AND student_id = ?
         AND is_active = 1
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
    )
    .get(payload.lessonId, payload.studentId);

  return row ? mapLessonPracticeConversation(row) : null;
}

export function listLessonPracticeConversations(payload: {
  lessonId: string;
  studentId: string;
  limit?: number;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const limit = Math.max(1, Math.min(payload.limit ?? 25, 80));

  const rows = db
    .prepare<LessonPracticeConversationRow[]>(
      `SELECT
         lpc.id,
         lpc.lesson_id,
         lpc.student_id,
         lpc.is_active,
         lpc.created_at,
         lpc.updated_at,
         lpc.last_message_at,
         COALESCE(stats.message_count, 0) AS message_count,
         stats.last_message_markdown
       FROM lesson_practice_conversations lpc
       LEFT JOIN (
         SELECT
           m.conversation_id,
           COUNT(*) AS message_count,
           (
             SELECT m2.content_markdown
             FROM lesson_practice_messages m2
             WHERE m2.conversation_id = m.conversation_id
             ORDER BY m2.created_at DESC
             LIMIT 1
           ) AS last_message_markdown
         FROM lesson_practice_messages m
         GROUP BY m.conversation_id
       ) stats ON stats.conversation_id = lpc.id
       WHERE lpc.lesson_id = ?
         AND lpc.student_id = ?
       ORDER BY lpc.is_active DESC, lpc.updated_at DESC, lpc.created_at DESC
       LIMIT ?`,
    )
    .all(payload.lessonId, payload.studentId, limit);

  return rows.map((row) => {
    const mapped = mapLessonPracticeConversation(row);
    return {
      ...mapped,
      preview: summarizePreview(mapped.lastMessageMarkdown),
    };
  });
}

export function listStudentPracticeHistory(payload: { studentId: string; limit?: number }) {
  const db = getDb();
  ensureLessonPracticeTable();
  const limit = Math.max(1, Math.min(payload.limit ?? 40, 100));

  const rows = db
    .prepare<
      (LessonPracticeConversationRow & {
        lesson_title: string;
        lesson_subject: string;
        lesson_topic: string;
      })[]
    >(
      `SELECT
         lpc.id,
         lpc.lesson_id,
         lpc.student_id,
         lpc.is_active,
         lpc.created_at,
         lpc.updated_at,
         lpc.last_message_at,
         COALESCE(stats.message_count, 0) AS message_count,
         stats.last_message_markdown,
         l.title AS lesson_title,
         l.subject AS lesson_subject,
         l.topic AS lesson_topic
       FROM lesson_practice_conversations lpc
       JOIN lessons l ON l.id = lpc.lesson_id
       LEFT JOIN (
         SELECT
           m.conversation_id,
           COUNT(*) AS message_count,
           (
             SELECT m2.content_markdown
             FROM lesson_practice_messages m2
             WHERE m2.conversation_id = m.conversation_id
             ORDER BY m2.created_at DESC
             LIMIT 1
           ) AS last_message_markdown
         FROM lesson_practice_messages m
         GROUP BY m.conversation_id
       ) stats ON stats.conversation_id = lpc.id
       WHERE lpc.student_id = ?
         AND COALESCE(stats.message_count, 0) > 0
       ORDER BY COALESCE(lpc.last_message_at, lpc.updated_at) DESC, lpc.created_at DESC
       LIMIT ?`,
    )
    .all(payload.studentId, limit);

  return rows.map((row) => {
    const mapped = mapLessonPracticeConversation(row);
    return {
      ...mapped,
      lessonTitle: row.lesson_title,
      lessonSubject: row.lesson_subject,
      lessonTopic: row.lesson_topic,
      preview: summarizePreview(mapped.lastMessageMarkdown),
    };
  });
}

export function setActiveLessonPracticeConversation(payload: {
  lessonId: string;
  studentId: string;
  conversationId: string;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE lesson_practice_conversations
       SET is_active = 0
       WHERE lesson_id = ?
         AND student_id = ?
         AND is_active = 1`,
    ).run(payload.lessonId, payload.studentId);

    db.prepare(
      `UPDATE lesson_practice_conversations
       SET is_active = 1,
           updated_at = ?
       WHERE id = ?
         AND lesson_id = ?
         AND student_id = ?`,
    ).run(now, payload.conversationId, payload.lessonId, payload.studentId);
  });

  tx();
}

export function createLessonPracticeConversation(payload: {
  lessonId: string;
  studentId: string;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE lesson_practice_conversations
       SET is_active = 0
       WHERE lesson_id = ?
         AND student_id = ?
         AND is_active = 1`,
    ).run(payload.lessonId, payload.studentId);

    db.prepare(
      `INSERT INTO lesson_practice_conversations (
        id,
        lesson_id,
        student_id,
        is_active,
        created_at,
        updated_at,
        last_message_at
      ) VALUES (?, ?, ?, 1, ?, ?, NULL)`,
    ).run(id, payload.lessonId, payload.studentId, now, now);
  });

  tx();

  return {
    id,
    lessonId: payload.lessonId,
    studentId: payload.studentId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null as string | null,
  };
}

export function getOrCreateActiveLessonPracticeConversation(payload: {
  lessonId: string;
  studentId: string;
}) {
  const existing = getActiveLessonPracticeConversation(payload);
  if (existing) {
    return existing;
  }
  return createLessonPracticeConversation(payload);
}

export function listLessonPracticeMessages(payload: {
  lessonId: string;
  studentId: string;
  conversationId?: string;
  limit?: number;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const limit = Math.max(1, Math.min(payload.limit ?? 30, 120));
  const conversationId =
    payload.conversationId ??
    getOrCreateActiveLessonPracticeConversation({
      lessonId: payload.lessonId,
      studentId: payload.studentId,
    }).id;

  const rows = db
    .prepare<LessonPracticeMessageRow[]>(
      `SELECT
         lpm.id,
         lpm.lesson_id,
         lpm.student_id,
         lpm.conversation_id,
         lpm.role,
         lpm.content_markdown,
         lpm.created_at
       FROM lesson_practice_messages lpm
       WHERE lpm.lesson_id = ?
         AND lpm.student_id = ?
         AND lpm.conversation_id = ?
       ORDER BY lpm.created_at DESC
       LIMIT ?`,
    )
    .all(payload.lessonId, payload.studentId, conversationId, limit);

  return rows.reverse().map(mapLessonPracticeMessage);
}

export function createLessonPracticeMessage(payload: {
  lessonId: string;
  studentId: string;
  conversationId: string;
  role: LessonPracticeMessageRole;
  contentMarkdown: string;
}) {
  const db = getDb();
  ensureLessonPracticeTable();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE lesson_practice_conversations
       SET is_active = 0
       WHERE lesson_id = ?
         AND student_id = ?
         AND is_active = 1
         AND id <> ?`,
    ).run(payload.lessonId, payload.studentId, payload.conversationId);

    db.prepare(
      `UPDATE lesson_practice_conversations
       SET is_active = 1,
           updated_at = ?,
           last_message_at = ?
       WHERE id = ?
         AND lesson_id = ?
         AND student_id = ?`,
    ).run(now, now, payload.conversationId, payload.lessonId, payload.studentId);

    db.prepare(
      `INSERT INTO lesson_practice_messages (
        id,
        lesson_id,
        student_id,
        conversation_id,
        role,
        content_markdown,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, payload.lessonId, payload.studentId, payload.conversationId, payload.role, payload.contentMarkdown, now);
  });

  tx();

  return {
    id,
    lessonId: payload.lessonId,
    studentId: payload.studentId,
    conversationId: payload.conversationId,
    role: payload.role,
    contentMarkdown: payload.contentMarkdown,
    createdAt: now,
  };
}
