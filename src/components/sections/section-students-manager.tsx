"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, UserMinus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";

type StudentOption = {
  id: string;
  fullName: string;
  email: string;
  isActive?: boolean;
};

type SectionStudentsManagerProps = {
  role: "ADMIN" | "TEACHER";
  section: {
    id: string;
    name: string;
    gradeLevel: string;
    schoolYear: string;
    status: "ACTIVE" | "ARCHIVED";
    subjectName: string | null;
  };
  initialAssignedStudentIds: string[];
  availableStudents: StudentOption[];
  backHref: string;
};

const ASSIGNED_PAGE_SIZE = 12;
const AVAILABLE_PAGE_SIZE = 12;

async function readJsonSafe(response: Response) {
  const text = await response.text();
  if (!text.trim()) {
    return {} as Record<string, unknown>;
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

export function SectionStudentsManager({
  role,
  section,
  initialAssignedStudentIds,
  availableStudents,
  backHref,
}: SectionStudentsManagerProps) {
  const canManageRoster = role === "ADMIN";
  const [assignedIds, setAssignedIds] = useState<string[]>(Array.from(new Set(initialAssignedStudentIds)));
  const [search, setSearch] = useState("");
  const [assignedPage, setAssignedPage] = useState(1);
  const [availablePage, setAvailablePage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const studentMap = useMemo(() => {
    const entries = new Map<string, StudentOption>();
    availableStudents.forEach((student) => entries.set(student.id, student));
    return entries;
  }, [availableStudents]);

  const query = search.trim().toLowerCase();

  const assignedStudents = useMemo(() => {
    return assignedIds
      .map((studentId) => studentMap.get(studentId))
      .filter((student): student is StudentOption => Boolean(student))
      .filter((student) => {
        if (!query) {
          return true;
        }
        return student.fullName.toLowerCase().includes(query) || student.email.toLowerCase().includes(query);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [assignedIds, query, studentMap]);

  const availablePool = useMemo(() => {
    const assigned = new Set(assignedIds);
    return availableStudents
      .filter((student) => !assigned.has(student.id))
      .filter((student) => {
        if (!query) {
          return true;
        }
        return student.fullName.toLowerCase().includes(query) || student.email.toLowerCase().includes(query);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [assignedIds, availableStudents, query]);

  const hasChanges = useMemo(() => {
    const current = [...assignedIds].sort();
    const initial = [...initialAssignedStudentIds].sort();
    if (current.length !== initial.length) {
      return true;
    }
    return current.some((studentId, index) => studentId !== initial[index]);
  }, [assignedIds, initialAssignedStudentIds]);

  const assignedPageCount = Math.max(1, Math.ceil(assignedStudents.length / ASSIGNED_PAGE_SIZE));
  const safeAssignedPage = Math.min(assignedPage, assignedPageCount);
  const paginatedAssignedStudents = useMemo(() => {
    const start = (safeAssignedPage - 1) * ASSIGNED_PAGE_SIZE;
    return assignedStudents.slice(start, start + ASSIGNED_PAGE_SIZE);
  }, [assignedStudents, safeAssignedPage]);

  const availablePageCount = Math.max(1, Math.ceil(availablePool.length / AVAILABLE_PAGE_SIZE));
  const safeAvailablePage = Math.min(availablePage, availablePageCount);
  const paginatedAvailablePool = useMemo(() => {
    const start = (safeAvailablePage - 1) * AVAILABLE_PAGE_SIZE;
    return availablePool.slice(start, start + AVAILABLE_PAGE_SIZE);
  }, [availablePool, safeAvailablePage]);

  function addStudent(studentId: string) {
    setAssignedIds((prev) => (prev.includes(studentId) ? prev : [...prev, studentId]));
    setSuccess(null);
  }

  function removeStudent(studentId: string) {
    setAssignedIds((prev) => prev.filter((id) => id !== studentId));
    setSuccess(null);
  }

  function saveChanges() {
    if (!canManageRoster) {
      setError("Only admin can update section membership.");
      return;
    }

    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const payload = { sectionId: section.id, studentIds: assignedIds };

      const response = await fetch("/api/admin/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = await readJsonSafe(response);
      if (!response.ok) {
        setError((body.error as string) ?? "Unable to update section students.");
        return;
      }

      setSuccess("Section students updated.");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-700)]">Section Students</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--ink-900)]">{section.name}</h2>
            <p className="mt-1 text-sm text-[var(--ink-500)]">
              {section.gradeLevel} • SY {section.schoolYear}
              {section.subjectName ? ` • ${section.subjectName}` : ""}
            </p>
          </div>
          <Link
            href={backHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-300)] bg-white px-4 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Sections
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Chip tone={section.status === "ACTIVE" ? "success" : "warning"}>{section.status}</Chip>
          <Chip tone="brand">Assigned: {assignedIds.length}</Chip>
          {canManageRoster ? (
            <Chip tone="neutral">Available: {Math.max(availableStudents.length - assignedIds.length, 0)}</Chip>
          ) : null}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[260px] sm:w-auto"
            placeholder="Search students"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setAssignedPage(1);
              setAvailablePage(1);
            }}
          />
          {canManageRoster ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => setAssignedIds(Array.from(new Set(initialAssignedStudentIds)))}
                disabled={pending}
              >
                Reset
              </Button>
              <Button onClick={saveChanges} disabled={pending || !hasChanges}>
                {pending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          ) : null}
        </div>
        {!canManageRoster ? (
          <div className="mt-3 rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
            Read-only: only admins can add or remove students in a section.
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="mt-3 rounded-xl border border-[var(--success-500)] bg-[var(--success-100)] px-3 py-2 text-sm text-[var(--success-700)]">
            {success}
          </div>
        ) : null}

        <div className={`mt-4 grid gap-4 ${canManageRoster ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
          <div className="rounded-xl border border-[var(--line-200)] p-3">
            <h3 className="text-sm font-bold text-[var(--ink-900)]">Students in Section</h3>
            <p className="mt-1 text-xs text-[var(--ink-500)]">
              {canManageRoster ? "Remove students from this section roster." : "Current section roster."}
            </p>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {paginatedAssignedStudents.map((student) => (
                <div
                  key={`assigned-${student.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-200)] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[var(--ink-900)]">{student.fullName}</p>
                    <p className="truncate text-xs text-[var(--ink-500)]">{student.email}</p>
                  </div>
                  {canManageRoster ? (
                    <Button size="sm" variant="danger" onClick={() => removeStudent(student.id)} disabled={pending}>
                      <UserMinus className="h-4 w-4" />
                      Remove
                    </Button>
                  ) : null}
                </div>
              ))}
              {assignedStudents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-xs text-[var(--ink-500)]">
                  No assigned students found.
                </p>
              ) : null}
            </div>
            <PaginationControls
              page={safeAssignedPage}
              pageSize={ASSIGNED_PAGE_SIZE}
              total={assignedStudents.length}
              onPageChange={setAssignedPage}
            />
          </div>

          {canManageRoster ? (
            <div className="rounded-xl border border-[var(--line-200)] p-3">
              <h3 className="text-sm font-bold text-[var(--ink-900)]">Available Students</h3>
              <p className="mt-1 text-xs text-[var(--ink-500)]">
                Only unassigned students shown. Each student can belong to one section.
              </p>
              <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                {paginatedAvailablePool.map((student) => (
                  <div
                    key={`available-${student.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line-200)] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink-900)]">{student.fullName}</p>
                      <p className="truncate text-xs text-[var(--ink-500)]">{student.email}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => addStudent(student.id)} disabled={pending}>
                      <UserPlus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                ))}
                {availablePool.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-xs text-[var(--ink-500)]">
                    No available students for this filter.
                  </p>
                ) : null}
              </div>
              <PaginationControls
                page={safeAvailablePage}
                pageSize={AVAILABLE_PAGE_SIZE}
                total={availablePool.length}
                onPageChange={setAvailablePage}
              />
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
