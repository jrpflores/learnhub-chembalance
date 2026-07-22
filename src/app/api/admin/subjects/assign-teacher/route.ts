import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { setTeacherSubjects } from "@/server/queries/subjects";
import { listUsers } from "@/server/queries/users";

const schema = z.object({
  teacherId: z.string(),
  subjectIds: z.array(z.string()),
});

export async function GET() {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const teachers = listUsers({ role: "TEACHER", page: 1, pageSize: 500 }).data;
  return NextResponse.json({
    teachers: teachers.map((teacher) => ({
      id: teacher.id,
      fullName: teacher.fullName,
      email: teacher.email,
      isActive: teacher.isActive,
    })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  setTeacherSubjects(parsed.data.teacherId, parsed.data.subjectIds, auth.user.id);
  return NextResponse.json({ success: true });
}
