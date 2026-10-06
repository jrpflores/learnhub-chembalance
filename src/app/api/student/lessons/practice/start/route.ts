import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { lessonPracticeStartSessionSchema } from "@/lib/validators";
import { canStudentAccessLesson, getLessonById } from "@/server/queries/lessons";
import {
  createLessonPracticeConversation,
  createLessonPracticeMessage,
  listLessonPracticeConversations,
  listLessonPracticeMessages,
} from "@/server/queries/lesson-practice";
import {
  completeLessonPracticeRequest,
  registerLessonPracticeRequest,
} from "@/server/services/lesson-practice-cancel";
import { generateLessonPracticeOpeningQuestion } from "@/server/services/lesson-practice-ai";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["STUDENT"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  try {
    const streamRequested = new URL(request.url).searchParams.get("stream") === "1";
    const body = (await request.json()) as Record<string, unknown>;
    const parsed = lessonPracticeStartSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    if (!canStudentAccessLesson(auth.user.id, parsed.data.lessonId)) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const lesson = getLessonById(parsed.data.lessonId);
    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    const conversation = createLessonPracticeConversation({
      lessonId: parsed.data.lessonId,
      studentId: auth.user.id,
    });

    const lessonContext = {
      title: lesson.title,
      subject: lesson.subject,
      topic: lesson.topic,
      shortDescription: lesson.shortDescription,
      contentMarkdown: lesson.contentMarkdown,
    };

    if (streamRequested) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start: async (controller) => {
          const routeAbortController = new AbortController();
          const onClientAbort = () => routeAbortController.abort();
          request.signal.addEventListener("abort", onClientAbort, { once: true });
          const requestId = registerLessonPracticeRequest({
            studentId: auth.user!.id,
            lessonId: parsed.data.lessonId,
            controller: routeAbortController,
          });

          const send = (payload: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          try {
            send({
              type: "start",
              requestId,
              conversationId: conversation.id,
              activeConversationId: conversation.id,
            });

            const opening = await generateLessonPracticeOpeningQuestion({
              lesson: lessonContext,
              signal: routeAbortController.signal,
              onChunk: (displayDraft) => {
                send({ type: "chunk", displayDraft });
              },
            });

            if (routeAbortController.signal.aborted) {
              send({ type: "aborted", message: "Practice start stopped." });
              controller.close();
              return;
            }

            const assistantMessage = opening.isFallback
              ? null
              : createLessonPracticeMessage({
                  lessonId: parsed.data.lessonId,
                  studentId: auth.user!.id,
                  conversationId: conversation.id,
                  role: "ASSISTANT",
                  contentMarkdown: opening.contentMarkdown,
                });

            const messages = listLessonPracticeMessages({
              lessonId: parsed.data.lessonId,
              studentId: auth.user!.id,
              conversationId: conversation.id,
              limit: 40,
            });
            const conversations = listLessonPracticeConversations({
              lessonId: parsed.data.lessonId,
              studentId: auth.user!.id,
              limit: 20,
            });

            send({
              type: "done",
              conversationId: conversation.id,
              activeConversationId: conversation.id,
              assistantMessage,
              fallbackMessage: opening.isFallback ? opening.contentMarkdown : null,
              messages,
              conversations,
            });
            controller.close();
          } catch (error) {
            const aborted =
              (error instanceof Error && error.name === "AbortError") || routeAbortController.signal.aborted;
            if (aborted) {
              send({ type: "aborted", message: "Practice start stopped." });
              controller.close();
              return;
            }
            send({
              type: "error",
              error: error instanceof Error ? error.message : "Unable to start practice session.",
            });
            controller.close();
          } finally {
            completeLessonPracticeRequest(requestId);
            request.signal.removeEventListener("abort", onClientAbort);
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const opening = await generateLessonPracticeOpeningQuestion({ lesson: lessonContext });
    if (!opening.isFallback) {
      createLessonPracticeMessage({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
        conversationId: conversation.id,
        role: "ASSISTANT",
        contentMarkdown: opening.contentMarkdown,
      });
    }

    return NextResponse.json({
      success: true,
      conversation,
      activeConversationId: conversation.id,
      conversations: listLessonPracticeConversations({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
        limit: 20,
      }),
      messages: listLessonPracticeMessages({
        lessonId: parsed.data.lessonId,
        studentId: auth.user.id,
        conversationId: conversation.id,
        limit: 40,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to start practice session.",
      },
      { status: 400 },
    );
  }
}
