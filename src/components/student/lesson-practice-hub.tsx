"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, PlayCircle, SendHorizonal, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MathTextEditor } from "@/components/ui/math-text-editor";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { extractApiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/date-display";

type PracticeLessonOption = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  shortDescription: string;
};

type PracticeMessage = {
  id: string;
  role: "STUDENT" | "ASSISTANT";
  contentMarkdown: string;
  createdAt: string;
};

type PracticeStreamEvent = {
  type?: string;
  requestId?: string;
  conversationId?: string;
  activeConversationId?: string;
  chunk?: string;
  displayDraft?: string;
  fallbackMessage?: string | null;
  messages?: PracticeMessage[];
  error?: string;
  message?: string;
};

type PracticeHistoryItem = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonSubject: string;
  lessonTopic: string;
  isActive: boolean;
  messageCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
};

type LessonPracticeHubProps = {
  lessons: PracticeLessonOption[];
  initialHistory: PracticeHistoryItem[];
};

function StreamingTutorBubble({ text, waiting }: { text: string; waiting: boolean }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[94%] rounded-2xl border border-[var(--line-200)] bg-white px-3 py-2 text-[var(--ink-800)]">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">AI Tutor</p>
        {text.trim().length > 0 ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {text}
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[var(--brand-600)] align-middle" aria-hidden />
          </p>
        ) : waiting ? (
          <p className="text-sm text-[var(--ink-500)]">
            AI tutor is typing
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[var(--brand-600)] align-middle" aria-hidden />
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function LessonPracticeHub({ lessons, initialHistory }: LessonPracticeHubProps) {
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id ?? "");
  const [sessionLessonId, setSessionLessonId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<PracticeMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [draftReply, setDraftReply] = useState("");
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState(initialHistory);
  const abortRef = useRef<AbortController | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);

  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId) ?? null;
  const sessionLesson = lessons.find((lesson) => lesson.id === sessionLessonId) ?? selectedLesson;
  // Show chat as soon as a session starts (before conversation id arrives).
  const inSession = Boolean(sessionLessonId);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!conversationRef.current) {
      return;
    }
    conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, draftReply, pending]);

  function resetSessionUi() {
    setSessionLessonId(null);
    setConversationId(null);
    setMessages([]);
    setAnswer("");
    setDraftReply("");
    setActiveRequestId(null);
    setPending(false);
  }

  async function reloadHistory() {
    const response = await fetch("/api/student/lessons/practice/history", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const payload = (await response.json()) as { history?: PracticeHistoryItem[] };
    setHistory(payload.history ?? []);
  }

  async function openHistorySession(item: PracticeHistoryItem) {
    if (pending) {
      return;
    }

    abortRef.current?.abort();
    setError(null);
    setInfo(null);
    setDraftReply("");
    setAnswer("");
    setPending(true);
    setSelectedLessonId(item.lessonId);
    setSessionLessonId(item.lessonId);
    setConversationId(item.id);

    try {
      const response = await fetch("/api/student/lessons/practice/conversations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: item.lessonId,
          conversationId: item.id,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        conversation?: { id: string };
        messages?: PracticeMessage[];
      } | null;

      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to open this practice session."));
        resetSessionUi();
        return;
      }

      setConversationId(payload?.conversation?.id ?? item.id);
      setMessages(payload?.messages ?? []);
      setInfo(`Resumed practice for ${item.lessonTitle}.`);
      await reloadHistory();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : "Unable to open this practice session.");
      resetSessionUi();
    } finally {
      setPending(false);
    }
  }

  async function readPracticeStream(
    response: Response,
    handlers: {
      onStart?: (event: PracticeStreamEvent) => void;
      onChunk?: (chunk: string, fullDraft: string) => void;
      onDone?: (event: PracticeStreamEvent) => void;
      onAborted?: (event: PracticeStreamEvent) => void;
      onError?: (event: PracticeStreamEvent) => void;
    },
  ) {
    if (!response.body) {
      throw new Error("No stream body.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let localDraft = "";

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
          continue;
        }

        if (event.type === "start" || event.type === "started") {
          handlers.onStart?.(event);
        } else if (event.type === "chunk") {
          if (typeof event.displayDraft === "string") {
            localDraft = event.displayDraft;
          } else if (event.chunk) {
            localDraft += event.chunk;
          }
          // Immediate update — do not wrap in startTransition (batches and kills live typing).
          handlers.onChunk?.(typeof event.chunk === "string" ? event.chunk : "", localDraft);
        } else if (event.type === "done") {
          handlers.onDone?.(event);
        } else if (event.type === "aborted" || event.type === "stopped") {
          handlers.onAborted?.(event);
        } else if (event.type === "error") {
          handlers.onError?.(event);
        }
      }
    }
  }

  function startSession() {
    if (!selectedLessonId || pending) {
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setInfo(null);
    setDraftReply("");
    setMessages([]);
    setConversationId(null);
    setSessionLessonId(selectedLessonId);
    setActiveRequestId(null);
    setPending(true);

    void (async () => {
      try {
        const response = await fetch("/api/student/lessons/practice/start?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lessonId: selectedLessonId }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
          setError(extractApiErrorMessage(payload, "Unable to start practice session."));
          resetSessionUi();
          return;
        }

        await readPracticeStream(response, {
          onStart: (event) => {
            if (event.conversationId || event.activeConversationId) {
              setConversationId(event.conversationId ?? event.activeConversationId ?? null);
            }
            if (event.requestId) {
              setActiveRequestId(event.requestId);
            }
          },
          onChunk: (_chunk, fullDraft) => {
            setDraftReply(fullDraft);
          },
          onDone: (event) => {
            if (event.conversationId || event.activeConversationId) {
              setConversationId(event.conversationId ?? event.activeConversationId ?? null);
            }
            if (Array.isArray(event.messages)) {
              setMessages(event.messages);
            }
            if (typeof event.fallbackMessage === "string" && event.fallbackMessage.trim().length > 0) {
              setInfo("Offline AI is unavailable right now. You can still read the lesson and try again.");
            }
            setDraftReply("");
            setActiveRequestId(null);
            if (!event.fallbackMessage) {
              setInfo("Your turn — answer the question below.");
            }
            void reloadHistory();
          },
          onAborted: (event) => {
            setInfo(event.message ?? "Practice start stopped.");
            setDraftReply("");
            setActiveRequestId(null);
          },
          onError: (event) => {
            setError(event.error ?? "Unable to start practice session.");
            setDraftReply("");
            setActiveRequestId(null);
            resetSessionUi();
          },
        });
      } catch (startError) {
        if (controller.signal.aborted) {
          setInfo("Practice start stopped.");
        } else {
          setError(startError instanceof Error ? startError.message : "Unable to start practice session.");
          resetSessionUi();
        }
      } finally {
        setPending(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();
  }

  function stopResponse() {
    if (activeRequestId && sessionLessonId) {
      void fetch("/api/student/lessons/practice/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: activeRequestId, lessonId: sessionLessonId }),
      });
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setActiveRequestId(null);
    setPending(false);
  }

  function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = answer.trim();
    if (!prompt || !sessionLessonId || !conversationId || pending) {
      return;
    }

    const optimisticId = `pending-${Date.now()}`;
    const optimisticMessage: PracticeMessage = {
      id: optimisticId,
      role: "STUDENT",
      contentMarkdown: prompt,
      createdAt: new Date().toISOString(),
    };

    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setInfo(null);
    setDraftReply("");
    setMessages((current) => [...current, optimisticMessage]);
    setAnswer("");
    setPending(true);

    void (async () => {
      try {
        const response = await fetch("/api/student/lessons/practice?stream=1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId: sessionLessonId,
            conversationId,
            message: prompt,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
          setMessages((current) => current.filter((message) => message.id !== optimisticId));
          setAnswer(prompt);
          setError(extractApiErrorMessage(payload, "Unable to send your answer right now."));
          return;
        }

        await readPracticeStream(response, {
          onStart: (streamEvent) => {
            if (streamEvent.requestId) {
              setActiveRequestId(streamEvent.requestId);
            }
          },
          onChunk: (_chunk, fullDraft) => {
            setDraftReply(fullDraft);
          },
          onDone: (streamEvent) => {
            if (Array.isArray(streamEvent.messages)) {
              setMessages(streamEvent.messages);
            }
            if (typeof streamEvent.fallbackMessage === "string" && streamEvent.fallbackMessage.trim().length > 0) {
              setInfo("Offline AI is unavailable right now. You can still read the lesson and try again.");
            }
            setDraftReply("");
            setActiveRequestId(null);
            void reloadHistory();
          },
          onError: (streamEvent) => {
            setMessages((current) => current.filter((message) => message.id !== optimisticId));
            setAnswer(prompt);
            setError(streamEvent.error ?? "Unable to send your answer right now.");
            setDraftReply("");
            setActiveRequestId(null);
          },
        });
      } catch (submitError) {
        if (!controller.signal.aborted) {
          setMessages((current) => current.filter((message) => message.id !== optimisticId));
          setAnswer(prompt);
          setError(submitError instanceof Error ? submitError.message : "Unable to send your answer right now.");
        }
      } finally {
        setPending(false);
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    })();
  }

  function onAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!pending && answer.trim().length >= 2) {
        formRef.current?.requestSubmit();
      }
    }
  }

  const showStreamingBubble = pending || draftReply.trim().length > 0;

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Practice"
        description="Pick a lesson, start a session, and answer AI practice questions — same tutor as Lessons → Practice."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Practice" },
        ]}
        actions={
          <Link href="/student/lessons" className={studentSecondaryLinkClassName("h-9")}>
            Browse Lessons
          </Link>
        }
      />

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Start a practice session</h3>
        <p className="mt-1 text-sm text-[var(--ink-600)]">
          Choose the lesson you want to practice. AI asks the first question; you answer.
        </p>

        {lessons.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-500)]">No published lessons available yet.</p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-[240px] flex-1 text-sm font-semibold text-[var(--ink-700)]">
              Lesson
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] bg-white px-3 text-sm"
                value={selectedLessonId}
                onChange={(event) => setSelectedLessonId(event.target.value)}
                disabled={pending}
              >
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.subject} · {lesson.title}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={startSession} disabled={pending || !selectedLessonId}>
              {pending && !draftReply && messages.length === 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              {inSession ? "Start New Session" : "Start Session"}
            </Button>
            {inSession ? (
              <Button variant="secondary" onClick={resetSessionUi} disabled={pending}>
                Close Session
              </Button>
            ) : null}
          </div>
        )}

        {selectedLesson ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Chip tone="brand">{selectedLesson.subject}</Chip>
            <Chip tone="neutral">{selectedLesson.topic}</Chip>
            <p className="w-full text-sm text-[var(--ink-600)]">{selectedLesson.shortDescription}</p>
          </div>
        ) : null}
      </Card>

      {inSession && sessionLesson ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Active session</p>
              <h3 className="text-lg font-bold text-[var(--ink-900)]">{sessionLesson.title}</h3>
            </div>
            <Chip tone="success">AI tutor</Chip>
          </div>

          <div
            ref={conversationRef}
            className="max-h-[420px] space-y-3 overflow-y-auto rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3"
          >
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "STUDENT" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[94%] rounded-2xl border px-3 py-2 ${
                    message.role === "STUDENT"
                      ? "border-[var(--brand-300)] bg-white text-[var(--ink-800)]"
                      : "border-[var(--line-200)] bg-white text-[var(--ink-800)]"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-500)]">
                    {message.role === "STUDENT" ? "You" : "AI Tutor"}
                  </p>
                  {message.role === "STUDENT" ? (
                    <p className="whitespace-pre-wrap text-sm">{message.contentMarkdown}</p>
                  ) : (
                    <MarkdownContent content={message.contentMarkdown} className="lesson-markdown ai-practice-markdown text-sm" />
                  )}
                </div>
              </div>
            ))}

            {showStreamingBubble ? <StreamingTutorBubble text={draftReply} waiting={pending && draftReply.trim().length === 0} /> : null}
          </div>

          <form ref={formRef} onSubmit={submitAnswer} className="mt-3 space-y-2">
            <MathTextEditor
              label="Your answer"
              inputId="practice-hub-answer"
              value={answer}
              onChange={setAnswer}
              onKeyDown={onAnswerKeyDown}
              minHeightClassName="min-h-24"
              allowMediaUpload={false}
              showUtilityControls={false}
              disabled={pending || messages.length === 0}
            />
            <div className="flex flex-wrap gap-2">
              {pending ? (
                <Button type="button" variant="danger" onClick={stopResponse}>
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button type="submit" disabled={answer.trim().length < 2 || messages.length === 0}>
                  <SendHorizonal className="h-4 w-4" />
                  Send Answer
                </Button>
              )}
            </div>
          </form>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-[var(--danger-500)] bg-[var(--danger-100)]">
          <p className="text-sm text-[var(--danger-700)]">{error}</p>
        </Card>
      ) : null}
      {info ? (
        <Card className="border-[var(--brand-300)] bg-[var(--brand-100)]">
          <p className="text-sm text-[var(--brand-800)]">{info}</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Practice history</h3>
            <p className="mt-1 text-sm text-[var(--ink-600)]">Open a past session to continue answering.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void reloadHistory()} disabled={pending}>
            Refresh
          </Button>
        </div>

        {history.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink-500)]">No practice sessions yet. Start one above.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">When</th>
                  <th className="px-2 py-2 font-semibold">Lesson</th>
                  <th className="px-2 py-2 font-semibold">Preview</th>
                  <th className="px-2 py-2 font-semibold">Messages</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => {
                  const isOpen = conversationId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-[var(--line-100)]">
                      <td className="px-2 py-2 whitespace-nowrap text-[var(--ink-700)]">
                        {formatDateTime(item.lastMessageAt ?? item.updatedAt)}
                      </td>
                      <td className="px-2 py-2">
                        <p className="font-semibold text-[var(--ink-900)]">{item.lessonTitle}</p>
                        <p className="text-xs text-[var(--ink-500)]">
                          {item.lessonSubject} · {item.lessonTopic}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-[var(--ink-600)]">
                        <p className="line-clamp-2">{item.preview || "No preview"}</p>
                      </td>
                      <td className="px-2 py-2 text-[var(--ink-700)]">{item.messageCount}</td>
                      <td className="px-2 py-2">
                        <Button
                          size="sm"
                          variant={isOpen ? "secondary" : "primary"}
                          onClick={() => void openHistorySession(item)}
                          disabled={pending}
                        >
                          {isOpen ? "Current" : "Open"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
