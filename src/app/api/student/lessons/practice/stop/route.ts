import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { lessonPracticeStopSchema } from "@/lib/validators";
import { cancelLessonPracticeRequest } from "@/server/services/lesson-practice-cancel";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = lessonPracticeStopSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const canceled = cancelLessonPracticeRequest({
      requestId: parsed.data.requestId,
      studentId: auth.user.id,
      lessonId: parsed.data.lessonId,
    });

    return NextResponse.json({
      success: true,
      canceled,
      message: canceled ? "AI tutor request canceled." : "No active AI tutor request found for cancellation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to cancel AI tutor request.",
      },
      { status: 400 },
    );
  }
}
