import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { importLessonIntoSection } from "@/server/queries/lesson-import";
import {
  canTeacherAttachLessonToSection,
  listImportableLessonsForSection,
} from "@/server/queries/lessons";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const subjectId = url.searchParams.get("subjectId")?.trim();
  const sectionId = url.searchParams.get("sectionId")?.trim();
  const search = url.searchParams.get("search")?.trim();

  if (!subjectId || !sectionId) {
    return NextResponse.json({ error: "subjectId and sectionId are required." }, { status: 400 });
  }

  const context = getTeacherSubjectContext(auth.user.id, subjectId);
  if (!context) {
    return NextResponse.json({ error: "Subject access is not allowed." }, { status: 403 });
  }

  const section = context.sections.find((entry) => entry.id === sectionId);
  if (!section) {
    return NextResponse.json({ error: "Section is not assigned for this subject." }, { status: 403 });
  }

  const lessons = listImportableLessonsForSection({
    teacherId: auth.user.id,
    subjectId: context.subject.id,
    subjectName: context.subject.name,
    sectionId: section.id,
    search: search || undefined,
    limit: 100,
  });

  return NextResponse.json({ lessons });
}

const importSchema = z.object({
  lessonId: z.string().min(1),
  subjectId: z.string().min(1),
  sectionId: z.string().min(1),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const context = getTeacherSubjectContext(auth.user.id, parsed.data.subjectId);
  if (!context) {
    return NextResponse.json({ error: "Subject access is not allowed." }, { status: 403 });
  }

  const section = context.sections.find((entry) => entry.id === parsed.data.sectionId);
  if (!section) {
    return NextResponse.json({ error: "Section is not assigned for this subject." }, { status: 403 });
  }

  const canAttach = canTeacherAttachLessonToSection({
    teacherId: auth.user.id,
    lessonId: parsed.data.lessonId,
    sectionId: parsed.data.sectionId,
  });
  if (!canAttach) {
    return NextResponse.json(
      { error: "Lesson cannot be imported to this section because subject/assignment does not match." },
      { status: 403 },
    );
  }

  const result = importLessonIntoSection({
    sourceLessonId: parsed.data.lessonId,
    sectionId: parsed.data.sectionId,
    teacherId: auth.user.id,
    assignedById: auth.user.id,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    lessonId: result.lessonId,
    quizCount: result.quizCount,
  });
}
