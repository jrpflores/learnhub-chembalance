import { env } from "@/lib/env";

type OfflineGraderRequest = {
  prompt: string;
  studentAnswer: string;
  referenceAnswer?: string | null;
  keywords?: string[];
  maxScore: number;
  rubric?: string;
};

type OfflineGraderResult = {
  normalizedScore: number;
  feedback: string;
  confidence: number;
  provider: "offline-service" | "fallback-rule";
  matchedConcepts: string[];
  missingConcepts: string[];
  misconceptions: string[];
};

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

function conceptKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const normalized = normalizeConceptText(value);
  return CONCEPT_ALIAS_MAP.get(normalized) ?? normalized;
}

function calculateFallbackGrade(request: OfflineGraderRequest): OfflineGraderResult {
  const normalizedStudent = normalizeConceptText(request.studentAnswer);
  const keywords = (request.keywords ?? []).filter(Boolean);
  const studentConcept = conceptKey(request.studentAnswer);
  const referenceConcept = conceptKey(request.referenceAnswer);

  if (studentConcept && referenceConcept && studentConcept === referenceConcept) {
    return {
      normalizedScore: 1,
      feedback: "Great answer. You identified the concept correctly.",
      confidence: 0.95,
      provider: "fallback-rule",
      matchedConcepts: [referenceConcept],
      missingConcepts: [],
      misconceptions: [],
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
  if (request.referenceAnswer) {
    const referenceTokens = request.referenceAnswer
      .toLowerCase()
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
    provider: "fallback-rule",
    matchedConcepts: [],
    missingConcepts: [],
    misconceptions: [],
  };
}

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
    };
  } catch {
    return calculateFallbackGrade(request);
  } finally {
    clearTimeout(timeout);
  }
}
