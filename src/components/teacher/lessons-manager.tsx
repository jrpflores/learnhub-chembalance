"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, BookOpen, ChevronRight, Download, Edit3, FolderOpen, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { LessonMarkdownEditor } from "@/components/teacher/lesson-markdown-editor";
import { ActionMenu } from "@/components/ui/action-menu";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { extractApiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/date-display";
import { uploadMediaFile } from "@/lib/media-upload";

type Lesson = {
  id: string;
  title: string;
  shortDescription: string;
  subject: string;
  topic: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  updatedAt: string;
  estimatedMinutes: number | null;
  difficulty: "EASY" | "MEDIUM" | "HARD" | null;
};

type LessonsManagerProps = {
  initialLessons: Lesson[];
  initialSubjectOptions: string[];
  selectedSubject: string | null;
  initialIntent?: "import" | "create" | null;
  breadcrumbContext?: {
    subjectId: string;
    subjectName: string;
    sectionId?: string;
    sectionName?: string;
    returnTab?: "students" | "lessons" | "quizzes" | "background-jobs";
  };
};

type LessonFilter = "ACTIVE" | "ARCHIVED";

type ImportableLesson = {
  id: string;
  title: string;
  shortDescription: string;
  topic: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  updatedAt: string;
  teacherName: string;
};

type LessonCreateForm = {
  title: string;
  shortDescription: string;
  subject: string;
  topic: string;
  unit: string;
  difficulty: "" | "EASY" | "MEDIUM" | "HARD";
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  estimatedMinutes: string;
  tags: string;
  coverImageUrl: string;
  contentMarkdown: string;
};

function defaultForm(defaultSubject: string): LessonCreateForm {
  return {
    title: "",
    shortDescription: "",
    subject: defaultSubject,
    topic: "General",
    unit: "",
    difficulty: "MEDIUM",
    status: "DRAFT",
    estimatedMinutes: "20",
    tags: "",
    coverImageUrl: "",
    contentMarkdown: "# Lesson title\n\nStart writing your lesson content here.\n",
  };
}

const LESSONS_PER_PAGE = 9;

export function LessonsManager({
  initialLessons,
  initialSubjectOptions,
  selectedSubject,
  initialIntent = null,
  breadcrumbContext,
}: LessonsManagerProps) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initialLessons);
  const [subjectOptions] = useState(() => {
    const normalized = initialSubjectOptions.map((subject) => subject.trim()).filter(Boolean);
    return Array.from(new Set(normalized));
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<LessonFilter>("ACTIVE");
  const [currentPage, setCurrentPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSearch, setImportSearch] = useState("");
  const [importingLessonId, setImportingLessonId] = useState<string | null>(null);
  const [importableLessons, setImportableLessons] = useState<ImportableLesson[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [form, setForm] = useState<LessonCreateForm>(defaultForm(selectedSubject ?? subjectOptions[0] ?? ""));
  const [viewMode, setViewMode] = usePersistedViewMode();
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const subjectDetailHref = useMemo(() => {
    if (!breadcrumbContext) {
      return null;
    }
    const params = new URLSearchParams();
    if (breadcrumbContext.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }
    if (breadcrumbContext.returnTab) {
      params.set("tab", breadcrumbContext.returnTab);
    }
    const query = params.toString();
    return query
      ? `/teacher/subjects/${breadcrumbContext.subjectId}?${query}`
      : `/teacher/subjects/${breadcrumbContext.subjectId}`;
  }, [breadcrumbContext]);
  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return lessons.filter((lesson) => {
      const matchesFilter = filter === "ARCHIVED" ? lesson.status === "ARCHIVED" : lesson.status !== "ARCHIVED";
      if (!matchesFilter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        lesson.title.toLowerCase().includes(query) ||
        lesson.subject.toLowerCase().includes(query) ||
        lesson.topic.toLowerCase().includes(query)
      );
    });
  }, [filter, lessons, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LESSONS_PER_PAGE));

  const paginatedLessons = useMemo(() => {
    const start = (currentPage - 1) * LESSONS_PER_PAGE;
    return filtered.slice(start, start + LESSONS_PER_PAGE);
  }, [currentPage, filtered]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, 5];
    }

    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }

    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (!selectedSubject) {
      return;
    }
    setForm((prev) => ({ ...prev, subject: selectedSubject }));
  }, [selectedSubject]);

  function openLesson(lessonId: string) {
    const params = new URLSearchParams();
    if (breadcrumbContext?.subjectId) {
      params.set("subjectId", breadcrumbContext.subjectId);
    }
    if (breadcrumbContext?.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }
    if (breadcrumbContext?.returnTab) {
      params.set("returnTab", breadcrumbContext.returnTab);
    }
    const query = params.toString();
    router.push(query ? `/teacher/lessons/${lessonId}?${query}` : `/teacher/lessons/${lessonId}`);
  }

  function openCreateModal() {
    setError(null);
    setForm(defaultForm(selectedSubject ?? subjectOptions[0] ?? ""));
    setCreateOpen(true);
  }

  const loadImportableLessons = useCallback(async (searchText?: string) => {
    if (!breadcrumbContext?.subjectId || !breadcrumbContext.sectionId) {
      setError("Import is only available inside a selected subject and section context.");
      return;
    }

    const params = new URLSearchParams({
      subjectId: breadcrumbContext.subjectId,
      sectionId: breadcrumbContext.sectionId,
    });
    if (searchText?.trim()) {
      params.set("search", searchText.trim());
    }

    setImportLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/teacher/lessons/import?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as { lessons?: ImportableLesson[]; error?: string; details?: unknown };
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to load importable lessons."));
        return;
      }
      setImportableLessons(payload.lessons ?? []);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Unable to load importable lessons.");
    } finally {
      setImportLoading(false);
    }
  }, [breadcrumbContext?.sectionId, breadcrumbContext?.subjectId]);

  const openImportModal = useCallback(async () => {
    setImportSearch("");
    setImportOpen(true);
    await loadImportableLessons();
  }, [loadImportableLessons]);

  useEffect(() => {
    if (initialIntent !== "import") {
      return;
    }
    if (!breadcrumbContext?.subjectId || !breadcrumbContext.sectionId) {
      return;
    }
    void openImportModal();
  }, [initialIntent, breadcrumbContext?.sectionId, breadcrumbContext?.subjectId, openImportModal]);

  useEffect(() => {
    if (initialIntent !== "create") {
      return;
    }
    if (subjectOptions.length === 0) {
      return;
    }
    setError(null);
    setForm(defaultForm(selectedSubject ?? subjectOptions[0] ?? ""));
    setCreateOpen(true);
  }, [initialIntent, selectedSubject, subjectOptions]);

  function importLesson(lessonId: string) {
    if (!breadcrumbContext?.subjectId || !breadcrumbContext.sectionId) {
      setError("Import is only available inside a selected subject and section context.");
      return;
    }

    setError(null);
    setImportingLessonId(lessonId);
    startTransition(async () => {
      try {
        const response = await fetch("/api/teacher/lessons/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lessonId,
            subjectId: breadcrumbContext.subjectId,
            sectionId: breadcrumbContext.sectionId,
          }),
        });

        const payload = (await response.json()) as Record<string, unknown>;
        if (!response.ok) {
          setError(extractApiErrorMessage(payload, "Unable to import lesson into this section."));
          return;
        }

        await Promise.all([reloadLessons(), loadImportableLessons(importSearch)]);
        router.refresh();
      } finally {
        setImportingLessonId(null);
      }
    });
  }

  async function reloadLessons() {
    const params = new URLSearchParams();
    if (search) {
      params.set("search", search);
    }
    if (selectedSubject) {
      params.set("subject", selectedSubject);
    }
    if (breadcrumbContext?.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }

    const response = await fetch(`/api/teacher/lessons?${params.toString()}`, { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { lessons: Lesson[] };
    setLessons(payload.lessons);
  }

  async function uploadCover(file: File) {
    setError(null);
    setCoverUploading(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setForm((prev) => ({ ...prev, coverImageUrl: uploaded.url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Cover upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  function createLesson() {
    const lessonSubject = (selectedSubject ?? form.subject).trim();
    if (!lessonSubject) {
      setError("Select a subject first.");
      return;
    }
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          shortDescription: form.shortDescription,
          subject: lessonSubject,
          topic: form.topic,
          unit: form.unit || undefined,
          difficulty: form.difficulty || undefined,
          status: form.status,
          estimatedMinutes: Number(form.estimatedMinutes),
          coverImageUrl: form.coverImageUrl || undefined,
          contentMarkdown: form.contentMarkdown || "# New lesson",
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          sectionId: breadcrumbContext?.sectionId,
        }),
      });

      const payload = (await response.json()) as { lessonId?: string; error?: string; details?: unknown };
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to create lesson."));
        return;
      }

      if (!payload.lessonId) {
        setError("Lesson created, but lesson id was not returned.");
        return;
      }

      setForm(defaultForm(selectedSubject ?? subjectOptions[0] ?? ""));
      setCreateOpen(false);

      const params = new URLSearchParams();
      if (breadcrumbContext?.subjectId) {
        params.set("subjectId", breadcrumbContext.subjectId);
      }
      if (breadcrumbContext?.sectionId) {
        params.set("sectionId", breadcrumbContext.sectionId);
      }
      if (breadcrumbContext?.returnTab) {
        params.set("returnTab", breadcrumbContext.returnTab);
      }
      const query = params.toString();
      router.push(query ? `/teacher/lessons/${payload.lessonId}?${query}` : `/teacher/lessons/${payload.lessonId}`);
      router.refresh();
    });
  }

  function setStatus(lessonId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, status }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as Record<string, unknown>;
        setError(extractApiErrorMessage(payload, "Unable to update lesson status."));
        return;
      }

      await reloadLessons();
      router.refresh();
    });
  }

  function deleteLesson() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: deleteTarget.id, hardDelete: true }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to delete lesson."));
        return;
      }

      setDeleteTarget(null);
      await reloadLessons();
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {breadcrumbContext && subjectDetailHref ? (
        <nav aria-label="Lessons context breadcrumb" className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
            <li>
              <Link href="/teacher/subjects" className="hover:underline">
                Subjects
              </Link>
            </li>
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
              <Link href={subjectDetailHref} className="hover:underline">
                {breadcrumbContext.subjectName}
              </Link>
            </li>
            {breadcrumbContext.sectionName ? (
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                <Link href={subjectDetailHref} className="hover:underline">
                  {breadcrumbContext.sectionName}
                </Link>
              </li>
            ) : null}
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
              <span className="font-semibold text-[var(--ink-900)]">Lessons</span>
            </li>
          </ol>
        </nav>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink-900)]">Lesson Management</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Create manually or import an existing lesson into the active subject + section context.
              Import copies lesson content and quizzes only — student attempts stay on the source.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={openCreateModal} disabled={subjectOptions.length === 0}>
              Create Lesson
            </Button>
            <Button
              variant="secondary"
              onClick={() => void openImportModal()}
              disabled={subjectOptions.length === 0 || !breadcrumbContext?.subjectId || !breadcrumbContext.sectionId}
            >
              <Download className="h-4 w-4" />
              Import Lesson
            </Button>
          </div>
        </div>
        {subjectOptions.length === 0 ? (
          <div className="mt-3 rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            No subjects are assigned to your account. Ask admin to assign a subject first.
          </div>
        ) : null}
        {subjectOptions.length > 0 && (!breadcrumbContext?.subjectId || !breadcrumbContext.sectionId) ? (
          <div className="mt-3 rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-600)]">
            Open lessons from a specific subject + section context to enable section-attached import.
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Lessons</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-[var(--line-300)] bg-white p-1">
              <button
                type="button"
                onClick={() => setFilter("ACTIVE")}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                  filter === "ACTIVE"
                    ? "bg-[var(--brand-500)] text-white"
                    : "text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setFilter("ARCHIVED")}
                className={`h-8 rounded-md px-3 text-sm font-semibold transition ${
                  filter === "ARCHIVED"
                    ? "bg-[var(--brand-500)] text-white"
                    : "text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                }`}
              >
                Archived
              </button>
            </div>
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              placeholder="Search lessons"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={reloadLessons}>
              Refresh
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>
        {selectedSubject ? (
          <p className="mt-2 text-sm font-semibold text-[var(--brand-700)]">Subject: {selectedSubject}</p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--ink-500)]">
          Showing {paginatedLessons.length === 0 ? 0 : (currentPage - 1) * LESSONS_PER_PAGE + 1}-
          {Math.min(currentPage * LESSONS_PER_PAGE, filtered.length)} of {filtered.length} {filter.toLowerCase()} lesson
          {filtered.length === 1 ? "" : "s"}
        </p>

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
                  <th className="px-2 py-2 font-semibold">Title</th>
                  <th className="px-2 py-2 font-semibold">Subject / Topic</th>
                  <th className="px-2 py-2 font-semibold">Duration</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Updated</th>
                  <th className={stickyActionsThClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLessons.map((lesson) => (
                  <tr key={lesson.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="text-left font-semibold text-[var(--ink-900)] hover:text-[var(--brand-700)]"
                        onClick={() => openLesson(lesson.id)}
                      >
                        {lesson.title}
                      </button>
                      <p className="line-clamp-2 text-xs text-[var(--ink-500)]">{lesson.shortDescription}</p>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {lesson.subject} / {lesson.topic}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{lesson.estimatedMinutes ? `${lesson.estimatedMinutes} min` : "-"}</td>
                    <td className="px-2 py-2">
                      <Chip tone={lesson.status === "PUBLISHED" ? "success" : lesson.status === "ARCHIVED" ? "danger" : "warning"}>
                        {lesson.status}
                      </Chip>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-500)]">{formatDateTime(lesson.updatedAt)}</td>
                    <td className={stickyActionsTdClassName}>
                      <LessonActionMenu
                        lesson={lesson}
                        onSetStatus={setStatus}
                        onOpenLesson={openLesson}
                        onDelete={setDeleteTarget}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {paginatedLessons.map((lesson) => (
              <div
                key={lesson.id}
                role="button"
                tabIndex={0}
                onClick={() => openLesson(lesson.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openLesson(lesson.id);
                  }
                }}
                className="relative rounded-xl border border-[var(--line-200)] bg-white p-4 pr-14 transition hover:-translate-y-[1px] hover:border-[var(--brand-300)] hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)]"
              >
                <LessonActionMenu
                  lesson={lesson}
                  onSetStatus={setStatus}
                  onOpenLesson={openLesson}
                  onDelete={setDeleteTarget}
                  className="absolute right-3 top-3 w-auto"
                />

                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-bold text-[var(--ink-900)]">{lesson.title}</h3>
                  <Chip tone={lesson.status === "PUBLISHED" ? "success" : lesson.status === "ARCHIVED" ? "danger" : "warning"}>
                    {lesson.status}
                  </Chip>
                </div>

                <p className="mt-2 line-clamp-3 text-sm text-[var(--ink-600)]">{lesson.shortDescription}</p>
                <p className="mt-2 text-xs text-[var(--ink-500)]">
                  {lesson.subject} / {lesson.topic}
                  {lesson.estimatedMinutes ? ` • ${lesson.estimatedMinutes} min` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">Updated {formatDateTime(lesson.updatedAt)}</p>
              </div>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-5 text-center text-sm text-[var(--ink-500)]">
            No lessons found for this filter.
          </div>
        ) : null}

        {filtered.length > LESSONS_PER_PAGE ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line-200)] pt-4">
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="flex flex-wrap items-center gap-1">
              {pageNumbers.map((page) => (
                <button
                  key={`page-${page}`}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 min-w-9 rounded-md px-3 text-sm font-semibold transition ${
                    page === currentPage
                      ? "bg-[var(--brand-500)] text-white"
                      : "border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Lesson"
        description="Import an existing lesson into this active section and subject."
      >
        <div className="space-y-3">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void loadImportableLessons(importSearch);
            }}
          >
            <input
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto sm:min-w-[260px]"
              placeholder="Search title, summary, or teacher"
              value={importSearch}
              onChange={(event) => setImportSearch(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={importLoading}>
              {importLoading ? "Searching..." : "Search"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setImportSearch("");
                void loadImportableLessons();
              }}
              disabled={importLoading}
            >
              Reset
            </Button>
          </form>

          {importLoading ? (
            <div className="rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-sm text-[var(--ink-600)]">
              Loading importable lessons...
            </div>
          ) : null}

          {!importLoading && importableLessons.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-5 text-center text-sm text-[var(--ink-500)]">
              No importable lessons found for this subject + section context.
            </div>
          ) : null}

          <div className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
            {importableLessons.map((lesson) => (
              <div
                key={lesson.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[var(--ink-900)]">{lesson.title}</p>
                  <p className="line-clamp-2 text-sm text-[var(--ink-600)]">{lesson.shortDescription}</p>
                  <p className="mt-1 text-xs text-[var(--ink-500)]">
                    Topic: {lesson.topic} • By: {lesson.teacherName} • Updated {formatDateTime(lesson.updatedAt)}
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => importLesson(lesson.id)}
                  disabled={pending || importingLessonId === lesson.id}
                >
                  {importingLessonId === lesson.id ? "Importing..." : "Import"}
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Lesson"
        description="Configure lesson details and write content with markdown + media."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <InputField label="Title" value={form.title} onChange={(value) => setForm((prev) => ({ ...prev, title: value }))} />
            <label className="text-sm font-semibold text-[var(--ink-700)]">
              Subject
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.subject}
                onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                disabled={Boolean(selectedSubject)}
              >
                {subjectOptions.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
              {selectedSubject ? (
                <p className="mt-1 text-xs font-medium text-[var(--brand-700)]">
                  Subject is locked to the selected subject context: {selectedSubject}
                </p>
              ) : null}
            </label>
            <InputField label="Topic" value={form.topic} onChange={(value) => setForm((prev) => ({ ...prev, topic: value }))} />
            <InputField label="Unit (optional)" value={form.unit} onChange={(value) => setForm((prev) => ({ ...prev, unit: value }))} />
            <label className="text-sm font-semibold text-[var(--ink-700)]">
              Difficulty
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.difficulty}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, difficulty: event.target.value as LessonCreateForm["difficulty"] }))
                }
              >
                <option value="">Not set</option>
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-[var(--ink-700)]">
              Status
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as LessonCreateForm["status"] }))
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <InputField
              label="Estimated Minutes"
              type="number"
              value={form.estimatedMinutes}
              onChange={(value) => setForm((prev) => ({ ...prev, estimatedMinutes: value }))}
            />
            <InputField
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={(value) => setForm((prev) => ({ ...prev, tags: value }))}
              className="sm:col-span-2"
            />
            <InputField
              label="Cover Image URL"
              value={form.coverImageUrl}
              onChange={(value) => setForm((prev) => ({ ...prev, coverImageUrl: value }))}
              className="sm:col-span-2"
            />
            <label className="flex items-end text-sm font-semibold text-[var(--ink-700)]">
              <input
                ref={coverFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void uploadCover(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => coverFileInputRef.current?.click()}
                disabled={pending || coverUploading}
              >
                {coverUploading ? "Uploading..." : "Upload Cover"}
              </Button>
            </label>
          </div>

          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Short Description
            <textarea
              className="mt-1 min-h-20 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
              value={form.shortDescription}
              onChange={(event) => setForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
              placeholder="Write a short summary for the lesson."
            />
          </label>

          <div>
            <p className="mb-1 text-sm font-semibold text-[var(--ink-700)]">Lesson Content</p>
            <LessonMarkdownEditor
              value={form.contentMarkdown}
              onChange={(next) => setForm((prev) => ({ ...prev, contentMarkdown: next }))}
              minHeightClassName="min-h-72"
              disabled={pending}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createLesson} disabled={pending}>
              {pending ? "Saving..." : "Create Lesson"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete Lesson"
        description="This permanently removes the lesson, its linked quizzes, and related student attempts."
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
            <Button variant="danger" onClick={deleteLesson} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Lesson
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function LessonActionMenu({
  lesson,
  onSetStatus,
  onOpenLesson,
  onDelete,
  className,
}: {
  lesson: Lesson;
  onSetStatus: (lessonId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") => void;
  onOpenLesson: (lessonId: string) => void;
  onDelete: (lesson: Lesson) => void;
  className?: string;
}) {
  return (
    <ActionMenu
      className={className}
      iconTrigger
      ariaLabel="Lesson actions"
      groups={[
        {
          items: [
            {
              label: "Open Lesson",
              icon: <FolderOpen className="h-4 w-4" />,
              onSelect: () => onOpenLesson(lesson.id),
            },
            {
              label: "Manage Quizzes",
              icon: <BookOpen className="h-4 w-4" />,
              onSelect: () => onOpenLesson(lesson.id),
            },
          ],
        },
        {
          items: [
            {
              label: "Set Draft",
              icon: <Edit3 className="h-4 w-4" />,
              onSelect: () => onSetStatus(lesson.id, "DRAFT"),
            },
            {
              label: "Publish",
              icon: <Upload className="h-4 w-4" />,
              onSelect: () => onSetStatus(lesson.id, "PUBLISHED"),
            },
          ],
        },
        {
          items: [
            {
              label: "Archive",
              icon: <Archive className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => onSetStatus(lesson.id, "ARCHIVED"),
            },
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => onDelete(lesson),
            },
          ],
        },
      ]}
    />
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  className?: string;
}) {
  return (
    <label className={`text-sm font-semibold text-[var(--ink-700)] ${className}`}>
      {label}
      <input
        className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
