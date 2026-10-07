"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3, Plus, Power, RefreshCw, Save, Trash2 } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

type Subject = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  lessonCount: number;
  quizCount: number;
  teacherCount: number;
};

type SubjectsManagerProps = {
  initialSubjects: Subject[];
};

type SubjectForm = {
  id?: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
};

const PAGE_SIZE = 12;

function toForm(subject?: Subject): SubjectForm {
  if (!subject) {
    return {
      name: "",
      code: "",
      description: "",
      isActive: true,
    };
  }

  return {
    id: subject.id,
    name: subject.name,
    code: subject.code,
    description: subject.description ?? "",
    isActive: subject.isActive,
  };
}

export function SubjectsManager({ initialSubjects }: SubjectsManagerProps) {
  const [subjects, setSubjects] = useState(initialSubjects);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [subjectForm, setSubjectForm] = useState<SubjectForm>(toForm());
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null);
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return subjects;
    }
    return subjects.filter((subject) => {
      return subject.name.toLowerCase().includes(query) || subject.code.toLowerCase().includes(query);
    });
  }, [search, subjects]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  async function reloadSubjects() {
    const response = await fetch("/api/admin/subjects?includeInactive=1", { cache: "no-store" });
    const payload = (await response.json()) as { subjects?: Subject[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load subjects.");
      return;
    }
    setSubjects(payload.subjects ?? []);
  }

  function openCreateSubject() {
    setError(null);
    setSubjectForm(toForm());
    setSubjectModalOpen(true);
  }

  function openEditSubject(subject: Subject) {
    setError(null);
    setSubjectForm(toForm(subject));
    setSubjectModalOpen(true);
  }

  function openDeleteSubject(subject: Subject) {
    setError(null);
    setDeleteTarget(subject);
  }

  function saveSubject() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/subjects", {
        method: subjectForm.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subjectForm.id,
          name: subjectForm.name,
          code: subjectForm.code,
          description: subjectForm.description || undefined,
          isActive: subjectForm.isActive,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to save subject.");
        return;
      }

      setSubjectModalOpen(false);
      await reloadSubjects();
    });
  }

  function setSubjectStatus(subject: Subject, isActive: boolean) {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/subjects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId: subject.id,
          isActive,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to update subject status.");
        return;
      }

      await reloadSubjects();
    });
  }

  function deleteSubject() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/subjects", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: deleteTarget.id }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to delete subject.");
        return;
      }

      setDeleteTarget(null);
      await reloadSubjects();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink-900)]">Subject Management</h2>
            <p className="text-sm text-[var(--ink-500)]">Manage subject catalog entries and publication state.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={reloadSubjects}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openCreateSubject}>
              <Plus className="h-4 w-4" />
              Add Subject
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <input
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[220px] sm:w-auto"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search subject"
          />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        {viewMode === "list" ? (
          <div className={tableScrollClassName}>
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Code</th>
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Lessons</th>
                  <th className="px-2 py-2 font-semibold">Quizzes</th>
                  <th className="px-2 py-2 font-semibold">Teachers</th>
                  <th className={stickyActionsThClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((subject) => (
                  <tr key={subject.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-semibold text-[var(--ink-700)]">{subject.code}</td>
                    <td className="px-2 py-2">
                      <p className="font-semibold text-[var(--ink-900)]">{subject.name}</p>
                      {subject.description ? <p className="text-xs text-[var(--ink-500)]">{subject.description}</p> : null}
                    </td>
                    <td className="px-2 py-2">
                      <Chip tone={subject.isActive ? "success" : "danger"}>
                        {subject.isActive ? "ACTIVE" : "INACTIVE"}
                      </Chip>
                    </td>
                    <td className="px-2 py-2">{subject.lessonCount}</td>
                    <td className="px-2 py-2">{subject.quizCount}</td>
                    <td className="px-2 py-2">{subject.teacherCount}</td>
                    <td className={stickyActionsTdClassName}>
                      <SubjectActions
                        subject={subject}
                        onEdit={openEditSubject}
                        onToggleStatus={setSubjectStatus}
                        onDelete={openDeleteSubject}
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paginated.map((subject) => (
              <div key={subject.id} className="relative rounded-xl border border-[var(--line-200)] bg-white p-4 pr-14">
                <SubjectActions
                  subject={subject}
                  onEdit={openEditSubject}
                  onToggleStatus={setSubjectStatus}
                  onDelete={openDeleteSubject}
                  className="absolute right-3 top-3"
                />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--brand-700)]">{subject.code}</p>
                    <h3 className="mt-1 text-base font-bold text-[var(--ink-900)]">{subject.name}</h3>
                  </div>
                  <Chip className="mr-10" tone={subject.isActive ? "success" : "danger"}>
                    {subject.isActive ? "ACTIVE" : "INACTIVE"}
                  </Chip>
                </div>
                {subject.description ? <p className="mt-2 text-sm text-[var(--ink-600)]">{subject.description}</p> : null}
                <p className="mt-2 text-xs text-[var(--ink-500)]">
                  Teachers: {subject.teacherCount} • Lessons: {subject.lessonCount} • Quizzes: {subject.quizCount}
                </p>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center text-sm text-[var(--ink-500)]">
            No subjects found for this filter.
          </div>
        ) : null}
        <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={subjectModalOpen}
        onClose={() => setSubjectModalOpen(false)}
        title={subjectForm.id ? "Edit Subject" : "Add Subject"}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Name
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={subjectForm.name}
              onChange={(event) => setSubjectForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Code
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm uppercase"
              value={subjectForm.code}
              onChange={(event) => setSubjectForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[90px] w-full rounded-lg border border-[var(--line-300)] px-3 py-2 text-sm"
              value={subjectForm.description}
              onChange={(event) => setSubjectForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-600)] md:col-span-2">
            <input
              type="checkbox"
              checked={subjectForm.isActive}
              onChange={(event) => setSubjectForm((prev) => ({ ...prev, isActive: event.target.checked }))}
            />
            Active
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setSubjectModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveSubject} disabled={pending}>
            <Save className="h-4 w-4" />
            Save Subject
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Subject"
        description="This action is permanent. Teacher and section assignments for this subject will be removed."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {deleteTarget ? (
              <>
                You are deleting <strong>{deleteTarget.name}</strong> ({deleteTarget.code}).
                Lessons stay in the system but lose this catalog link.
              </>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteSubject} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Subject
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SubjectActions({
  subject,
  onEdit,
  onToggleStatus,
  onDelete,
  className,
}: {
  subject: Subject;
  onEdit: (subject: Subject) => void;
  onToggleStatus: (subject: Subject, isActive: boolean) => void;
  onDelete: (subject: Subject) => void;
  className?: string;
}) {
  return (
    <ActionMenu
      className={className}
      iconTrigger
      ariaLabel="Subject actions"
      groups={[
        {
          items: [
            {
              label: "Edit",
              icon: <Edit3 className="h-4 w-4" />,
              onSelect: () => onEdit(subject),
            },
          ],
        },
        {
          items: [
            {
              label: subject.isActive ? "Disable" : "Enable",
              icon: <Power className="h-4 w-4" />,
              tone: subject.isActive ? "danger" : "default",
              onSelect: () => onToggleStatus(subject, !subject.isActive),
            },
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => onDelete(subject),
            },
          ],
        },
      ]}
    />
  );
}
