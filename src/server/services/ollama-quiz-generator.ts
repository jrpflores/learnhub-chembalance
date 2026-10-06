import { z } from "zod";
import { env } from "@/lib/env";
import { ollamaGenerateText } from "@/server/services/ollama-client";

export type GeneratedQuizQuestion = {
  questionText: string;
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";
  choices: string[];
  correctAnswer: string;
  explanation: string;
};

export type GeneratedQuizQuestionType = GeneratedQuizQuestion["questionType"];

type GenerateQuizFromLessonInput = {
  lessonTitle: string;
  lessonSubject: string;
  lessonTopic: string;
  lessonContent: string;
  questionCount: number;
  questionTypes?: GeneratedQuizQuestionType[];
};

const MAX_GENERATED_QUESTIONS = 10;
const QUIZ_GEN_LESSON_CHUNK_CHARS = Math.max(280, Math.min(Math.trunc(env.aiQuizGenLessonChunkChars), 2000));
const QUIZ_GEN_MAX_CHUNKS = Math.max(1, Math.min(Math.trunc(env.aiQuizGenMaxChunks), 10));
const QUIZ_GEN_MAX_CONTEXT_CHARS = Math.max(900, Math.min(Math.trunc(env.aiQuizGenMaxContextChars), 15000));
const STOPWORDS = new Set([
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

const rawQuestionSchema = z.object({
  question_text: z.string().min(4),
  question_type: z.string().min(2),
  choices: z.array(z.string()).optional().default([]),
  correct_answer: z.string().min(1),
  explanation: z.string().optional().default(""),
});

const rawResponseSchema = z.union([
  z.object({ questions: z.array(rawQuestionSchema).min(1) }),
  z.array(rawQuestionSchema).min(1),
]);

function normalizeRequestedQuestionTypes(questionTypes?: GeneratedQuizQuestionType[]) {
  const unique = [...new Set((questionTypes ?? []).filter(Boolean))];
  if (unique.length === 0) {
    return ["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"] as GeneratedQuizQuestionType[];
  }
  return unique;
}

function normalizedType(value: string): GeneratedQuizQuestion["questionType"] {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized.includes("TRUE") || normalized.includes("FALSE")) {
    return "TRUE_FALSE";
  }
  if (normalized.includes("SHORT")) {
    return "SHORT_ANSWER";
  }
  return "MULTIPLE_CHOICE";
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

function resolveMultipleChoiceCorrectAnswer(correctAnswerRaw: string, choices: string[]) {
  const trimmed = correctAnswerRaw.trim();
  const lower = trimmed.toLowerCase();
  const byValue = choices.find((choice) => choice.trim().toLowerCase() === lower);
  if (byValue) {
    return byValue;
  }
  const labelMatch = trimmed.match(/^[A-D]$/i);
  if (labelMatch) {
    const index = labelMatch[0].toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < choices.length) {
      return choices[index];
    }
  }
  return null;
}

export function tryNormalizeGeneratedQuizQuestion(
  raw: z.infer<typeof rawQuestionSchema>,
  allowedTypes: GeneratedQuizQuestionType[],
): GeneratedQuizQuestion | null {
  const questionText = raw.question_text.trim();
  if (questionText.length < 4) {
    return null;
  }

  const detectedType = normalizedType(raw.question_type);
  if (!allowedTypes.includes(detectedType)) {
    return null;
  }

  const explanation =
    raw.explanation.trim() ||
    (detectedType === "TRUE_FALSE"
      ? "Review the lesson concept tied to this statement."
      : detectedType === "SHORT_ANSWER"
        ? "Use key ideas from the lesson in your explanation."
        : "Match your reasoning with the key concepts from this lesson section.");

  if (detectedType === "TRUE_FALSE") {
    if (!/(true|false)/i.test(raw.correct_answer)) {
      return null;
    }
    const correct = /true/i.test(raw.correct_answer) ? "True" : "False";
    return {
      questionText,
      questionType: detectedType,
      choices: ["True", "False"],
      correctAnswer: correct,
      explanation,
    };
  }

  if (detectedType === "SHORT_ANSWER") {
    const correctAnswer = raw.correct_answer.trim();
    if (correctAnswer.length < 1) {
      return null;
    }
    return {
      questionText,
      questionType: detectedType,
      choices: [],
      correctAnswer,
      explanation,
    };
  }

  const cleanedChoices = raw.choices
    .map((choice) => choice.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (cleanedChoices.length < 2) {
    return null;
  }

  const correctAnswer = resolveMultipleChoiceCorrectAnswer(raw.correct_answer, cleanedChoices);
  if (!correctAnswer) {
    return null;
  }

  return {
    questionText,
    questionType: "MULTIPLE_CHOICE",
    choices: cleanedChoices,
    correctAnswer,
    explanation,
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
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
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

function buildRelevantLessonContext(input: GenerateQuizFromLessonInput) {
  const chunks = chunkLessonContent(input.lessonContent, QUIZ_GEN_LESSON_CHUNK_CHARS);
  if (chunks.length === 0) {
    return "(no lesson content)";
  }

  if (chunks.length <= QUIZ_GEN_MAX_CHUNKS) {
    const merged = chunks.join("\n\n---\n\n");
    return merged.length > QUIZ_GEN_MAX_CONTEXT_CHARS ? `${merged.slice(0, QUIZ_GEN_MAX_CONTEXT_CHARS)}...` : merged;
  }

  const terms = tokenizeSearchTerms(`${input.lessonTitle}\n${input.lessonSubject}\n${input.lessonTopic}`, 48);
  const scored = chunks.map((chunk, index) => ({
    index,
    chunk,
    score: chunkRelevanceScore(chunk, terms),
  }));

  const prioritized = [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .slice(0, QUIZ_GEN_MAX_CHUNKS)
    .sort((a, b) => a.index - b.index);

  const hasSignal = prioritized.some((entry) => entry.score > 0);
  const selectedChunks = hasSignal
    ? prioritized.map((entry) => entry.chunk)
    : sampleChunksEvenly(chunks, QUIZ_GEN_MAX_CHUNKS);

  const merged = selectedChunks.join("\n\n---\n\n");
  return merged.length > QUIZ_GEN_MAX_CONTEXT_CHARS ? `${merged.slice(0, QUIZ_GEN_MAX_CONTEXT_CHARS)}...` : merged;
}

export async function generateQuizFromLesson(input: GenerateQuizFromLessonInput): Promise<GeneratedQuizQuestion[]> {
  if (!env.offlineAiEnabled) {
    throw new Error("Offline AI is disabled. Enable OFFLINE_AI_ENABLED to generate quiz questions.");
  }

  const sanitizedQuestionCount = Math.max(1, Math.min(input.questionCount, MAX_GENERATED_QUESTIONS));
  const allowedTypes = normalizeRequestedQuestionTypes(input.questionTypes);
  const allowedTypesText = allowedTypes.join(", ");
  const lessonContext = buildRelevantLessonContext(input);

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
- Create exactly ${sanitizedQuestionCount} questions.
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

  const modelOutput = await ollamaGenerateText({
    prompt,
    format: "json",
    temperature: Math.min(Math.max(env.ollamaTemperature, 0), 0.4),
  });

  const rawJson = asJsonObject(modelOutput);
  if (!rawJson) {
    throw new Error("Ollama returned non-JSON quiz content.");
  }

  const parsed = rawResponseSchema.safeParse(rawJson);
  if (!parsed.success) {
    throw new Error("Ollama quiz output did not match expected structure.");
  }

  const rawQuestions = Array.isArray(parsed.data) ? parsed.data : parsed.data.questions;
  const normalized = rawQuestions
    .slice(0, sanitizedQuestionCount)
    .map((question) => tryNormalizeGeneratedQuizQuestion(question, allowedTypes))
    .filter((question): question is GeneratedQuizQuestion => question !== null);

  if (normalized.length === 0) {
    throw new Error("Ollama returned zero valid questions after validation.");
  }

  return normalized;
}
