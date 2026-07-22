import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { listTeacherSubjects } from "@/server/queries/subjects";
import { listTeacherSectionSubjectIds } from "@/server/queries/sections";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const sectionId = url.searchParams.get("sectionId")?.trim();
  const assigned = listTeacherSubjects(auth.user.id);

  if (!sectionId) {
    return NextResponse.json({ subjects: assigned });
  }

  const sectionSubjectIds = new Set(listTeacherSectionSubjectIds(sectionId, auth.user.id));
  return NextResponse.json({
    subjects: assigned.filter((subject) => sectionSubjectIds.has(subject.id)),
  });
}
