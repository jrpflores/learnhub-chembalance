import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

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
    .map((entry) => normalizeModelName(entry))
    .filter(Boolean)
    .filter((model, index, list) => list.indexOf(model) === index);
}

const databaseFile = process.env.DATABASE_FILE ?? "./data/learnhub.db";
const offlineGraderUrl = process.env.OFFLINE_GRADER_URL ?? "http://offline-grader:8001";
const offlineAiEnabled = process.env.OFFLINE_AI_ENABLED !== "false";
const timeoutMs = toNumber(process.env.OFFLINE_GRADER_TIMEOUT_MS, 5000);
const confidenceThreshold = toNumber(process.env.AI_CONFIDENCE_MEDIUM, 0.7);

const ollamaBaseUrl = (process.env.OLLAMA_BASE_URL ?? "http://ollama:11434").replace(/\/$/, "");
const ollamaModel = normalizeModelName(process.env.OLLAMA_MODEL) || "llama3:8b";
const ollamaFallbackModels = parseModelList(process.env.OLLAMA_FALLBACK_MODELS);
const ollamaTimeoutMs = toNumber(process.env.OLLAMA_TIMEOUT_MS, 240000);
const ollamaTemperature = toNumber(process.env.OLLAMA_TEMPERATURE, 0.1);
const quizGenLessonChunkChars = Math.max(280, Math.min(Math.trunc(toNumber(process.env.AI_QUIZ_GEN_LESSON_CHUNK_CHARS, 800)), 2000));
const quizGenMaxChunks = Math.max(1, Math.min(Math.trunc(toNumber(process.env.AI_QUIZ_GEN_MAX_CHUNKS, 5)), 10));
const quizGenMaxContextChars = Math.max(
  900,
  Math.min(Math.trunc(toNumber(process.env.AI_QUIZ_GEN_MAX_CONTEXT_CHARS, 4500)), 15000),
);

const resolvedDbFile = path.isAbsolute(databaseFile)
  ? databaseFile
  : path.resolve(process.cwd(), databaseFile);

fs.mkdirSync(path.dirname(resolvedDbFile), { recursive: true });

const db = new Database(resolvedDbFile);
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL");
db.exec(`
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
`);

const ALLOWED_QUESTION_TYPES = ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as const;
type AllowedQuestionType = (typeof ALLOWED_QUESTION_TYPES)[number];
const MAX_GENERATION_QUESTIONS = 10;
const ALLOWED_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
type AllowedDifficulty = (typeof ALLOWED_DIFFICULTIES)[number];
const SUBSCRIPT_DIGIT_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};
const LEET_CHAR_MAP: Record<string, string> = {
  "@": "a",
  "€": "e",
  "$": "s",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
};
const CONCEPT_ALIAS_GROUPS = [
  ["water", "h2o", "h₂o", "dihydrogen monoxide", "aqua"],
] as const;
const QUIZ_GEN_STOPWORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "have",
  "about",
  "your",
  "what",
  "when",
  "where",
  "which",
  "into",
  "there",
  "their",
  "would",
  "could",
  "should",
  "were",
  "will",
  "lesson",
  "topic",
  "subject",
  "teacher",
  "student",
]);

const CONCEPT_ALIAS_MAP = (() => {
  const map = new Map<string, string>();
  for (const group of CONCEPT_ALIAS_GROUPS) {
    const canonical = normalizeConceptText(group[0]);
    for (const alias of group) {
      map.set(normalizeConceptText(alias), canonical);
    }
  }
  return map;
})();

type PendingGradingJob = {
  id: string;
  attempt_answer_id: string;
  request_payload_json: string | null;
};

type AnswerContext = {
  answer_text: string | null;
  max_points: number;
  prompt_markdown: string;
  explanation_markdown: string | null;
  reference_answer: string | null;
  grading_keywords_json: string | null;
};

type PendingQuizGenerationJob = {
  id: string;
  teacher_id: string;
  lesson_id: string;
  quiz_id: string;
  question_count: number;
  question_types_json: string;
};

type QuizGenerationContext = {
  title: string;
  subject: string;
  topic: string;
  content_markdown: string;
};

type PendingLessonGenerationJob = {
  id: string;
  teacher_id: string;
  subject_id: string;
  section_id: string;
  prompt_text: string;
  preferred_title: string | null;
  preferred_topic: string | null;
  preferred_difficulty: AllowedDifficulty | null;
  preferred_estimated_minutes: number | null;
};

type LessonGenerationContext = {
  subject_name: string;
  subject_description: string | null;
  section_name: string;
  grade_level: string;
  school_year: string;
};

type GeneratedQuestion = {
  questionText: string;
  questionType: AllowedQuestionType;
  choices: string[];
  correctAnswer: string;
  explanation: string;
};

