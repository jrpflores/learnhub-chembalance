import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { canTeacherAccessLesson, getLessonById } from "@/server/queries/lessons";
import { createQuestion } from "@/server/queries/questions";
import { canTeacherAccessQuiz, getQuizById, setQuizQuestions } from "@/server/queries/quizzes";
import { generateQuizFromLesson } from "@/server/services/ollama-quiz-generator";

const generatedQuestionSchema = z.object({
  questionText: z.string().min(4),
  questionType: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"]),
  choices: z.array(z.string()).default([]),
  correctAnswer: z.string().min(1),
  explanation: z.string().default(""),
});

const previewRequestSchema = z.object({
  action: z.literal("preview"),
  lessonId: z.string(),
  quizId: z.string(),
  questionCount: z.number().int().min(1).max(10).default(5),
  questionTypes: z.array(z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "SHORT_ANSWER"])).min(1).max(3).optional(),
});

const saveRequestSchema = z.object({
  action: z.literal("save"),
  lessonId: z.string(),
  quizId: z.string(),
  questions: z.array(generatedQuestionSchema).min(1).max(20),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const rawBody = await request.json();
  const action = (rawBody as { action?: string }).action;

  if (action !== "preview" && action !== "save") {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  const parsed =
    action === "preview"
      ? previewRequestSchema.safeParse(rawBody)
      : saveRequestSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { lessonId, quizId } = parsed.data;

  if (auth.user.role === "TEACHER") {
    if (!canTeacherAccessLesson(auth.user.id, lessonId) || !canTeacherAccessQuiz(auth.user.id, quizId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  }

  const quiz = getQuizById(quizId);
  if (!quiz || quiz.lessonId !== lessonId) {
    return NextResponse.json({ error: "Quiz not found for this lesson." }, { status: 404 });
  }

  if (action === "preview") {
    const previewData = parsed.data as z.infer<typeof previewRequestSchema>;
    try {
      const questions = await generateQuizFromLesson({
        lessonTitle: lesson.title,
        lessonSubject: lesson.subject,
        lessonTopic: lesson.topic,
        lessonContent: lesson.contentMarkdown,
        questionCount: previewData.questionCount,
        questionTypes: previewData.questionTypes,
      });

      return NextResponse.json({ success: true, questions });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Generation failed. Verify Ollama availability and retry.";
      const timeoutDetected = /timed out|aborted/i.test(message);
      return NextResponse.json(
        {
          error: `Generation failed: ${message}`,
        },
        { status: timeoutDetected ? 504 : 502 },
      );
    }
  }

  const saveData = parsed.data as z.infer<typeof saveRequestSchema>;
  const createdQuestionIds = saveData.questions.map((question) => {
    const questionType = question.questionType;
    const isTrueFalse = questionType === "TRUE_FALSE";
    const options =
      questionType === "SHORT_ANSWER"
        ? []
        : (isTrueFalse ? ["True", "False"] : question.choices.slice(0, 4))
            .map((value, index) => {
              const label = String.fromCharCode(65 + index);
              const isCorrect =
                value.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase() ||
                label.toLowerCase() === question.correctAnswer.trim().toLowerCase();
              return { label, value, isCorrect };
            });

    return createQuestion({
      teacherId: auth.user.id,
      subject: lesson.subject,
      topic: lesson.topic,
      difficulty: "MEDIUM",
      type: questionType,
      promptMarkdown: question.questionText,
      explanationMarkdown: question.explanation || undefined,
      referenceAnswer: questionType === "SHORT_ANSWER" ? question.correctAnswer : undefined,
      gradingKeywords:
        questionType === "SHORT_ANSWER"
          ? question.correctAnswer
              .split(/[^a-zA-Z0-9]+/)
              .map((item) => item.trim())
              .filter(Boolean)
              .slice(0, 8)
          : undefined,
      options,
    });
  });

  const mergedAssignments = [
    ...quiz.questions
      .sort((a, b) => a.position - b.position)
      .map((question) => ({
        questionId: question.questionId,
        position: question.position,
        points: question.points,
        isRequired: question.isRequired,
      })),
    ...createdQuestionIds.map((questionId) => ({
      questionId,
      position: 0,
      points: 1,
      isRequired: true,
    })),
  ].map((assignment, index) => ({ ...assignment, position: index + 1 }));

  setQuizQuestions(quiz.id, mergedAssignments);

  return NextResponse.json({
    success: true,
    createdCount: createdQuestionIds.length,
  });
}
