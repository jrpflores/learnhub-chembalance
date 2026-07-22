"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";

type Question = {
  id: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type:
    | "MULTIPLE_CHOICE"
    | "TRUE_FALSE"
    | "SHORT_ANSWER"
    | "MULTI_SELECT"
    | "MATCHING"
    | "FILL_BLANK"
    | "SEQUENCING"
    | "IMAGE_BASED";
  promptMarkdown: string;
  options: { label: string; value: string; isCorrect: boolean }[];
};

type QuestionsManagerProps = {
  initialQuestions: Question[];
};

const PAGE_SIZE = 10;

export function QuestionsManager({ initialQuestions }: QuestionsManagerProps) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    subject: "Science",
    topic: "Chemistry",
    difficulty: "MEDIUM",
    type: "MULTIPLE_CHOICE",
    promptMarkdown: "",
    explanationMarkdown: "",
    referenceAnswer: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctOption: "A",
  });

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return questions.filter((question) => {
      if (!query) {
        return true;
      }

      return (
        question.promptMarkdown.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.topic.toLowerCase().includes(query)
      );
    });
  }, [questions, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  async function reloadQuestions() {
    const response = await fetch(`/api/teacher/questions?search=${encodeURIComponent(search)}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { questions: Question[] };
    setQuestions(payload.questions);
  }

  function createQuestion() {
    startTransition(async () => {
      const options =
        form.type === "SHORT_ANSWER"
          ? []
          : [form.optionA, form.optionB, form.optionC, form.optionD]
              .filter((value) => value.trim().length > 0)
              .map((value, index) => ({
                label: String.fromCharCode(65 + index),
                value,
                isCorrect: String.fromCharCode(65 + index) === form.correctOption,
              }));

      await fetch("/api/teacher/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject,
          topic: form.topic,
          difficulty: form.difficulty,
          type: form.type,
          promptMarkdown: form.promptMarkdown,
          explanationMarkdown: form.explanationMarkdown || undefined,
          referenceAnswer: form.type === "SHORT_ANSWER" ? form.referenceAnswer : undefined,
          gradingKeywords:
            form.type === "SHORT_ANSWER"
              ? form.referenceAnswer
                  .split(/[^a-zA-Z0-9]+/)
                  .filter(Boolean)
                  .slice(0, 8)
              : undefined,
          options,
        }),
      });

      setForm((prev) => ({
        ...prev,
        promptMarkdown: "",
        explanationMarkdown: "",
        referenceAnswer: "",
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
      }));

      await reloadQuestions();
    });
  }

  function duplicateQuestion(questionId: string) {
    startTransition(async () => {
      await fetch("/api/teacher/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "duplicate",
          questionId,
        }),
      });
      await reloadQuestions();
    });
  }

  function archiveQuestion(questionId: string) {
    startTransition(async () => {
      await fetch("/api/teacher/questions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      await reloadQuestions();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Create Question</h2>
        <p className="text-sm text-[var(--ink-500)]">Reusable question bank with difficulty, type, and topic classification.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.subject}
            onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
            placeholder="Subject"
          />
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.topic}
            onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
            placeholder="Topic"
          />
          <select
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.difficulty}
            onChange={(event) => setForm((prev) => ({ ...prev, difficulty: event.target.value }))}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
          <select
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.type}
            onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
          >
            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short Answer</option>
          </select>
        </div>

        <textarea
          className="mt-3 min-h-24 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
          placeholder="Question prompt"
          value={form.promptMarkdown}
          onChange={(event) => setForm((prev) => ({ ...prev, promptMarkdown: event.target.value }))}
        />

        <textarea
          className="mt-3 min-h-20 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
          placeholder="Explanation (optional)"
          value={form.explanationMarkdown}
          onChange={(event) => setForm((prev) => ({ ...prev, explanationMarkdown: event.target.value }))}
        />

        {form.type === "SHORT_ANSWER" ? (
          <input
            className="mt-3 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Reference answer"
            value={form.referenceAnswer}
            onChange={(event) => setForm((prev) => ({ ...prev, referenceAnswer: event.target.value }))}
          />
        ) : (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
              placeholder="Option A"
              value={form.optionA}
              onChange={(event) => setForm((prev) => ({ ...prev, optionA: event.target.value }))}
            />
            <input
              className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
              placeholder="Option B"
              value={form.optionB}
              onChange={(event) => setForm((prev) => ({ ...prev, optionB: event.target.value }))}
            />
            <input
              className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
              placeholder="Option C"
              value={form.optionC}
              onChange={(event) => setForm((prev) => ({ ...prev, optionC: event.target.value }))}
            />
            <input
              className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
              placeholder="Option D"
              value={form.optionD}
              onChange={(event) => setForm((prev) => ({ ...prev, optionD: event.target.value }))}
            />
            <select
              className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm sm:col-span-2"
              value={form.correctOption}
              onChange={(event) => setForm((prev) => ({ ...prev, correctOption: event.target.value }))}
            >
              <option value="A">Correct: A</option>
              <option value="B">Correct: B</option>
              <option value="C">Correct: C</option>
              <option value="D">Correct: D</option>
            </select>
          </div>
        )}

        <div className="mt-4">
          <Button onClick={createQuestion} disabled={pending}>
            Save Question
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Question Bank</h2>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              placeholder="Search questions"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Button variant="secondary" onClick={reloadQuestions}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {paginated.map((question) => (
            <div key={question.id} className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="brand">{question.subject}</Chip>
                  <Chip tone="neutral">{question.topic}</Chip>
                  <Chip tone={question.difficulty === "HARD" ? "danger" : question.difficulty === "MEDIUM" ? "warning" : "success"}>
                    {question.difficulty}
                  </Chip>
                  <Chip tone="neutral">{question.type}</Chip>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => duplicateQuestion(question.id)}>
                    Duplicate
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => archiveQuestion(question.id)}>
                    Archive
                  </Button>
                </div>
              </div>

              <p className="mt-3 text-sm font-semibold text-[var(--ink-900)]">{question.promptMarkdown}</p>
            </div>
          ))}
        </div>
        <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>
    </div>
  );
}
