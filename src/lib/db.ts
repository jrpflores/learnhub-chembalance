import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "@/lib/env";

type LooseStatement<T = unknown> = {
  get: (...params: unknown[]) => T;
  all: (...params: unknown[]) => T;
  run: (...params: unknown[]) => { changes: number; lastInsertRowid: number | bigint };
};

export type LooseDb = {
  prepare: <T = unknown>(sql: string) => LooseStatement<T>;
  pragma: (statement: string) => unknown;
  exec: (sql: string) => void;
  transaction: <T>(callback: () => T) => () => T;
};

type GlobalWithDb = typeof globalThis & {
  __learnhubDb?: Database.Database;
};

function resolveDatabaseFile() {
  const file = env.databaseFile;
  if (path.isAbsolute(file)) {
    return file;
  }

  return path.resolve(process.cwd(), file);
}

function createConnection() {
  const databaseFile = resolveDatabaseFile();
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const db = new Database(databaseFile);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  ensureRuntimeMigrations(db);
  return db;
}

function hasTable(db: Database.Database, tableName: string) {
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { total: number } | undefined;
  return (row?.total ?? 0) > 0;
}

function hasColumn(db: Database.Database, tableName: string, columnName: string) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return rows.some((row) => row.name === columnName);
}

function ensureRuntimeMigrations(db: Database.Database) {
  if (hasTable(db, "lessons") && !hasColumn(db, "lessons", "subject_id")) {
    db.exec("ALTER TABLE lessons ADD COLUMN subject_id TEXT");
  }
  if (hasTable(db, "quizzes") && !hasColumn(db, "quizzes", "show_answer_key")) {
    db.exec("ALTER TABLE quizzes ADD COLUMN show_answer_key INTEGER NOT NULL DEFAULT 1");
  }
  if (hasTable(db, "users") && !hasColumn(db, "users", "gender")) {
    db.exec("ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IS NULL OR gender IN ('MALE', 'FEMALE'))");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_lessons_subject_id_status ON lessons(subject_id, status)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS section_teachers (
      id TEXT PRIMARY KEY,
      section_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      assigned_by_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at TEXT,
      UNIQUE (section_id, teacher_id, is_active),
      FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_section_teachers_section_active ON section_teachers(section_id, is_active)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_section_teachers_teacher_active ON section_teachers(teacher_id, is_active)");

  db.exec(`
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
    )
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_practice_conversations_active_unique ON lesson_practice_conversations(lesson_id, student_id) WHERE is_active = 1",
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_lesson_practice_conversations_lesson_student_updated ON lesson_practice_conversations(lesson_id, student_id, updated_at)",
  );
  if (hasTable(db, "lesson_practice_messages") && !hasColumn(db, "lesson_practice_messages", "conversation_id")) {
    db.exec("ALTER TABLE lesson_practice_messages ADD COLUMN conversation_id TEXT");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_lesson_practice_messages_conversation_created ON lesson_practice_messages(conversation_id, created_at)",
  );
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
      SELECT lesson_id, student_id, MIN(created_at) AS first_message_at, MAX(created_at) AS last_message_at
      FROM lesson_practice_messages
      GROUP BY lesson_id, student_id
    ) src
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

  // Backfill lessons.subject_id from canonical subjects by name.
  db.exec(`
    UPDATE lessons
    SET subject_id = (
      SELECT s.id
      FROM subjects s
      WHERE lower(s.name) = lower(lessons.subject)
      LIMIT 1
    )
    WHERE subject_id IS NULL
  `);

  // Backfill section-teacher assignment rows from existing section owner field.
  db.exec(`
    INSERT INTO section_teachers (id, section_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at)
    SELECT
      lower(hex(randomblob(16))),
      s.id,
      s.teacher_id,
      NULL,
      1,
      COALESCE(s.created_at, datetime('now')),
      NULL
    FROM sections s
    WHERE NOT EXISTS (
      SELECT 1
      FROM section_teachers st
      WHERE st.section_id = s.id AND st.teacher_id = s.teacher_id AND st.is_active = 1
    )
  `);

  // Move default CPSU seal branding to ChemBalance mark without touching custom uploads.
  if (hasTable(db, "system_settings")) {
    const brandingRow = db
      .prepare("SELECT value_json FROM system_settings WHERE key = ? LIMIT 1")
      .get("platform.branding") as { value_json: string } | undefined;
    if (brandingRow?.value_json) {
      try {
        const value = JSON.parse(brandingRow.value_json) as Record<string, unknown>;
        const legacy = new Set([
          "/branding/cpsu-seal.png",
          "/branding/cpsu-seal-720.png",
          "/branding/123.png",
        ]);
        const nextLogo =
          typeof value.logoUrl === "string" && legacy.has(value.logoUrl) ? "/branding/logo.png" : value.logoUrl;
        const nextFavicon =
          typeof value.faviconUrl === "string" && legacy.has(value.faviconUrl)
            ? "/branding/logo.png"
            : value.faviconUrl;
        if (nextLogo !== value.logoUrl || nextFavicon !== value.faviconUrl) {
          value.logoUrl = nextLogo;
          value.faviconUrl = nextFavicon;
          db.prepare(
            "UPDATE system_settings SET value_json = ?, updated_at = datetime('now') WHERE key = ?",
          ).run(JSON.stringify(value), "platform.branding");
        }
      } catch {
        // Keep existing branding JSON if malformed.
      }
    }
  }
}

export function getDb(): LooseDb {
  const globalRef = globalThis as GlobalWithDb;

  if (!globalRef.__learnhubDb) {
    globalRef.__learnhubDb = createConnection();
  }

  return globalRef.__learnhubDb as unknown as LooseDb;
}

export function withTransaction<T>(callback: (db: LooseDb) => T) {
  const db = getDb();
  const tx = db.transaction(() => callback(db));
  return tx();
}

export function toBoolean(value: unknown): boolean {
  return Number(value) === 1;
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
