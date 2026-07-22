import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { quizSchema } from "@/lib/validators";
import {
  archiveQuiz,
  canTeacherAccessQuiz,
  createQuiz,
  deleteQuiz,
  listQuizzes,
  setQuizQuestions,
  updateQuiz,
} from "@/server/queries/quizzes";
import { canTeacherAccessLesson } from "@/server/queries/lessons";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as "DRAFT" | "PUBLISHED" | "ARCHIVED" | null;
  const search = url.searchParams.get("search") ?? undefined;
  const lessonId = url.searchParams.get("lessonId") ?? undefined;

  const quizzes = listQuizzes({
    accessibleTeacherId: auth.user.role === "TEACHER" ? auth.user.id : undefined,
    lessonId,
    status: status ?? undefined,
    search,
  });

  return NextResponse.json({ quizzes });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = quizSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (!parsed.data.lessonId) {
    return NextResponse.json({ error: "lessonId is required. Quizzes must belong to a lesson." }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !canTeacherAccessLesson(auth.user.id, parsed.data.lessonId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const quizId = createQuiz({
    teacherId: auth.user.id,
    lessonId: parsed.data.lessonId,
    title: parsed.data.title,
    description: parsed.data.description,
    instructions: parsed.data.instructions,
    passingScore: parsed.data.passingScore,
    timeLimitSec: parsed.data.timeLimitSec,
    maxAttempts: parsed.data.maxAttempts,
    status: parsed.data.status,
    availableFrom: parsed.data.availableFrom,
    availableUntil: parsed.data.availableUntil,
    randomizeQuestions: parsed.data.randomizeQuestions,
    randomizeOptions: parsed.data.randomizeOptions,
    feedbackMode: parsed.data.feedbackMode,
    explanationMode: parsed.data.explanationMode,
    showAnswerKey: parsed.data.showAnswerKey,
  });

  if (parsed.data.questionAssignments?.length) {
    setQuizQuestions(
      quizId,
      parsed.data.questionAssignments.map((assignment) => ({
        questionId: assignment.questionId,
        position: assignment.position,
        points: assignment.points,
        isRequired: assignment.isRequired ?? true,
      })),
    );
  }

  return NextResponse.json({ success: true, quizId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as { quizId?: string } & Record<string, unknown>;

    if (!body.quizId) {
      return NextResponse.json({ error: "quizId is required" }, { status: 400 });
    }

    if (auth.user.role === "TEACHER" && !canTeacherAccessQuiz(auth.user.id, body.quizId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const parsed = quizSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    if (
      auth.user.role === "TEACHER" &&
      parsed.data.lessonId &&
      !canTeacherAccessLesson(auth.user.id, parsed.data.lessonId)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    updateQuiz(body.quizId, {
      lessonId: parsed.data.lessonId,
      title: parsed.data.title,
      description: parsed.data.description,
      instructions: parsed.data.instructions,
      passingScore: parsed.data.passingScore,
      timeLimitSec: parsed.data.timeLimitSec,
      maxAttempts: parsed.data.maxAttempts,
      status: parsed.data.status,
      availableFrom: parsed.data.availableFrom,
      availableUntil: parsed.data.availableUntil,
      randomizeQuestions: parsed.data.randomizeQuestions,
      randomizeOptions: parsed.data.randomizeOptions,
      feedbackMode: parsed.data.feedbackMode,
      explanationMode: parsed.data.explanationMode,
      showAnswerKey: parsed.data.showAnswerKey,
    });

    if (parsed.data.questionAssignments) {
      setQuizQuestions(
        body.quizId,
        parsed.data.questionAssignments.map((assignment) => ({
          questionId: assignment.questionId,
          position: assignment.position,
          points: assignment.points,
          isRequired: assignment.isRequired ?? true,
        })),
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { quizId?: string; hardDelete?: boolean };
  if (!body.quizId) {
    return NextResponse.json({ error: "quizId is required" }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !canTeacherAccessQuiz(auth.user.id, body.quizId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    if (body.hardDelete) {
      deleteQuiz(body.quizId);
    } else {
      archiveQuiz(body.quizId);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete quiz.";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
