import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { canTeacherAccessSection, sectionAnalytics } from "@/server/queries/sections";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const sectionId = url.searchParams.get("sectionId") ?? undefined;

  if (sectionId && auth.user.role === "TEACHER" && !canTeacherAccessSection(auth.user.id, sectionId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(sectionAnalytics(auth.user.id, sectionId));
}
