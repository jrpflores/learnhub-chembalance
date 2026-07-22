"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3, FlaskConical, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination-controls";

type Equation = {
  id: string;
  title: string;
  formula: string;
  balancedFormula: string | null;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
  subjectId: string | null;
  subjectName: string | null;
  hints: string[];
  explanationMarkdown: string | null;
  tags: string[];
  isArchived: boolean;
};

type SubjectOption = {
  id: string;
  name: string;
  code: string;
};

type EquationLibraryManagerProps = {
  title: string;
  description: string;
  initialEquations: Equation[];
  subjects: SubjectOption[];
  apiBasePath: "/api/teacher/equations" | "/api/admin/equations";
};

type EquationForm = {
  id?: string;
  title: string;
  formula: string;
  balancedFormula: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  topic: string;
  subjectId: string;
  hints: string;
  explanationMarkdown: string;
  tags: string;
  isArchived: boolean;
};

const PAGE_SIZE = 12;

function toForm(equation?: Equation): EquationForm {
  if (!equation) {
    return {
      title: "",
      formula: "",
      balancedFormula: "",
      difficulty: "MEDIUM",
      topic: "",
      subjectId: "",
      hints: "",
      explanationMarkdown: "",
      tags: "",
      isArchived: false,
    };
  }

  return {
    id: equation.id,
    title: equation.title,
    formula: equation.formula,
    balancedFormula: equation.balancedFormula ?? "",
    difficulty: equation.difficulty,
    topic: equation.topic,
    subjectId: equation.subjectId ?? "",
    hints: equation.hints.join(", "),
    explanationMarkdown: equation.explanationMarkdown ?? "",
    tags: equation.tags.join(", "),
    isArchived: equation.isArchived,
  };
}

export function EquationLibraryManager({
  title,
  description,
  initialEquations,
  subjects,
  apiBasePath,
}: EquationLibraryManagerProps) {
  const [equations, setEquations] = useState(initialEquations);
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<EquationForm>(toForm());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return equations.filter((equation) => {
      if (!includeArchived && equation.isArchived) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        equation.title.toLowerCase().includes(query) ||
        equation.topic.toLowerCase().includes(query) ||
        equation.formula.toLowerCase().includes(query)
      );
    });
  }, [equations, includeArchived, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  async function reload() {
    const response = await fetch(`${apiBasePath}?includeArchived=${includeArchived ? "1" : "0"}`, { cache: "no-store" });
    const payload = (await response.json()) as { equations?: Equation[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load equations.");
      return;
    }
    setEquations(payload.equations ?? []);
  }

  function openCreate() {
    setError(null);
    setForm(toForm());
    setModalOpen(true);
  }

  function openEdit(equation: Equation) {
    setError(null);
    setForm(toForm(equation));
    setModalOpen(true);
  }

  function saveEquation() {
    setError(null);
    startTransition(async () => {
      const method = form.id ? "PATCH" : "POST";
      const body = {
        equationId: form.id,
        title: form.title,
        formula: form.formula,
        balancedFormula: form.balancedFormula || undefined,
        difficulty: form.difficulty,
        topic: form.topic,
        subjectId: form.subjectId || undefined,
        hints: form.hints
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        explanationMarkdown: form.explanationMarkdown || undefined,
        tags: form.tags
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        isArchived: form.isArchived,
      };

      const response = await fetch(apiBasePath, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to save equation.");
        return;
      }

      setModalOpen(false);
      setForm(toForm());
      await reload();
    });
  }

  function toggleArchive(equation: Equation) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(apiBasePath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equationId: equation.id,
          isArchived: !equation.isArchived,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to update equation status.");
        return;
      }

      await reload();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink-900)]">{title}</h2>
            <p className="text-sm text-[var(--ink-500)]">{description}</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add Equation
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[230px] sm:w-auto"
              placeholder="Search equation, topic, formula"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-600)]">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(event) => {
                  setIncludeArchived(event.target.checked);
                  setPage(1);
                }}
              />
              Show archived
            </label>
          </div>
          <Button variant="secondary" onClick={reload}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {paginated.map((equation) => (
            <div key={equation.id} className="rounded-xl border border-[var(--line-200)] bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-bold text-[var(--ink-900)]">{equation.title}</h3>
                <Chip tone={equation.isArchived ? "danger" : "success"}>
                  {equation.isArchived ? "ARCHIVED" : "ACTIVE"}
                </Chip>
              </div>
              <p className="mt-2 font-mono text-sm text-[var(--ink-800)]">{equation.formula}</p>
              {equation.balancedFormula ? (
                <p className="mt-1 text-xs text-[var(--ink-500)]">Balanced: {equation.balancedFormula}</p>
              ) : null}
              <p className="mt-1 text-xs text-[var(--ink-500)]">
                {equation.subjectName ?? "General"} • {equation.topic} • {equation.difficulty}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => openEdit(equation)}>
                  <Edit3 className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant={equation.isArchived ? "secondary" : "danger"}
                  onClick={() => toggleArchive(equation)}
                  disabled={pending}
                >
                  {equation.isArchived ? "Restore" : "Archive"}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center text-sm text-[var(--ink-500)]">
            No equations yet. Add your first chemistry equation to build the reusable library.
          </div>
        ) : null}
        <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Edit Chemical Equation" : "Add Chemical Equation"}
        description="Store reusable equations for practice, quizzes, and AI-guided hints."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Title
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Combustion of methane"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Subject
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.subjectId}
              onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))}
            >
              <option value="">General</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Formula
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 font-mono text-sm"
              value={form.formula}
              onChange={(event) => setForm((prev) => ({ ...prev, formula: event.target.value }))}
              placeholder="CH4 + O2 -> CO2 + H2O"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Balanced Formula (optional)
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 font-mono text-sm"
              value={form.balancedFormula}
              onChange={(event) => setForm((prev) => ({ ...prev, balancedFormula: event.target.value }))}
              placeholder="CH4 + 2O2 -> CO2 + 2H2O"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Topic
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.topic}
              onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))}
              placeholder="Balancing Equations"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Difficulty
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.difficulty}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, difficulty: event.target.value as "EASY" | "MEDIUM" | "HARD" }))
              }
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Hints (comma separated)
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.hints}
              onChange={(event) => setForm((prev) => ({ ...prev, hints: event.target.value }))}
              placeholder="Balance oxygen last, use smallest whole numbers"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Tags (comma separated)
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.tags}
              onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))}
              placeholder="chemistry, stoichiometry"
            />
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Explanation (optional)
            <textarea
              className="mt-1 min-h-[96px] w-full rounded-lg border border-[var(--line-300)] px-3 py-2 text-sm"
              value={form.explanationMarkdown}
              onChange={(event) => setForm((prev) => ({ ...prev, explanationMarkdown: event.target.value }))}
              placeholder="Explain balancing strategy step-by-step."
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-600)] md:col-span-2">
            <input
              type="checkbox"
              checked={form.isArchived}
              onChange={(event) => setForm((prev) => ({ ...prev, isArchived: event.target.checked }))}
            />
            Archived
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveEquation} disabled={pending}>
            <FlaskConical className="h-4 w-4" />
            Save Equation
          </Button>
        </div>
      </Modal>
    </div>
  );
}
