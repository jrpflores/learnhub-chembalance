"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Progress } from "@/components/ui/progress";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { StudentPageHeader, studentPrimaryLinkClassName, studentSecondaryLinkClassName } from "@/components/student/student-page-header";

type LessonItem = {
  id: string;
  title: string;
  shortDescription: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD" | null;
  coverImageUrl: string | null;
  teacherName: string;
  estimatedMinutes: number | null;
  quizCount: number;
  completionPercent: number;
};

type StudentLessonsListProps = {
  lessons: LessonItem[];
  selectedSubject: string | null;
};

const PAGE_SIZE = 9;

export function StudentLessonsList({ lessons, selectedSubject }: StudentLessonsListProps) {
  const [viewMode, setViewMode] = usePersistedViewMode("learnhub:view:student-lessons");
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(lessons.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return lessons.slice(start, start + PAGE_SIZE);
  }, [lessons, safePage]);

  return (
    <div>
      <StudentPageHeader
        title="Lessons"
        description="Track progress and jump back where you left off."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Lessons" },
        ]}
        actions={
          <>
            <Link href="/student/subjects" className={studentSecondaryLinkClassName("h-9")}>
              Subjects
            </Link>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </>
        }
      />
      {selectedSubject ? (
        <p className="mt-2 text-sm font-semibold text-[var(--brand-700)]">Filtered by subject: {selectedSubject}</p>
      ) : (
        <p className="mt-2 text-sm text-[var(--ink-500)]">
          Tip: open a subject first for a tighter lesson list.
        </p>
      )}

      {viewMode === "list" ? (
        <Card className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Lesson</th>
                  <th className="px-2 py-2 font-semibold">Subject / Topic</th>
                  <th className="px-2 py-2 font-semibold">Teacher</th>
                  <th className="px-2 py-2 font-semibold">Quizzes</th>
                  <th className="px-2 py-2 font-semibold">Progress</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((lesson) => (
                  <tr key={lesson.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-[var(--ink-900)]">{lesson.title}</p>
                      <p className="line-clamp-2 text-xs text-[var(--ink-500)]">{lesson.shortDescription}</p>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {lesson.subject} / {lesson.topic}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{lesson.teacherName}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{lesson.quizCount}</td>
                    <td className="px-2 py-2">
                      <div className="min-w-[140px]">
                        <Progress value={lesson.completionPercent} />
                        <p className="mt-1 text-xs text-[var(--ink-500)]">{lesson.completionPercent}%</p>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/student/lessons/${lesson.id}`} className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                        Open
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
          {paginated.map((lesson) => (
            <Link key={lesson.id} href={`/student/lessons/${lesson.id}`}>
              <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lg">
                {lesson.coverImageUrl ? (
                  <Image
                    src={lesson.coverImageUrl}
                    alt={lesson.title}
                    className="mb-3 h-36 w-full rounded-xl object-cover"
                    width={640}
                    height={320}
                    unoptimized
                  />
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Chip tone="brand">{lesson.subject}</Chip>
                  <Chip tone="neutral">{lesson.topic}</Chip>
                  {lesson.difficulty ? (
                    <Chip tone={lesson.difficulty === "HARD" ? "danger" : lesson.difficulty === "MEDIUM" ? "warning" : "success"}>
                      {lesson.difficulty}
                    </Chip>
                  ) : null}
                </div>

                <h3 className="mt-3 line-clamp-2 text-lg font-bold text-[var(--ink-900)]">{lesson.title}</h3>
                <p className="mt-1 line-clamp-3 text-sm text-[var(--ink-600)]">{lesson.shortDescription}</p>

                <div className="mt-3 space-y-2 text-xs text-[var(--ink-500)]">
                  <p>Teacher: {lesson.teacherName}</p>
                  <p>
                    Quizzes: {lesson.quizCount}
                    {lesson.estimatedMinutes ? ` • ${lesson.estimatedMinutes} min` : ""}
                  </p>
                  <Progress value={lesson.completionPercent} />
                  <p className="font-semibold text-[var(--ink-700)]">{lesson.completionPercent}% complete</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {lessons.length === 0 ? (
        <Card className="mt-5 border-dashed bg-[var(--line-100)] text-center">
          <p className="text-sm text-[var(--ink-500)]">
            {selectedSubject ? "No published lessons for this subject yet." : "No published lessons available yet."}
          </p>
          <div className="mt-3 flex justify-center">
            <Link href="/student/subjects" className={studentSecondaryLinkClassName("h-9")}>
              Browse Subjects
            </Link>
          </div>
        </Card>
      ) : null}
      <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={lessons.length} onPageChange={setPage} />
    </div>
  );
}
