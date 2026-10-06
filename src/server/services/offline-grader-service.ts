import { env } from "@/lib/env";
import { calculateFallbackShortAnswerGrade } from "@/server/services/short-answer-fallback-grade";

export type OfflineGraderRequest = {
  prompt: string;
  studentAnswer: string;
  referenceAnswer?: string | null;
  keywords?: string[];
  maxScore: number;
  rubric?: string;
};

export type OfflineGraderResult = {
  normalizedScore: number;
  feedback: string;
  confidence: number;
  provider: "offline-service" | "fallback-rule";
  matchedConcepts: string[];
  missingConcepts: string[];
  misconceptions: string[];
  fallbackReason?: string | null;
};

export async function gradeShortAnswer(request: OfflineGraderRequest): Promise<OfflineGraderResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.offlineGraderTimeoutMs);

  try {
    const response = await fetch(`${env.offlineGraderUrl}/grade-short-answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: request.prompt,
        student_answer: request.studentAnswer,
        reference_answer: request.referenceAnswer,
        keywords: request.keywords,
        max_score: request.maxScore,
        rubric: request.rubric,
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Offline grader returned status ${response.status}`);
    }

    const payload = (await response.json()) as {
      normalized_score?: number;
      feedback?: string;
      confidence?: number;
      matched_concepts?: string[];
      missing_concepts?: string[];
      misconceptions?: string[];
    };

    const normalizedScore = Math.max(0, Math.min(1, payload.normalized_score ?? 0));

    return {
      normalizedScore,
      feedback: payload.feedback ?? "Answer evaluated by offline grader.",
      confidence: Math.max(0, Math.min(1, payload.confidence ?? 0.7)),
      provider: "offline-service",
      matchedConcepts: Array.isArray(payload.matched_concepts)
        ? payload.matched_concepts.filter((entry): entry is string => typeof entry === "string")
        : [],
      missingConcepts: Array.isArray(payload.missing_concepts)
        ? payload.missing_concepts.filter((entry): entry is string => typeof entry === "string")
        : [],
      misconceptions: Array.isArray(payload.misconceptions)
        ? payload.misconceptions.filter((entry): entry is string => typeof entry === "string")
        : [],
      fallbackReason: null,
    };
  } catch (error) {
    const fallback = calculateFallbackShortAnswerGrade({
      studentAnswer: request.studentAnswer,
      referenceAnswer: request.referenceAnswer,
      keywords: request.keywords,
      fallbackReason: error instanceof Error ? error.message : "offline grader unavailable",
    });
    return {
      ...fallback,
      matchedConcepts: fallback.matchedConcepts,
      missingConcepts: fallback.missingConcepts,
      misconceptions: fallback.misconceptions,
    };
  } finally {
    clearTimeout(timeout);
  }
}
