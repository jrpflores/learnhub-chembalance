import { env } from "@/lib/env";

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

const ARROW_PATTERN = /=>|=|→|⟶|⟹|⇌|<-+>|<->|->/g;

export type EquationAnalysisResult = {
  isCorrect: boolean;
  confidence: number;
  feedback: string;
  hint?: string;
  provider: "deterministic" | "offline-ai" | "fallback";
  normalizedAnswer: string;
  metadata: Record<string, unknown>;
};

function normalizeEquation(value: string) {
  const withDigits = value.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => SUBSCRIPT_DIGIT_MAP[char] ?? char);
  return withDigits
    .replace(ARROW_PATTERN, "->")
    .replace(/\s+/g, "")
    .trim();
}

function splitEquationSides(raw: string) {
  const normalized = normalizeEquation(raw);
  const parts = normalized.split("->");
  if (parts.length !== 2) {
    return null;
  }
  return { left: parts[0], right: parts[1], normalized };
}

function parseCompoundToken(token: string) {
  const match = token.match(/^(\d+)?([A-Z][A-Za-z0-9]*)$/);
  if (!match) {
    return null;
  }
  const coefficient = Number(match[1] ?? "1");
  const formula = match[2];
  if (!formula) {
    return null;
  }
  return { coefficient, formula };
}

function parseMolecule(formula: string) {
  const atomCounts = new Map<string, number>();
  const tokens = formula.match(/[A-Z][a-z]?\d*/g);
  if (!tokens || tokens.join("") !== formula) {
    return null;
  }

  for (const token of tokens) {
    const elementMatch = token.match(/^([A-Z][a-z]?)(\d*)$/);
    if (!elementMatch) {
      return null;
    }
    const element = elementMatch[1];
    const count = Number(elementMatch[2] || "1");
    atomCounts.set(element, (atomCounts.get(element) ?? 0) + count);
  }

  return atomCounts;
}

function aggregateSideAtoms(side: string) {
  const totals = new Map<string, number>();
  const compounds = side.split("+").map((item) => item.trim()).filter(Boolean);
  if (compounds.length === 0) {
    return null;
  }

  for (const compound of compounds) {
    const parsed = parseCompoundToken(compound);
    if (!parsed) {
      return null;
    }
    const molecule = parseMolecule(parsed.formula);
    if (!molecule) {
      return null;
    }
    molecule.forEach((count, element) => {
      totals.set(element, (totals.get(element) ?? 0) + count * parsed.coefficient);
    });
  }

  return { totals, compounds };
}

function mapsEqual(a: Map<string, number>, b: Map<string, number>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a.entries()) {
    if ((b.get(key) ?? 0) !== value) {
      return false;
    }
  }
  return true;
}

