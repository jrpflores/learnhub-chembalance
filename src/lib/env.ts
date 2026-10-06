const required = {
  jwtSecret: process.env.JWT_SECRET,
};

if (!required.jwtSecret) {
  throw new Error("JWT_SECRET is required");
}

function toBoolean(value: string | undefined, fallback: boolean) {
  if (value == null) {
    return fallback;
  }
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeModelName(value: string | undefined) {
  if (!value) {
    return "";
  }
  return value.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

function parseModelList(value: string | undefined) {
  return (value ?? "")
    .split(/[,\n]/)
    .map((item) => normalizeModelName(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

export const env = {
  databaseFile: process.env.DATABASE_FILE ?? "./data/learnhub.db",
  jwtSecret: required.jwtSecret,
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "learnhub_session",
  sessionCookieSecure: toBoolean(process.env.SESSION_COOKIE_SECURE, process.env.NODE_ENV === "production"),
  offlineGraderUrl: process.env.OFFLINE_GRADER_URL ?? "http://localhost:8001",
  offlineGraderTimeoutMs: toNumber(process.env.OFFLINE_GRADER_TIMEOUT_MS, 5000),
  offlineAiEnabled: process.env.OFFLINE_AI_ENABLED !== "false",
  aiGradingMode: (process.env.AI_GRADING_MODE ?? "sync") as "sync" | "queue",
  aiFallbackBehavior: (process.env.AI_FALLBACK_BEHAVIOR ?? "manual_review") as
    | "manual_review"
    | "rule_based",
  aiHighConfidenceThreshold: toNumber(process.env.AI_CONFIDENCE_HIGH, 0.9),
  aiMediumConfidenceThreshold: toNumber(process.env.AI_CONFIDENCE_MEDIUM, 0.7),
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
  /** Default lite offline model (3B class) for CPU-friendly quiz/lesson/tutor workloads. */
  ollamaModel: normalizeModelName(process.env.OLLAMA_MODEL) || "qwen2.5:3b",
  ollamaFallbackModels: parseModelList(process.env.OLLAMA_FALLBACK_MODELS),
  ollamaTimeoutMs: toNumber(process.env.OLLAMA_TIMEOUT_MS, 240000),
  ollamaTemperature: toNumber(process.env.OLLAMA_TEMPERATURE, 0.1),
  /** JSON generation (quiz/lesson drafts). Lower = faster on CPU. */
  ollamaNumPredict: toNumber(process.env.OLLAMA_NUM_PREDICT, 2048),
  /** Tutor streaming replies — keep short for responsive practice chat. */
  ollamaTutorNumPredict: toNumber(process.env.OLLAMA_TUTOR_NUM_PREDICT, 1024),
  aiTutorQuestionCharLimit: toNumber(process.env.AI_TUTOR_QUESTION_CHAR_LIMIT, 1200),
  aiTutorHistoryWindow: toNumber(process.env.AI_TUTOR_HISTORY_WINDOW, 6),
  aiTutorHistoryChars: toNumber(process.env.AI_TUTOR_HISTORY_CHARS, 320),
  aiTutorLessonChunkChars: toNumber(process.env.AI_TUTOR_LESSON_CHUNK_CHARS, 680),
  aiTutorLessonMaxChunks: toNumber(process.env.AI_TUTOR_LESSON_MAX_CHUNKS, 4),
  aiTutorLessonMaxContextChars: toNumber(process.env.AI_TUTOR_LESSON_MAX_CONTEXT_CHARS, 3200),
  aiQuizGenLessonChunkChars: toNumber(process.env.AI_QUIZ_GEN_LESSON_CHUNK_CHARS, 800),
  aiQuizGenMaxChunks: toNumber(process.env.AI_QUIZ_GEN_MAX_CHUNKS, 5),
  aiQuizGenMaxContextChars: toNumber(process.env.AI_QUIZ_GEN_MAX_CONTEXT_CHARS, 4500),
  uploadsDir: process.env.UPLOADS_DIR ?? "./storage/uploads",
  logsDir: process.env.LOGS_DIR ?? "./storage/logs",
  aiModelsDir: process.env.AI_MODELS_DIR ?? "./storage/models",
};
