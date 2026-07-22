import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { listLessons } from "@/server/queries/lessons";
import { listQuizzes } from "@/server/queries/quizzes";
import {
  canTeacherAccessSection,
  getSectionTargets,
  setSectionLessonTargets,
  setSectionQuizTargets,
} from "@/server/queries/sections";

const schema = z.object({
  sectionId: z.string(),
  lessonIds: z.array(z.string()).optional(),
  quizIds: z.array(z.string()).optional(),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const sectionId = url.searchParams.get("sectionId");
  if (!sectionId) {
    return NextResponse.json({ error: "sectionId is required" }, { status: 400 });
  }
  if (!canTeacherAccessSection(auth.user.id, sectionId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    targets: getSectionTargets(sectionId),
    lessons: listLessons({ teacherId: auth.user.id, status: "PUBLISHED" }).map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
    })),
    quizzes: listQuizzes({ teacherId: auth.user.id, status: "PUBLISHED" }).map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
    })),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!canTeacherAccessSection(auth.user.id, parsed.data.sectionId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.data.lessonIds) {
    setSectionLessonTargets(parsed.data.sectionId, parsed.data.lessonIds, auth.user.id);
  }
  if (parsed.data.quizIds) {
    setSectionQuizTargets(parsed.data.sectionId, parsed.data.quizIds, auth.user.id);
  }

  return NextResponse.json({ success: true });
}
