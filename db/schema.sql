PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'TEACHER', 'STUDENT')),
  is_active INTEGER NOT NULL DEFAULT 1,
  avatar_url TEXT,
  timezone TEXT,
  locale TEXT,
  streak_days INTEGER NOT NULL DEFAULT 0,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  FOREIGN KEY (created_by_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, is_active);

CREATE TABLE IF NOT EXISTS teacher_student_assignments (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  assigned_by_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  UNIQUE (teacher_id, student_id, is_active),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (student_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher_active ON teacher_student_assignments(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignments_student_active ON teacher_student_assignments(student_id, is_active);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject_id TEXT,
  title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  content_markdown TEXT NOT NULL,
  cover_image_url TEXT,
  difficulty TEXT CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  unit TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  estimated_minutes INTEGER,
  tags_json TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lessons_teacher_status ON lessons(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_lessons_subject_topic ON lessons(subject, topic);
CREATE INDEX IF NOT EXISTS idx_lessons_subject_id_status ON lessons(subject_id, status);

CREATE TABLE IF NOT EXISTS lesson_progress (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED')),
  completion_percent INTEGER NOT NULL DEFAULT 0,
  time_spent_sec INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lesson_id, student_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_status ON lesson_progress(student_id, status);

CREATE TABLE IF NOT EXISTS lesson_views (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
  time_spent_sec INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lesson_views_lesson_viewed ON lesson_views(lesson_id, viewed_at);
CREATE INDEX IF NOT EXISTS idx_lesson_views_student_viewed ON lesson_views(student_id, viewed_at);

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

CREATE TABLE IF NOT EXISTS question_bank_entries (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  type TEXT NOT NULL CHECK (type IN ('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'MULTI_SELECT', 'MATCHING', 'FILL_BLANK', 'SEQUENCING', 'IMAGE_BASED')),
  prompt_markdown TEXT NOT NULL,
  explanation_markdown TEXT,
  hint_markdown TEXT,
  reference_answer TEXT,
  grading_keywords_json TEXT,
  image_url TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_bank_teacher_subject_topic ON question_bank_entries(teacher_id, subject, topic);
CREATE INDEX IF NOT EXISTS idx_question_bank_type_difficulty ON question_bank_entries(type, difficulty, is_archived);

CREATE TABLE IF NOT EXISTS question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (question_id) REFERENCES question_bank_entries(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_question_options_question_position ON question_options(question_id, position);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  lesson_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  instructions TEXT,
  passing_score INTEGER NOT NULL DEFAULT 70,
  time_limit_sec INTEGER,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  available_from TEXT,
  available_until TEXT,
  randomize_questions INTEGER NOT NULL DEFAULT 0,
  randomize_options INTEGER NOT NULL DEFAULT 0,
  feedback_mode TEXT NOT NULL DEFAULT 'INSTANT' CHECK (feedback_mode IN ('INSTANT', 'DELAYED')),
  explanation_mode TEXT NOT NULL DEFAULT 'AFTER_SUBMISSION' CHECK (explanation_mode IN ('ALWAYS', 'AFTER_SUBMISSION', 'AFTER_PASS', 'NEVER')),
  show_answer_key INTEGER NOT NULL DEFAULT 1,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id)
);

CREATE INDEX IF NOT EXISTS idx_quizzes_teacher_status ON quizzes(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_quizzes_lesson ON quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_availability ON quizzes(available_from, available_until);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  points REAL NOT NULL DEFAULT 1,
  is_required INTEGER NOT NULL DEFAULT 1,
  UNIQUE (quiz_id, question_id),
  UNIQUE (quiz_id, position),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (question_id) REFERENCES question_bank_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_question ON quiz_questions(question_id);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'SUBMITTED', 'GRADED', 'ABANDONED')),
  outcome TEXT NOT NULL DEFAULT 'PENDING' CHECK (outcome IN ('PENDING', 'PASSED', 'FAILED')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  graded_at TEXT,
  time_spent_sec INTEGER,
  score_percent REAL,
  correct_count INTEGER,
  wrong_count INTEGER,
  pass_threshold INTEGER,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (quiz_id, student_id, attempt_number),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_created ON quiz_attempts(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_created ON quiz_attempts(quiz_id, created_at);

CREATE TABLE IF NOT EXISTS attempt_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  quiz_question_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_option_ids_json TEXT,
  answer_text TEXT,
  is_correct INTEGER,
  earned_points REAL,
  max_points REAL NOT NULL DEFAULT 1,
  feedback TEXT,
  graded_by_ai INTEGER NOT NULL DEFAULT 0,
  topic_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_question_id) REFERENCES quiz_questions(id),
  FOREIGN KEY (question_id) REFERENCES question_bank_entries(id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_question_correct ON attempt_answers(question_id, is_correct);

CREATE TABLE IF NOT EXISTS badges (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('MILESTONE', 'PERFORMANCE', 'CONSISTENCY', 'EXPLORATION')),
  xp_reward INTEGER NOT NULL DEFAULT 0,
  criteria_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  badge_id TEXT NOT NULL,
  reason TEXT,
  awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, badge_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (badge_id) REFERENCES badges(id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_awarded ON user_badges(user_id, awarded_at);

CREATE TABLE IF NOT EXISTS xp_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('QUIZ_COMPLETION', 'QUIZ_PASS', 'LESSON_COMPLETE', 'STREAK', 'ACHIEVEMENT', 'BONUS')),
  amount INTEGER NOT NULL,
  description TEXT,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_xp_events_user_created ON xp_events(user_id, created_at);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('XP', 'QUIZ_COMPLETION', 'STREAK')),
  scope TEXT NOT NULL DEFAULT 'GLOBAL',
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  entries_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_snapshots_mode_scope_period ON leaderboard_snapshots(mode, scope, period_start);

CREATE TABLE IF NOT EXISTS recommendations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('REVIEW_LESSON', 'RETRY_QUIZ', 'NEXT_LESSON', 'PRACTICE_TOPIC')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  lesson_id TEXT,
  quiz_id TEXT,
  topic TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  is_dismissed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_student_priority ON recommendations(student_id, is_dismissed, priority);

CREATE TABLE IF NOT EXISTS system_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value_json TEXT NOT NULL,
  description TEXT,
  updated_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (updated_by_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  role_snapshot TEXT CHECK (role_snapshot IN ('ADMIN', 'TEACHER', 'STUDENT')),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_created ON activity_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_entity ON activity_logs(action, entity_type);

CREATE TABLE IF NOT EXISTS ai_grading_jobs (
  id TEXT PRIMARY KEY,
  attempt_answer_id TEXT NOT NULL UNIQUE,
  reviewed_by_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  score REAL,
  feedback TEXT,
  request_payload_json TEXT,
  response_payload_json TEXT,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (attempt_answer_id) REFERENCES attempt_answers(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ai_grading_jobs_status_queue ON ai_grading_jobs(status, queued_at);

CREATE TABLE IF NOT EXISTS quiz_generation_jobs (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  quiz_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  question_count INTEGER NOT NULL,
  question_types_json TEXT NOT NULL,
  generated_questions_json TEXT,
  created_question_ids_json TEXT,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quiz_generation_jobs_lesson_status_queue
  ON quiz_generation_jobs(lesson_id, status, queued_at);

CREATE TABLE IF NOT EXISTS lesson_generation_jobs (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  prompt_text TEXT NOT NULL,
  preferred_title TEXT,
  preferred_topic TEXT,
  preferred_difficulty TEXT CHECK (preferred_difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  preferred_estimated_minutes INTEGER,
  generated_lesson_json TEXT,
  created_lesson_id TEXT,
  error_message TEXT,
  queued_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (created_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_generation_jobs_context_queue
  ON lesson_generation_jobs(teacher_id, subject_id, section_id, status, queued_at);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_subjects_active_name ON subjects(is_active, name);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  assigned_by_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  assigned_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  UNIQUE (teacher_id, subject_id, is_active),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher_active ON teacher_subjects(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject_active ON teacher_subjects(subject_id, is_active);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  subject_id TEXT,
  name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  school_year TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sections_teacher_status ON sections(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_sections_school_year ON sections(school_year, status);

CREATE TABLE IF NOT EXISTS section_subjects (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  assigned_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (section_id, subject_id),
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_section_subjects_section ON section_subjects(section_id);
CREATE INDEX IF NOT EXISTS idx_section_subjects_subject ON section_subjects(subject_id);

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
);

CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_teacher_active
  ON section_subject_teachers(teacher_id, is_active);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_section_subject_active
  ON section_subject_teachers(section_id, subject_id, is_active);
CREATE INDEX IF NOT EXISTS idx_section_subject_teachers_subject_teacher_active
  ON section_subject_teachers(subject_id, teacher_id, is_active);

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
);

CREATE INDEX IF NOT EXISTS idx_section_teachers_section_active ON section_teachers(section_id, is_active);
CREATE INDEX IF NOT EXISTS idx_section_teachers_teacher_active ON section_teachers(teacher_id, is_active);

CREATE TABLE IF NOT EXISTS section_students (
  id TEXT PRIMARY KEY,
  section_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  assigned_by_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT,
  UNIQUE (section_id, student_id, is_active),
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_section_students_section_active ON section_students(section_id, is_active);
CREATE INDEX IF NOT EXISTS idx_section_students_student_active ON section_students(student_id, is_active);

CREATE TABLE IF NOT EXISTS lesson_sections (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  assigned_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (lesson_id, section_id),
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lesson_sections_section ON lesson_sections(section_id);

CREATE TABLE IF NOT EXISTS quiz_sections (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  section_id TEXT NOT NULL,
  assigned_by_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (quiz_id, section_id),
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quiz_sections_section ON quiz_sections(section_id);

CREATE TABLE IF NOT EXISTS chemical_equations (
  id TEXT PRIMARY KEY,
  subject_id TEXT,
  teacher_id TEXT,
  title TEXT NOT NULL,
  formula TEXT NOT NULL,
  balanced_formula TEXT,
  difficulty TEXT NOT NULL DEFAULT 'MEDIUM' CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
  topic TEXT NOT NULL,
  hints_json TEXT,
  explanation_markdown TEXT,
  tags_json TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_chemical_equations_topic_difficulty ON chemical_equations(topic, difficulty, is_archived);
CREATE INDEX IF NOT EXISTS idx_chemical_equations_teacher ON chemical_equations(teacher_id, is_archived);

CREATE TABLE IF NOT EXISTS equation_practice_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  section_id TEXT,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_equation_practice_sessions_student_status ON equation_practice_sessions(student_id, status, started_at);

CREATE TABLE IF NOT EXISTS equation_practice_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  equation_id TEXT NOT NULL,
  student_answer TEXT NOT NULL,
  normalized_answer TEXT,
  is_correct INTEGER,
  confidence REAL,
  feedback TEXT,
  hint TEXT,
  ai_provider TEXT,
  grading_metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES equation_practice_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (equation_id) REFERENCES chemical_equations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_equation_practice_attempts_session_created ON equation_practice_attempts(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_equation_practice_attempts_equation_created ON equation_practice_attempts(equation_id, created_at);
