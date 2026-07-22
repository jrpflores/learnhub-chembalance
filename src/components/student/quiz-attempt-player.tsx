"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MathTextEditor } from "@/components/ui/math-text-editor";
import { Modal } from "@/components/ui/modal";
import { Progress } from "@/components/ui/progress";
import { MarkdownContent } from "@/components/ui/markdown-content";

type QuizQuestion = {
  quizQuestionId: string;
  questionId: string;
  position: number;
  points: number;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | string;
  topic: string;
  promptMarkdown: string;
  hintMarkdown?: string | null;
  options: {
    id: string;
    label: string;
    value: string;
  }[];
};

type AttemptQuizPayload = {
  id: string;
  title: string;
  description: string;
  instructions?: string | null;
  passingScore: number;
  timeLimitSec?: number | null;
  questions: QuizQuestion[];
};

type QuizAttemptPlayerProps = {
  attemptId: string;
};

type AnswerState = {
  questionId: string;
  quizQuestionId: string;
  selectedOptionIds?: string[];
  answerText?: string;
  flagged?: boolean;
};

const ENCOURAGEMENT = ["Great job, keep going!", "Nice work!", "You are halfway there!", "Almost finished!"];

function loadAttemptQuiz(attemptId: string): { quiz: AttemptQuizPayload | null; error: string | null } {
  if (typeof window === "undefined") {
    return { quiz: null, error: null };
  }

  const stored = window.sessionStorage.getItem(`attempt:${attemptId}`);
  if (!stored) {
    return { quiz: null, error: "Quiz session was not found. Please start again." };
  }

  try {
    return {
      quiz: JSON.parse(stored) as AttemptQuizPayload,
      error: null,
    };
  } catch {
    return { quiz: null, error: "Unable to load quiz session." };
  }
}