function deterministicEquationAnalysis(studentAnswer: string, expectedBalancedFormula?: string | null) {
  const normalizedAnswer = normalizeEquation(studentAnswer);
  if (!expectedBalancedFormula) {
    return {
      isCorrect: false,
      confidence: 0.25,
      feedback: "A reference balanced equation is required for deterministic validation.",
      provider: "fallback" as const,
      normalizedAnswer,
      metadata: { reason: "missing_reference_balanced_formula" },
      unresolved: true,
    };
  }

  const normalizedExpected = normalizeEquation(expectedBalancedFormula);
  if (normalizedAnswer === normalizedExpected) {
    return {
      isCorrect: true,
      confidence: 0.99,
      feedback: "Correct. Your balanced equation matches the expected form.",
      provider: "deterministic" as const,
      normalizedAnswer,
      metadata: { matchType: "exact" },
      unresolved: false,
    };
  }

  const answerSides = splitEquationSides(normalizedAnswer);
  const expectedSides = splitEquationSides(normalizedExpected);
  if (!answerSides || !expectedSides) {
    return {
      isCorrect: false,
      confidence: 0.55,
      feedback: "Use a complete equation format like Reactants -> Products.",
      provider: "deterministic" as const,
      normalizedAnswer,
      metadata: { matchType: "invalid_format" },
      unresolved: true,
    };
  }

  const parsedAnswerLeft = aggregateSideAtoms(answerSides.left);
  const parsedAnswerRight = aggregateSideAtoms(answerSides.right);
  const parsedExpectedLeft = aggregateSideAtoms(expectedSides.left);
  const parsedExpectedRight = aggregateSideAtoms(expectedSides.right);

  if (!parsedAnswerLeft || !parsedAnswerRight || !parsedExpectedLeft || !parsedExpectedRight) {
    return {
      isCorrect: false,
      confidence: 0.55,
      feedback: "We could not parse one or more compounds. Check chemical notation and coefficients.",
      provider: "deterministic" as const,
      normalizedAnswer,
      metadata: { matchType: "parse_error" },
      unresolved: true,
    };
  }

  const sameLeftCompounds = parsedAnswerLeft.compounds.join("+") === parsedExpectedLeft.compounds.join("+");
  const sameRightCompounds = parsedAnswerRight.compounds.join("+") === parsedExpectedRight.compounds.join("+");
  const atomsBalanced = mapsEqual(parsedAnswerLeft.totals, parsedAnswerRight.totals);

  if (sameLeftCompounds && sameRightCompounds && atomsBalanced) {
    return {
      isCorrect: true,
      confidence: 0.96,
      feedback: "Correct. Your coefficients balance all atoms.",
      provider: "deterministic" as const,
      normalizedAnswer,
      metadata: { matchType: "balanced_equivalent" },
      unresolved: false,
    };
  }

  if (!atomsBalanced) {
    return {
      isCorrect: false,
      confidence: 0.9,
      feedback: "Not balanced yet. Recount each element on both sides and adjust coefficients only.",
      hint: "Try balancing one element at a time before checking oxygen and hydrogen last.",
      provider: "deterministic" as const,
      normalizedAnswer,
      metadata: { matchType: "not_balanced" },
      unresolved: false,
    };
  }

  return {
    isCorrect: false,
    confidence: 0.7,
    feedback: "Your equation is balanced but does not match the expected reactants/products ordering.",
    provider: "deterministic" as const,
    normalizedAnswer,
    metadata: { matchType: "compound_mismatch" },
    unresolved: true,
  };
}

async function callOfflineEquationAnalyzer(payload: {
  prompt: string;
  studentAnswer: string;
  expectedAnswer?: string | null;
  hints?: string[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.offlineGraderTimeoutMs);

  try {
    const response = await fetch(`${env.offlineGraderUrl}/equations/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: payload.prompt,
        student_answer: payload.studentAnswer,
        expected_answer: payload.expectedAnswer,
        hints: payload.hints ?? [],
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Offline equation analyzer returned ${response.status}`);
    }

    const parsed = (await response.json()) as {
      is_correct?: boolean;
      confidence?: number;
      feedback?: string;
      hint?: string;
      provider?: string;
      metadata?: Record<string, unknown>;
      normalized_answer?: string;
    };

    return {
      isCorrect: Boolean(parsed.is_correct),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7))),
      feedback: parsed.feedback?.trim() || "Answer analyzed by offline AI.",
      hint: parsed.hint?.trim() || undefined,
      provider: "offline-ai" as const,
      normalizedAnswer: parsed.normalized_answer || normalizeEquation(payload.studentAnswer),
      metadata: parsed.metadata ?? {},
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeEquationAnswer(payload: {
  prompt: string;
  studentAnswer: string;
  expectedBalancedFormula?: string | null;
  hints?: string[];
}) {
  const deterministic = deterministicEquationAnalysis(payload.studentAnswer, payload.expectedBalancedFormula);

  if (!deterministic.unresolved || !env.offlineAiEnabled) {
    return deterministic;
  }

  const aiResult = await callOfflineEquationAnalyzer({
    prompt: payload.prompt,
    studentAnswer: payload.studentAnswer,
    expectedAnswer: payload.expectedBalancedFormula,
    hints: payload.hints,
  });

  if (aiResult) {
    return aiResult;
  }

  return {
    ...deterministic,
    provider: deterministic.provider === "deterministic" ? "deterministic" : "fallback",
    metadata: {
      ...deterministic.metadata,
      aiFallback: "offline_unavailable",
    },
  };
}
