"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { StudentPageHeader, studentPrimaryLinkClassName, studentSecondaryLinkClassName } from "@/components/student/student-page-header";

type SubjectRow = {
  id: string;
  name: string;
  code: string;
  lessonCount: number;
};

type StudentSubjectsListProps = {
  subjects: SubjectRow[];
};

const PAGE_SIZE = 9;

export function StudentSubjectsList({ subjects }: StudentSubjectsListProps) {
  const [viewMode, setViewMode] = usePersistedViewMode("learnhub:view:student-subjects");
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(subjects.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return subjects.slice(start, start + PAGE_SIZE);
  }, [safePage, subjects]);

  return (
    <div>
      <StudentPageHeader
        title="Subjects"
        description="Open an assigned subject to browse its lessons."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Subjects" },
        ]}
        actions={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
      />

      {viewMode === "list" ? (
        <Card className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Code</th>
                  <th className="px-2 py-2 font-semibold">Subject</th>
                  <th className="px-2 py-2 font-semibold">Lessons</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((subject) => (
                  <tr key={subject.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-semibold text-[var(--ink-700)]">{subject.code}</td>
                    <td className="px-2 py-2 font-medium text-[var(--ink-900)]">{subject.name}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{subject.lessonCount}</td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/student/lessons?subject=${encodeURIComponent(subject.name)}`}
                        className={studentPrimaryLinkClassName("h-9 min-w-0")}
                      >
                        Open Lessons
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
            <Link key={subject.id} href={`/student/lessons?subject=${encodeURIComponent(subject.name)}`}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-600)]">{subject.code}</p>
                <h3 className="mt-2 text-lg font-bold text-[var(--ink-900)]">{subject.name}</h3>
                <p className="mt-2 text-sm text-[var(--ink-500)]">{subject.lessonCount} lessons</p>
                <span className={studentSecondaryLinkClassName("mt-4 h-9 w-full")}>Open Lessons</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {subjects.length === 0 ? (
        <Card className="mt-5 border-dashed bg-[var(--line-100)] text-center">
          <p className="text-sm text-[var(--ink-500)]">No assigned subjects yet. Ask your teacher or admin for a section assignment.</p>
        </Card>
      ) : null}
      <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={subjects.length} onPageChange={setPage} />
    </div>
  );
}
