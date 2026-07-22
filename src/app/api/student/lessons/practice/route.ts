import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { lessonPracticePromptSchema } from "@/lib/validators";
import {
  canStudentAccessLesson,
  getLessonById,
} from "@/server/queries/lessons";
import {
  createLessonPracticeMessage,
  getLessonPracticeConversation,
  getOrCreateActiveLessonPracticeConversation,
  listLessonPracticeMessages,
  setActiveLessonPracticeConversation,
} from "@/server/queries/lesson-practice";
import {
  completeLessonPracticeRequest,
  registerLessonPracticeRequest,
} from "@/server/services/lesson-practice-cancel";
import { generateLessonPracticeReply } from "@/server/services/lesson-practice-ai";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const streamRequested = new URL(request.url).searchParams.get("stream") === "1";
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = lessonPracticePromptSchema.safeParse({
      ...body,
      message: typeof body.message === "string" ? body.message.trim() : body.message,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (!canStudentAccessLesson(auth.user.id, parsed.data.lessonId)) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const lesson = getLessonById(parsed.data.lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const requestedConversationId = parsed.data.conversationId?.trim();
    const requestedConversation = requestedConversationId
      ? getLessonPracticeConversation({
          lessonId: parsed.data.lessonId,
          studentId: auth.user.id,
          conversationId: requestedConversationId,
        })
      : null;
    if (requestedConversationId && !requestedConversation) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    const conversation =
      requestedConversation ??
      getOrCreateActiveLessonPracticeConversation({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
      });

    if (requestedConversation && !requestedConversation.isActive) {
      setActiveLessonPracticeConversation({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
        conversationId: requestedConversation.id,
      });
    }

    const history = listLessonPracticeMessages({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: conversation.id,
      limit: 16,
    });

    const studentMessage = createLessonPracticeMessage({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: conversation.id,
      role: "STUDENT",
      contentMarkdown: parsed.data.message,
    });

    if (streamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const routeAbortController = new AbortController();
          const onClientAbort = () => routeAbortController.abort();
          request.signal.addEventListener("abort", onClientAbort, { once: true });
          const requestId = registerLessonPracticeRequest({
            studentId: auth.user.id,
            lessonId: parsed.data.lessonId,
            controller: routeAbortController,
          });
          const push = (event: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          };

          push({ type: "start", requestId, conversationId: conversation.id, studentMessage });

          try {
            const assistantReply = await generateLessonPracticeReply({
              lesson: {
                title: lesson.title,
                subject: lesson.subject,
                topic: lesson.topic,
                shortDescription: lesson.shortDescription,
                contentMarkdown: lesson.contentMarkdown,
              },
              history: history.map((message) => ({
                role: message.role,
                contentMarkdown: message.contentMarkdown,
              })),
              question: parsed.data.message,
              signal: routeAbortController.signal,
              onChunk: (chunk) => {
                push({ type: "chunk", chunk });
              },
            });

            if (routeAbortController.signal.aborted) {
              push({ type: "aborted", message: "AI tutor response stopped." });
              return;
            }

            const assistantMessage = createLessonPracticeMessage({
              lessonId: parsed.data.lessonId,
              studentId: auth.user.id,
              conversationId: conversation.id,
              role: "ASSISTANT",
              contentMarkdown: assistantReply,
            });

            const messages = listLessonPracticeMessages({
              lessonId: parsed.data.lessonId,
              studentId: auth.user.id,
              conversationId: conversation.id,
              limit: 40,
            });

            push({
              type: "done",
              conversationId: conversation.id,
              assistantMessage,
              messages,
            });
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              push({ type: "aborted", message: "AI tutor response stopped." });
            } else {
              push({
                type: "error",
                error: error instanceof Error ? error.message : "Unable to process AI practice request.",
              });
            }
          } finally {
            request.signal.removeEventListener("abort", onClientAbort);
            completeLessonPracticeRequest(requestId);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
        },
      });
    }

    const assistantReply = await generateLessonPracticeReply({
      lesson: {
        title: lesson.title,
        subject: lesson.subject,
        topic: lesson.topic,
        shortDescription: lesson.shortDescription,
        contentMarkdown: lesson.contentMarkdown,
      },
      history: history.map((message) => ({
        role: message.role,
        contentMarkdown: message.contentMarkdown,
      })),
      question: parsed.data.message,
      signal: request.signal,
    });

    if (request.signal.aborted) {
      return NextResponse.json({ error: "Request canceled" }, { status: 499 });
    }

    const assistantMessage = createLessonPracticeMessage({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: conversation.id,
      role: "ASSISTANT",
      contentMarkdown: assistantReply,
    });

    const messages = listLessonPracticeMessages({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
      conversationId: conversation.id,
      limit: 40,
    });

    return NextResponse.json({
      success: true,
      conversationId: conversation.id,
      studentMessage,
      assistantMessage,
      messages,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "Request canceled" }, { status: 499 });
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to process AI practice request.",
      },
      { status: 400 },
    );
  }
}
