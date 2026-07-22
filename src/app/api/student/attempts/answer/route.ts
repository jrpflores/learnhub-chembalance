import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { saveAttemptAnswerSchema } from "@/lib/validators";
import { getAttemptById, getQuizById, saveAttemptAnswer } from "@/server/queries/quizzes";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = saveAttemptAnswerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const attempt = getAttemptById(parsed.data.attemptId);
  if (!attempt || attempt.studentId !== auth.user.id) {
    return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
  }

  if (attempt.status !== "IN_PROGRESS") {
    return NextResponse.json({ error: "Attempt is already submitted" }, { status: 400 });
  }

  const quiz = getQuizById(attempt.quizId);
  if (!quiz) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  const question = quiz.questions.find((item) => item.quizQuestionId === parsed.data.quizQuestionId);
  if (!question) {
    return NextResponse.json({ error: "Question not found in quiz" }, { status: 404 });
  }

  saveAttemptAnswer({
    attemptId: parsed.data.attemptId,
    quizQuestionId: parsed.data.quizQuestionId,
    questionId: parsed.data.questionId,
    selectedOptionIds: parsed.data.selectedOptionIds,
    answerText: parsed.data.answerText,
    maxPoints: question.points,
    topicSnapshot: question.topic,
  });

  return NextResponse.json({ success: true });
}
