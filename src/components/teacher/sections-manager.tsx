"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Archive, BarChart3, Edit3, Plus, RotateCcw, Save } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

type Section = {
  id: string;
  name: string;
  gradeLevel: string;
  schoolYear: string;
  status: "ACTIVE" | "ARCHIVED";
  description: string | null;
  subjectId: string | null;
  subjectName: string | null;
  studentCount: number;
};

type StudentOption = {
  id: string;
  fullName: string;
  email: string;
};

type SubjectOption = {
  id: string;
  name: string;
};

type ContentOption = {
  id: string;
  title: string;
};

type SectionAnalyticsSummary = {
  sectionId: string;
  sectionName: string;
  studentCount: number;
  lessonCompletionRate: number;
  quizAttempts: number;
  passRate: number;
  averageScore: number;
};

type SectionsManagerProps = {
  initialSections: Section[];
  students: StudentOption[];
  subjects: SubjectOption[];
  lessons: ContentOption[];
  quizzes: ContentOption[];
  analyticsSummary: SectionAnalyticsSummary[];
  readOnly?: boolean;
};

type SectionForm = {
  id?: string;
  name: string;
  gradeLevel: string;
  schoolYear: string;
  status: "ACTIVE" | "ARCHIVED";
  description: string;
  subjectId: string;
  studentIds: string[];
  lessonIds: string[];
  quizIds: string[];
};

const PAGE_SIZE = 10;
const ANALYTICS_PAGE_SIZE = 10;

function defaultForm(defaultSubjectId?: string): SectionForm {
  return {
    name: "",
    gradeLevel: "Grade 7",
    schoolYear: new Date().getFullYear().toString(),
    status: "ACTIVE",
    description: "",
    subjectId: defaultSubjectId ?? "",
    studentIds: [],
    lessonIds: [],
    quizIds: [],
  };
}

