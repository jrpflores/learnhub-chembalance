import { z } from "zod";
import { env } from "@/lib/env";

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

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

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

function normalizeQuestion(
  raw: z.infer<typeof rawQuestionSchema>,
  allowedTypes: GeneratedQuizQuestionType[],
): GeneratedQuizQuestion {
  const detectedType = normalizedType(raw.question_type);
  const questionType = allowedTypes.includes(detectedType) ? detectedType : allowedTypes[0];

  if (questionType === "TRUE_FALSE") {
    const correct = /true/i.test(raw.correct_answer) ? "True" : "False";
    return {
      questionText: raw.question_text.trim(),
      questionType,
      choices: ["True", "False"],
      correctAnswer: correct,
      explanation: raw.explanation.trim() || "Review the lesson concept tied to this statement.",
    };
  }

  if (questionType === "SHORT_ANSWER") {
    return {
      questionText: raw.question_text.trim(),
      questionType,
      choices: [],
      correctAnswer: raw.correct_answer.trim(),
      explanation: raw.explanation.trim() || "Use key ideas from the lesson in your explanation.",
    };
  }

  const cleanedChoices = raw.choices
    .map((choice) => choice.trim())
    .filter(Boolean)
    .slice(0, 4);

  const normalizedChoices = cleanedChoices.length >= 2 ? cleanedChoices : [raw.correct_answer.trim(), "None of the above"];
  if (normalizedChoices.length < 4) {
    while (normalizedChoices.length < 4) {
      normalizedChoices.push(`Distractor ${normalizedChoices.length}`);
    }
  }

  const exactMatch = normalizedChoices.find((choice) => choice.toLowerCase() === raw.correct_answer.trim().toLowerCase());
  const correctAnswer = exactMatch ?? normalizedChoices[0];

  return {
    questionText: raw.question_text.trim(),
    questionType,
    choices: normalizedChoices,
    correctAnswer,
    explanation: raw.explanation.trim() || "Match your reasoning with the key concepts from this lesson section.",
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

  const candidateModels = [env.ollamaModel, ...env.ollamaFallbackModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index,
  );

  let lastError: Error | null = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.ollamaTimeoutMs);

    try {
      const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: "json",
          options: {
            temperature: Math.min(Math.max(env.ollamaTemperature, 0), 0.4),
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const rawError = await response.text();
        const errorDetail = rawError ? ` (${rawError.slice(0, 180)})` : "";
        lastError = new Error(`Ollama model "${model}" returned ${response.status}${errorDetail}`);
        continue;
      }

      const payload = (await response.json()) as { response?: string };
      const modelOutput = payload.response?.trim() ?? "";
      const rawJson = asJsonObject(modelOutput);
      if (!rawJson) {
        lastError = new Error(`Model "${model}" returned non-JSON content.`);
        continue;
      }

      const parsed = rawResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        lastError = new Error(`Model "${model}" output did not match expected structure.`);
        continue;
      }

      const rawQuestions = Array.isArray(parsed.data) ? parsed.data : parsed.data.questions;
      return rawQuestions.slice(0, sanitizedQuestionCount).map((question) => normalizeQuestion(question, allowedTypes));
    } catch (error) {
      if (isAbortError(error)) {
        lastError = new Error(
          `Ollama request timed out after ${env.ollamaTimeoutMs}ms on model "${model}". Try fewer questions, a lighter model, or increase OLLAMA_TIMEOUT_MS.`,
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
