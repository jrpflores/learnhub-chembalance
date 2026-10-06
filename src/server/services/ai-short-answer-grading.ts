import { env } from "@/lib/env";
import { gradeShortAnswer, type OfflineGraderResult } from "@/server/services/offline-grader-service";

export type ShortAnswerAiGradeContext = {
  prompt: string;
  studentAnswer: string;
  referenceAnswer: string | null;
  keywords: string[];
  maxPoints: number;
  rubric?: string | null;
  explanationMarkdown?: string | null;
};

export type AppliedShortAnswerAiGrade = {
  isCorrect: boolean;
  earnedPoints: number;
  feedback: string;
  gradedByAi: boolean;
  normalizedScore: number;
  confidence: number;
  provider: OfflineGraderResult["provider"];
  responsePayload: Record<string, unknown>;
};

export function buildAiFeedback(payload: {
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

function requiresManualReview(result: OfflineGraderResult) {
  if (!env.offlineAiEnabled) {
    return true;
  }
  if (env.aiFallbackBehavior === "rule_based") {
    return false;
  }
  if (result.provider === "fallback-rule") {
    return true;
  }
  const passesThreshold =
    result.normalizedScore >= 0.7 &&
    result.confidence >= env.aiMediumConfidenceThreshold &&
    result.confidence >= env.aiHighConfidenceThreshold;
  return !passesThreshold;
}

export function applyOfflineGraderResult(
  result: OfflineGraderResult,
  context: Pick<ShortAnswerAiGradeContext, "maxPoints" | "explanationMarkdown">,
): AppliedShortAnswerAiGrade {
  const feedback = buildAiFeedback({
    baseFeedback: result.feedback,
    matchedConcepts: result.matchedConcepts,
    missingConcepts: result.missingConcepts,
    misconceptions: result.misconceptions,
    explanationMarkdown: context.explanationMarkdown,
  });

  if (requiresManualReview(result)) {
    return {
      isCorrect: false,
      earnedPoints: 0,
      feedback:
        env.aiFallbackBehavior === "manual_review"
          ? `${feedback} This answer is queued for teacher review.`
          : feedback,
      gradedByAi: false,
      normalizedScore: result.normalizedScore,
      confidence: result.confidence,
      provider: result.provider,
      responsePayload: {
        confidence: result.confidence,
        provider: result.provider,
        fallbackReason: result.fallbackReason ?? null,
        manualReview: true,
      },
    };
  }

  const earnedPoints = Number((result.normalizedScore * context.maxPoints).toFixed(3));
  const isCorrect = result.confidence >= env.aiMediumConfidenceThreshold && result.normalizedScore >= 0.7;

  return {
    isCorrect,
    earnedPoints,
    feedback,
    gradedByAi: true,
    normalizedScore: result.normalizedScore,
    confidence: result.confidence,
    provider: result.provider,
    responsePayload: {
      confidence: result.confidence,
      provider: result.provider,
      fallbackReason: result.fallbackReason ?? null,
      manualReview: false,
    },
  };
}

export async function gradeShortAnswerWithOfflineAi(
  context: ShortAnswerAiGradeContext,
): Promise<AppliedShortAnswerAiGrade> {
  if (!env.offlineAiEnabled) {
    return {
      isCorrect: false,
      earnedPoints: 0,
      feedback: "Offline AI is disabled. Your answer was saved for teacher review.",
      gradedByAi: false,
      normalizedScore: 0,
      confidence: 0,
      provider: "fallback-rule",
      responsePayload: { manualReview: true, reason: "offline_ai_disabled" },
    };
  }

  const result = await gradeShortAnswer({
    prompt: context.prompt,
    studentAnswer: context.studentAnswer,
    referenceAnswer: context.referenceAnswer,
    keywords: context.keywords,
    maxScore: context.maxPoints,
    rubric: context.rubric ?? undefined,
  });

  return applyOfflineGraderResult(result, context);
}
