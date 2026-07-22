import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { reviewAttemptAnswerByTeacher } from "@/server/services/quiz-service";

const reviewAnswerSchema = z.object({
  attemptId: z.string().min(1),
  answerId: z.string().min(1),
  markCorrect: z.boolean(),
  feedback: z.string().trim().max(1200).optional(),
});

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const parsed = reviewAnswerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const attempt = reviewAttemptAnswerByTeacher({
      teacherId: auth.user.id,
      attemptId: parsed.data.attemptId,
      answerId: parsed.data.answerId,
      markCorrect: parsed.data.markCorrect,
      feedback: parsed.data.feedback,
    });

    return NextResponse.json({ success: true, attempt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to review answer.";
    const status = message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
