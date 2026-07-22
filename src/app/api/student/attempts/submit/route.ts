import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { submitAttemptSchema } from "@/lib/validators";
import { getAttemptById } from "@/server/queries/quizzes";
import { submitQuizAttempt } from "@/server/services/quiz-service";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = submitAttemptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = getAttemptById(parsed.data.attemptId);
  if (!attempt || attempt.studentId !== auth.user.id) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  try {
    const result = await submitQuizAttempt(parsed.data);
    const processing = result?.status === "SUBMITTED";
    return NextResponse.json({
      success: true,
      processing,
      message: processing
        ? "Submission received. Short-answer responses are being checked in the background."
        : "Submission graded successfully.",
      attempt: result,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to submit attempt" },
      { status: 400 },
    );
  }
}
