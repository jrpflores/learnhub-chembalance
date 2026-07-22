import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { listTeacherAssignableStudents } from "@/server/queries/sections";

export async function GET() {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  return NextResponse.json({
    students: listTeacherAssignableStudents(auth.user.id),
  });
}

export async function PATCH(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can assign students to sections." }, { status: 403 });
}
