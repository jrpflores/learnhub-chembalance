import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { listTeacherStudentsPaginated } from "@/server/queries/users";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const sectionId = url.searchParams.get("sectionId") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "12");
  const students = listTeacherStudentsPaginated({
    teacherId: auth.user.id,
    search,
    sectionId,
    page,
    pageSize,
  });

  return NextResponse.json(students);
}

export async function POST(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can create student accounts." }, { status: 403 });
}

export async function PATCH(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can update student accounts." }, { status: 403 });
}

export async function DELETE(request: Request) {
  void request;
  return NextResponse.json({ error: "Only admin can delete student accounts." }, { status: 403 });
}
