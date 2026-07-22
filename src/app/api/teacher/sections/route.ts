import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { canTeacherAccessSection, getSectionById, listSections } from "@/server/queries/sections";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam === "ACTIVE" || statusParam === "ARCHIVED" ? statusParam : undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const schoolYear = url.searchParams.get("schoolYear") ?? undefined;
  const sectionId = url.searchParams.get("sectionId");

  if (sectionId) {
    if (auth.user.role === "TEACHER" && !canTeacherAccessSection(auth.user.id, sectionId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const section = getSectionById(sectionId);
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    return NextResponse.json({ section });
  }

  const sections = listSections({
    teacherId: auth.user.role === "TEACHER" ? auth.user.id : undefined,
    status,
    search,
    schoolYear,
  });

  return NextResponse.json({ sections });
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can create sections." }, { status: 403 });
}

export async function PATCH(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can update sections." }, { status: 403 });
}
