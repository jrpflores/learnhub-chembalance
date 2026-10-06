"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type StartQuizCardProps = {
  quizId: string;
  canAttempt: boolean;
  hasInProgress?: boolean;
};

export function StartQuizCard({ quizId, canAttempt, hasInProgress = false }: StartQuizCardProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onStart() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/student/attempts/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });

      const payload = (await response.json()) as {
        error?: string;
        attemptId?: string;
        quiz?: unknown;
      };

      if (!response.ok || !payload.attemptId || !payload.quiz) {
        setError(payload.error ?? "Unable to start quiz.");
        return;
      }

      sessionStorage.setItem(`attempt:${payload.attemptId}`, JSON.stringify(payload.quiz));
      router.push(`/student/quizzes/attempt/${payload.attemptId}`);
    });
  }

  const actionLabel = !canAttempt
    ? "No Attempts Remaining"
    : pending
      ? hasInProgress
        ? "Resuming Quiz..."
        : "Preparing Quiz..."
      : hasInProgress
        ? "Continue Quiz"
        : "Start Quiz";

  return (
    <div className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
      <h3 className="text-base font-bold text-[var(--ink-900)]">
        {hasInProgress ? "Continue your attempt" : "Ready to begin?"}
      </h3>
      <p className="mt-1 text-sm text-[var(--ink-600)]">
        {hasInProgress
          ? "You have an unfinished attempt. Continue it without using an extra attempt slot."
          : "You'll answer one question at a time with progress tracking and smooth transitions."}
      </p>

      {error ? <p className="mt-2 text-sm text-[var(--danger-600)]">{error}</p> : null}

      <div className="mt-3">
        <Button onClick={onStart} disabled={!canAttempt || pending}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
