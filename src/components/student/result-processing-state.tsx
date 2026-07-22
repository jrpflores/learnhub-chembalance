"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatTime } from "@/lib/date-display";

type AiJobStats = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
};

type ResultProcessingStateProps = {
  attemptId: string;
  quizTitle: string;
  initialAiJobs: AiJobStats | null;
};

export function ResultProcessingState({ attemptId, quizTitle, initialAiJobs }: ResultProcessingStateProps) {
  const router = useRouter();
  const [aiJobs, setAiJobs] = useState<AiJobStats | null>(initialAiJobs);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const progressValue = useMemo(() => {
    if (!aiJobs || aiJobs.total <= 0) {
      return 15;
    }
    const processed = aiJobs.completed + aiJobs.failed;
    return Math.max(10, Math.min(100, Math.round((processed / aiJobs.total) * 100)));
  }, [aiJobs]);

  async function checkStatus() {
    setChecking(true);
    setError(null);
    try {
      const response = await fetch(`/api/student/attempts/status?attemptId=${encodeURIComponent(attemptId)}`, {
        cache: "no-store",
        headers: {
          "x-learnhub-toast-silent": "1",
        },
      });
      const payload = (await response.json()) as {
        error?: string;
        attempt?: { status?: string };
        aiJobs?: AiJobStats | null;
      };

      if (!response.ok) {
        setError(payload.error ?? "Unable to check grading status right now.");
        return;
      }

      setAiJobs(payload.aiJobs ?? null);
      setLastCheckedAt(new Date().toISOString());

      if (payload.attempt?.status === "GRADED") {
        router.replace(`/student/results/${attemptId}`);
        router.refresh();
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Unable to check grading status right now.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      void checkStatus();
    }, 4000);
    void checkStatus();

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId]);

  return (
    <div className="space-y-4">
      <Card className="border-[var(--brand-300)] bg-[var(--brand-100)]">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-700)]">Submission Received</p>
        <h2 className="mt-1 text-2xl font-black text-[var(--ink-900)]">{quizTitle}</h2>
        <p className="mt-2 text-sm text-[var(--ink-700)]">
          Your short-answer responses are being checked by the offline AI grader in the background.
        </p>
        <p className="mt-1 text-sm text-[var(--ink-600)]">
          You can stay here and wait, or open other pages and return to Results anytime.
        </p>

        <div className="mt-4 rounded-xl border border-[var(--line-200)] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ink-800)]">Grading progress</p>
            {checking ? <Loader2 className="h-4 w-4 animate-spin text-[var(--brand-700)]" /> : null}
          </div>
          <div className="mt-2">
            <Progress value={progressValue} />
          </div>
          <p className="mt-2 text-xs text-[var(--ink-600)]">
            {aiJobs ? (
              <>
                Jobs processed: {aiJobs.completed + aiJobs.failed}/{aiJobs.total}
              </>
            ) : (
              "Preparing grading jobs..."
            )}
          </p>
          {lastCheckedAt ? <p className="mt-1 text-xs text-[var(--ink-500)]">Last checked: {formatTime(lastCheckedAt)}</p> : null}
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-[var(--line-200)] bg-white p-3 text-sm text-[var(--ink-700)]">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[var(--success-600)]" />
            Answers submitted successfully.
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--brand-500)]" />
            Offline AI is evaluating short-answer responses.
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--line-400)]" />
            Final score will appear automatically once grading is done.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void checkStatus()} disabled={checking}>
            {checking ? "Checking..." : "Check Status Now"}
          </Button>
          <Link
            href="/student/results"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-4 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
          >
            Go to Results History
          </Link>
          <Link
            href="/student/quizzes"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-4 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
          >
            Back to Quizzes
          </Link>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