export function SectionsManager({
  initialSections,
  students,
  subjects,
  lessons,
  quizzes,
  analyticsSummary,
  readOnly = false,
}: SectionsManagerProps) {
  const [sections, setSections] = useState(initialSections);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [page, setPage] = useState(1);
  const [analyticsPage, setAnalyticsPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SectionForm>(defaultForm(subjects[0]?.id));
  const [viewMode, setViewMode] = usePersistedViewMode("learnhub:view:teacher-sections");
  const [pending, startTransition] = useTransition();
  const hasSubjectAssignments = subjects.length > 0;

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sections.filter((section) => {
      if (section.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        section.name.toLowerCase().includes(query) ||
        section.gradeLevel.toLowerCase().includes(query) ||
        section.schoolYear.toLowerCase().includes(query)
      );
    });
  }, [search, sections, statusFilter]);

  const sectionPageCount = Math.max(1, Math.ceil(filteredSections.length / PAGE_SIZE));
  const safeSectionPage = Math.min(page, sectionPageCount);
  const paginatedSections = useMemo(() => {
    const start = (safeSectionPage - 1) * PAGE_SIZE;
    return filteredSections.slice(start, start + PAGE_SIZE);
  }, [filteredSections, safeSectionPage]);

  const analyticsPageCount = Math.max(1, Math.ceil(analyticsSummary.length / ANALYTICS_PAGE_SIZE));
  const safeAnalyticsPage = Math.min(analyticsPage, analyticsPageCount);
  const paginatedAnalytics = useMemo(() => {
    const start = (safeAnalyticsPage - 1) * ANALYTICS_PAGE_SIZE;
    return analyticsSummary.slice(start, start + ANALYTICS_PAGE_SIZE);
  }, [analyticsSummary, safeAnalyticsPage]);

  async function reload() {
    const response = await fetch("/api/teacher/sections", { cache: "no-store" });
    const payload = (await response.json()) as { sections?: Section[]; error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load sections.");
      return;
    }
    setSections(payload.sections ?? []);
  }

  async function loadSectionDetails(sectionId: string) {
    const [sectionResponse, targetsResponse] = await Promise.all([
      fetch(`/api/teacher/sections?sectionId=${sectionId}`, { cache: "no-store" }),
      fetch(`/api/teacher/sections/targets?sectionId=${sectionId}`, { cache: "no-store" }),
    ]);

    const sectionPayload = (await sectionResponse.json()) as {
      section?: Section & { students: { studentId: string }[] };
      error?: string;
    };

    if (!sectionResponse.ok || !sectionPayload.section) {
      throw new Error(sectionPayload.error ?? "Unable to load section details.");
    }

    const targetsPayload = (await targetsResponse.json()) as {
      targets?: {
        lessons: { lessonId: string }[];
        quizzes: { quizId: string }[];
      };
    };

    const section = sectionPayload.section;
    setForm({
      id: section.id,
      name: section.name,
      gradeLevel: section.gradeLevel,
      schoolYear: section.schoolYear,
      status: section.status,
      description: section.description ?? "",
      subjectId: section.subjectId ?? "",
      studentIds: section.students.map((student) => student.studentId),
      lessonIds: targetsPayload.targets?.lessons.map((item) => item.lessonId) ?? [],
      quizIds: targetsPayload.targets?.quizzes.map((item) => item.quizId) ?? [],
    });
  }

  function openCreate() {
    if (readOnly) {
      return;
    }
    setError(null);
    if (!hasSubjectAssignments) {
      setError("Assign at least one subject to this teacher before creating sections.");
      return;
    }
    setForm(defaultForm(subjects[0]?.id));
    setModalOpen(true);
  }

  function openEdit(sectionId: string) {
    if (readOnly) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await loadSectionDetails(sectionId);
        setModalOpen(true);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load section details.");
      }
    });
  }

  function toggleMultiValue(field: "studentIds" | "lessonIds" | "quizIds", id: string) {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(id) ? prev[field].filter((value) => value !== id) : [...prev[field], id],
    }));
  }

  function saveSection() {
    if (readOnly) {
      return;
    }
    if (!form.subjectId) {
      setError("Select a subject for this section.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const basePayload = {
        name: form.name,
        gradeLevel: form.gradeLevel,
        schoolYear: form.schoolYear,
        status: form.status,
        description: form.description || undefined,
        subjectId: form.subjectId || undefined,
      };

      const response = await fetch("/api/teacher/sections", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: form.id,
          ...basePayload,
          studentIds: form.studentIds,
        }),
      });

      const payload = (await response.json()) as { sectionId?: string; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to save section.");
        return;
      }

      const sectionId = form.id ?? payload.sectionId;
      if (!sectionId) {
        setError("Section save succeeded but section id is missing.");
        return;
      }

      const studentResponse = await fetch("/api/teacher/sections/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          studentIds: form.studentIds,
        }),
      });

      const targetResponse = await fetch("/api/teacher/sections/targets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId,
          lessonIds: form.lessonIds,
          quizIds: form.quizIds,
        }),
      });

      if (!studentResponse.ok || !targetResponse.ok) {
        setError("Section saved, but student/target updates failed. Please retry.");
        return;
      }

      setModalOpen(false);
      setForm(defaultForm());
      await reload();
    });
  }

  function changeSectionStatus(section: Section, status: "ACTIVE" | "ARCHIVED") {
    if (readOnly) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          status,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Unable to update section status.");
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
            <h2 className="text-lg font-bold text-[var(--ink-900)]">Section / Class Grouping</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Group students into sections and target lessons/quizzes for each class.
            </p>
          </div>
          {!readOnly ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Create Section
            </Button>
          ) : null}
        </div>
        {!readOnly && !hasSubjectAssignments ? (
          <div className="mt-3 rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            No subject assignments found for this teacher. Ask admin to assign subjects first.
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--line-300)] bg-white p-1">
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ACTIVE");
                  setPage(1);
                }}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                  statusFilter === "ACTIVE"
                    ? "bg-[var(--brand-500)] text-white"
                    : "text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ARCHIVED");
                  setPage(1);
                }}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                  statusFilter === "ARCHIVED"
                    ? "bg-[var(--brand-500)] text-white"
                    : "text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                Archived
              </button>
            </div>
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search section"
            />
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        {viewMode === "list" ? (
          <div className={tableScrollClassName}>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Section</th>
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
                    <td className="px-2 py-2 font-semibold text-[var(--ink-900)]">
                      <Link href={`/teacher/subjects?sectionId=${section.id}`} className="hover:underline">
                        {section.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{section.subjectName ?? "General"}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {section.gradeLevel} • SY {section.schoolYear}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{section.studentCount}</td>
                    <td className="px-2 py-2">
                      <Chip tone={section.status === "ACTIVE" ? "success" : "warning"}>{section.status}</Chip>
                    </td>
                    <td className={stickyActionsTdClassName}>
                      <SectionCardActions
                        section={section}
                        pending={pending}
                        readOnly={readOnly}
                        onManage={(target) => openEdit(target.id)}
                        onChangeStatus={changeSectionStatus}
                        subjectHref={`/teacher/subjects?sectionId=${section.id}`}
                        alignRight
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {paginatedSections.map((section) => (
              <div key={section.id} className="relative rounded-xl border border-[var(--line-200)] bg-white p-4 pr-14">
                <SectionCardActions
                  section={section}
                  pending={pending}
                  readOnly={readOnly}
                  onManage={(target) => openEdit(target.id)}
                  onChangeStatus={changeSectionStatus}
                  subjectHref={`/teacher/subjects?sectionId=${section.id}`}
                  menuClassName="absolute right-3 top-3"
                />
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-bold text-[var(--ink-900)]">
                    <Link href={`/teacher/subjects?sectionId=${section.id}`} className="hover:underline">
                      {section.name}
                    </Link>
                  </h3>
                  <Chip className="mr-10" tone={section.status === "ACTIVE" ? "success" : "warning"}>
                    {section.status}
                  </Chip>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-500)]">
                  {section.gradeLevel} • SY {section.schoolYear}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  Subject: {section.subjectName ?? "General"} • Students: {section.studentCount}
                </p>
                <div className="mt-3">
                  <Link
                    href={`/teacher/subjects?sectionId=${section.id}`}
                    className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-3 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
                  >
                    Open in Subjects
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
        <PaginationControls page={safeSectionPage} pageSize={PAGE_SIZE} total={filteredSections.length} onPageChange={setPage} />
      </Card>

      <Card>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[var(--brand-600)]" />
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Section-Level Analytics</h3>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Section</th>
                <th className="px-2 py-2 font-semibold">Students</th>
                <th className="px-2 py-2 font-semibold">Lesson Completion</th>
                <th className="px-2 py-2 font-semibold">Quiz Attempts</th>
                <th className="px-2 py-2 font-semibold">Pass Rate</th>
                <th className="px-2 py-2 font-semibold">Average Score</th>
              </tr>
            </thead>
            <tbody>
              {paginatedAnalytics.map((item) => (
                <tr key={item.sectionId} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{item.sectionName}</td>
                  <td className="px-2 py-2">{item.studentCount}</td>
                  <td className="px-2 py-2">{item.lessonCompletionRate}%</td>
                  <td className="px-2 py-2">{item.quizAttempts}</td>
                  <td className="px-2 py-2">{item.passRate}%</td>
                  <td className="px-2 py-2">{item.averageScore}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={safeAnalyticsPage}
          pageSize={ANALYTICS_PAGE_SIZE}
          total={analyticsSummary.length}
          onPageChange={setAnalyticsPage}
        />
      </Card>

      {!readOnly ? (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={form.id ? "Manage Section" : "Create Section"}
          description="Configure class roster, lesson targets, and quiz targets."
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
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Subject
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.subjectId}
              onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))}
            >
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </select>
          </label>
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
          <label className="text-sm font-semibold text-[var(--ink-700)] md:col-span-2">
            Description
            <textarea
              className="mt-1 min-h-[80px] w-full rounded-lg border border-[var(--line-300)] px-3 py-2 text-sm"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--ink-600)] md:col-span-2">
            <input
              type="checkbox"
              checked={form.status === "ARCHIVED"}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.checked ? "ARCHIVED" : "ACTIVE" }))}
            />
            Archived
          </label>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[var(--line-200)] p-3">
            <p className="text-sm font-semibold text-[var(--ink-800)]">Students</p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {students.map((student) => (
                <label key={student.id} className="inline-flex w-full items-center gap-2 text-sm text-[var(--ink-700)]">
                  <input
                    type="checkbox"
                    checked={form.studentIds.includes(student.id)}
                    onChange={() => toggleMultiValue("studentIds", student.id)}
                  />
                  <span className="truncate">{student.fullName}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line-200)] p-3">
            <p className="text-sm font-semibold text-[var(--ink-800)]">Target Lessons</p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {lessons.map((lesson) => (
                <label key={lesson.id} className="inline-flex w-full items-center gap-2 text-sm text-[var(--ink-700)]">
                  <input
                    type="checkbox"
                    checked={form.lessonIds.includes(lesson.id)}
                    onChange={() => toggleMultiValue("lessonIds", lesson.id)}
                  />
                  <span className="truncate">{lesson.title}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line-200)] p-3">
            <p className="text-sm font-semibold text-[var(--ink-800)]">Target Quizzes</p>
            <div className="mt-2 max-h-44 space-y-2 overflow-y-auto">
              {quizzes.map((quiz) => (
                <label key={quiz.id} className="inline-flex w-full items-center gap-2 text-sm text-[var(--ink-700)]">
                  <input
                    type="checkbox"
                    checked={form.quizIds.includes(quiz.id)}
                    onChange={() => toggleMultiValue("quizIds", quiz.id)}
                  />
                  <span className="truncate">{quiz.title}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveSection} disabled={pending}>
            <Save className="h-4 w-4" />
            Save Section
          </Button>
        </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SectionCardActions({
  section,
  pending,
  readOnly,
  onManage,
  onChangeStatus,
  subjectHref,
  alignRight,
  menuClassName,
}: {
  section: Section;
  pending: boolean;
  readOnly: boolean;
  onManage: (section: Section) => void;
  onChangeStatus: (section: Section, status: "ACTIVE" | "ARCHIVED") => void;
  subjectHref: string;
  alignRight?: boolean;
  menuClassName?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${alignRight ? "justify-end" : ""}`}>
      {!menuClassName ? (
        <Link
          href={subjectHref}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-3 text-sm font-medium text-[var(--ink-900)] transition hover:bg-[var(--line-100)]"
        >
          Open in Subjects
        </Link>
      ) : null}
      {!readOnly ? (
        <ActionMenu
          className={menuClassName}
          iconTrigger
          ariaLabel="Section actions"
          groups={[
            {
              items: [
                {
                  label: "Manage Section",
                  icon: <Edit3 className="h-4 w-4" />,
                  onSelect: () => onManage(section),
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
      ) : null}
    </div>
  );
}
