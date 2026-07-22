import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { lessonSchema } from "@/lib/validators";
import {
  attachLessonToSection,
  archiveLesson,
  canTeacherAccessLesson,
  createLesson,
  deleteLesson,
  listLessons,
  updateLesson,
} from "@/server/queries/lessons";
import { canTeacherAccessSection, listTeacherSectionSubjectIds } from "@/server/queries/sections";
import { getSubjectByName, teacherHasSubjectNameAssignment } from "@/server/queries/subjects";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "DRAFT" | "PUBLISHED" | "ARCHIVED" | null;
  const search = url.searchParams.get("search") ?? undefined;
  const subject = url.searchParams.get("subject") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;
  const sectionId = url.searchParams.get("sectionId") ?? undefined;

  const lessons = listLessons({
    accessibleTeacherId: auth.user?.role === "TEACHER" ? auth.user.id : undefined,
    status: status ?? undefined,
    search,
    subject,
    topic,
    sectionId,
  });

  return NextResponse.json({ lessons });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const parsed = lessonSchema.extend({ sectionId: z.string().optional() }).safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !teacherHasSubjectNameAssignment(auth.user.id, parsed.data.subject)) {
    return NextResponse.json({ error: "You can only create lessons in your assigned subjects." }, { status: 403 });
  }

  const subject = getSubjectByName(parsed.data.subject);
  if (!subject) {
    return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  }

  if (auth.user.role === "TEACHER" && parsed.data.sectionId) {
    if (!canTeacherAccessSection(auth.user.id, parsed.data.sectionId)) {
      return NextResponse.json({ error: "You are not assigned to this section." }, { status: 403 });
    }
    const sectionSubjectIds = listTeacherSectionSubjectIds(parsed.data.sectionId, auth.user.id);
    if (!sectionSubjectIds.includes(subject.id)) {
      return NextResponse.json(
        { error: "This section is not assigned to you for the selected subject." },
        { status: 403 },
      );
    }
  }

  const lessonId = createLesson({
    teacherId: auth.user.id,
    subjectId: subject.id,
    title: parsed.data.title,
    shortDescription: parsed.data.shortDescription,
    contentMarkdown: parsed.data.contentMarkdown,
    difficulty: parsed.data.difficulty ?? undefined,
    subject: parsed.data.subject,
    topic: parsed.data.topic,
    unit: parsed.data.unit ?? undefined,
    status: parsed.data.status,
    estimatedMinutes: parsed.data.estimatedMinutes,
    tags: parsed.data.tags,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
  });

  if (parsed.data.sectionId) {
    attachLessonToSection(lessonId, parsed.data.sectionId, auth.user.id);
  }

  return NextResponse.json({ success: true, lessonId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { lessonId?: string } & Record<string, unknown>;
  if (!body.lessonId) {
    return NextResponse.json({ error: "lessonId is required" }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !canTeacherAccessLesson(auth.user.id, body.lessonId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = lessonSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && parsed.data.subject && !teacherHasSubjectNameAssignment(auth.user.id, parsed.data.subject)) {
    return NextResponse.json({ error: "You can only move lessons to your assigned subjects." }, { status: 403 });
  }

  const subject = parsed.data.subject ? getSubjectByName(parsed.data.subject) : null;
  if (parsed.data.subject && !subject) {
    return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  }

  updateLesson(body.lessonId, {
    ...parsed.data,
    subjectId: subject?.id ?? undefined,
    coverImageUrl: parsed.data.coverImageUrl === "" ? null : parsed.data.coverImageUrl,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { lessonId?: string; hardDelete?: boolean };

  if (!body.lessonId) {
    return NextResponse.json({ error: "lessonId is required" }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !canTeacherAccessLesson(auth.user.id, body.lessonId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (body.hardDelete) {
      deleteLesson(body.lessonId);
    } else {
      archiveLesson(body.lessonId);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete lesson.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