type GeneratedLessonDraft = {
  title: string;
  shortDescription: string;
  topic: string;
  unit: string | null;
  difficulty: AllowedDifficulty;
  estimatedMinutes: number;
  tags: string[];
  contentMarkdown: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asJsonObject(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    const match = value.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]) as unknown;
    } catch {
      return null;
    }
  }
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function normalizeQuestionType(value: string): AllowedQuestionType {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized.includes("TRUE") || normalized.includes("FALSE")) {
    return "TRUE_FALSE";
  }
  if (normalized.includes("SHORT")) {
    return "SHORT_ANSWER";
  }
  return "MULTIPLE_CHOICE";
}

function parseRequestedTypes(value: string): AllowedQuestionType[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [...ALLOWED_QUESTION_TYPES];
    }

    const normalized = parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => normalizeQuestionType(item))
      .filter((item, index, list) => list.indexOf(item) === index);

    return normalized.length > 0 ? normalized : [...ALLOWED_QUESTION_TYPES];
  } catch {
    return [...ALLOWED_QUESTION_TYPES];
  }
}

function normalizeDifficulty(value?: string | null): AllowedDifficulty {
  const normalized = value?.trim().toUpperCase() ?? "MEDIUM";
  return ALLOWED_DIFFICULTIES.includes(normalized as AllowedDifficulty)
    ? (normalized as AllowedDifficulty)
    : "MEDIUM";
}

function collapseSpacedLetters(value: string) {
  return value.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/gi, (token) => token.replace(/\s+/g, ""));
}

function normalizeConceptText(value: string) {
  const replacedSubscripts = value.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => SUBSCRIPT_DIGIT_MAP[char] ?? char);
  const normalizedUnicode = replacedSubscripts.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const collapsedLetters = collapseSpacedLetters(normalizedUnicode);
  const mappedLeet = collapsedLetters.replace(/[@€$0134]/g, (char) => LEET_CHAR_MAP[char] ?? char);
  return mappedLeet
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function conceptKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const normalized = normalizeConceptText(value);
  return CONCEPT_ALIAS_MAP.get(normalized) ?? normalized;
}

function calculateFallbackShortAnswerGrade(payload: {
  studentAnswer: string;
  referenceAnswer: string | null;
  keywords: string[];
  fallbackReason?: string;
}) {
  const normalizedStudent = normalizeConceptText(payload.studentAnswer);
  const keywords = payload.keywords.filter(Boolean);
  const studentConcept = conceptKey(payload.studentAnswer);
  const referenceConcept = conceptKey(payload.referenceAnswer);

  if (studentConcept && referenceConcept && studentConcept === referenceConcept) {
    return {
      normalizedScore: 1,
      feedback: "Great answer. You identified the concept correctly.",
      confidence: 0.95,
      matchedConcepts: [referenceConcept],
      missingConcepts: [],
      misconceptions: [],
      provider: "fallback-rule" as const,
      fallbackReason: payload.fallbackReason ?? null,
    };
  }

  const keywordHits =
    keywords.length === 0
      ? 0
      : keywords.filter((keyword) => {
          const normalizedKeyword = normalizeConceptText(keyword);
          const keywordConcept = conceptKey(keyword);
          return (
            normalizedStudent.includes(normalizedKeyword) ||
            (studentConcept.length > 0 && keywordConcept.length > 0 && studentConcept === keywordConcept)
          );
        }).length;

  const keywordScore = keywords.length > 0 ? keywordHits / keywords.length : 0;

  let referenceScore = 0;
  if (payload.referenceAnswer) {
    const referenceTokens = normalizeConceptText(payload.referenceAnswer)
      .split(/[^a-z0-9]+/)
      .filter(Boolean);

    if (referenceTokens.length > 0) {
      const uniqueTokens = Array.from(new Set(referenceTokens));
      const overlap = uniqueTokens.filter((token) => normalizedStudent.includes(token)).length;
      referenceScore = overlap / uniqueTokens.length;
    }
  }

  const combined = Math.max(keywordScore * 0.7 + referenceScore * 0.3, Math.max(keywordScore, referenceScore));
  const normalizedScore = Math.min(1, Number(combined.toFixed(2)));

  let feedback = "Good attempt. Review key concepts and improve precision.";
  if (normalizedScore >= 0.85) {
    feedback = "Strong answer with correct key ideas.";
  } else if (normalizedScore >= 0.6) {
    feedback = "Solid progress. Add more exact details to get full credit.";
  } else if (normalizedScore >= 0.35) {
    feedback = "You have part of the concept. Recheck the lesson examples and try again.";
  }

  return {
    normalizedScore,
    feedback,
    confidence: Number((0.55 + normalizedScore * 0.35).toFixed(2)),
    matchedConcepts: [],
    missingConcepts: [],
    misconceptions: [],
    provider: "fallback-rule" as const,
    fallbackReason: payload.fallbackReason ?? null,
  };
}