export function QuizAttemptPlayer({ attemptId }: QuizAttemptPlayerProps) {
  const router = useRouter();
  const initialLoad = useMemo(() => loadAttemptQuiz(attemptId), [attemptId]);
  const [quiz] = useState<AttemptQuizPayload | null>(initialLoad.quiz);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(initialLoad.error);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!quiz) {
      return;
    }

    const timer = setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [quiz]);

  const currentQuestion = quiz?.questions[currentIndex] ?? null;
  const totalQuestions = quiz?.questions.length ?? 0;
  const progress = totalQuestions > 0 ? ((currentIndex + 1) / totalQuestions) * 100 : 0;

  const supportMessage = useMemo(() => {
    if (!quiz) {
      return "";
    }

    if (progress >= 90) {
      return ENCOURAGEMENT[3];
    }
    if (progress >= 50) {
      return ENCOURAGEMENT[2];
    }
    if (progress >= 25) {
      return ENCOURAGEMENT[1];
    }
    return ENCOURAGEMENT[0];
  }, [progress, quiz]);

  function setAnswer(update: Partial<AnswerState>) {
    if (!currentQuestion) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.quizQuestionId]: {
        ...prev[currentQuestion.quizQuestionId],
        ...update,
        questionId: currentQuestion.questionId,
        quizQuestionId: currentQuestion.quizQuestionId,
      },
    }));
  }

  function toggleOption(optionId: string) {
    if (!currentQuestion) {
      return;
    }

    const existing = answers[currentQuestion.quizQuestionId]?.selectedOptionIds ?? [];
    const isMulti = currentQuestion.type === "MULTI_SELECT";

    const next = isMulti
      ? existing.includes(optionId)
        ? existing.filter((id) => id !== optionId)
        : [...existing, optionId]
      : [optionId];

    setAnswer({ selectedOptionIds: next });
  }

  async function persistCurrentAnswer() {
    if (!currentQuestion) {
      return;
    }

    const answer = answers[currentQuestion.quizQuestionId];
    if (!answer) {
      return;
    }

    await fetch("/api/student/attempts/answer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        attemptId,
        quizQuestionId: currentQuestion.quizQuestionId,
        questionId: currentQuestion.questionId,
        selectedOptionIds: answer.selectedOptionIds,
        answerText: answer.answerText,
      }),
    });
  }

  function goNext() {
    startTransition(async () => {
      await persistCurrentAnswer();
      setCurrentIndex((prev) => Math.min(prev + 1, totalQuestions - 1));
    });
  }

  function goPrevious() {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
  }

  function toggleFlag() {
    if (!currentQuestion) {
      return;
    }

    const current = answers[currentQuestion.quizQuestionId];
    setAnswer({ flagged: !current?.flagged });
  }

  function jumpToQuestion(index: number) {
    setCurrentIndex(index);
  }

  function submitAttempt() {
    if (!quiz) {
      return;
    }
    setSubmitConfirmOpen(true);
  }

  function confirmSubmitAttempt() {
    if (!quiz) {
      return;
    }
    startTransition(async () => {
      if (currentQuestion) {
        await persistCurrentAnswer();
      }

      const payloadAnswers = quiz.questions.map((question) => {
        const answer = answers[question.quizQuestionId];
        return {
          quizQuestionId: question.quizQuestionId,
          questionId: question.questionId,
          selectedOptionIds: answer?.selectedOptionIds,
          answerText: answer?.answerText,
        };
      });

      const response = await fetch("/api/student/attempts/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId,
          answers: payloadAnswers,
          timeSpentSec: elapsedSec,
        }),
      });

      const body = (await response.json()) as {
        error?: string;
        processing?: boolean;
        attempt?: {
          status?: string;
        };
      };
      if (!response.ok) {
        setError(body.error ?? "Failed to submit quiz.");
        return;
      }

      setSubmitConfirmOpen(false);
      sessionStorage.removeItem(`attempt:${attemptId}`);
      const needsBackgroundReview = body.processing || body.attempt?.status === "SUBMITTED";
      router.push(needsBackgroundReview ? `/student/results/${attemptId}?processing=1` : `/student/results/${attemptId}`);
      router.refresh();
    });
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-[var(--danger-600)]">{error}</p>
        <div className="mt-3">
          <Button onClick={() => router.push("/student/quizzes")}>Back to Quizzes</Button>
        </div>
      </Card>
    );
  }

  if (!quiz || !currentQuestion) {
    return (
      <Card>
        <p className="text-sm text-[var(--ink-500)]">Loading quiz session...</p>
      </Card>
    );
  }

  const currentAnswer = answers[currentQuestion.quizQuestionId];
  const minutesLeft = quiz.timeLimitSec ? Math.max(0, quiz.timeLimitSec - elapsedSec) : null;

  return (
    <div className="space-y-4">
      <Card className="border-none bg-[linear-gradient(125deg,#0f766e_0%,#0ea5e9_48%,#2563eb_100%)] text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-white/80">Quiz Mode</p>
            <h2 className="text-xl font-black">{quiz.title}</h2>
            <p className="mt-1 text-sm text-white/90">{supportMessage}</p>
          </div>

          <div className="rounded-xl bg-white/20 px-3 py-2 text-right">
            <p className="text-xs text-white/80">{`Question ${currentIndex + 1} of ${totalQuestions}`}</p>
            {minutesLeft !== null ? (
              <p className="text-base font-bold">{formatTimer(minutesLeft)}</p>
            ) : (
              <p className="text-base font-bold">No timer</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <Progress value={progress} className="bg-white/20" />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--brand-600)]">{currentQuestion.topic}</p>
          <Button variant="ghost" size="sm" onClick={toggleFlag}>
            {currentAnswer?.flagged ? "Unflag" : "Flag for Review"}
          </Button>
        </div>

        <MarkdownContent content={currentQuestion.promptMarkdown} className="lesson-markdown text-[var(--ink-900)]" />

        {currentQuestion.hintMarkdown ? (
          <div className="mt-3 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-xs text-[var(--ink-600)]">
            Hint: {currentQuestion.hintMarkdown}
          </div>
        ) : null}

        {currentQuestion.type === "SHORT_ANSWER" ? (
          <MathTextEditor
            className="mt-4"
            label="Your Answer"
            value={currentAnswer?.answerText ?? ""}
            onChange={(nextValue) => setAnswer({ answerText: nextValue })}
            placeholder="Type your answer with text, formulas, or symbols..."
            minHeightClassName="min-h-32"
            showToolbar
            showUtilityControls
            previewDefaultOpen
          />
        ) : (
          <div className="mt-4 grid gap-2">
            {currentQuestion.options.map((option) => {
              const selected = (currentAnswer?.selectedOptionIds ?? []).includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-2xl border px-4 py-3 text-left text-base transition ${
                    selected
                      ? "border-[var(--brand-600)] bg-[var(--brand-500)] text-white"
                      : "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                  }`}
                  onClick={() => toggleOption(option.id)}
                >
                  <span className="font-bold">{option.label}.</span> {option.value}
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" onClick={goPrevious} disabled={currentIndex === 0 || pending}>
            Previous
          </Button>

          <div className="flex gap-2">
            {currentIndex < totalQuestions - 1 ? (
              <Button onClick={goNext} disabled={pending}>
                Next
              </Button>
            ) : (
              <Button onClick={submitAttempt} disabled={pending}>
                Submit Quiz
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-[var(--ink-700)]">Answer Navigator</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {quiz.questions.map((question, index) => {
            const answer = answers[question.quizQuestionId];
            const isCurrent = index === currentIndex;
            const isAnswered = Boolean(answer?.answerText?.trim() || (answer?.selectedOptionIds?.length ?? 0) > 0);
            const isFlagged = Boolean(answer?.flagged);

            return (
              <button
                key={question.quizQuestionId}
                type="button"
                onClick={() => jumpToQuestion(index)}
                className={`h-9 min-w-9 rounded-lg border px-2 text-xs font-bold transition ${
                  isCurrent
                    ? "border-[var(--brand-600)] bg-[var(--brand-500)] text-white"
                    : isFlagged
                      ? "border-[var(--warning-500)] bg-[var(--warning-100)] text-[var(--warning-700)]"
                      : isAnswered
                        ? "border-[var(--success-500)] bg-[var(--success-100)] text-[var(--success-700)]"
                        : "border-[var(--line-300)] bg-white text-[var(--ink-500)]"
                }`}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </Card>

      <Modal
        open={submitConfirmOpen}
        onClose={() => setSubmitConfirmOpen(false)}
        title="Submit Quiz"
        description="You will no longer be able to edit answers after submission."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            Are you sure you want to submit now?
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSubmitConfirmOpen(false)}>
              Continue Editing
            </Button>
            <Button onClick={confirmSubmitAttempt} disabled={pending}>
              Submit Quiz
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function formatTimer(totalSec: number) {
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
