"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { MathTextEditor } from "@/components/ui/math-text-editor";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { extractApiErrorMessage } from "@/lib/api-error";

type LessonDetailTabsProps = {
  lesson: {
    id: string;
    title: string;
    shortDescription: string;
    subject: string;
    topic: string;
    difficulty: string | null;
    contentMarkdown: string;
  };
  quizzes: {
    id: string;
    title: string;
    description: string;
    passingScore: number;
    questionCount: number;
    maxAttempts: number;
  }[];
  practiceConversation: {
    id: string;
    createdAt: string;
  };
  practiceConversations: {
    id: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string | null;
    messageCount: number;
    preview: string;
  }[];
  practiceMessages: {
    id: string;
    role: "STUDENT" | "ASSISTANT";
    conversationId?: string;
    contentMarkdown: string;
    createdAt: string;
  }[];
};

type PracticePayload = {
  error?: string;
  details?: unknown;
  conversationId?: string;
  activeConversationId?: string;
  conversation?: {
    id?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    lastMessageAt?: string | null;
    messageCount?: number;
    preview?: string;
  };
  conversations?: {
    id: string;
    isActive?: boolean;
    createdAt: string;
    updatedAt: string;
    lastMessageAt: string | null;
    messageCount?: number;
    preview?: string;
  }[];
  messages?: {
    id: string;
    role: "STUDENT" | "ASSISTANT";
    conversationId?: string;
    contentMarkdown: string;
    createdAt: string;
  }[];
};

type PracticeStreamEvent =
  | {
      type: "start";
      requestId?: string;
      conversationId?: string;
      studentMessage?: { id: string; role: "STUDENT"; contentMarkdown: string; createdAt: string };
    }
  | { type: "chunk"; chunk?: string }
  | {
      type: "done";
      conversationId?: string;
      messages?: {
        id: string;
        role: "STUDENT" | "ASSISTANT";
        conversationId?: string;
        contentMarkdown: string;
        createdAt: string;
      }[];
    }
  | { type: "aborted"; message?: string }
  | { type: "error"; error?: string };

type PracticeConversationSummary = LessonDetailTabsProps["practiceConversations"][number];

function formatConversationLabel(conversation: PracticeConversationSummary, index: number) {
  const when = conversation.lastMessageAt ?? conversation.updatedAt ?? conversation.createdAt;
  const dateLabel = when
    ? new Date(when).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "recent";
  const messageLabel = conversation.messageCount === 1 ? "1 message" : `${conversation.messageCount} messages`;
  return `Conversation ${index + 1} • ${dateLabel} • ${messageLabel}`;
}

function normalizeConversationSummary(
  source: {
    id: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    lastMessageAt?: string | null;
    messageCount?: number;
    preview?: string;
  },
  fallbackCreatedAt: string,
): PracticeConversationSummary {
  return {
    id: source.id,
    isActive: Boolean(source.isActive),
    createdAt: source.createdAt ?? fallbackCreatedAt,
    updatedAt: source.updatedAt ?? source.createdAt ?? fallbackCreatedAt,
    lastMessageAt: source.lastMessageAt ?? null,
    messageCount: Number(source.messageCount ?? 0),
    preview: source.preview ?? "",
  };
}

