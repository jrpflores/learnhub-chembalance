import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { completePracticeSession, getPracticeSessionById } from "@/server/queries/equations";

const schema = z.object({
  sessionId: z.string(),
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

  const session = getPracticeSessionById(parsed.data.sessionId, auth.user.id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  completePracticeSession(parsed.data.sessionId);
  return NextResponse.json({ success: true });
}
