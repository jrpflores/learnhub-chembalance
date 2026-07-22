"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { StudentPageHeader, studentPrimaryLinkClassName, studentSecondaryLinkClassName } from "@/components/student/student-page-header";

type QuizItem = {
  id: string;
  title: string;
  description: string;
  lessonTitle: string | null;
  passingScore: number;
  timeLimitSec: number | null;
  maxAttempts: number;
  questionCount: number;
  attemptsUsed: number;
  latestOutcome: string | null;
  canAttempt: boolean;
};

type StudentQuizzesListProps = {
  quizzes: QuizItem[];
};

const PAGE_SIZE = 9;

function outcomeLabel(outcome: string | null) {
  if (!outcome) {
    return "New";
  }
  return outcome === "PENDING" ? "Processing" : outcome;
}

function outcomeTone(outcome: string | null) {
  if (outcome === "PASSED") {
    return "success" as const;
  }
  if (outcome === "FAILED") {
    return "warning" as const;
  }
  return "neutral" as const;
}

function AttemptButton({ quiz }: { quiz: QuizItem }) {
  if (quiz.canAttempt) {
    return (
      <Link href={`/student/quizzes/${quiz.id}`} className={studentPrimaryLinkClassName()}>
        Take Quiz
      </Link>
    );
  }

  return (
    <span className="inline-flex h-10 min-w-[128px] cursor-not-allowed items-center justify-center rounded-xl bg-[var(--line-200)] px-4 text-sm font-semibold text-[var(--ink-500)]">
      No Attempts Left
    </span>
  );
}

export function StudentQuizzesList({ quizzes }: StudentQuizzesListProps) {
  const [viewMode, setViewMode] = usePersistedViewMode("learnhub:view:student-quizzes");
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(quizzes.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return quizzes.slice(start, start + PAGE_SIZE);
  }, [quizzes, safePage]);

  return (
    <div>
      <StudentPageHeader
        title="Quizzes"
        description="Challenge mode with clear attempts and progress feedback."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Quizzes" },
        ]}
        actions={
          <>
            <Link href="/student/results" className={studentSecondaryLinkClassName("h-9")}>
              Results
            </Link>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </>
        }
      />

      {viewMode === "list" ? (
        <Card className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Quiz</th>
                  <th className="px-2 py-2 font-semibold">Lesson</th>
                  <th className="px-2 py-2 font-semibold">Questions</th>
                  <th className="px-2 py-2 font-semibold">Pass / Time</th>
                  <th className="px-2 py-2 font-semibold">Attempts</th>
                  <th className="px-2 py-2 font-semibold">Outcome</th>
                  <th className="px-2 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((quiz) => (
                  <tr key={quiz.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2">
                      <p className="font-semibold text-[var(--ink-900)]">{quiz.title}</p>
                      <p className="line-clamp-2 text-xs text-[var(--ink-500)]">{quiz.description}</p>
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{quiz.lessonTitle ?? "-"}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">{quiz.questionCount}</td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {quiz.passingScore}%{quiz.timeLimitSec ? ` • ${Math.round(quiz.timeLimitSec / 60)} min` : " • No limit"}
                    </td>
                    <td className="px-2 py-2 text-[var(--ink-700)]">
                      {quiz.maxAttempts <= 0 ? `${quiz.attemptsUsed}/Unlimited` : `${quiz.attemptsUsed}/${quiz.maxAttempts}`}
                    </td>
                    <td className="px-2 py-2">
                      <Chip tone={outcomeTone(quiz.latestOutcome)}>{outcomeLabel(quiz.latestOutcome)}</Chip>
                    </td>
                    <td className="px-2 py-2">
                      <AttemptButton quiz={quiz} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {paginated.map((quiz) => (
            <Card key={quiz.id} className="flex h-full flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="line-clamp-2 text-lg font-bold text-[var(--ink-900)]">{quiz.title}</h3>
                  <Chip tone={outcomeTone(quiz.latestOutcome)}>{outcomeLabel(quiz.latestOutcome)}</Chip>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-[var(--ink-600)]">{quiz.description}</p>
                <p className="mt-2 text-xs text-[var(--ink-500)]">
                  {quiz.questionCount} questions • Pass {quiz.passingScore}%
                  {quiz.timeLimitSec ? ` • ${Math.round(quiz.timeLimitSec / 60)} min` : ""}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  Attempts: {quiz.maxAttempts <= 0 ? `${quiz.attemptsUsed}/Unlimited` : `${quiz.attemptsUsed}/${quiz.maxAttempts}`}
                </p>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                {quiz.lessonTitle ? <p className="text-xs text-[var(--ink-500)]">Lesson: {quiz.lessonTitle}</p> : <span />}
                <AttemptButton quiz={quiz} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {quizzes.length === 0 ? (
        <Card className="mt-5 border-dashed bg-[var(--line-100)] text-center">
          <p className="text-sm text-[var(--ink-500)]">No quizzes available yet. Lessons may still be draft or unpublished.</p>
          <div className="mt-3 flex justify-center gap-2">
            <Link href="/student/lessons" className={studentSecondaryLinkClassName("h-9")}>
              Browse Lessons
            </Link>
          </div>
        </Card>
      ) : null}
      <PaginationControls page={safePage} pageSize={PAGE_SIZE} total={quizzes.length} onPageChange={setPage} />
    </div>
  );
}
