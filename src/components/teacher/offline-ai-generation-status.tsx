"use client";

import { Loader2 } from "lucide-react";

export const OFFLINE_AI_CPU_WAIT_HINT =
  "Offline AI on CPU often needs 1–3 minutes (sometimes longer for big lessons). The page is working—please keep this tab open for Preview.";

export type OfflineAiBusyPhase =
  | "preview-questions"
  | "save-questions"
  | "queue-quiz-job"
  | "queue-lesson-job"
  | "job-pending"
  | "job-processing";

const PHASE_COPY: Record<OfflineAiBusyPhase, { title: string; detail: string }> = {
  "preview-questions": {
    title: "Generating question preview with offline AI…",
    detail: OFFLINE_AI_CPU_WAIT_HINT,
  },
  "save-questions": {
    title: "Saving preview questions to the quiz…",
    detail: "This should finish in a few seconds.",
  },
  "queue-quiz-job": {
    title: "Queueing quiz generation job…",
    detail: "You can close this dialog once queueing completes. Generation continues in the background.",
  },
  "queue-lesson-job": {
    title: "Queueing lesson generation job…",
    detail: "Track progress on the Background Jobs tab. Draft creation usually takes 1–3 minutes on CPU once the worker starts.",
  },
  "job-pending": {
    title: "Waiting for the background worker…",
    detail: "If this stays pending for more than a minute, confirm the LearnHub worker is running and Ollama is healthy (/api/health).",
  },
  "job-processing": {
    title: "Offline AI is generating content…",
    detail:
      "Offline AI on CPU often needs 1–3 minutes (sometimes longer for big lessons). Status refreshes every few seconds—this is normal.",
  },
};

type OfflineAiBusyBannerProps = {
  phase: OfflineAiBusyPhase;
  className?: string;
};

export function OfflineAiBusyBanner({ phase, className = "" }: OfflineAiBusyBannerProps) {
  const copy = PHASE_COPY[phase];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-xl border border-[var(--brand-300)] bg-[var(--brand-100)] px-3 py-3 text-sm text-[var(--ink-800)] ${className}`.trim()}
    >
      <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-[var(--brand-700)]" aria-hidden />
      <div className="space-y-1">
        <p className="font-semibold text-[var(--ink-900)]">{copy.title}</p>
        <p className="text-xs leading-relaxed text-[var(--ink-600)]">{copy.detail}</p>
      </div>
    </div>
  );
}

export function offlineAiJobBusyPhase(status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"): OfflineAiBusyPhase | null {
  if (status === "PROCESSING") {
    return "job-processing";
  }
  if (status === "PENDING") {
    return "job-pending";
  }
  return null;
}
