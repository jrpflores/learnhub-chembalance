import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { listQuizzes } from "@/server/queries/quizzes";

type AdminQuizzesPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AdminQuizzesPage({ searchParams }: AdminQuizzesPageProps) {
  const query = await searchParams;
  const requestedPage = parsePage(query.page);
  const quizzes = listQuizzes({});
  const pageCount = Math.max(1, Math.ceil(quizzes.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const paginatedQuizzes = quizzes.slice(start, start + PAGE_SIZE);
  const pageHref = (nextPage: number) => `/admin/quizzes?page=${nextPage}`;

  return (
    <Card>
      <h2 className="text-lg font-bold text-[var(--ink-900)]">Quiz Oversight</h2>
      <p className="mt-1 text-sm text-[var(--ink-500)]">Review publishing status, timing windows, and participation readiness.</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
              <th className="px-2 py-2 font-semibold">Title</th>
              <th className="px-2 py-2 font-semibold">Teacher</th>
              <th className="px-2 py-2 font-semibold">Lesson</th>
              <th className="px-2 py-2 font-semibold">Questions</th>
              <th className="px-2 py-2 font-semibold">Attempts</th>
              <th className="px-2 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQuizzes.map((quiz) => (
              <tr key={quiz.id} className="border-b border-[var(--line-100)]">
                <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{quiz.title}</td>
                <td className="px-2 py-2">{quiz.teacherName}</td>
                <td className="px-2 py-2">{quiz.lessonTitle ?? "-"}</td>
                <td className="px-2 py-2">{quiz.questionCount}</td>
                <td className="px-2 py-2">{quiz.maxAttempts <= 0 ? "Unlimited" : quiz.maxAttempts}</td>
                <td className="px-2 py-2">
                  <Chip tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "danger" : "warning"}>
                    {quiz.status}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {quizzes.length > PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
          <p className="text-xs text-[var(--ink-500)]">
            Showing {start + 1}-{Math.min(start + PAGE_SIZE, quizzes.length)} of {quizzes.length}
          </p>
          <div className="flex items-center gap-2">
            <Link
              href={page > 1 ? pageHref(page - 1) : "#"}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                page > 1
                  ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                  : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
              }`}
            >
              Previous
            </Link>
            <span className="text-xs font-semibold text-[var(--ink-600)]">
              Page {page}/{pageCount}
            </span>
            <Link
              href={page < pageCount ? pageHref(page + 1) : "#"}
              className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                page < pageCount
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
  );
}
