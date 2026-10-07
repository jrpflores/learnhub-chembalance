"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Archive, Edit3, RotateCcw, Save } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Select2AsyncMulti, Select2AsyncSingle, type Select2Option } from "@/components/ui/select2-async";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { formatDateTime } from "@/lib/date-display";

type SectionItem = {
  id: string;
  teacherId: string;
  teacherName: string;
  subjectId: string | null;
  subjectName: string | null;
  subjectIds: string[];
  name: string;
  gradeLevel: string;
  schoolYear: string;
  status: "ACTIVE" | "ARCHIVED";
  description: string | null;
  studentCount: number;
  updatedAt: string;
};

type TeacherOption = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
};

type SubjectOption = {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
};

type SectionsManagerProps = {
  initialSections: SectionItem[];
  teachers: TeacherOption[];
  subjects: SubjectOption[];
};

type SectionForm = {
  sectionId?: string;
  subjectIds: string[];
  subjectTeacherAssignments: Array<{
    subjectId: string;
    teacherId: string;
  }>;
  name: string;
  gradeLevel: string;
  schoolYear: string;
  status: "ACTIVE" | "ARCHIVED";
  description: string;
};

const PAGE_SIZE = 10;

function toForm(section?: SectionItem, fallbackTeacherId?: string, fallbackSubjectId?: string): SectionForm {
  if (!section) {
    const initialSubjectIds = fallbackSubjectId ? [fallbackSubjectId] : [];
    return {
      subjectIds: initialSubjectIds,
      subjectTeacherAssignments:
        fallbackTeacherId && fallbackSubjectId
          ? [{ subjectId: fallbackSubjectId, teacherId: fallbackTeacherId }]
          : [],
      name: "",
      gradeLevel: "Grade 7",
      schoolYear: new Date().getFullYear().toString(),
      status: "ACTIVE",
      description: "",
    };
  }

  return {
    sectionId: section.id,
    subjectIds:
      section.subjectIds?.length > 0
        ? section.subjectIds
        : section.subjectId
          ? [section.subjectId]
          : fallbackSubjectId
            ? [fallbackSubjectId]
            : [],
    subjectTeacherAssignments:
      section.subjectIds?.length > 0
        ? section.subjectIds
            .map((subjectId) => ({ subjectId, teacherId: section.teacherId }))
            .filter((assignment) => Boolean(assignment.teacherId))
        : section.subjectId && section.teacherId
          ? [{ subjectId: section.subjectId, teacherId: section.teacherId }]
          : [],
    name: section.name,
    gradeLevel: section.gradeLevel,
    schoolYear: section.schoolYear,
    status: section.status,
    description: section.description ?? "",
  };
}

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

function teacherToSelectOption(teacher: TeacherOption): Select2Option {
  return {
    value: teacher.id,
    label: `${teacher.fullName} (${teacher.email})`,
  };
}

function subjectToSelectOption(subject: SubjectOption): Select2Option {
  return {
    value: subject.id,
    label: `${subject.code} - ${subject.name}`,
  };
}