function sortConversations(items: PracticeConversationSummary[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

export function LessonDetailTabs({
  lesson,
  quizzes,
  practiceConversation,
  practiceConversations,
  practiceMessages,
}: LessonDetailTabsProps) {
  const [tab, setTab] = useState<"content" | "quizzes" | "practice">("content");
  const [messages, setMessages] = useState(practiceMessages);
  const [activeConversationId, setActiveConversationId] = useState(practiceConversation.id);
  const [conversations, setConversations] = useState<PracticeConversationSummary[]>(practiceConversations);
  const [question, setQuestion] = useState("");
  const [practiceDraftReply, setPracticeDraftReply] = useState("");
  const [activePracticeRequestId, setActivePracticeRequestId] = useState<string | null>(null);
  const [practiceError, setPracticeError] = useState<string | null>(null);
  const [practiceInfo, setPracticeInfo] = useState<string | null>(null);
  const [practicePending, setPracticePending] = useState(false);
  const practiceFormRef = useRef<HTMLFormElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const practiceAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      practiceAbortRef.current?.abort();
      practiceAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    setConversations(practiceConversations);
    setActiveConversationId(practiceConversation.id);
    setMessages(practiceMessages);
  }, [practiceConversation.id, practiceConversations, practiceMessages]);

  useEffect(() => {
    if (!conversationRef.current || tab !== "practice") {
      return;
    }
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, practiceDraftReply, practicePending, tab]);

  function submitPracticeQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = question.trim();
    if (!prompt || practicePending) {
      return;
    }
    const optimisticMessageId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticMessage = {
      id: optimisticMessageId,
      role: "STUDENT" as const,
      contentMarkdown: prompt,
      createdAt: new Date().toISOString(),
    };

    const controller = new AbortController();
    practiceAbortRef.current = controller;
    setPracticeError(null);
    setPracticeInfo(null);
    setPracticeDraftReply("");
    setActivePracticeRequestId(null);
    setMessages((current) => [...current, optimisticMessage]);
    setQuestion("");
    setPracticePending(true);

    void (async () => {
      let studentMessagePersisted = false;
      let doneReceived = false;
      let streamFailed = false;
      let draftReply = "";

      try {
        const response = await fetch("/api/student/lessons/practice?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId: lesson.id,
            conversationId: activeConversationId,
            message: prompt,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as PracticePayload | null;
          if (response.status === 499) {
            setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
            setQuestion(prompt);
            setPracticeInfo("AI tutor response stopped.");
            return;
          }
          setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
          setQuestion(prompt);
          setPracticeError(extractApiErrorMessage(payload, "Unable to send your question right now."));
          return;
        }

        if (!response.body) {
          const payload = (await response.json().catch(() => null)) as PracticePayload | null;
          const nextConversationId =
            (typeof payload?.activeConversationId === "string" && payload.activeConversationId) ||
            (typeof payload?.conversationId === "string" && payload.conversationId) ||
            "";
          if (nextConversationId) {
            setActiveConversationId(nextConversationId);
          }
          if (Array.isArray(payload?.conversations)) {
            const normalized = payload.conversations.map((conversation) =>
              normalizeConversationSummary(conversation, new Date().toISOString()),
            );
            setConversations(sortConversations(normalized));
          }
          if (payload?.messages) {
            setMessages(payload.messages);
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
              continue;
            }
            let event: PracticeStreamEvent | null = null;
            try {
              event = JSON.parse(line) as PracticeStreamEvent;
            } catch {
              event = null;
            }
            if (!event) {
              continue;
            }

            if (event.type === "start" && event.studentMessage) {
              studentMessagePersisted = true;
              if (typeof event.conversationId === "string" && event.conversationId.length > 0) {
                const startConversationId = event.conversationId;
                setActiveConversationId(startConversationId);
                const nowIso = new Date().toISOString();
                setConversations((current) => {
                  const existing = current.find((conversation) => conversation.id === startConversationId);
                  if (existing) {
                    const updated = current.map((conversation) =>
                      conversation.id === startConversationId
                        ? {
                            ...conversation,
                            isActive: true,
                            updatedAt: nowIso,
                          }
                        : { ...conversation, isActive: false },
                    );
                    return sortConversations(updated);
                  }
                  return sortConversations([
                    {
                      id: startConversationId,
                      isActive: true,
                      createdAt: nowIso,
                      updatedAt: nowIso,
                      lastMessageAt: nowIso,
                      messageCount: 0,
                      preview: "",
                    },
                    ...current.map((conversation) => ({ ...conversation, isActive: false })),
                  ]);
                });
              }
              if (typeof event.requestId === "string" && event.requestId.length > 0) {
                setActivePracticeRequestId(event.requestId);
              }
              setMessages((current) =>
                current.map((message) => (message.id === optimisticMessageId ? event.studentMessage! : message)),
              );
              continue;
            }

            if (event.type === "chunk") {
              const chunk = typeof event.chunk === "string" ? event.chunk : "";
              if (!chunk) {
                continue;
              }
              draftReply += chunk;
              setPracticeDraftReply((current) => current + chunk);
              continue;
            }

            if (event.type === "done") {
              doneReceived = true;
              setPracticeDraftReply("");
              setActivePracticeRequestId(null);
              if (typeof event.conversationId === "string" && event.conversationId.length > 0) {
                setActiveConversationId(event.conversationId);
              }
              if (event.messages && Array.isArray(event.messages)) {
                setMessages(event.messages);
                const nowIso = new Date().toISOString();
                const previewSource = [...event.messages].reverse().find((message) => message.role === "ASSISTANT" || message.role === "STUDENT");
                setConversations((current) =>
                  sortConversations(
                    current.map((conversation) =>
                      conversation.id === (event.conversationId ?? activeConversationId)
                        ? {
                            ...conversation,
                            isActive: true,
                            updatedAt: nowIso,
                            lastMessageAt: nowIso,
                            messageCount: event.messages?.length ?? conversation.messageCount,
                            preview: previewSource?.contentMarkdown?.slice(0, 120) ?? conversation.preview,
                          }
                        : { ...conversation, isActive: false },
                    ),
                  ),
                );
              }
              continue;
            }

            if (event.type === "aborted") {
              streamFailed = true;
              setPracticeDraftReply("");
              setActivePracticeRequestId(null);
              if (!studentMessagePersisted) {
                setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
                setQuestion(prompt);
              }
              setPracticeInfo(event.message ?? "AI tutor response stopped.");
              continue;
            }

            if (event.type === "error") {
              streamFailed = true;
              setPracticeDraftReply("");
              setActivePracticeRequestId(null);
              if (!studentMessagePersisted) {
                setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
                setQuestion(prompt);
              }
              setPracticeError(event.error ?? "Unable to send your question right now.");
            }
          }
        }

        if (!doneReceived && !streamFailed && draftReply.trim().length > 0) {
          setMessages((current) => [
            ...current,
            {
              id: `assistant-draft-${Date.now()}`,
              role: "ASSISTANT",
              contentMarkdown: draftReply,
              createdAt: new Date().toISOString(),
            },
          ]);
          setPracticeDraftReply("");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setPracticeDraftReply("");
          setActivePracticeRequestId(null);
          if (!studentMessagePersisted) {
            setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
            setQuestion(prompt);
          }
          setPracticeInfo("AI tutor response stopped.");
          return;
        }
        setPracticeDraftReply("");
        setActivePracticeRequestId(null);
        if (!studentMessagePersisted) {
          setMessages((current) => current.filter((message) => message.id !== optimisticMessageId));
          setQuestion(prompt);
        }
        setPracticeError(error instanceof Error ? error.message : "Unable to send your question right now.");
      } finally {
        if (practiceAbortRef.current === controller) {
          practiceAbortRef.current = null;
        }
        setActivePracticeRequestId(null);
        setPracticePending(false);
      }
    })();
  }

  function stopPracticeResponse() {
    if (activePracticeRequestId) {
      void fetch("/api/student/lessons/practice/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: activePracticeRequestId,
          lessonId: lesson.id,
        }),
      }).catch(() => null);
    }
    practiceAbortRef.current?.abort();
  }

  function selectConversation(nextConversationId: string) {
    if (!nextConversationId || nextConversationId === activeConversationId || practicePending) {
      return;
    }

    setPracticeError(null);
    setPracticeInfo(null);
    setPracticeDraftReply("");
    setActivePracticeRequestId(null);
    setPracticePending(true);

    void (async () => {
      try {
        const response = await fetch("/api/student/lessons/practice/conversations", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId: lesson.id,
            conversationId: nextConversationId,
          }),
        });

        const payload = (await response.json().catch(() => null)) as PracticePayload | null;
        if (!response.ok) {
          setPracticeError(extractApiErrorMessage(payload, "Unable to open this conversation right now."));
          return;
        }

        const selectedId =
          (typeof payload?.activeConversationId === "string" && payload.activeConversationId) ||
          (typeof payload?.conversation?.id === "string" && payload.conversation.id) ||
          nextConversationId;

        setActiveConversationId(selectedId);
        setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
        if (Array.isArray(payload?.conversations) && payload.conversations.length > 0) {
          const normalized = payload.conversations.map((conversation) =>
            normalizeConversationSummary(conversation, new Date().toISOString()),
          );
          setConversations(sortConversations(normalized));
        } else {
          setConversations((current) =>
            current.map((conversation) => ({
              ...conversation,
              isActive: conversation.id === selectedId,
            })),
          );
        }
      } catch (error) {
        setPracticeError(error instanceof Error ? error.message : "Unable to open this conversation right now.");
      } finally {
        setPracticePending(false);
      }
    })();
  }

  function startNewConversation() {
    if (practicePending) {
      return;
    }

    setPracticeError(null);
    setPracticeInfo(null);
    setPracticeDraftReply("");
    setActivePracticeRequestId(null);
    setQuestion("");
    setPracticePending(true);

    void (async () => {
      try {
        const response = await fetch("/api/student/lessons/practice/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: lesson.id }),
        });

        const payload = (await response.json().catch(() => null)) as PracticePayload | null;
        if (!response.ok) {
          setPracticeError(extractApiErrorMessage(payload, "Unable to start a new conversation right now."));
          return;
        }

        const nextConversationId =
          (typeof payload?.conversation?.id === "string" && payload.conversation.id) ||
          (typeof payload?.conversationId === "string" && payload.conversationId) ||
          "";

        if (!nextConversationId) {
          setPracticeError("Unable to start a new conversation right now.");
          return;
        }

        setActiveConversationId(nextConversationId);
        setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
        if (Array.isArray(payload?.conversations) && payload.conversations.length > 0) {
          const normalized = payload.conversations.map((conversation) =>
            normalizeConversationSummary(conversation, new Date().toISOString()),
          );
          setConversations(sortConversations(normalized));
        } else {
          const nowIso = new Date().toISOString();
          setConversations((current) =>
            sortConversations([
              {
                id: nextConversationId,
                isActive: true,
                createdAt: nowIso,
                updatedAt: nowIso,
                lastMessageAt: null,
                messageCount: 0,
                preview: "",
              },
              ...current
                .filter((conversation) => conversation.id !== nextConversationId)
                .map((conversation) => ({ ...conversation, isActive: false })),
            ]),
          );
        }
        setPracticeInfo("New conversation started.");
      } catch (error) {
        setPracticeError(error instanceof Error ? error.message : "Unable to start a new conversation right now.");
      } finally {
        setPracticePending(false);
      }
    })();
  }

  function handlePracticeTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    if (practicePending || question.trim().length < 2) {
      return;
    }
    practiceFormRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title={lesson.title}
        description={lesson.shortDescription}
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Lessons", href: `/student/lessons?subject=${encodeURIComponent(lesson.subject)}` },
          { label: lesson.title },
        ]}
        actions={
          <>
            <Link href="/student/quizzes" className={studentSecondaryLinkClassName("h-9")}>
              All Quizzes
            </Link>
            <Link href="/student/practice" className={studentSecondaryLinkClassName("h-9")}>
              Practice Hub
            </Link>
          </>
        }
      />

      <div className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="brand">{lesson.subject}</Chip>
          <Chip tone="neutral">{lesson.topic}</Chip>
          {lesson.difficulty ? <Chip tone="warning">{lesson.difficulty}</Chip> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant={tab === "content" ? "primary" : "secondary"} onClick={() => setTab("content")}>
            Lesson Content
          </Button>
          <Button variant={tab === "quizzes" ? "primary" : "secondary"} onClick={() => setTab("quizzes")}>
            Quizzes ({quizzes.length})
          </Button>
          <Button variant={tab === "practice" ? "primary" : "secondary"} onClick={() => setTab("practice")}>
            Practice
          </Button>
        </div>
      </div>

      {tab === "content" ? (
        <div className="rounded-2xl border border-[var(--line-200)] bg-white p-5">
          <MarkdownContent content={lesson.contentMarkdown} className="lesson-markdown" />
        </div>
      ) : tab === "quizzes" ? (
        <div className="grid gap-3">
          {quizzes.length === 0 ? (
            <p className="rounded-2xl border border-[var(--line-200)] bg-white px-4 py-3 text-sm text-[var(--ink-500)]">
              No quizzes attached yet.
            </p>
          ) : (
            quizzes.map((quiz) => (
              <div key={quiz.id} className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
                <h3 className="text-lg font-bold text-[var(--ink-900)]">{quiz.title}</h3>
                <p className="mt-1 text-sm text-[var(--ink-600)]">{quiz.description}</p>
                <p className="mt-2 text-xs text-[var(--ink-500)]">
                  {quiz.questionCount} questions • Pass {quiz.passingScore}% •{" "}
                  {quiz.maxAttempts <= 0 ? "Unlimited attempts" : `Max ${quiz.maxAttempts} attempts`}
                </p>

                <div className="mt-3">
                  <Link href={`/student/quizzes/${quiz.id}`}>
                    <Button>Take Quiz</Button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-[var(--line-200)] bg-white p-4">
          <div className="space-y-2 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2">
            <p className="text-sm text-[var(--ink-600)]">Ask follow-up questions about this lesson and practice with AI tutor guidance.</p>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`practice-conversation-${lesson.id}`} className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-500)]">
                Conversation
              </label>
              <select
                id={`practice-conversation-${lesson.id}`}
                value={activeConversationId}
                onChange={(event) => selectConversation(event.target.value)}
                className="min-w-[240px] flex-1 rounded-lg border border-[var(--line-300)] bg-white px-3 py-2 text-sm text-[var(--ink-800)]"
                disabled={practicePending}
              >
                {conversations.length === 0 ? (
                  <option value={activeConversationId}>Current conversation</option>
                ) : (
                  conversations.map((conversation, index) => (
                    <option key={conversation.id} value={conversation.id}>
                      {formatConversationLabel(conversation, index)}
                    </option>
                  ))
                )}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={startNewConversation} disabled={practicePending}>
                New Conversation
              </Button>
            </div>
          </div>

          <div
            ref={conversationRef}
            className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-[var(--ink-500)]">
                Start by asking a question like <span className="font-semibold">“Can you explain this in simpler steps?”</span>
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === "STUDENT" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[94%] rounded-2xl border px-3 py-2 ${
                      message.role === "STUDENT"
                        ? "border-[var(--brand-500)] bg-[var(--brand-500)] text-white"
                        : "border-[var(--line-200)] bg-white text-[var(--ink-800)]"
                    }`}
                  >
                    <p
                      className={`mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
                        message.role === "STUDENT" ? "text-white/85" : "text-[var(--ink-500)]"
                      }`}
                    >
                      {message.role === "STUDENT" ? "You" : "AI Tutor"}
                    </p>
                    {message.role === "STUDENT" ? (
                      <p className="whitespace-pre-wrap text-sm">{message.contentMarkdown}</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <MarkdownContent content={message.contentMarkdown} className="lesson-markdown ai-practice-markdown text-sm" />
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {practiceDraftReply.trim().length > 0 ? (
              <div className="flex justify-start">
                <div className="max-w-[94%] rounded-2xl border border-[var(--line-200)] bg-white px-3 py-2 text-[var(--ink-800)]">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">AI Tutor</p>
                  <div className="overflow-x-auto">
                    <MarkdownContent content={practiceDraftReply} className="lesson-markdown ai-practice-markdown text-sm" />
                  </div>
                </div>
              </div>
            ) : null}
            {practicePending && practiceDraftReply.trim().length === 0 ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-[var(--line-200)] bg-white px-3 py-2 text-sm text-[var(--ink-500)]">
                  AI tutor is thinking...
                </div>
              </div>
            ) : null}
          </div>

          <form ref={practiceFormRef} onSubmit={submitPracticeQuestion} className="space-y-2">
            <MathTextEditor
              label="Ask AI Tutor"
              inputId={`lesson-practice-${lesson.id}`}
              value={question}
              onChange={setQuestion}
              onKeyDown={handlePracticeTextareaKeyDown}
              placeholder="Ask a question with math/science symbols (example: $H_2O$, $x^2$, $\\frac{a}{b}$)..."
              minHeightClassName="min-h-[110px]"
              maxLength={1200}
              disabled={practicePending}
              showToolbar
              showUtilityControls
              previewDefaultOpen={false}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-[var(--ink-500)]">{question.trim().length}/1200 • Enter to ask • Shift+Enter for newline</p>
              {practicePending ? (
                <Button type="button" variant="danger" onClick={stopPracticeResponse}>
                  Stop
                </Button>
              ) : (
                <Button type="submit" disabled={question.trim().length < 2}>
                  Ask AI
                </Button>
              )}
            </div>
            {practiceError ? (
              <p className="rounded-lg border border-[var(--danger-200)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
                {practiceError}
              </p>
            ) : null}
            {practiceInfo ? (
              <p className="rounded-lg border border-[var(--line-300)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-600)]">
                {practiceInfo}
              </p>
            ) : null}
          </form>
        </div>
      )}
    </div>
  );
}
