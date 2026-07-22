"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { StudentPageHeader, studentPrimaryLinkClassName, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { formatDateTime } from "@/lib/date-display";
import { formatSeconds } from "@/lib/utils";

type AttemptItem = {
  id: string;
  quizTitle: string;
  attemptNumber: number;
  outcome: string;
  scorePercent: number | null;
  timeSpentSec: number | null;
  createdAt: string;
};

type StudentResultsListProps = {
  attempts: AttemptItem[];
};

const PAGE_SIZE = 10;

function outcomeLabel(outcome: string) {
  return outcome === "PENDING" ? "Processing" : outcome;
}

function outcomeTone(outcome: string) {
  if (outcome === "PASSED") {
    return "success" as const;
  }
  if (outcome === "FAILED") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export function StudentResultsList({ attempts }: StudentResultsListProps) {
  const [viewMode, setViewMode] = usePersistedViewMode("learnhub:view:student-results", "list");
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(attempts.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return attempts.slice(start, start + PAGE_SIZE);
  }, [attempts, safePage]);

  return (
    <div>
      <StudentPageHeader
        title="Results"
        description="Track progress, retries, and improvement over time."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Results" },
        ]}
        actions={
          <>
            <Link href="/student/quizzes" className={studentSecondaryLinkClassName("h-9")}>
              Quizzes
            </Link>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </>
        }
      />

      <Card className="mt-5">
        {viewMode === "list" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Quiz</th>
                  <th className="px-2 py-2 font-semibold">Attempt</th>
                  <th className="px-2 py-2 font-semibold">Score</th>
                  <th className="px-2 py-2 font-semibold">Outcome</th>
                  <th className="px-2 py-2 font-semibold">Time Spent</th>
                  <th className="px-2 py-2 font-semibold">Date</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((attempt) => (
                  <tr key={attempt.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{attempt.quizTitle}</td>
                    <td className="px-2 py-2">#{attempt.attemptNumber}</td>
                    <td className="px-2 py-2">{attempt.scorePercent === null ? "--" : `${attempt.scorePercent}%`}</td>
                    <td className="px-2 py-2">
                      <Chip tone={outcomeTone(attempt.outcome)}>{outcomeLabel(attempt.outcome)}</Chip>
                    </td>
                    <td className="px-2 py-2">{formatSeconds(attempt.timeSpentSec)}</td>
                    <td className="px-2 py-2 text-[var(--ink-500)]">{formatDateTime(attempt.createdAt)}</td>
                    <td className="px-2 py-2">
                      <Link href={`/student/results/${attempt.id}`} className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paginated.map((attempt) => (
              <div key={attempt.id} className="rounded-xl border border-[var(--line-200)] bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-bold text-[var(--ink-900)]">{attempt.quizTitle}</h3>
                  <Chip tone={outcomeTone(attempt.outcome)}>{outcomeLabel(attempt.outcome)}</Chip>
                </div>
                <p className="mt-2 text-sm text-[var(--ink-600)]">
                  Attempt #{attempt.attemptNumber} • {attempt.scorePercent === null ? "--" : `${attempt.scorePercent}%`}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  {formatSeconds(attempt.timeSpentSec)} • {formatDateTime(attempt.createdAt)}
                </p>
                <div className="mt-4">
                  <Link href={`/student/results/${attempt.id}`} className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                    View Result
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {attempts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center">
            <p className="text-sm text-[var(--ink-500)]">No quiz attempts yet.</p>
            <div className="mt-3 flex justify-center">
              <Link href="/student/quizzes" className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                Go to Quizzes
              </Link>
            </div>
          </div>
        ) : null}
        <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={attempts.length} onPageChange={setPage} />
      </Card>
    </div>
  );
}