function normalizeGeneratedQuestion(raw: {
  question_text: string;
  question_type: string;
  choices?: string[];
  correct_answer: string;
  explanation?: string;
}, allowedTypes: AllowedQuestionType[]): GeneratedQuestion {
  const detectedType = normalizeQuestionType(raw.question_type);
  const questionType = allowedTypes.includes(detectedType) ? detectedType : allowedTypes[0];

  if (questionType === "TRUE_FALSE") {
    const correct = /true/i.test(raw.correct_answer) ? "True" : "False";
    return {
      questionText: raw.question_text.trim(),
      questionType,
      choices: ["True", "False"],
      correctAnswer: correct,
      explanation: (raw.explanation ?? "").trim() || "Review this concept and justify why the statement is true or false.",
    };
  }

  if (questionType === "SHORT_ANSWER") {
    return {
      questionText: raw.question_text.trim(),
      questionType,
      choices: [],
      correctAnswer: raw.correct_answer.trim(),
      explanation: (raw.explanation ?? "").trim() || "Use evidence from the lesson in your response.",
    };
  }

  const cleanedChoices = (raw.choices ?? [])
    .map((choice) => choice.trim())
    .filter(Boolean)
    .slice(0, 4);

  const choices = cleanedChoices.length >= 2 ? cleanedChoices : [raw.correct_answer.trim(), "None of the above"];
  while (choices.length < 4) {
    choices.push(`Distractor ${choices.length}`);
  }

  const matchedCorrect = choices.find((choice) => choice.toLowerCase() === raw.correct_answer.trim().toLowerCase());

  return {
    questionText: raw.question_text.trim(),
    questionType,
    choices,
    correctAnswer: matchedCorrect ?? choices[0],
    explanation: (raw.explanation ?? "").trim() || "Review the lesson concepts to justify the correct answer.",
  };
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function stripMarkdownForSearch(content: string) {
  return normalizeWhitespace(
    content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`\n]+`/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[[^\]]+]\([^)]*\)/g, " ")
      .replace(/[>#*_~|-]/g, " "),
  ).toLowerCase();
}

function tokenizeSearchTerms(content: string, limit: number) {
  return stripMarkdownForSearch(content)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !QUIZ_GEN_STOPWORDS.has(token))
    .slice(0, limit);
}

function chunkLessonContent(contentMarkdown: string, chunkSize: number) {
  const sections = contentMarkdown
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";
  for (const section of sections) {
    if (section.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = "";
      }

      const pieceCount = Math.ceil(section.length / chunkSize);
      for (let index = 0; index < pieceCount; index += 1) {
        const start = index * chunkSize;
        const end = start + chunkSize;
        const piece = section.slice(start, end).trim();
        if (piece) {
          chunks.push(piece);
        }
      }
      continue;
    }

    const combined = current ? `${current}\n\n${section}` : section;
    if (combined.length <= chunkSize) {
      current = combined;
    } else {
      if (current) {
        chunks.push(current);
      }
      current = section;
    }
  }

  if (current) {
    chunks.push(current);
  }
  return chunks;
}

function sampleChunksEvenly(chunks: string[], limit: number) {
  if (chunks.length <= limit) {
    return chunks;
  }

  if (limit === 1) {
    return [chunks[0]];
  }

  const pickedIndexes = new Set<number>();
  const step = (chunks.length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) {
    pickedIndexes.add(Math.round(index * step));
  }

  const orderedIndexes = [...pickedIndexes].sort((a, b) => a - b).slice(0, limit);
  if (orderedIndexes.length < limit) {
    for (let index = 0; index < chunks.length && orderedIndexes.length < limit; index += 1) {
      if (!pickedIndexes.has(index)) {
        orderedIndexes.push(index);
      }
    }
  }

  return orderedIndexes.sort((a, b) => a - b).map((index) => chunks[index]);
}

