"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  lessonCount: number;
  sectionCount: number;
};

type TeacherSubjectsListProps = {
  sections: {
    id: string;
    name: string;
  }[];
  subjects: SubjectRow[];
  selectedSection?: {
    id: string;
    name: string;
    subjectId: string | null;
    studentCount: number;
  } | null;
};

const PAGE_SIZE = 8;

function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function TeacherSubjectsList({ sections, subjects, selectedSection = null }: TeacherSubjectsListProps) {
  const router = useRouter();
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return subjects;
    }
    return subjects.filter((subject) => {
      return (
        subject.name.toLowerCase().includes(query) ||
        subject.code.toLowerCase().includes(query) ||
        (subject.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [search, subjects]);

  const currentPageCount = pageCount(filtered.length);
  const safePage = Math.min(page, currentPageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(start, start + PAGE_SIZE);

  const selectedSectionHint = selectedSection
    ? `Current section context: ${selectedSection.name}. Open a subject to continue in this section.`
    : "Choose a subject to manage class roster, lessons, and quizzes.";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[var(--ink-900)]">Subjects</h2>
          <p className="mt-1 text-sm text-[var(--ink-500)]">{selectedSectionHint}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:items-center">
          <select
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
            value={selectedSection?.id ?? ""}
            onChange={(event) => {
              const nextSectionId = event.target.value;
              if (nextSectionId) {
                router.push(`/teacher/subjects?sectionId=${encodeURIComponent(nextSectionId)}`);
                return;
              }
              router.push("/teacher/subjects");
            }}
          >
            <option value="">All assigned sections</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
          <input
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
            placeholder="Search subject name or code"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {selectedSection ? (
        <Card className="mt-4 border-[var(--brand-300)] bg-[var(--brand-100)]">
          <p className="text-sm font-semibold text-[var(--brand-700)]">Active Section: {selectedSection.name}</p>
          <p className="mt-1 text-xs text-[var(--ink-600)]">
            {selectedSection.studentCount} assigned students. Subject listings are filtered to this section context.
          </p>
        </Card>
      ) : null}

      {viewMode === "list" ? (
        <Card className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Code</th>
                  <th className="px-2 py-2 font-semibold">Subject</th>
                  <th className="px-2 py-2 font-semibold">Sections</th>
                  <th className="px-2 py-2 font-semibold">Lessons</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((subject) => (
                  <tr key={subject.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-semibold text-[var(--ink-700)]">{subject.code}</td>
                    <td className="px-2 py-2">
                      <p className="font-medium text-[var(--ink-900)]">{subject.name}</p>
                      {subject.description ? <p className="text-xs text-[var(--ink-500)]">{subject.description}</p> : null}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{subject.sectionCount}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{subject.lessonCount}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/teacher/subjects/${subject.id}${selectedSection ? `?sectionId=${selectedSection.id}` : ""}`}
                        className="inline-flex items-center gap-1 text-[var(--brand-700)] underline-offset-2 hover:underline"
                      >
                        Open Subject
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((subject) => (
            <Link
              key={subject.id}
              href={`/teacher/subjects/${subject.id}${selectedSection ? `?sectionId=${selectedSection.id}` : ""}`}
            >
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-600)]">{subject.code}</p>
                <h3 className="mt-2 text-lg font-bold text-[var(--ink-900)]">{subject.name}</h3>
                {subject.description ? <p className="mt-2 line-clamp-2 text-sm text-[var(--ink-500)]">{subject.description}</p> : null}
                <p className="mt-2 text-sm text-[var(--ink-500)]">
                  {subject.sectionCount} sections • {subject.lessonCount} lessons
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {filtered.length > PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
          <p className="text-xs text-[var(--ink-500)]">
            Showing {filtered.length === 0 ? 0 : start + 1}-{Math.min(start + PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="h-8 rounded-md border border-[var(--line-300)] bg-white px-3 text-xs font-semibold text-[var(--ink-700)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="text-xs font-semibold text-[var(--ink-600)]">
              Page {safePage} / {currentPageCount}
            </span>
            <button
              type="button"
              className="h-8 rounded-md border border-[var(--line-300)] bg-white px-3 text-xs font-semibold text-[var(--ink-700)] disabled:cursor-not-allowed disabled:opacity-40"
              disabled={safePage >= currentPageCount}
              onClick={() => setPage((prev) => Math.min(currentPageCount, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {subjects.length === 0 ? (
        <Card className="mt-5 border-dashed bg-[var(--line-100)] text-center text-sm text-[var(--ink-500)]">
          No assigned subjects yet.
        </Card>
      ) : null}

      {subjects.length > 0 && filtered.length === 0 ? (
        <Card className="mt-5 border-dashed bg-[var(--line-100)] text-center text-sm text-[var(--ink-500)]">
          No subjects matched your search.
        </Card>
      ) : null}
    </div>
  );
}
