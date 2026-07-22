"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Modal } from "@/components/ui/modal";
import { formatSeconds } from "@/lib/utils";

type AttemptAnswerReview = {
  id: string;
  quizQuestionId: string;
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  isCorrect: boolean | null;
  earnedPoints: number | null;
  maxPoints: number;
  feedback: string | null;
  gradedByAi: boolean;
  topicSnapshot: string | null;
  promptMarkdown: string;
  type: string;
  explanationMarkdown: string | null;
  options: {
    id: string;
    label: string;
    value: string;
    isCorrect: boolean;
    position: number;
  }[];
};

type AttemptReviewPayload = {
  id: string;
  quizId: string;
  studentId: string;
  studentName: string;
  attemptNumber: number;
  status: string;
  outcome: string;
  startedAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  timeSpentSec: number | null;
  scorePercent: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  passingScore: number;
  answers: AttemptAnswerReview[];
};

type QuizAttemptReviewProps = {
  lessonId: string;
  quizId: string;
  initialAttempt: AttemptReviewPayload;
  contextQuery?: string;
};

type ReviewAction = {
  answerId: string;
  markCorrect: boolean;
};

export function QuizAttemptReview({ lessonId, quizId, initialAttempt, contextQuery }: QuizAttemptReviewProps) {
  const [attempt, setAttempt] = useState(initialAttempt);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewAction, setReviewAction] = useState<ReviewAction | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedAnswer = useMemo(
    () => (reviewAction ? attempt.answers.find((answer) => answer.id === reviewAction.answerId) ?? null : null),
    [attempt.answers, reviewAction],
  );
  const withContext = (path: string) => (contextQuery ? `${path}?${contextQuery}` : path);

  function openReviewAction(action: ReviewAction) {
    const target = attempt.answers.find((answer) => answer.id === action.answerId);
    setReviewAction(action);
    setReviewNote(target?.feedback ?? "");
  }

  function closeReviewAction() {
    if (pending) {
      return;
    }
    setReviewAction(null);
    setReviewNote("");
  }

  function confirmReviewAction() {
    if (!reviewAction) {
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const response = await fetch("/api/teacher/quiz-attempts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: attempt.id,
          answerId: reviewAction.answerId,
          markCorrect: reviewAction.markCorrect,
          feedback: reviewNote.trim() || undefined,
        }),
      });

      let payload: { error?: string; attempt?: AttemptReviewPayload } = {};
      try {
        payload = (await response.json()) as { error?: string; attempt?: AttemptReviewPayload };
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.attempt) {
        setError(payload.error ?? "Unable to update answer review.");
        return;
      }

      setAttempt(payload.attempt);
      setSuccess(
        reviewAction.markCorrect
          ? "Answer marked correct. Attempt score was recalculated."
          : "Answer marked incorrect. Attempt score was recalculated.",
      );
      setReviewAction(null);
      setReviewNote("");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">Teacher Review</p>
            <h2 className="text-2xl font-black text-[var(--ink-900)]">{attempt.studentName}</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Attempt #{attempt.attemptNumber} • {attempt.outcome} • Score {attempt.scorePercent ?? 0}%
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}/submissions`)}
              className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-4 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--line-100)]"
            >
              Back to Submissions
            </Link>
            <Link
              href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}`)}
              className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--brand-500)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-600)]"
            >
              Back to Quiz
            </Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <Metric label="Correct" value={attempt.correctCount ?? 0} />
          <Metric label="Wrong" value={attempt.wrongCount ?? 0} />
          <Metric label="Pass Threshold" value={`${attempt.passingScore}%`} />
          <Metric label="Time Spent" value={formatSeconds(attempt.timeSpentSec)} />
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-[var(--success-500)] bg-[var(--success-100)] px-3 py-2 text-sm text-[var(--success-700)]">
          {success}
        </div>
      ) : null}

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Submitted Answers</h3>
        <p className="mt-1 text-sm text-[var(--ink-500)]">
          Review each answer and adjust grading when needed. Score updates immediately after confirmation.
        </p>

        <div className="mt-4 space-y-4">
          {attempt.answers.map((answer, index) => {
            const selectedOptions = answer.options.filter((option) => answer.selectedOptionIds.includes(option.id));
            const correctOptions = answer.options.filter((option) => option.isCorrect);
            const statusTone = answer.isCorrect === null ? "brand" : answer.isCorrect ? "success" : "warning";
            const statusLabel = answer.isCorrect === null ? "Pending AI" : answer.isCorrect ? "Correct" : "Incorrect";

            return (
              <div key={answer.id} className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink-900)]">Question {index + 1}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={statusTone}>{statusLabel}</Chip>
                    {answer.gradedByAi ? <Chip tone="brand">AI Graded</Chip> : null}
                    <Chip tone="neutral">
                      {Number(answer.earnedPoints ?? 0).toFixed(1)}/{Number(answer.maxPoints).toFixed(1)} pts
                    </Chip>
                  </div>
                </div>

                <div className="mt-3">
                  <MarkdownContent content={answer.promptMarkdown} className="lesson-markdown" />
                </div>

                <div className="mt-3 rounded-xl bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
                  {answer.type === "SHORT_ANSWER" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[var(--ink-800)]">Student answer</p>
                      {answer.answerText ? (
                        <MarkdownContent content={answer.answerText} className="lesson-markdown text-sm" />
                      ) : (
                        <p>No answer submitted</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p>
                        <strong>Student choice:</strong> {selectedOptions.map((option) => option.value).join(", ") || "No choice"}
                      </p>
                      <p>
                        <strong>Correct answer:</strong> {correctOptions.map((option) => option.value).join(", ")}
                      </p>
                    </div>
                  )}
                </div>

                {answer.feedback ? <p className="mt-2 text-sm text-[var(--ink-600)]">Feedback: {answer.feedback}</p> : null}
                {answer.explanationMarkdown ? (
                  <div className="mt-3 rounded-xl border border-[var(--line-200)] bg-white p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Explanation</p>
                    <MarkdownContent content={answer.explanationMarkdown} className="lesson-markdown text-sm" />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => openReviewAction({ answerId: answer.id, markCorrect: true })}
                    disabled={pending || answer.isCorrect === true || answer.isCorrect === null}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Mark Correct
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openReviewAction({ answerId: answer.id, markCorrect: false })}
                    disabled={pending || answer.isCorrect === false || answer.isCorrect === null}
                  >
                    <XCircle className="h-4 w-4" />
                    Mark Incorrect
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Modal
        open={Boolean(reviewAction)}
        onClose={closeReviewAction}
        title={reviewAction?.markCorrect ? "Mark Answer Correct" : "Mark Answer Incorrect"}
        description="This action updates the selected answer and recalculates the overall attempt score."
      >
        <div className="space-y-4">
          {selectedAnswer ? (
            <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
              <p>
                <strong>Current score:</strong>{" "}
                {Number(selectedAnswer.earnedPoints ?? 0).toFixed(1)}/{Number(selectedAnswer.maxPoints).toFixed(1)} points
              </p>
            </div>
          ) : null}

          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Review Note (optional)
            <textarea
              className="mt-1 min-h-24 w-full rounded-lg border border-[var(--line-300)] bg-white px-3 py-2 text-sm"
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Add a short note about this teacher adjustment."
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeReviewAction} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={confirmReviewAction} disabled={pending}>
              {pending ? "Updating..." : "Confirm and Recalculate"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-base font-bold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
