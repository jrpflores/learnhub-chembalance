import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { listStudentPracticeHistory } from "@/server/queries/lesson-practice";

export async function GET() {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const history = listStudentPracticeHistory({
    studentId: auth.user.id,
    limit: 40,
  });

  return NextResponse.json({
    success: true,
    history,
  });
}
