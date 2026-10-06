import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { canTeacherAccessLesson } from "@/server/queries/lessons";
import { createQuizGenerationJob, listQuizGenerationJobsByLesson } from "@/server/queries/quiz-generation-jobs";
import { canTeacherAccessQuiz, getQuizById } from "@/server/queries/quizzes";

const questionTypeSchema = z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]);

const enqueueSchema = z.object({
  lessonId: z.string(),
  quizId: z.string(),
  questionCount: z.number().int().min(1).max(10),
  questionTypes: z.array(questionTypeSchema).min(1).max(3),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const lessonId = url.searchParams.get("lessonId");
  if (!lessonId) {
    return NextResponse.json({ error: "lessonId is required." }, { status: 400 });
  }

  if (!canTeacherAccessLesson(auth.user.id, lessonId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = listQuizGenerationJobsByLesson({
    lessonId,
    teacherId: auth.user.id,
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = enqueueSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { lessonId, quizId, questionCount, questionTypes } = parsed.data;

  if (!canTeacherAccessLesson(auth.user.id, lessonId) || !canTeacherAccessQuiz(auth.user.id, quizId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quiz = getQuizById(quizId);
  if (!quiz || quiz.lessonId !== lessonId) {
    return NextResponse.json({ error: "Quiz not found for this lesson." }, { status: 404 });
  }

  const created = createQuizGenerationJob({
    teacherId: auth.user.id,
    lessonId,
    quizId,
    questionCount,
    questionTypes: [...new Set(questionTypes)],
  });

  if (!created.jobId) {
    return NextResponse.json(
      {
        error: "A generation job is already queued or running for this quiz.",
        conflictJobId: created.conflictJobId,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ success: true, jobId: created.jobId }, { status: 202 });
}
