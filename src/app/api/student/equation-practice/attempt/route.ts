import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { equationPracticeAttemptSchema } from "@/lib/validators";
import { addPracticeAttempt, getChemicalEquationById, getPracticeSessionById } from "@/server/queries/equations";
import { analyzeEquationAnswer } from "@/server/services/equation-analysis-service";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = equationPracticeAttemptSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const session = getPracticeSessionById(parsed.data.sessionId, auth.user.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Session is not active" }, { status: 400 });
  }

  const equation = getChemicalEquationById(parsed.data.equationId);
  if (!equation || equation.isArchived) {
    return NextResponse.json({ error: "Equation not found" }, { status: 404 });
  }

  const analysis = await analyzeEquationAnswer({
    prompt: equation.title,
    studentAnswer: parsed.data.studentAnswer,
    expectedBalancedFormula: equation.balancedFormula ?? equation.formula,
    hints: equation.hints,
  });

  const attemptId = addPracticeAttempt({
    sessionId: parsed.data.sessionId,
    equationId: parsed.data.equationId,
    studentAnswer: parsed.data.studentAnswer,
    normalizedAnswer: analysis.normalizedAnswer,
    isCorrect: analysis.isCorrect,
    confidence: analysis.confidence,
    feedback: analysis.feedback,
    hint: analysis.hint,
    aiProvider: analysis.provider,
    gradingMetadata: analysis.metadata,
  });

  return NextResponse.json({
    success: true,
    attemptId,
    result: analysis,
  });
}
