"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { OfflineAiBusyBanner } from "@/components/teacher/offline-ai-generation-status";
import { extractApiErrorMessage, extractGenerationConflictMessage } from "@/lib/api-error";

type SubjectLessonGenerationActionProps = {
  subjectId: string;
  subjectName: string;
  sectionId: string;
  sectionName: string;
  onQueuedRedirectHref?: string;
};

const MIN_PROMPT_LENGTH = 20;

export function SubjectLessonGenerationAction({
  subjectId,
  subjectName,
  sectionId,
  sectionName,
  onQueuedRedirectHref,
}: SubjectLessonGenerationActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    promptText: "",
    preferredTitle: "",
    preferredTopic: "",
    preferredDifficulty: "MEDIUM" as "" | "EASY" | "MEDIUM" | "HARD",
    preferredEstimatedMinutes: "20",
  });

  const promptLength = useMemo(() => form.promptText.trim().length, [form.promptText]);

  function resetForm() {
    setForm({
      promptText: "",
      preferredTitle: "",
      preferredTopic: "",
      preferredDifficulty: "MEDIUM",
      preferredEstimatedMinutes: "20",
    });
  }

  function closeModal() {
    setOpen(false);
    setError(null);
  }

  function queueLessonGeneration() {
    const promptText = form.promptText.trim();
    if (promptText.length < MIN_PROMPT_LENGTH) {
      setError(`Description must be at least ${MIN_PROMPT_LENGTH} characters.`);
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons/generation-jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-learnhub-toast-success": "Lesson generation queued in background.",
          "x-learnhub-toast-error": "Unable to queue lesson generation.",
        },
        body: JSON.stringify({
          subjectId,
          sectionId,
          promptText,
          preferredTitle: form.preferredTitle.trim() || undefined,
          preferredTopic: form.preferredTopic.trim() || undefined,
          preferredDifficulty: form.preferredDifficulty || undefined,
          preferredEstimatedMinutes: (() => {
            const raw = form.preferredEstimatedMinutes.trim();
            if (!raw) {
              return undefined;
            }
            const parsed = Number.parseInt(raw, 10);
            return Number.isFinite(parsed) ? parsed : undefined;
          })(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const message =
          response.status === 409
            ? extractGenerationConflictMessage(
                payload,
                "A lesson generation job is already queued or running for this section.",
                "Open the Background Jobs tab to track it.",
              )
            : extractApiErrorMessage(payload, "Unable to queue lesson generation.");
        setError(message);
        return;
      }

      resetForm();
      closeModal();
      if (onQueuedRedirectHref) {
        router.push(onQueuedRedirectHref);
        router.refresh();
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Generate Lesson
      </Button>

      <Modal
        open={open}
        onClose={closeModal}
        title="Generate Lesson"
        description="Describe the lesson you want. Offline AI builds a draft in the background—often 1–3 minutes on CPU once the worker starts."
      >
        <div className="space-y-4">
          {pending ? <OfflineAiBusyBanner phase="queue-lesson-job" /> : null}
          <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
            Subject: <span className="font-semibold text-[var(--ink-900)]">{subjectName}</span>
            <span className="mx-1 text-[var(--ink-400)]">•</span>
            Section: <span className="font-semibold text-[var(--ink-900)]">{sectionName}</span>
          </div>

          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Lesson description
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-lg border border-[var(--line-300)] px-3 py-2 text-sm"
              placeholder="Example: Create a lesson explaining balancing chemical equations with step-by-step examples and a short practice section."
              value={form.promptText}
              onChange={(event) => setForm((prev) => ({ ...prev, promptText: event.target.value }))}
            />
            <span className="mt-1 block text-xs text-[var(--ink-500)]">
              {promptLength}/{MIN_PROMPT_LENGTH} minimum characters
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Preferred title (optional)
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.preferredTitle}
                onChange={(event) => setForm((prev) => ({ ...prev, preferredTitle: event.target.value }))}
                placeholder="Balancing Chemical Equations"
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Topic (optional)
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.preferredTopic}
                onChange={(event) => setForm((prev) => ({ ...prev, preferredTopic: event.target.value }))}
                placeholder="Chemical Reactions"
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Difficulty
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.preferredDifficulty}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    preferredDifficulty: event.target.value as typeof prev.preferredDifficulty,
                  }))
                }
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Estimated minutes
              <input
                type="number"
                min={5}
                max={300}
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.preferredEstimatedMinutes}
                onChange={(event) => setForm((prev) => ({ ...prev, preferredEstimatedMinutes: event.target.value }))}
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-lg border border-[var(--danger-200)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="button" onClick={queueLessonGeneration} disabled={pending}>
              {pending ? "Queueing..." : "Queue Background Generation"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
