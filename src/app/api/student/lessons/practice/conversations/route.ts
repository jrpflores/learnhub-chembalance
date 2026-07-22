import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { lessonPracticeConversationSchema, lessonPracticeConversationSelectSchema } from "@/lib/validators";
import { canStudentAccessLesson } from "@/server/queries/lessons";
import {
  createLessonPracticeConversation,
  getLessonPracticeConversation,
  getOrCreateActiveLessonPracticeConversation,
  listLessonPracticeConversations,
  listLessonPracticeMessages,
  setActiveLessonPracticeConversation,
} from "@/server/queries/lesson-practice";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const lessonId = new URL(request.url).searchParams.get("lessonId")?.trim() ?? "";
  if (!lessonId) {
    return NextResponse.json({ error: "lessonId is required." }, { status: 400 });
  }

  if (!canStudentAccessLesson(auth.user.id, lessonId)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const activeConversation = getOrCreateActiveLessonPracticeConversation({
    lessonId,
    studentId: auth.user.id,
  });
  const conversations = listLessonPracticeConversations({
    lessonId,
    studentId: auth.user.id,
    limit: 20,
  });

  return NextResponse.json({
    success: true,
    activeConversationId: activeConversation.id,
    conversations,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = lessonPracticeConversationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    if (!canStudentAccessLesson(auth.user.id, parsed.data.lessonId)) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const conversation = createLessonPracticeConversation({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
    });
    const conversations = listLessonPracticeConversations({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      limit: 20,
    });

    return NextResponse.json({
      success: true,
      conversation,
      activeConversationId: conversation.id,
      conversations,
      messages: [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create a new AI tutor conversation.",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = lessonPracticeConversationSelectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    if (!canStudentAccessLesson(auth.user.id, parsed.data.lessonId)) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const conversation = getLessonPracticeConversation({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: parsed.data.conversationId,
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    if (!conversation.isActive) {
      setActiveLessonPracticeConversation({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
        conversationId: conversation.id,
      });
    }

    const messages = listLessonPracticeMessages({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: conversation.id,
      limit: 60,
    });
    const conversations = listLessonPracticeConversations({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      limit: 20,
    });

    return NextResponse.json({
      success: true,
      conversation,
      activeConversationId: conversation.id,
      conversations,
      messages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to switch AI tutor conversation.",
      },
      { status: 400 },
    );
  }
}
