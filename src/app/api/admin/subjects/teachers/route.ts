import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import {
  addTeacherSubjectAssignment,
  listSubjectTeacherAssignments,
  listSubjectTeachers,
  removeTeacherSubjectAssignment,
} from "@/server/queries/subjects";
import { listUsers } from "@/server/queries/users";

const addSchema = z.object({
  subjectId: z.string(),
  teacherId: z.string(),
});

const removeSchema = z.object({
  subjectId: z.string(),
  teacherId: z.string(),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const subjectId = url.searchParams.get("subjectId");

  if (subjectId) {
    const assignedTeachers = listSubjectTeachers(subjectId);
    return NextResponse.json({ assignedTeachers });
  }

  return NextResponse.json({
    assignments: listSubjectTeacherAssignments(),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const teacher = listUsers({ role: "TEACHER", page: 1, pageSize: 500 }).data.find((entry) => entry.id === parsed.data.teacherId);
  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  addTeacherSubjectAssignment(parsed.data.subjectId, parsed.data.teacherId, auth.user.id);
  return NextResponse.json({
    success: true,
    assignedTeachers: listSubjectTeachers(parsed.data.subjectId),
  });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  removeTeacherSubjectAssignment(parsed.data.subjectId, parsed.data.teacherId);
  return NextResponse.json({
    success: true,
    assignedTeachers: listSubjectTeachers(parsed.data.subjectId),
  });
}
