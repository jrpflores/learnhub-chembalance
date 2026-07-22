import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { getPracticeSessionById, listStudentPracticeSessions } from "@/server/queries/equations";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (sessionId) {
    const session = getPracticeSessionById(sessionId, auth.user.id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ session });
  }

  return NextResponse.json({
    sessions: listStudentPracticeSessions(auth.user.id),
  });
}
