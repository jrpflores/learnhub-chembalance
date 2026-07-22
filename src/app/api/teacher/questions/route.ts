import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { questionSchema } from "@/lib/validators";
import {
  archiveQuestion,
  canTeacherAccessQuestionBySubject,
  createQuestion,
  duplicateQuestion,
  isTeacherQuestionOwner,
  listQuestions,
  questionBankStats,
  updateQuestion,
} from "@/server/queries/questions";
import { teacherHasSubjectNameAssignment } from "@/server/queries/subjects";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const subject = url.searchParams.get("subject") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;
  const difficulty = url.searchParams.get("difficulty") as "EASY" | "MEDIUM" | "HARD" | null;
  const type = url.searchParams.get("type") as
    | "MULTIPLE_CHOICE"
    | "TRUE_FALSE"
    | "SHORT_ANSWER"
    | "MULTI_SELECT"
    | "MATCHING"
    | "FILL_BLANK"
    | "SEQUENCING"
    | "IMAGE_BASED"
    | null;

  const teacherIdParam = url.searchParams.get("teacherId");
  if (auth.user.role === "ADMIN" && !teacherIdParam) {
    return NextResponse.json({ error: "teacherId is required for admin query" }, { status: 400 });
  }
  const questions =
    auth.user.role === "TEACHER"
      ? listQuestions({
          accessibleTeacherId: auth.user.id,
          search,
          subject,
          topic,
          difficulty: difficulty ?? undefined,
          type: type ?? undefined,
        })
      : listQuestions({
          teacherId: teacherIdParam ?? undefined,
          search,
          subject,
          topic,
          difficulty: difficulty ?? undefined,
          type: type ?? undefined,
        });

  return NextResponse.json({
    questions,
    stats:
      auth.user.role === "TEACHER"
        ? questionBankStats(auth.user.id, true)
        : questionBankStats(teacherIdParam ?? auth.user.id),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { action?: string; questionId?: string } & Record<string, unknown>;

  if (body.action === "duplicate") {
    if (!body.questionId) {
      return NextResponse.json({ error: "questionId is required" }, { status: 400 });
    }

    if (auth.user.role === "TEACHER" && !canTeacherAccessQuestionBySubject(auth.user.id, body.questionId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const newQuestionId = duplicateQuestion(body.questionId, auth.user.id);
    return NextResponse.json({ success: true, questionId: newQuestionId });
  }

  const parsed = questionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !teacherHasSubjectNameAssignment(auth.user.id, parsed.data.subject)) {
    return NextResponse.json({ error: "You can only create questions in assigned subjects." }, { status: 403 });
  }

  const questionId = createQuestion({
    teacherId: auth.user.id,
    ...parsed.data,
    imageUrl: parsed.data.imageUrl || undefined,
  });

  return NextResponse.json({ success: true, questionId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { questionId?: string } & Record<string, unknown>;

  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !isTeacherQuestionOwner(auth.user.id, body.questionId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = questionSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && parsed.data.subject && !teacherHasSubjectNameAssignment(auth.user.id, parsed.data.subject)) {
    return NextResponse.json({ error: "You can only move questions to assigned subjects." }, { status: 403 });
  }

  updateQuestion(body.questionId, {
    ...parsed.data,
    imageUrl: parsed.data.imageUrl === "" ? null : parsed.data.imageUrl,
    options: parsed.data.options,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { questionId?: string };
  if (!body.questionId) {
    return NextResponse.json({ error: "questionId is required" }, { status: 400 });
  }

  if (auth.user.role === "TEACHER" && !isTeacherQuestionOwner(auth.user.id, body.questionId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  archiveQuestion(body.questionId);
  return NextResponse.json({ success: true });
}
