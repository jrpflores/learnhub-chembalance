"use client";

import { useMemo, useState, useTransition } from "react";
import { Edit3, Trash2, UserRoundCheck, UserRoundX } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";

type Student = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  streakDays: number;
  assignedAt: string;
};

type StudentAnalytics = {
  studentId: string;
  fullName: string;
  quizzesTaken: number;
  averageScore: number;
  passedCount: number;
  failedCount: number;
  completedLessons: number;
  inProgressLessons: number;
};

type StudentsManagerProps = {
  initialResult: {
    data: Student[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
  sections: {
    id: string;
    name: string;
    studentCount: number;
  }[];
  initialSearch?: string;
  initialSectionId?: string;
  analytics: StudentAnalytics[];
  readOnly?: boolean;
};

function pageRange(result: { page: number; pageSize: number; total: number }) {
  if (result.total === 0) {
    return "0-0";
  }
  const start = (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);
  return `${start}-${end}`;
}

export function StudentsManager({
  initialResult,
  sections,
  initialSearch = "",
  initialSectionId = "",
  analytics,
  readOnly = false,
}: StudentsManagerProps) {
  const [students, setStudents] = useState(initialResult.data);
  const [search, setSearch] = useState(initialSearch);
  const [sectionId, setSectionId] = useState(initialSectionId);
  const [pagination, setPagination] = useState({
    page: initialResult.page,
    pageSize: initialResult.pageSize,
    total: initialResult.total,
    pageCount: initialResult.pageCount,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", password: "" });

  const analyticsMap = useMemo(() => {
    return new Map(analytics.map((row) => [row.studentId, row]));
  }, [analytics]);

  async function reloadStudents(next?: { page?: number; search?: string; sectionId?: string }) {
    const nextPage = next?.page ?? pagination.page;
    const nextSearch = next?.search ?? search;
    const nextSectionId = next?.sectionId ?? sectionId;
    const params = new URLSearchParams({
      page: String(nextPage),
      pageSize: String(pagination.pageSize),
    });

    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }
    if (nextSectionId) {
      params.set("sectionId", nextSectionId);
    }

    const response = await fetch(`/api/teacher/students?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as {
      data?: Student[];
      page?: number;
      pageSize?: number;
      total?: number;
      pageCount?: number;
    };

    setStudents(Array.isArray(payload.data) ? payload.data : []);
    setPagination({
      page: payload.page ?? nextPage,
      pageSize: payload.pageSize ?? pagination.pageSize,
      total: payload.total ?? 0,
      pageCount: payload.pageCount ?? 1,
    });
  }

  function createStudent() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/teacher/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to create student");
        return;
      }

      setForm({ fullName: "", email: "", password: "" });
      await reloadStudents({ page: 1 });
    });
  }

  function updateStudent(studentId: string, patch: Partial<Pick<Student, "isActive">>) {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/teacher/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studentId, ...patch }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to update student");
        return;
      }

      await reloadStudents();
    });
  }

  function openEditModal(student: Student) {
    setError(null);
    setEditingStudent(student);
    setEditFullName(student.fullName);
  }

  function saveStudentName() {
    if (!editingStudent) {
      return;
    }

    const trimmedName = editFullName.trim();
    if (!trimmedName || trimmedName === editingStudent.fullName) {
      setEditingStudent(null);
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingStudent.id, fullName: trimmedName }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to update student name");
        return;
      }

      setEditingStudent(null);
      await reloadStudents();
    });
  }

  function openDeleteModal(student: Student) {
    setError(null);
    setDeleteTarget(student);
  }

  function deleteStudent() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to delete student");
        return;
      }

      setDeleteTarget(null);
      await reloadStudents();
    });
  }

  return (
    <div className="space-y-6">
      {!readOnly ? (
        <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Create Student Account</h2>
        <p className="text-sm text-[var(--ink-500)]">Add students directly and assign them to your class.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Full name"
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
          />
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            placeholder="Temporary password"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </div>

        <div className="mt-4">
          <Button onClick={createStudent} disabled={pending}>
            Add Student
          </Button>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--danger-600)]">{error}</p> : null}
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Student Management</h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              value={sectionId}
              onChange={(event) => {
                const nextSectionId = event.target.value;
                setSectionId(nextSectionId);
                startTransition(async () => {
                  await reloadStudents({ page: 1, sectionId: nextSectionId });
                });
              }}
            >
              <option value="">All assigned sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name} ({section.studentCount})
                </option>
              ))}
            </select>
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              placeholder="Search students"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              variant="secondary"
              onClick={() =>
                startTransition(async () => {
                  await reloadStudents({ page: 1 });
                })
              }
            >
              Search
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        <div className={tableScrollClassName}>
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Student</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Average</th>
                <th className="px-2 py-2 font-semibold">Quizzes</th>
                <th className="px-2 py-2 font-semibold">Weak Signals</th>
                <th className={stickyActionsThClassName}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => {
                const stat = analyticsMap.get(student.id);
                return (
                  <tr key={student.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-[var(--ink-800)]">{student.fullName}</p>
                      <p className="text-xs text-[var(--ink-500)]">{student.email}</p>
                    </td>
                    <td className="px-2 py-2">
                      <Chip tone={student.isActive ? "success" : "danger"}>{student.isActive ? "Active" : "Inactive"}</Chip>
                    </td>
                    <td className="px-2 py-2">{stat ? `${stat.averageScore}%` : "-"}</td>
                    <td className="px-2 py-2">{stat ? stat.quizzesTaken : 0}</td>
                    <td className="px-2 py-2">
                      {stat && stat.failedCount > 0 ? `${stat.failedCount} failed attempts` : "No risk signal"}
                    </td>
                    <td className={stickyActionsTdClassName}>
                      <StudentActions
                        student={student}
                        readOnly={readOnly}
                        onEdit={openEditModal}
                        onToggle={(target) => updateStudent(target.id, { isActive: !target.isActive })}
                        onDelete={openDeleteModal}
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {students.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center text-sm text-[var(--ink-500)]">
            No students found for this filter.
          </div>
        ) : null}

        {pagination.pageCount > 1 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-500)]">
            <span>
              Showing {pageRange(pagination)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={pending || pagination.page <= 1}
                onClick={() =>
                  startTransition(async () => {
                    await reloadStudents({ page: Math.max(1, pagination.page - 1) });
                  })
                }
              >
                Previous
              </Button>
              <span>
                Page {pagination.page}/{pagination.pageCount}
              </span>
              <Button
                variant="secondary"
                disabled={pending || pagination.page >= pagination.pageCount}
                onClick={() =>
                  startTransition(async () => {
                    await reloadStudents({ page: Math.min(pagination.pageCount, pagination.page + 1) });
                  })
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {!readOnly ? (
        <Modal
        open={Boolean(editingStudent)}
        onClose={() => setEditingStudent(null)}
        title="Edit Student Name"
        description="Update the student full name and save."
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Full Name
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={editFullName}
              onChange={(event) => setEditFullName(event.target.value)}
              placeholder="Enter student name"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingStudent(null)}>
              Cancel
            </Button>
            <Button onClick={saveStudentName} disabled={pending}>
              Save Name
            </Button>
          </div>
        </div>
        </Modal>
      ) : null}

      {!readOnly ? (
        <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Student"
        description="This action permanently removes the student account and related learning records."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {deleteTarget ? (
              <>
                You are deleting <strong>{deleteTarget.fullName}</strong> ({deleteTarget.email}).
              </>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteStudent} disabled={pending}>
              Delete Student
            </Button>
          </div>
        </div>
        </Modal>
      ) : null}
    </div>
  );
}

function StudentActions({
  student,
  readOnly,
  onEdit,
  onToggle,
  onDelete,
  className,
}: {
  student: Student;
  readOnly: boolean;
  onEdit: (student: Student) => void;
  onToggle: (student: Student) => void;
  onDelete: (student: Student) => void;
  className?: string;
}) {
  if (readOnly) {
    return <span className="text-xs text-[var(--ink-500)]">Managed by admin</span>;
  }

  return (
    <ActionMenu
      className={className}
      iconTrigger
      ariaLabel="Student actions"
      groups={[
        {
          items: [
            {
              label: "Edit Name",
              icon: <Edit3 className="h-4 w-4" />,
              onSelect: () => onEdit(student),
            },
            {
              label: student.isActive ? "Deactivate" : "Reactivate",
              icon: student.isActive ? <UserRoundX className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />,
              onSelect: () => onToggle(student),
            },
          ],
        },
        {
          items: [
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => onDelete(student),
            },
          ],
        },
      ]}
    />
  );
}
