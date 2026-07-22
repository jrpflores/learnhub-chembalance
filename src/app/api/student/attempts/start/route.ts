import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { startQuizAttempt } from "@/server/services/quiz-service";

const schema = z.object({
  quizId: z.string(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = startQuizAttempt(auth.user.id, parsed.data.quizId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to start attempt" },
      { status: 400 },
    );
  }
}
