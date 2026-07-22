import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { getAttemptById, getAttemptAiJobStats } from "@/server/queries/quizzes";
import { finalizeSubmittedAttemptIfReady } from "@/server/services/quiz-service";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const attemptId = url.searchParams.get("attemptId")?.trim();
  if (!attemptId) {
    return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
  }

  const current = getAttemptById(attemptId);
  if (!current || current.studentId !== auth.user.id) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const resolved = finalizeSubmittedAttemptIfReady(attemptId);
  if (!resolved) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  const aiJobs = resolved.status === "SUBMITTED" ? getAttemptAiJobStats(attemptId) : null;

  return NextResponse.json({
    attempt: {
      id: resolved.id,
      status: resolved.status,
      outcome: resolved.outcome,
      scorePercent: resolved.scorePercent,
      correctCount: resolved.correctCount,
      wrongCount: resolved.wrongCount,
      gradedAt: resolved.gradedAt,
      submittedAt: resolved.submittedAt,
    },
    aiJobs,
  });
}