function chunkRelevanceScore(chunk: string, terms: string[]) {
  if (terms.length === 0) {
    return 0;
  }
  const searchable = stripMarkdownForSearch(chunk);
  let score = 0;
  for (const term of terms) {
    if (searchable.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function buildQuizGenerationLessonContext(input: {
  lessonTitle: string;
  lessonSubject: string;
  lessonTopic: string;
  lessonContent: string;
}) {
  const chunks = chunkLessonContent(input.lessonContent, quizGenLessonChunkChars);
  if (chunks.length === 0) {
    return "(no lesson content)";
  }

  if (chunks.length <= quizGenMaxChunks) {
    const merged = chunks.join("\n\n---\n\n");
    return merged.length > quizGenMaxContextChars ? `${merged.slice(0, quizGenMaxContextChars)}...` : merged;
  }

  const terms = tokenizeSearchTerms(`${input.lessonTitle}\n${input.lessonSubject}\n${input.lessonTopic}`, 48);
  const prioritized = chunks
    .map((chunk, index) => ({ chunk, index, score: chunkRelevanceScore(chunk, terms) }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .slice(0, quizGenMaxChunks)
    .sort((a, b) => a.index - b.index);

  const hasSignal = prioritized.some((entry) => entry.score > 0);
  const selectedChunks = hasSignal
    ? prioritized.map((entry) => entry.chunk)
    : sampleChunksEvenly(chunks, quizGenMaxChunks);

  const merged = selectedChunks.join("\n\n---\n\n");
  return merged.length > quizGenMaxContextChars ? `${merged.slice(0, quizGenMaxContextChars)}...` : merged;
}

async function generateQuizQuestions(input: {
  lessonTitle: string;
  lessonSubject: string;
  lessonTopic: string;
  lessonContent: string;
  questionCount: number;
  questionTypes: AllowedQuestionType[];
}) {
  const questionCount = Math.max(1, Math.min(input.questionCount, MAX_GENERATION_QUESTIONS));
  const questionTypes = input.questionTypes.length > 0 ? input.questionTypes : [...ALLOWED_QUESTION_TYPES];
  const allowedTypesText = questionTypes.join(", ");
  const lessonContext = buildQuizGenerationLessonContext(input);

  const prompt = `
You are generating junior-high quiz questions.
Use ONLY the supplied lesson content. Do not invent external facts.

Output strict JSON, no markdown:
{
  "questions": [
    {
      "question_text": "...",
      "question_type": "MULTIPLE_CHOICE|TRUE_FALSE|SHORT_ANSWER",
      "choices": ["...","...","...","..."],
      "correct_answer": "...",
      "explanation": "..."
    }
  ]
}

Rules:
- Create exactly ${questionCount} questions.
- Allowed question types: ${allowedTypesText}.
- Age-appropriate language for junior high.
- Prioritize concept understanding over trick wording.
- For multiple choice, provide plausible distractors.
- Keep statements concise and classroom-ready.

Lesson title: ${input.lessonTitle}
Subject: ${input.lessonSubject}
Topic: ${input.lessonTopic}

Relevant lesson excerpts (trimmed for context budget):
${lessonContext}
`.trim();

  const candidateModels = [ollamaModel, ...ollamaFallbackModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index,
  );

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ollamaTimeoutMs);

    try {
      const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: Math.min(Math.max(ollamaTemperature, 0), 0.4),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawError = await response.text();
        const errorDetail = rawError ? ` (${rawError.slice(0, 180)})` : "";
        lastError = new Error(`Ollama model "${model}" returned ${response.status}${errorDetail}`);
        continue;
      }

      const payload = (await response.json()) as { response?: string };
      const rawResponse = payload.response?.trim() ?? "";
      const parsedObject = asJsonObject(rawResponse);
      if (!parsedObject) {
        lastError = new Error(`Model "${model}" returned non-JSON content.`);
        continue;
      }

      const rawQuestions: {
        question_text?: unknown;
        question_type?: unknown;
        choices?: unknown;
        correct_answer?: unknown;
        explanation?: unknown;
      }[] = Array.isArray(parsedObject)
        ? parsedObject
        : Array.isArray((parsedObject as { questions?: unknown }).questions)
          ? ((parsedObject as { questions: unknown[] }).questions as typeof rawQuestions)
          : [];

      const normalized = rawQuestions
        .filter((entry) => typeof entry.question_text === "string" && typeof entry.correct_answer === "string")
        .map((entry) =>
          normalizeGeneratedQuestion(
            {
              question_text: String(entry.question_text),
              question_type: typeof entry.question_type === "string" ? entry.question_type : "MULTIPLE_CHOICE",
              choices: Array.isArray(entry.choices)
                ? entry.choices.filter((choice): choice is string => typeof choice === "string")
                : [],
              correct_answer: String(entry.correct_answer),
              explanation: typeof entry.explanation === "string" ? entry.explanation : "",
            },
            questionTypes,
          ),
        )
        .slice(0, questionCount);

      if (normalized.length === 0) {
        lastError = new Error(`Model "${model}" returned zero valid questions.`);
        continue;
      }

      return normalized;
    } catch (error) {
      if (isAbortError(error)) {
        lastError = new Error(
          `Ollama request timed out after ${ollamaTimeoutMs}ms on model "${model}". Try fewer questions or increase OLLAMA_TIMEOUT_MS.`,
        );
        continue;
      }
      lastError = error instanceof Error ? error : new Error(`Model "${model}" request failed.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("No configured Ollama model could generate quiz questions.");
}

function normalizeGeneratedLessonDraft(
  raw: Record<string, unknown>,
  defaults: {
    topic: string;
    estimatedMinutes: number;
    difficulty: AllowedDifficulty;
  },
): GeneratedLessonDraft {
  const title = (typeof raw.title === "string" ? raw.title.trim() : "").slice(0, 180);
  const shortDescription = (typeof raw.short_description === "string" ? raw.short_description.trim() : "").slice(0, 400);
  const topic = (typeof raw.topic === "string" ? raw.topic.trim() : defaults.topic).slice(0, 100);
  const unitRaw = typeof raw.unit === "string" ? raw.unit.trim() : "";
  const unit = unitRaw.length > 0 ? unitRaw.slice(0, 120) : null;
  const difficulty = normalizeDifficulty(typeof raw.difficulty === "string" ? raw.difficulty : defaults.difficulty);
  const estimatedRaw = typeof raw.estimated_minutes === "number" ? raw.estimated_minutes : defaults.estimatedMinutes;
  const estimatedMinutes = Math.max(5, Math.min(300, Math.round(estimatedRaw)));
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];
  const contentMarkdown =
    typeof raw.content_markdown === "string" ? raw.content_markdown.trim() : "";

  return {
    title: title.length >= 3 ? title : `${topic || "Lesson"} Fundamentals`,
    shortDescription:
      shortDescription.length >= 10
        ? shortDescription
        : "AI-generated lesson draft ready for teacher review and edits.",
    topic: topic.length >= 2 ? topic : defaults.topic,
    unit,
    difficulty,
    estimatedMinutes,
    tags,
    contentMarkdown:
      contentMarkdown.length >= 20
        ? contentMarkdown
        : `# ${title || "Lesson Draft"}\n\n## Overview\n\n${shortDescription || "Review this concept and update the lesson details."}`,
  };
}

async function generateLessonDraft(input: {
  subjectName: string;
  subjectDescription: string | null;
  sectionName: string;
  gradeLevel: string;
  schoolYear: string;
  promptText: string;
  preferredTitle?: string | null;
  preferredTopic?: string | null;
  preferredDifficulty?: AllowedDifficulty | null;
  preferredEstimatedMinutes?: number | null;
}) {
  const preferredTopic = input.preferredTopic?.trim() || "General";
  const preferredDifficulty = normalizeDifficulty(input.preferredDifficulty);
  const preferredEstimatedMinutes = Math.max(5, Math.min(300, input.preferredEstimatedMinutes ?? 20));

  const prompt = `
You are creating one junior-high lesson draft for an LMS.
Return strict JSON only (no markdown fences, no explanations) in this format:
{
  "title": "...",
  "short_description": "...",
  "topic": "...",
  "unit": "...",
  "difficulty": "EASY|MEDIUM|HARD",
  "estimated_minutes": 20,
  "tags": ["..."],
  "content_markdown": "# Title\\n\\n## Learning Goals\\n..."
}

Rules:
- Generate exactly one lesson draft.
- Keep content age-appropriate and clear for junior-high students.
- Use markdown structure with headings and concise sections.
- Keep short_description to one concise paragraph.
- Do not include content unrelated to the teacher request.
- Keep difficulty aligned with preferred difficulty when provided.
- Keep estimated_minutes realistic for one class period.
- Include examples and practice prompts in content_markdown.
- The lesson remains a draft and will be reviewed by a teacher.

Context:
Subject: ${input.subjectName}
Subject description: ${input.subjectDescription ?? "N/A"}
Section: ${input.sectionName}
Grade level: ${input.gradeLevel}
School year: ${input.schoolYear}
Preferred title: ${input.preferredTitle?.trim() || "N/A"}
Preferred topic: ${preferredTopic}
Preferred difficulty: ${preferredDifficulty}
Preferred estimated minutes: ${preferredEstimatedMinutes}

Teacher request:
${input.promptText.slice(0, 2400)}
`.trim();

  const candidateModels = [ollamaModel, ...ollamaFallbackModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index,
  );

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ollamaTimeoutMs);

    try {
      const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: Math.min(Math.max(ollamaTemperature, 0), 0.35),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const rawError = await response.text();
        const errorDetail = rawError ? ` (${rawError.slice(0, 180)})` : "";
        lastError = new Error(`Ollama model "${model}" returned ${response.status}${errorDetail}`);
        continue;
      }

      const payload = (await response.json()) as { response?: string };
      const parsed = asJsonObject(payload.response?.trim() ?? "");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        lastError = new Error(`Model "${model}" returned non-object JSON for lesson draft.`);
        continue;
      }

      return normalizeGeneratedLessonDraft(parsed as Record<string, unknown>, {
        topic: preferredTopic,
        estimatedMinutes: preferredEstimatedMinutes,
        difficulty: preferredDifficulty,
      });
    } catch (error) {
      if (isAbortError(error)) {
        lastError = new Error(
          `Ollama request timed out after ${ollamaTimeoutMs}ms on model "${model}". Try a shorter prompt or increase OLLAMA_TIMEOUT_MS.`,
        );
        continue;
      }
      lastError = error instanceof Error ? error : new Error(`Model "${model}" request failed.`);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error("No configured Ollama model could generate a lesson draft.");
}

async function callOfflineGrader(payload: {
  prompt: string;
  studentAnswer: string;
  referenceAnswer: string | null;
  keywords: string[];
  maxScore: number;
  rubric?: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${offlineGraderUrl}/grade-short-answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        student_answer: payload.studentAnswer,
        reference_answer: payload.referenceAnswer,
        keywords: payload.keywords,
        max_score: payload.maxScore,
        rubric: payload.rubric,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Offline grader returned ${response.status}`);
    }

    const body = (await response.json()) as {
      normalized_score?: number;
      feedback?: string;
      confidence?: number;
      matched_concepts?: string[];
      missing_concepts?: string[];
      misconceptions?: string[];
    };

    return {
      normalizedScore: Math.max(0, Math.min(1, body.normalized_score ?? 0)),
      feedback: body.feedback ?? "Evaluated by offline grader.",
      confidence: Math.max(0, Math.min(1, body.confidence ?? 0.7)),
      matchedConcepts: Array.isArray(body.matched_concepts)
        ? body.matched_concepts.filter((entry): entry is string => typeof entry === "string")
        : [],
      missingConcepts: Array.isArray(body.missing_concepts)
        ? body.missing_concepts.filter((entry): entry is string => typeof entry === "string")
        : [],
      misconceptions: Array.isArray(body.misconceptions)
        ? body.misconceptions.filter((entry): entry is string => typeof entry === "string")
        : [],
      provider: "offline-service" as const,
      fallbackReason: null as string | null,
    };
  } catch (error) {
    return calculateFallbackShortAnswerGrade({
      studentAnswer: payload.studentAnswer,
      referenceAnswer: payload.referenceAnswer,
      keywords: payload.keywords,
      fallbackReason: error instanceof Error ? error.message : "offline grader unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildAiFeedback(payload: {
  baseFeedback: string;
  matchedConcepts: string[];
  missingConcepts: string[];
  misconceptions: string[];
  explanationMarkdown?: string | null;
}) {
  const parts: string[] = [];
  const base = payload.baseFeedback.trim();
  if (base) {
    parts.push(base);
  }

  if (payload.matchedConcepts.length > 0) {
    parts.push(`Covered: ${payload.matchedConcepts.slice(0, 3).join(", ")}.`);
  }
  if (payload.missingConcepts.length > 0) {
    parts.push(`Review: ${payload.missingConcepts.slice(0, 3).join(", ")}.`);
  }
  if (payload.misconceptions.length > 0) {
    parts.push(`Watch out for: ${payload.misconceptions.slice(0, 2).join(", ")}.`);
  }

  if (parts.length === 0 && payload.explanationMarkdown) {
    parts.push("Review the explanation and try again.");
  }

  return parts.join(" ");
}

async function processPendingGradingJobs() {
  const jobs = db
    .prepare<[], PendingGradingJob>(
      `SELECT id, attempt_answer_id, request_payload_json
       FROM ai_grading_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 10`,
    )
    .all();

  for (const job of jobs) {
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE ai_grading_jobs
       SET status = 'PROCESSING', started_at = ?
       WHERE id = ?`,
    ).run(now, job.id);

    try {
      const context = db
        .prepare<[string], AnswerContext>(
          `SELECT
             aa.answer_text,
             aa.max_points,
             qb.prompt_markdown,
             qb.explanation_markdown,
             qb.reference_answer,
             qb.grading_keywords_json
           FROM attempt_answers aa
           JOIN question_bank_entries qb ON qb.id = aa.question_id
           WHERE aa.id = ?
           LIMIT 1`,
        )
        .get(job.attempt_answer_id);

      if (!context) {
        throw new Error("Attempt answer context not found");
      }

      const studentAnswer = (context.answer_text ?? "").trim();
      if (!studentAnswer) {
        db.prepare(
          `UPDATE attempt_answers
           SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
           WHERE id = ?`,
        ).run("No answer submitted.", now, job.attempt_answer_id);

        db.prepare(
          `UPDATE ai_grading_jobs
           SET status = 'COMPLETED', score = 0, feedback = ?, completed_at = ?
           WHERE id = ?`,
        ).run("No answer submitted.", now, job.id);
        continue;
      }

      if (!offlineAiEnabled) {
        db.prepare(
          `UPDATE ai_grading_jobs
           SET status = 'FAILED', error_message = ?, completed_at = ?
           WHERE id = ?`,
        ).run("Offline AI disabled. Requires teacher review.", now, job.id);

        db.prepare(
          `UPDATE attempt_answers
           SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
           WHERE id = ?`,
        ).run("Queued for teacher review: offline AI is disabled.", now, job.attempt_answer_id);
        continue;
      }

      const keywords = (() => {
        if (!context.grading_keywords_json) {
          return [] as string[];
        }
        try {
          const parsed = JSON.parse(context.grading_keywords_json) as unknown;
          return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
        } catch {
          return [] as string[];
        }
      })();

      const result = await callOfflineGrader({
        prompt: context.prompt_markdown,
        studentAnswer,
        referenceAnswer: context.reference_answer,
        keywords,
        maxScore: context.max_points,
        rubric: context.explanation_markdown ?? undefined,
      });

      const feedback = buildAiFeedback({
        baseFeedback: result.feedback,
        matchedConcepts: result.matchedConcepts,
        missingConcepts: result.missingConcepts,
        misconceptions: result.misconceptions,
        explanationMarkdown: context.explanation_markdown,
      });

      const earnedPoints = Number((result.normalizedScore * context.max_points).toFixed(3));
      const isCorrect = result.confidence >= confidenceThreshold && result.normalizedScore >= 0.7;

      db.prepare(
        `UPDATE attempt_answers
         SET is_correct = ?, earned_points = ?, feedback = ?, graded_by_ai = 1, updated_at = ?
         WHERE id = ?`,
      ).run(isCorrect ? 1 : 0, earnedPoints, feedback, now, job.attempt_answer_id);

      db.prepare(
        `UPDATE ai_grading_jobs
         SET status = 'COMPLETED', score = ?, feedback = ?, response_payload_json = ?, completed_at = ?
         WHERE id = ?`,
      ).run(
        result.normalizedScore,
        feedback,
        JSON.stringify({
          confidence: result.confidence,
          provider: result.provider,
          fallbackReason: result.fallbackReason,
        }),
        now,
        job.id,
      );
    } catch (error) {
      db.prepare(
        `UPDATE ai_grading_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown error", now, job.id);

      db.prepare(
        `UPDATE attempt_answers
         SET is_correct = 0, earned_points = 0, feedback = ?, graded_by_ai = 0, updated_at = ?
         WHERE id = ?`,
      ).run("Queued for teacher review due to offline AI processing failure.", now, job.attempt_answer_id);
    }
  }

  return jobs.length;
}

async function processPendingQuizGenerationJobs() {
  const jobs = db
    .prepare<[], PendingQuizGenerationJob>(
      `SELECT id, teacher_id, lesson_id, quiz_id, question_count, question_types_json
       FROM quiz_generation_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 4`,
    )
    .all();

  for (const job of jobs) {
    const startedAt = new Date().toISOString();
    db.prepare(
      `UPDATE quiz_generation_jobs
       SET status = 'PROCESSING', started_at = ?, error_message = NULL
       WHERE id = ?`,
    ).run(startedAt, job.id);

    try {
      const context = db
        .prepare<[string], QuizGenerationContext>(
          `SELECT l.title, l.subject, l.topic, l.content_markdown
           FROM quiz_generation_jobs qgj
           JOIN lessons l ON l.id = qgj.lesson_id
           JOIN quizzes q ON q.id = qgj.quiz_id
           WHERE qgj.id = ?
             AND q.lesson_id = l.id
             AND q.teacher_id = qgj.teacher_id
           LIMIT 1`,
        )
        .get(job.id);

      if (!context) {
        throw new Error("Lesson/quiz context not found for generation job.");
      }

      const generatedQuestions = await generateQuizQuestions({
        lessonTitle: context.title,
        lessonSubject: context.subject,
        lessonTopic: context.topic,
        lessonContent: context.content_markdown,
        questionCount: Math.max(1, Math.min(job.question_count, MAX_GENERATION_QUESTIONS)),
        questionTypes: parseRequestedTypes(job.question_types_json),
      });

      if (generatedQuestions.length === 0) {
        throw new Error("No valid questions generated.");
      }

      const createdQuestionIds = db.transaction(() => {
        const maxPosition =
          db
            .prepare<[string], { max_position: number | null }>(
              `SELECT MAX(position) AS max_position
               FROM quiz_questions
               WHERE quiz_id = ?`,
            )
            .get(job.quiz_id)?.max_position ?? 0;

        let nextPosition = maxPosition;
        const createdIds: string[] = [];

        for (const generated of generatedQuestions) {
          const questionId = crypto.randomUUID();
          const now = new Date().toISOString();

          db.prepare(
            `INSERT INTO question_bank_entries (
              id, teacher_id, subject, topic, difficulty, type,
              prompt_markdown, explanation_markdown, reference_answer, grading_keywords_json,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'MEDIUM', ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            questionId,
            job.teacher_id,
            context.subject,
            context.topic,
            generated.questionType,
            generated.questionText,
            generated.explanation,
            generated.questionType === "SHORT_ANSWER" ? generated.correctAnswer : null,
            generated.questionType === "SHORT_ANSWER"
              ? JSON.stringify(
                  generated.correctAnswer
                    .split(/[^a-zA-Z0-9]+/)
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                )
              : null,
            now,
            now,
          );

          if (generated.questionType !== "SHORT_ANSWER") {
            const options =
              generated.questionType === "TRUE_FALSE" ? ["True", "False"] : generated.choices.slice(0, 4);
            const normalizedOptions = options.length >= 2 ? options : [generated.correctAnswer, "None of the above"];

            for (let index = 0; index < normalizedOptions.length; index += 1) {
              const value = normalizedOptions[index];
              const label = String.fromCharCode(65 + index);
              const isCorrect =
                value.trim().toLowerCase() === generated.correctAnswer.trim().toLowerCase() ||
                label.toLowerCase() === generated.correctAnswer.trim().toLowerCase();

              db.prepare(
                `INSERT INTO question_options (
                  id, question_id, label, value, is_correct, position, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              ).run(crypto.randomUUID(), questionId, label, value, isCorrect ? 1 : 0, index + 1, now);
            }
          }

          nextPosition += 1;
          db.prepare(
            `INSERT INTO quiz_questions (
              id, quiz_id, question_id, position, points, is_required
            ) VALUES (?, ?, ?, ?, 1, 1)`,
          ).run(crypto.randomUUID(), job.quiz_id, questionId, nextPosition);

          createdIds.push(questionId);
        }

        return createdIds;
      })();

      db.prepare(
        `UPDATE quiz_generation_jobs
         SET status = 'COMPLETED',
             generated_questions_json = ?,
             created_question_ids_json = ?,
             completed_at = ?
         WHERE id = ?`,
      ).run(
        JSON.stringify(generatedQuestions),
        JSON.stringify(createdQuestionIds),
        new Date().toISOString(),
        job.id,
      );
    } catch (error) {
      db.prepare(
        `UPDATE quiz_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown generation error", new Date().toISOString(), job.id);
    }
  }

  return jobs.length;
}

async function processPendingLessonGenerationJobs() {
  const jobs = db
    .prepare<[], PendingLessonGenerationJob>(
      `SELECT
         id,
         teacher_id,
         subject_id,
         section_id,
         prompt_text,
         preferred_title,
         preferred_topic,
         preferred_difficulty,
         preferred_estimated_minutes
       FROM lesson_generation_jobs
       WHERE status = 'PENDING'
       ORDER BY queued_at ASC
       LIMIT 3`,
    )
    .all();

  for (const job of jobs) {
    const startedAt = new Date().toISOString();
    db.prepare(
      `UPDATE lesson_generation_jobs
       SET status = 'PROCESSING', started_at = ?, error_message = NULL
       WHERE id = ?`,
    ).run(startedAt, job.id);

    try {
      const context = db
        .prepare<[string], LessonGenerationContext>(
          `SELECT
             subj.name AS subject_name,
             subj.description AS subject_description,
             sec.name AS section_name,
             sec.grade_level,
             sec.school_year
           FROM lesson_generation_jobs lgj
           JOIN subjects subj ON subj.id = lgj.subject_id
           JOIN sections sec ON sec.id = lgj.section_id
           WHERE lgj.id = ?
             AND sec.status = 'ACTIVE'
             AND EXISTS (
               SELECT 1
               FROM section_subject_teachers sst
               WHERE sst.section_id = lgj.section_id
                 AND sst.subject_id = lgj.subject_id
                 AND sst.teacher_id = lgj.teacher_id
                 AND sst.is_active = 1
             )
           LIMIT 1`,
        )
        .get(job.id);

      if (!context) {
        throw new Error("Subject/section context not found for lesson generation job.");
      }

      const generatedLesson = await generateLessonDraft({
        subjectName: context.subject_name,
        subjectDescription: context.subject_description,
        sectionName: context.section_name,
        gradeLevel: context.grade_level,
        schoolYear: context.school_year,
        promptText: job.prompt_text,
        preferredTitle: job.preferred_title,
        preferredTopic: job.preferred_topic,
        preferredDifficulty: job.preferred_difficulty,
        preferredEstimatedMinutes: job.preferred_estimated_minutes,
      });

      const createdLessonId = db.transaction(() => {
        const now = new Date().toISOString();
        const lessonId = crypto.randomUUID();

        db.prepare(
          `INSERT INTO lessons (
            id, teacher_id, subject_id, title, short_description, content_markdown, cover_image_url,
            difficulty, subject, topic, unit, status, estimated_minutes, tags_json,
            published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, NULL, ?, ?)`,
        ).run(
          lessonId,
          job.teacher_id,
          job.subject_id,
          generatedLesson.title,
          generatedLesson.shortDescription,
          generatedLesson.contentMarkdown,
          null,
          generatedLesson.difficulty,
          context.subject_name,
          generatedLesson.topic,
          generatedLesson.unit,
          generatedLesson.estimatedMinutes,
          JSON.stringify(generatedLesson.tags),
          now,
          now,
        );

        db.prepare(
          `INSERT OR IGNORE INTO lesson_sections (
             id, lesson_id, section_id, assigned_by_id, created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), lessonId, job.section_id, job.teacher_id, now);

        return lessonId;
      })();

      db.prepare(
        `UPDATE lesson_generation_jobs
         SET status = 'COMPLETED',
             generated_lesson_json = ?,
             created_lesson_id = ?,
             completed_at = ?
         WHERE id = ?`,
      ).run(JSON.stringify(generatedLesson), createdLessonId, new Date().toISOString(), job.id);
    } catch (error) {
      db.prepare(
        `UPDATE lesson_generation_jobs
         SET status = 'FAILED', error_message = ?, completed_at = ?
         WHERE id = ?`,
      ).run(error instanceof Error ? error.message : "Unknown lesson generation error", new Date().toISOString(), job.id);
    }
  }

  return jobs.length;
}

async function main() {
  console.log("ChemBalance worker started.");
  console.log(`Database: ${resolvedDbFile}`);
  console.log(`Offline grader: ${offlineGraderUrl}`);
  console.log(`Ollama: ${ollamaBaseUrl}`);

  for (;;) {
    const gradingProcessed = await processPendingGradingJobs();
    const generationProcessed = await processPendingQuizGenerationJobs();
    const lessonGenerationProcessed = await processPendingLessonGenerationJobs();

    if (gradingProcessed > 0 || generationProcessed > 0 || lessonGenerationProcessed > 0) {
      console.log(
        `Processed jobs - grading: ${gradingProcessed}, quiz-generation: ${generationProcessed}, lesson-generation: ${lessonGenerationProcessed}`,
      );
    }

    await sleep(5000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
