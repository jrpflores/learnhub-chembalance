import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { getAttemptById } from "@/server/queries/quizzes";
import { recheckShortAnswersByStudent } from "@/server/services/quiz-service";

const recheckShortAnswersSchema = z.object({
  attemptId: z.string().min(1),
});

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const parsed = recheckShortAnswersSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const attempt = getAttemptById(parsed.data.attemptId);
    if (!attempt || attempt.studentId !== auth.user.id) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const refreshed = await recheckShortAnswersByStudent({
      studentId: auth.user.id,
      attemptId: parsed.data.attemptId,
    });

    return NextResponse.json({
      success: true,
      processing: refreshed.status === "SUBMITTED",
      message:
        refreshed.status === "SUBMITTED"
          ? "Short-answer responses were queued for AI recheck."
          : "Short-answer recheck completed.",
      attempt: refreshed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to queue short-answer recheck.",
      },
      { status: 400 },
    );
  }
}

