"use client";

import { useMemo, useState, useTransition } from "react";
import { Archive, FilePenLine, Trash2, Upload } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { extractApiErrorMessage } from "@/lib/api-error";

type Quiz = {
  id: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  passingScore: number;
  timeLimitSec: number | null;
  maxAttempts: number;
  questionCount: number;
  lessonId: string | null;
  lessonTitle: string | null;
};

type QuestionOption = {
  id: string;
  promptMarkdown: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: string;
};

type QuizzesManagerProps = {
  initialQuizzes: Quiz[];
  questionBank: QuestionOption[];
  lessons: { id: string; title: string }[];
};

export function QuizzesManager({ initialQuizzes, questionBank, lessons }: QuizzesManagerProps) {
  const [quizzes, setQuizzes] = useState(initialQuizzes);
  const [search, setSearch] = useState("");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Quiz | null>(null);
  const [form, setForm] = useState({
    lessonId: "",
    title: "",
    description: "",
    instructions: "Answer each question carefully.",
    passingScore: "70",
    timeLimitSec: "900",
    maxAttempts: "3",
    randomizeQuestions: true,
    randomizeOptions: true,
    feedbackMode: "INSTANT",
    explanationMode: "AFTER_SUBMISSION",
  });

  const filteredQuizzes = useMemo(() => {
    const query = search.toLowerCase();
    return quizzes.filter((quiz) => {
      if (!query) {
        return true;
      }

      return quiz.title.toLowerCase().includes(query) || quiz.description.toLowerCase().includes(query);
    });
  }, [quizzes, search]);

  async function reload() {
    const response = await fetch(`/api/teacher/quizzes?search=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { quizzes: Quiz[] };
    setQuizzes(payload.quizzes);
  }

  function toggleQuestion(questionId: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId) ? prev.filter((id) => id !== questionId) : [...prev, questionId],
    );
  }

  function createQuiz() {
    startTransition(async () => {
      await fetch("/api/teacher/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: form.lessonId || undefined,
          title: form.title,
          description: form.description,
          instructions: form.instructions,
          passingScore: Number(form.passingScore),
          timeLimitSec: Number(form.timeLimitSec),
          maxAttempts: Number(form.maxAttempts),
          randomizeQuestions: form.randomizeQuestions,
          randomizeOptions: form.randomizeOptions,
          feedbackMode: form.feedbackMode,
          explanationMode: form.explanationMode,
          showAnswerKey: true,
          status: "DRAFT",
          questionAssignments: selectedQuestionIds.map((questionId, index) => ({
            questionId,
            position: index + 1,
            points: 1,
            isRequired: true,
          })),
        }),
      });

      setForm({
        lessonId: "",
        title: "",
        description: "",
        instructions: "Answer each question carefully.",
        passingScore: "70",
        timeLimitSec: "900",
        maxAttempts: "3",
        randomizeQuestions: true,
        randomizeOptions: true,
        feedbackMode: "INSTANT",
        explanationMode: "AFTER_SUBMISSION",
      });
      setSelectedQuestionIds([]);
      await reload();
    });
  }

  function setQuizStatus(quizId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, status }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;
        setError(extractApiErrorMessage(payload, "Unable to update quiz status."));
        return;
      }
      await reload();
    });
  }

  function deleteQuiz() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: deleteTarget.id, hardDelete: true }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to delete quiz."));
        return;
      }

      setDeleteTarget(null);
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </div>
      ) : null}
      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Create Quiz</h2>
        <p className="text-sm text-[var(--ink-500)]">Build quizzes from reusable question bank entries with publish controls.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.lessonId}
            onChange={(event) => setForm((prev) => ({ ...prev, lessonId: event.target.value }))}
          >
            <option value="">No linked lesson</option>
            {lessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id}>
                {lesson.title}
              </option>
            ))}
          </select>
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Quiz title"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Passing score"
            value={form.passingScore}
            onChange={(event) => setForm((prev) => ({ ...prev, passingScore: event.target.value }))}
          />
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Time limit (sec)"
            value={form.timeLimitSec}
            onChange={(event) => setForm((prev) => ({ ...prev, timeLimitSec: event.target.value }))}
          />
        </div>

        <textarea
          className="mt-3 min-h-20 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
          placeholder="Description"
          value={form.description}
          onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
        />

        <textarea
          className="mt-3 min-h-16 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
          placeholder="Instructions"
          value={form.instructions}
          onChange={(event) => setForm((prev) => ({ ...prev, instructions: event.target.value }))}
        />

        <div className="mt-4 grid gap-2 rounded-2xl border border-[var(--line-200)] p-3">
          <p className="text-sm font-semibold text-[var(--ink-800)]">Question Bank Selection</p>
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {questionBank.map((question) => {
              const selected = selectedQuestionIds.includes(question.id);
              return (
                <button
                  key={question.id}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                    selected
                      ? "border-[var(--brand-600)] bg-[var(--brand-500)] text-white"
                      : "border-[var(--line-200)] bg-white hover:bg-[var(--line-100)]"
                  }`}
                  onClick={() => toggleQuestion(question.id)}
                >
                  <p className={`line-clamp-2 font-medium ${selected ? "text-white" : "text-[var(--ink-800)]"}`}>{question.promptMarkdown}</p>
                  <p className={`mt-1 text-xs ${selected ? "text-white/90" : "text-[var(--ink-500)]"}`}>
                    {question.topic} • {question.difficulty} • {question.type}
                  </p>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--ink-500)]">Selected: {selectedQuestionIds.length} questions</p>
        </div>

        <div className="mt-4">
          <Button onClick={createQuiz} disabled={pending}>
            Save Quiz
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Quiz Management</h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              placeholder="Search quizzes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={reload}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredQuizzes.map((quiz) => (
            <div key={quiz.id} className="relative rounded-2xl border border-[var(--line-200)] bg-white p-4 pr-14">
              <ActionMenu
                className="absolute right-3 top-3"
                iconTrigger
                ariaLabel="Quiz actions"
                groups={[
                  {
                    items: [
                      {
                        label: "Set Draft",
                        icon: <FilePenLine className="h-4 w-4" />,
                        onSelect: () => setQuizStatus(quiz.id, "DRAFT"),
                      },
                      {
                        label: "Publish",
                        icon: <Upload className="h-4 w-4" />,
                        onSelect: () => setQuizStatus(quiz.id, "PUBLISHED"),
                      },
                    ],
                  },
                  {
                    items: [
                      {
                        label: "Archive",
                        icon: <Archive className="h-4 w-4" />,
                        tone: "danger",
                        onSelect: () => setQuizStatus(quiz.id, "ARCHIVED"),
                      },
                      {
                        label: "Delete",
                        icon: <Trash2 className="h-4 w-4" />,
                        tone: "danger",
                        onSelect: () => setDeleteTarget(quiz),
                      },
                    ],
                  },
                ]}
              />
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-base font-bold text-[var(--ink-900)]">{quiz.title}</h3>
                <Chip
                  className="mr-10"
                  tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "danger" : "warning"}
                >
                  {quiz.status}
                </Chip>
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-[var(--ink-600)]">{quiz.description}</p>
              <p className="mt-2 text-xs text-[var(--ink-500)]">
                {quiz.questionCount} questions • Pass {quiz.passingScore}% •{" "}
                {quiz.maxAttempts <= 0 ? "Unlimited attempts" : `Max ${quiz.maxAttempts} attempts`}
              </p>

            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Quiz"
        description="This permanently removes the quiz and related student attempts."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {deleteTarget ? (
              <>
                Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteQuiz} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Quiz
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
