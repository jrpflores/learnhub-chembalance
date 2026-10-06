import { env } from "@/lib/env";
import { ollamaGenerateText } from "@/server/services/ollama-client";

export type GeneratedLessonDraft = {
  title: string;
  shortDescription: string;
  topic: string;
  unit: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  estimatedMinutes: number;
  tags: string[];
  contentMarkdown: string;
};

export type GenerateLessonDraftInput = {
  subjectName: string;
  subjectDescription: string | null;
  sectionName: string;
  gradeLevel: string;
  schoolYear: string;
  promptText: string;
  preferredTitle?: string | null;
  preferredTopic?: string | null;
  preferredDifficulty?: "EASY" | "MEDIUM" | "HARD" | null;
  preferredEstimatedMinutes?: number | null;
};

const ALLOWED_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;

function asJsonObject(value: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    const match = value.match(/\{[\s\S]*\}/);
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

function normalizeDifficulty(value?: string | null): GeneratedLessonDraft["difficulty"] {
  const normalized = value?.trim().toUpperCase() ?? "MEDIUM";
  return ALLOWED_DIFFICULTIES.includes(normalized as GeneratedLessonDraft["difficulty"])
    ? (normalized as GeneratedLessonDraft["difficulty"])
    : "MEDIUM";
}

export function parseGeneratedLessonDraft(
  raw: Record<string, unknown>,
  defaults: {
    topic: string;
    estimatedMinutes: number;
    difficulty: GeneratedLessonDraft["difficulty"];
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
  const contentMarkdown = typeof raw.content_markdown === "string" ? raw.content_markdown.trim() : "";

  return {
    title,
    shortDescription,
    topic: topic.length >= 2 ? topic : defaults.topic,
    unit,
    difficulty,
    estimatedMinutes,
    tags,
    contentMarkdown,
  };
}

export function validateGeneratedLessonDraftForInsert(
  draft: GeneratedLessonDraft,
): { ok: true } | { ok: false; reason: string } {
  if (draft.title.length < 3) {
    return { ok: false, reason: "Generated title is too short for a lesson draft." };
  }
  if (draft.shortDescription.length < 10) {
    return { ok: false, reason: "Generated short description is too short for a lesson draft." };
  }
  if (draft.contentMarkdown.length < 20) {
    return { ok: false, reason: "Generated lesson content is too short for a lesson draft." };
  }
  if (draft.topic.trim().length < 2) {
    return { ok: false, reason: "Generated topic is missing or too short." };
  }
  return { ok: true };
}

export async function generateLessonDraft(input: GenerateLessonDraftInput): Promise<GeneratedLessonDraft> {
  if (!env.offlineAiEnabled) {
    throw new Error("Offline AI is disabled. Enable OFFLINE_AI_ENABLED to generate lesson drafts.");
  }

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

  const modelOutput = await ollamaGenerateText({
    prompt,
    format: "json",
    temperature: Math.min(Math.max(env.ollamaTemperature, 0), 0.35),
    numPredict: Math.min(env.ollamaNumPredict, 2800),
  });

  const parsed = asJsonObject(modelOutput);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Ollama returned non-object JSON for lesson draft.");
  }

  return parseGeneratedLessonDraft(parsed as Record<string, unknown>, {
    topic: preferredTopic,
    estimatedMinutes: preferredEstimatedMinutes,
    difficulty: preferredDifficulty,
  });
}
