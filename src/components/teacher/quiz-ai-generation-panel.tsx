"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { OfflineAiBusyBanner, type OfflineAiBusyPhase } from "@/components/teacher/offline-ai-generation-status";
import { extractApiErrorMessage, extractGenerationConflictMessage } from "@/lib/api-error";

type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

type PreviewQuestion = {
  questionText: string;
  questionType: QuestionType;
  choices: string[];
  correctAnswer: string;
  explanation: string;
};

const GENERATION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
];

const MAX_AI_GENERATED_QUESTIONS = 10;

function sanitizeGenerationCount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.max(1, Math.min(parsed, MAX_AI_GENERATED_QUESTIONS));
}

type QuizAiGenerationPanelProps = {
  lessonId: string;
  quizId: string;
  conflictTrackingHint?: string;
  onQueued: () => void;
  onSaved: () => void;
};

function InputField(props: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--ink-700)]">
      {props.label}
      <input
        type={props.type ?? "text"}
        value={props.value}
        min={props.min}
        max={props.max}
        onChange={(event) => props.onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
      />
      {props.hint ? <span className="mt-1 block text-xs font-normal text-[var(--ink-500)]">{props.hint}</span> : null}
    </label>
  );
}

export function QuizAiGenerationPanel({
  lessonId,
  quizId,
  conflictTrackingHint,
  onQueued,
  onSaved,
}: QuizAiGenerationPanelProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [generationCount, setGenerationCount] = useState("3");
  const [generationTypes, setGenerationTypes] = useState<QuestionType[]>([
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
  ]);
  const [previewQuestions, setPreviewQuestions] = useState<PreviewQuestion[]>([]);
  const [previewStale, setPreviewStale] = useState(false);
  const [busyPhase, setBusyPhase] = useState<OfflineAiBusyPhase | null>(null);

  useEffect(() => {
    setPreviewQuestions([]);
    setPreviewStale(false);
  }, [quizId]);

  function markPreviewStale() {
    if (previewQuestions.length > 0) {
      setPreviewStale(true);
    }
  }

  function runPreview() {
    const sanitizedCount = sanitizeGenerationCount(generationCount);
    const sanitizedTypes = generationTypes.length > 0 ? generationTypes : (["MULTIPLE_CHOICE"] as QuestionType[]);
    setGenerationCount(String(sanitizedCount));
    setGenerationTypes(sanitizedTypes);
    setError(null);
    setPreviewStale(false);
    setBusyPhase("preview-questions");

    startTransition(async () => {
      try {
      const response = await fetch("/api/teacher/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          lessonId,
          quizId,
          questionCount: sanitizedCount,
          questionTypes: sanitizedTypes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to preview generated questions."));
        return;
      }

      const questions = Array.isArray(payload?.questions) ? (payload.questions as PreviewQuestion[]) : [];
      if (questions.length === 0) {
        setError("Preview returned no questions. Adjust settings and try again.");
        setPreviewQuestions([]);
        return;
      }

      setPreviewQuestions(questions);
      } finally {
        setBusyPhase(null);
      }
    });
  }

  function savePreviewToQuiz() {
    if (previewQuestions.length === 0 || previewStale) {
      setError(previewStale ? "Settings changed since preview. Run Preview again before saving." : "Preview questions first.");
      return;
    }

    setError(null);
    setBusyPhase("save-questions");
    startTransition(async () => {
      try {
      const response = await fetch("/api/teacher/quizzes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          lessonId,
          quizId,
          questions: previewQuestions,
        }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to save generated questions."));
        return;
      }

      setPreviewQuestions([]);
      setPreviewStale(false);
      onSaved();
      } finally {
        setBusyPhase(null);
      }
    });
  }

  function queueGenerationJob() {
    const sanitizedCount = sanitizeGenerationCount(generationCount);
    const sanitizedTypes = generationTypes.length > 0 ? generationTypes : (["MULTIPLE_CHOICE"] as QuestionType[]);
    setGenerationCount(String(sanitizedCount));
    setGenerationTypes(sanitizedTypes);
    setError(null);
    setBusyPhase("queue-quiz-job");

    startTransition(async () => {
      try {
      const response = await fetch("/api/teacher/quizzes/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId,
          quizId,
          questionCount: sanitizedCount,
          questionTypes: sanitizedTypes,
        }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const message =
          response.status === 409
            ? extractGenerationConflictMessage(
                payload,
                "A generation job is already queued or running for this quiz.",
                conflictTrackingHint,
              )
            : extractApiErrorMessage(payload, "Unable to queue generation job.");
        setError(message);
        return;
      }

      setPreviewQuestions([]);
      setPreviewStale(false);
      onQueued();
      } finally {
        setBusyPhase(null);
      }
    });
  }

  const busy = pending || busyPhase !== null;

  return (
    <div className="space-y-4">
      {busyPhase ? <OfflineAiBusyBanner phase={busyPhase} /> : null}

      {error ? (
        <p className="rounded-xl border border-[var(--danger-200)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </p>
      ) : null}

      <InputField
        label="Question Count"
        type="number"
        value={generationCount}
        onChange={(value) => {
          setGenerationCount(value);
          markPreviewStale();
        }}
        min={1}
        max={MAX_AI_GENERATED_QUESTIONS}
        hint={`Max ${MAX_AI_GENERATED_QUESTIONS} questions per generation.`}
      />

      <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Question Types</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENERATION_TYPE_OPTIONS.map((option) => {
            const selected = generationTypes.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setGenerationTypes((prev) =>
                    prev.includes(option.value) ? prev.filter((item) => item !== option.value) : [...prev, option.value],
                  );
                  markPreviewStale();
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                  selected
                    ? "border-[var(--brand-600)] bg-[var(--brand-500)] text-white"
                    : "border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--ink-500)]">
          Preview waits on offline AI in this dialog (often 1–3 minutes on CPU). Queue keeps working after you leave.
        </p>
      </div>

      {previewQuestions.length > 0 ? (
        <div className="space-y-2 rounded-xl border border-[var(--line-200)] bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ink-800)]">
              Preview ({previewQuestions.length} question{previewQuestions.length === 1 ? "" : "s"})
            </p>
            {previewStale ? (
              <span className="text-xs font-semibold text-[var(--warning-700)]">Out of date — preview again</span>
            ) : null}
          </div>
          <ol className="max-h-64 space-y-3 overflow-y-auto text-sm">
            {previewQuestions.map((question, index) => (
              <li key={`${index}-${question.questionText.slice(0, 24)}`} className="rounded-lg border border-[var(--line-100)] p-2">
                <p className="text-xs font-semibold uppercase text-[var(--ink-500)]">
                  Q{index + 1} · {question.questionType.replaceAll("_", " ")}
                </p>
                <MarkdownContent content={question.questionText} className="mt-1 text-[var(--ink-800)]" />
                <p className="mt-1 text-xs text-[var(--ink-600)]">
                  Answer: <span className="font-semibold">{question.correctAnswer}</span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={runPreview} disabled={generationTypes.length === 0 || busy}>
          {busyPhase === "preview-questions" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Previewing…
            </>
          ) : (
            "Preview"
          )}
        </Button>
        <Button
          variant="secondary"
          onClick={savePreviewToQuiz}
          disabled={previewQuestions.length === 0 || previewStale || busy}
        >
          {busyPhase === "save-questions" ? "Saving…" : "Add preview to quiz"}
        </Button>
        <Button onClick={queueGenerationJob} disabled={generationTypes.length === 0 || busy}>
          {busyPhase === "queue-quiz-job" ? "Queueing…" : "Queue in background"}
        </Button>
      </div>
    </div>
  );
}
