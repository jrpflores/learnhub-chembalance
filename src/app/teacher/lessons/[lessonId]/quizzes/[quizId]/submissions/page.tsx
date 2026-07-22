import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/date-display";
import { formatSeconds } from "@/lib/utils";
import { canTeacherAccessLesson, getLessonById } from "@/server/queries/lessons";
import { canTeacherAccessQuiz, getQuizById, listQuizSubmissionsForTeacher } from "@/server/queries/quizzes";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

type TeacherQuizSubmissionsPageProps = {
  params: Promise<{ lessonId: string; quizId: string }>;
  searchParams: Promise<{ subjectId?: string; sectionId?: string; page?: string; returnTab?: string }>;
};

const PAGE_SIZE = 20;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function TeacherQuizSubmissionsPage({ params, searchParams }: TeacherQuizSubmissionsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const displayPreferences = getSystemDisplayPreferences();
  const { lessonId, quizId } = await params;
  const query = await searchParams;

  const lesson = getLessonById(lessonId);
  if (!lesson || !canTeacherAccessLesson(user.id, lessonId)) {
    notFound();
  }

  const quiz = getQuizById(quizId);
  if (!quiz || !canTeacherAccessQuiz(user.id, quizId) || quiz.lessonId !== lessonId) {
    notFound();
  }

  const submissions = listQuizSubmissionsForTeacher(user.id, quizId);
  const requestedSubjectId = query.subjectId?.trim();
  const requestedSectionId = query.sectionId?.trim();
  const requestedReturnTab = query.returnTab?.trim();
  const returnTab =
    requestedReturnTab === "students" ||
    requestedReturnTab === "lessons" ||
    requestedReturnTab === "quizzes" ||
    requestedReturnTab === "background-jobs"
      ? requestedReturnTab
      : undefined;
  const requestedPage = parsePage(query.page);
  const breadcrumbSubjectContext = requestedSubjectId ? getTeacherSubjectContext(user.id, requestedSubjectId) : null;
  const breadcrumbSection = requestedSectionId
    ? breadcrumbSubjectContext?.sections.find((section) => section.id === requestedSectionId)
    : undefined;
  const contextQuery = new URLSearchParams();
  if (breadcrumbSubjectContext?.subject.id) {
    contextQuery.set("subjectId", breadcrumbSubjectContext.subject.id);
  }
  if (breadcrumbSection?.id) {
    contextQuery.set("sectionId", breadcrumbSection.id);
  }
  if (returnTab) {
    contextQuery.set("returnTab", returnTab);
  }
  const contextQueryString = contextQuery.toString();
  const withContext = (path: string) => (contextQueryString ? `${path}?${contextQueryString}` : path);
  const submissionsPageCount = Math.max(1, Math.ceil(submissions.length / PAGE_SIZE));
  const submissionsPage = Math.min(requestedPage, submissionsPageCount);
  const submissionsStart = (submissionsPage - 1) * PAGE_SIZE;
  const paginatedSubmissions = submissions.slice(submissionsStart, submissionsStart + PAGE_SIZE);
  const submissionsPageHref = (nextPage: number) => {
    const params = new URLSearchParams(contextQueryString);
    params.set("page", String(nextPage));
    return `/teacher/lessons/${lessonId}/quizzes/${quizId}/submissions?${params.toString()}`;
  };
  const subjectDetailHref = (() => {
    if (!breadcrumbSubjectContext) {
      return null;
    }
    const params = new URLSearchParams();
    if (breadcrumbSection?.id) {
      params.set("sectionId", breadcrumbSection.id);
    }
    if (returnTab) {
      params.set("tab", returnTab);
    }
    const queryString = params.toString();
    return queryString
      ? `/teacher/subjects/${breadcrumbSubjectContext.subject.id}?${queryString}`
      : `/teacher/subjects/${breadcrumbSubjectContext.subject.id}`;
  })();

  return (
    <div className="space-y-4">
      <nav aria-label="Quiz submissions breadcrumb" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
          <li>
            <Link href={breadcrumbSection ? `/teacher/subjects?sectionId=${breadcrumbSection.id}` : "/teacher/subjects"} className="hover:underline">
              Subjects
            </Link>
          </li>
          {breadcrumbSubjectContext ? (
            <>
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                {subjectDetailHref ? (
                  <Link href={subjectDetailHref} className="hover:underline">
                    {breadcrumbSubjectContext.subject.name}
                  </Link>
                ) : (
                  <span>{breadcrumbSubjectContext.subject.name}</span>
                )}
              </li>
              {breadcrumbSection ? (
                <li className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                  {subjectDetailHref ? (
                    <Link href={subjectDetailHref} className="hover:underline">
                      {breadcrumbSection.name}
                    </Link>
                  ) : (
                    <span>{breadcrumbSection.name}</span>
                  )}
                </li>
              ) : null}
            </>
          ) : null}
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lessonId}`)} className="hover:underline">
              {lesson.title}
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}`)} className="hover:underline">
              {quiz.title}
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <span className="font-semibold text-[var(--ink-900)]">Submitted Answers</span>
          </li>
        </ol>
      </nav>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">Quiz Submissions</p>
            <h2 className="text-2xl font-black text-[var(--ink-900)]">{quiz.title}</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Review submitted answers and apply teacher corrections when needed.
            </p>
          </div>
          <Link
            href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}`)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--brand-500)] px-4 text-sm font-medium text-white hover:bg-[var(--brand-600)]"
          >
            Back to Quiz
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SummaryMetric label="Total Submissions" value={submissions.length} />
          <SummaryMetric
            label="Needs Manual Review"
            value={submissions.filter((submission) => submission.reviewFlagCount > 0).length}
          />
          <SummaryMetric
            label="Average Score"
            value={
              submissions.length > 0
                ? `${(
                    submissions.reduce((sum, submission) => sum + Number(submission.scorePercent ?? 0), 0) /
                    submissions.length
                  ).toFixed(1)}%`
                : "0%"
            }
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Submitted Attempts</h3>

        {submissions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center">
            <p className="text-base font-semibold text-[var(--ink-800)]">No submissions yet</p>
            <p className="mt-1 text-sm text-[var(--ink-500)]">Student attempts will appear here once quizzes are submitted.</p>
          </div>
        ) : (
          <div className={tableScrollClassName}>
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Student</th>
                  <th className="px-2 py-2 font-semibold">Attempt</th>
                  <th className="px-2 py-2 font-semibold">Result</th>
                  <th className="px-2 py-2 font-semibold">Score</th>
                  <th className="px-2 py-2 font-semibold">Correct/Wrong</th>
                  <th className="px-2 py-2 font-semibold">Time Spent</th>
                  <th className="px-2 py-2 font-semibold">Submitted</th>
                  <th className={stickyActionsThClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSubmissions.map((submission) => (
                  <tr key={submission.attemptId} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{submission.studentName}</td>
                    <td className="px-2 py-2">#{submission.attemptNumber}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Chip tone={submission.outcome === "PASSED" ? "success" : "warning"}>{submission.outcome}</Chip>
                        {submission.reviewFlagCount > 0 ? <Chip tone="warning">Review {submission.reviewFlagCount}</Chip> : null}
                      </div>
                    </td>
                    <td className="px-2 py-2">{Number(submission.scorePercent ?? 0).toFixed(1)}%</td>
                    <td className="px-2 py-2">
                      {(submission.correctCount ?? 0)}/{(submission.wrongCount ?? 0)}
                    </td>
                    <td className="px-2 py-2">{formatSeconds(submission.timeSpentSec)}</td>
                    <td className="px-2 py-2">
                      {submission.submittedAt
                        ? formatDateTime(submission.submittedAt, displayPreferences)
                        : formatDateTime(submission.createdAt, displayPreferences)}
                    </td>
                    <td className={stickyActionsTdClassName}>
                      <Link
                        href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}/submissions/${submission.attemptId}`)}
                        className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] px-3 text-sm font-medium text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                      >
                        Review Answers
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {submissions.length > PAGE_SIZE ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
            <p className="text-xs text-[var(--ink-500)]">
              Showing {submissionsStart + 1}-{Math.min(submissionsStart + PAGE_SIZE, submissions.length)} of {submissions.length}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={submissionsPage > 1 ? submissionsPageHref(submissionsPage - 1) : "#"}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                  submissionsPage > 1
                    ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                    : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                }`}
              >
                Previous
              </Link>
              <span className="text-xs font-semibold text-[var(--ink-600)]">
                Page {submissionsPage}/{submissionsPageCount}
              </span>
              <Link
                href={submissionsPage < submissionsPageCount ? submissionsPageHref(submissionsPage + 1) : "#"}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                  submissionsPage < submissionsPageCount
                    ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                    : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-base font-bold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