export function SectionsManager({ initialSections, teachers, subjects }: SectionsManagerProps) {
  const [sections, setSections] = useState(initialSections);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SectionForm>(toForm(undefined, teachers[0]?.id, subjects[0]?.id));
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [pending, startTransition] = useTransition();

  const teacherOptions = useMemo(() => teachers.filter((teacher) => teacher.isActive), [teachers]);
  const subjectOptions = useMemo(() => subjects.filter((subject) => subject.isActive), [subjects]);
  const [teacherDefaultOptions, setTeacherDefaultOptions] = useState<Select2Option[]>([]);
  const [subjectDefaultOptions, setSubjectDefaultOptions] = useState<Select2Option[]>([]);

  useEffect(() => {
    setTeacherDefaultOptions(teacherOptions.slice(0, 50).map(teacherToSelectOption));
  }, [teacherOptions]);

  useEffect(() => {
    setSubjectDefaultOptions(subjectOptions.slice(0, 50).map(subjectToSelectOption));
  }, [subjectOptions]);

  const teacherSelectMap = useMemo(
    () => new Map(teacherOptions.map((teacher) => [teacher.id, teacherToSelectOption(teacher)])),
    [teacherOptions],
  );
  const subjectSelectMap = useMemo(
    () => new Map(subjectOptions.map((subject) => [subject.id, subjectToSelectOption(subject)])),
    [subjectOptions],
  );
  const selectedSubjectOptions = form.subjectIds.map(
    (subjectId) => subjectSelectMap.get(subjectId) ?? { value: subjectId, label: subjectId },
  );
  const selectedTeacherBySubject = useMemo(
    () => new Map(form.subjectTeacherAssignments.map((assignment) => [assignment.subjectId, assignment.teacherId])),
    [form.subjectTeacherAssignments],
  );

  const filteredSections = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections.filter((section) => {
      if (statusFilter !== "ALL" && section.status !== statusFilter) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        section.name.toLowerCase().includes(q) ||
        section.teacherName.toLowerCase().includes(q) ||
        (section.subjectName ?? "").toLowerCase().includes(q)
      );
    });
  }, [search, sections, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredSections.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginatedSections = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredSections.slice(start, start + PAGE_SIZE);
  }, [filteredSections, safePage]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  async function reload() {
    const response = await fetch("/api/admin/sections", { cache: "no-store" });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      setError((payload.error as string) ?? "Unable to load sections.");
      return;
    }
    const next = Array.isArray(payload.sections) ? (payload.sections as SectionItem[]) : [];
    setSections(next);
  }

  async function loadSectionDetails(sectionId: string) {
    const response = await fetch(`/api/admin/sections?sectionId=${sectionId}`, { cache: "no-store" });
    const payload = await readJsonSafe(response);
    if (!response.ok || !payload.section) {
      throw new Error((payload.error as string) ?? "Unable to load section details.");
    }

    const section = payload.section as SectionItem & {
      subjects?: Array<{ subjectId: string; teacherId?: string | null }>;
    };
    const detailAssignments =
      section.subjects
        ?.map((subject) => ({
          subjectId: subject.subjectId,
          teacherId: subject.teacherId ?? section.teacherId,
        }))
        .filter((assignment) => Boolean(assignment.teacherId)) ?? [];
    const detailSubjectIds =
      section.subjects?.map((subject) => subject.subjectId) ??
      (section.subjectIds?.length ? section.subjectIds : section.subjectId ? [section.subjectId] : []);

    setForm({
      sectionId: section.id,
      subjectIds: detailSubjectIds,
      subjectTeacherAssignments: detailAssignments,
      name: section.name,
      gradeLevel: section.gradeLevel,
      schoolYear: section.schoolYear,
      status: section.status,
      description: section.description ?? "",
    });
  }

  function openCreate() {
    setError(null);
    if (teacherOptions.length === 0) {
      setError("No active teachers available.");
      return;
    }
    if (subjectOptions.length === 0) {
      setError("No active subjects available.");
      return;
    }
    setForm(toForm(undefined, teacherOptions[0]?.id, subjectOptions[0]?.id));
    setModalOpen(true);
  }

  function openEdit(section: SectionItem) {
    setError(null);
    startTransition(async () => {
      try {
        await loadSectionDetails(section.id);
        setModalOpen(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load section details.");
      }
    });
  }

  const loadTeacherOptions = useCallback(async (inputValue: string) => {
    const params = new URLSearchParams({
      role: "TEACHER",
      page: "1",
      pageSize: "20",
    });
    if (inputValue.trim()) {
      params.set("search", inputValue.trim());
    }

    const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      return [];
    }

    const items = Array.isArray(payload.data)
      ? (payload.data as { id: string; fullName: string; email: string; role: string; isActive: boolean }[])
      : [];

    const options = items
      .filter((item) => item.role === "TEACHER" && item.isActive)
      .map((item) => ({
        value: item.id,
        label: `${item.fullName} (${item.email})`,
      }));

    if (options.length > 0) {
      setTeacherDefaultOptions((prev) => {
        const map = new Map(prev.map((option) => [option.value, option]));
        for (const option of options) {
          map.set(option.value, option);
        }
        return [...map.values()].slice(0, 100);
      });
    }

    return options;
  }, []);

  const loadSubjectOptions = useCallback(async (inputValue: string) => {
    const params = new URLSearchParams();
    if (inputValue.trim()) {
      params.set("search", inputValue.trim());
    }

    const response = await fetch(`/api/admin/subjects?${params.toString()}`, { cache: "no-store" });
    const payload = await readJsonSafe(response);
    if (!response.ok) {
      return [];
    }

    const items = Array.isArray(payload.subjects)
      ? (payload.subjects as { id: string; code: string; name: string; isActive: boolean }[])
      : [];

    const options = items
      .filter((item) => item.isActive)
      .map((item) => ({
        value: item.id,
        label: `${item.code} - ${item.name}`,
      }));

    if (options.length > 0) {
      setSubjectDefaultOptions((prev) => {
        const map = new Map(prev.map((option) => [option.value, option]));
        for (const option of options) {
          map.set(option.value, option);
        }
        return [...map.values()].slice(0, 150);
      });
    }

    return options;
  }, []);

  function setSelectedSubjectIds(nextSubjectIds: string[]) {
    const uniqueSubjectIds = Array.from(new Set(nextSubjectIds.filter(Boolean)));
    setForm((prev) => {
      const assignmentMap = new Map(prev.subjectTeacherAssignments.map((assignment) => [assignment.subjectId, assignment.teacherId]));
      const defaultTeacherId = prev.subjectTeacherAssignments[0]?.teacherId ?? teacherOptions[0]?.id ?? "";
      const nextAssignments = uniqueSubjectIds
        .map((subjectId) => ({
          subjectId,
          teacherId: assignmentMap.get(subjectId) ?? defaultTeacherId,
        }))
        .filter((assignment) => Boolean(assignment.teacherId));

      return {
        ...prev,
        subjectIds: uniqueSubjectIds,
        subjectTeacherAssignments: nextAssignments,
      };
    });
  }

  function updateSubjectTeacher(subjectId: string, teacherId: string) {
    setForm((prev) => {
      const assignmentMap = new Map(prev.subjectTeacherAssignments.map((assignment) => [assignment.subjectId, assignment.teacherId]));
      if (teacherId) {
        assignmentMap.set(subjectId, teacherId);
      } else {
        assignmentMap.delete(subjectId);
      }

      const nextAssignments = prev.subjectIds
        .map((id) => ({
          subjectId: id,
          teacherId: assignmentMap.get(id) ?? "",
        }))
        .filter((assignment) => Boolean(assignment.teacherId));

      return {
        ...prev,
        subjectTeacherAssignments: nextAssignments,
      };
    });
  }

  function save() {
    if (!form.name.trim() || form.subjectIds.length === 0) {
      setError("Section name and at least one subject are required.");
      return;
    }

    const subjectTeacherAssignments = form.subjectIds
      .map((subjectId) => ({
        subjectId,
        teacherId: selectedTeacherBySubject.get(subjectId) ?? "",
      }))
      .filter((assignment) => Boolean(assignment.teacherId));

    if (subjectTeacherAssignments.length !== form.subjectIds.length) {
      setError("Assign one teacher for each selected subject.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/sections", {
        method: form.sectionId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: form.sectionId,
          teacherId: subjectTeacherAssignments[0]?.teacherId,
          subjectIds: form.subjectIds,
          subjectId: form.subjectIds[0] ?? undefined,
          subjectTeacherAssignments,
          name: form.name,
          gradeLevel: form.gradeLevel,
          schoolYear: form.schoolYear,
          status: form.status,
          description: form.description || undefined,
        }),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError((payload.error as string) ?? "Unable to save section.");
        return;
      }

      setModalOpen(false);
      await reload();
    });
  }

  function changeStatus(section: SectionItem, status: "ACTIVE" | "ARCHIVED") {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          status,
        }),
      });

      const payload = await readJsonSafe(response);
      if (!response.ok) {
        setError((payload.error as string) ?? "Unable to update section.");
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
            <h2 className="text-lg font-bold text-[var(--ink-900)]">Sections</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Admin can create sections and assign a dedicated teacher for each selected subject in a section.
            </p>
          </div>
          <Button onClick={openCreate}>Create Section</Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--line-300)] bg-white p-1">
            {(["ACTIVE", "ARCHIVED", "ALL"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatusFilter(value)}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                  statusFilter === value
                    ? "bg-[var(--brand-500)] text-white"
                    : "text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
          <input
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[220px] sm:w-auto"
            placeholder="Search section, teacher, subject"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Section</th>
                  <th className="px-2 py-2 font-semibold">Teacher</th>
                  <th className="px-2 py-2 font-semibold">Subject</th>
                  <th className="px-2 py-2 font-semibold">Grade / Year</th>
                  <th className="px-2 py-2 font-semibold">Students</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className={stickyActionsThClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSections.map((section) => (
                  <tr key={section.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-[var(--ink-900)]">{section.name}</p>
                      <p className="text-xs text-[var(--ink-500)]">{formatDateTime(section.updatedAt)}</p>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{section.teacherName}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{section.subjectName ?? "Unassigned"}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {section.gradeLevel} / {section.schoolYear}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{section.studentCount}</td>
                    <td className="px-2 py-2">
                      <Chip tone={section.status === "ACTIVE" ? "success" : "warning"}>{section.status}</Chip>
                    </td>
                    <td className={stickyActionsTdClassName}>
                      <SectionActions
                        section={section}
                        pending={pending}
                        onEdit={openEdit}
                        onChangeStatus={changeStatus}
                        viewHref={`/admin/sections/${section.id}/students`}
                        alignRight
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paginatedSections.map((section) => (
              <div key={section.id} className="relative rounded-xl border border-[var(--line-200)] bg-white p-4 pr-14">
                <SectionActions
                  section={section}
                  pending={pending}
                  onEdit={openEdit}
                  onChangeStatus={changeStatus}
                  viewHref={`/admin/sections/${section.id}/students`}
                  menuClassName="absolute right-3 top-3"
                />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[var(--ink-900)]">{section.name}</h3>
                  <Chip className="mr-10" tone={section.status === "ACTIVE" ? "success" : "warning"}>
                    {section.status}
                  </Chip>
                </div>
                <p className="mt-2 text-sm text-[var(--ink-600)]">{section.teacherName}</p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  {section.subjectName ?? "Unassigned"} • {section.gradeLevel} / {section.schoolYear}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">Students: {section.studentCount}</p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">Updated {formatDateTime(section.updatedAt)}</p>
                <div className="mt-4">
                  <Link
                    href={`/admin/sections/${section.id}/students`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-3 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
                  >
                    View Students
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredSections.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center text-sm text-[var(--ink-500)]">
            No sections found for this filter.
          </div>
        ) : null}
        <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={filteredSections.length} onPageChange={setPage} />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.sectionId ? "Edit Section" : "Create Section"}
        description="Assign one teacher per subject for this section."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Section Name
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <div className="text-sm font-semibold text-[var(--ink-700)]">
            Subjects
            <div className="mt-1">
              <Select2AsyncMulti
                inputId="section-subjects"
                value={selectedSubjectOptions}
                onChange={(options) => setSelectedSubjectIds(options.map((option) => option.value))}
                loadOptions={loadSubjectOptions}
                defaultOptions={subjectDefaultOptions}
                placeholder="Search and select subject(s)..."
              />
            </div>
            <p className="mt-1 text-xs text-[var(--ink-500)]">Select one or more subjects for this section.</p>
          </div>
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Grade Level
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.gradeLevel}
              onChange={(event) => setForm((prev) => ({ ...prev, gradeLevel: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            School Year
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.schoolYear}
              onChange={(event) => setForm((prev) => ({ ...prev, schoolYear: event.target.value }))}
            />
          </label>
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Status
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.status}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, status: event.target.value as "ACTIVE" | "ARCHIVED" }))
              }
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[90px] w-full rounded-lg border border-[var(--line-300)] px-3 py-2 text-sm"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>

          <div className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Teacher Per Subject
            {form.subjectIds.length > 0 ? (
              <div className="mt-2 space-y-2 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
                {form.subjectIds.map((subjectId) => {
                  const subjectOption = subjectSelectMap.get(subjectId);
                  const subjectLabel = subjectOption?.label ?? subjectId;
                  const teacherId = selectedTeacherBySubject.get(subjectId);
                  const teacherOption = teacherId
                    ? teacherSelectMap.get(teacherId) ?? { value: teacherId, label: "Selected teacher" }
                    : null;
                  return (
                    <div
                      key={`subject-teacher-${subjectId}`}
                      className="grid gap-2 rounded-lg border border-[var(--line-200)] bg-white p-3 md:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)] md:items-center"
                    >
                      <p className="truncate text-sm font-semibold text-[var(--ink-900)]">{subjectLabel}</p>
                      <Select2AsyncSingle
                        inputId={`subject-teacher-${subjectId}`}
                        value={teacherOption}
                        onChange={(option) => updateSubjectTeacher(subjectId, option?.value ?? "")}
                        loadOptions={loadTeacherOptions}
                        defaultOptions={teacherDefaultOptions}
                        placeholder="Search assigned teacher..."
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 rounded-lg border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-2 text-xs font-medium text-[var(--ink-500)]">
                Select at least one subject to assign teachers.
              </p>
            )}
          </div>

        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            <Save className="h-4 w-4" />
            Save Section
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SectionActions({
  section,
  pending,
  onEdit,
  onChangeStatus,
  viewHref,
  alignRight,
  menuClassName,
}: {
  section: SectionItem;
  pending: boolean;
  onEdit: (section: SectionItem) => void;
  onChangeStatus: (section: SectionItem, status: "ACTIVE" | "ARCHIVED") => void;
  viewHref: string;
  alignRight?: boolean;
  menuClassName?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${alignRight ? "justify-end" : ""}`}>
      {!menuClassName ? (
        <Link
          href={viewHref}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-3 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
        >
          View Students
        </Link>
      ) : null}
      <ActionMenu
        className={menuClassName}
        iconTrigger
        ariaLabel="Section actions"
        groups={[
          {
            items: [
              {
                label: "Edit Section",
                icon: <Edit3 className="h-4 w-4" />,
                onSelect: () => onEdit(section),
                disabled: pending,
              },
              {
                label: section.status === "ACTIVE" ? "Archive" : "Restore",
                icon: section.status === "ACTIVE" ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />,
                tone: section.status === "ACTIVE" ? "danger" : "default",
                onSelect: () => onChangeStatus(section, section.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"),
                disabled: pending,
              },
            ],
          },
        ]}
      />
    </div>
  );
}
