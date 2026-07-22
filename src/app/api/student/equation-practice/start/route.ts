import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { equationPracticeStartSchema } from "@/lib/validators";
import { createPracticeSession, getPracticeEquationsPool } from "@/server/queries/equations";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = equationPracticeStartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const sessionId = createPracticeSession({
    studentId: auth.user.id,
    sectionId: parsed.data.sectionId,
    topic: parsed.data.topic,
  });

  const equations = getPracticeEquationsPool({
    topic: parsed.data.topic,
    limit: 10,
  });

  return NextResponse.json({
    success: true,
    sessionId,
    equations,
  });
}
