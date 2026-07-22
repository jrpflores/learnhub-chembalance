import { openDatabase, readSchemaSql, getDatabaseFile } from "./shared";

const db = openDatabase();

function hasColumn(tableName: string, columnName: string) {
  const columns = (db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as { name: string }[]).map((row) => row.name);
  return columns.includes(columnName);
}

function hasTable(tableName: string) {
  return Boolean(
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
      .get(tableName),
  );
}

const lessonsTableExists = Boolean(
  db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'lessons' LIMIT 1`)
    .get(),
);

if (lessonsTableExists) {
  if (!hasColumn("lessons", "subject_id")) {
    db.exec("ALTER TABLE lessons ADD COLUMN subject_id TEXT");
  }
}

// Compatibility preflight:
// Older databases may have lesson_practice_messages without conversation_id.
// Add the column before schema SQL runs because schema creates an index on it.
if (hasTable("lesson_practice_messages") && !hasColumn("lesson_practice_messages", "conversation_id")) {
  db.exec("ALTER TABLE lesson_practice_messages ADD COLUMN conversation_id TEXT");
}

db.exec(readSchemaSql());
if (!hasColumn("lessons", "subject_id")) {
  db.exec("ALTER TABLE lessons ADD COLUMN subject_id TEXT");
}
if (!hasColumn("quizzes", "show_answer_key")) {
  db.exec("ALTER TABLE quizzes ADD COLUMN show_answer_key INTEGER NOT NULL DEFAULT 1");
}

db.exec("CREATE INDEX IF NOT EXISTS idx_lessons_subject_id_status ON lessons(subject_id, status)");
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_section_subjects_section_subject ON section_subjects(section_id, subject_id)",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_section_subject_active ON section_subject_teachers(section_id, subject_id, is_active)",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_teacher_active ON section_subject_teachers(teacher_id, is_active)",
);
db.exec(
  "CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_subject_teacher_active ON section_subject_teachers(subject_id, teacher_id, is_active)",
);

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
if (hasTable("lesson_practice_messages") && !hasColumn("lesson_practice_messages", "conversation_id")) {
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
  CREATE TABLE IF NOT EXISTS section_subject_teachers (
    id TEXT PRIMARY KEY,
    section_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    teacher_id TEXT NOT NULL,
    assigned_by_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    UNIQUE (section_id, subject_id, teacher_id, is_active),
    FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
  )
`);

db.exec(`
  UPDATE lessons
  SET subject_id = (
    SELECT s.id FROM subjects s WHERE lower(s.name) = lower(lessons.subject) LIMIT 1
  )
  WHERE subject_id IS NULL
`);

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

db.exec(`
  INSERT INTO section_subjects (id, section_id, subject_id, assigned_by_id, created_at)
  SELECT
    lower(hex(randomblob(16))),
    s.id,
    s.subject_id,
    NULL,
    COALESCE(s.created_at, datetime('now'))
  FROM sections s
  WHERE s.subject_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM section_subjects ss
      WHERE ss.section_id = s.id AND ss.subject_id = s.subject_id
    )
`);

db.exec(`
  INSERT INTO section_subject_teachers (id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at)
  SELECT
    lower(hex(randomblob(16))),
    ss.section_id,
    ss.subject_id,
    st.teacher_id,
    COALESCE(ss.assigned_by_id, st.assigned_by_id),
    1,
    COALESCE(ss.created_at, st.assigned_at, datetime('now')),
    NULL
  FROM section_subjects ss
  JOIN section_teachers st ON st.section_id = ss.section_id AND st.is_active = 1
  WHERE NOT EXISTS (
    SELECT 1
    FROM section_subject_teachers sst
    WHERE sst.section_id = ss.section_id
      AND sst.subject_id = ss.subject_id
      AND sst.teacher_id = st.teacher_id
      AND sst.is_active = 1
  )
`);

db.exec(`
  INSERT INTO section_subject_teachers (id, section_id, subject_id, teacher_id, assigned_by_id, is_active, assigned_at, ended_at)
  SELECT
    lower(hex(randomblob(16))),
    ss.section_id,
    ss.subject_id,
    sec.teacher_id,
    ss.assigned_by_id,
    1,
    COALESCE(ss.created_at, sec.created_at, datetime('now')),
    NULL
  FROM section_subjects ss
  JOIN sections sec ON sec.id = ss.section_id
  WHERE sec.teacher_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM section_subject_teachers sst
      WHERE sst.section_id = ss.section_id
        AND sst.subject_id = ss.subject_id
        AND sst.teacher_id = sec.teacher_id
        AND sst.is_active = 1
    )
`);

console.log(`Database schema ensured at ${getDatabaseFile()}`);
