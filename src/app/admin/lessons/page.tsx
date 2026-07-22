import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { formatDateTime } from "@/lib/date-display";
import { listLessons } from "@/server/queries/lessons";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

type AdminLessonsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 20;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AdminLessonsPage({ searchParams }: AdminLessonsPageProps) {
  const query = await searchParams;
  const displayPreferences = getSystemDisplayPreferences();
  const requestedPage = parsePage(query.page);
  const lessons = listLessons();
  const pageCount = Math.max(1, Math.ceil(lessons.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * PAGE_SIZE;
  const paginatedLessons = lessons.slice(start, start + PAGE_SIZE);
  const pageHref = (nextPage: number) => `/admin/lessons?page=${nextPage}`;

  return (
    <Card>
      <h2 className="text-lg font-bold text-[var(--ink-900)]">Lesson Oversight</h2>
      <p className="mt-1 text-sm text-[var(--ink-500)]">Monitor active/inactive content across all teachers.</p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
              <th className="px-2 py-2 font-semibold">Title</th>
              <th className="px-2 py-2 font-semibold">Teacher</th>
              <th className="px-2 py-2 font-semibold">Subject</th>
              <th className="px-2 py-2 font-semibold">Topic</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2 font-semibold">Updated</th>
            </tr>
          </thead>
          <tbody>
            {paginatedLessons.map((lesson) => (
              <tr key={lesson.id} className="border-b border-[var(--line-100)]">
                <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{lesson.title}</td>
                <td className="px-2 py-2">{lesson.teacherName}</td>
                <td className="px-2 py-2">{lesson.subject}</td>
                <td className="px-2 py-2">{lesson.topic}</td>
                <td className="px-2 py-2">
                  <Chip tone={lesson.status === "PUBLISHED" ? "success" : lesson.status === "ARCHIVED" ? "danger" : "warning"}>
                    {lesson.status}
                  </Chip>
                </td>
                <td className="px-2 py-2 text-[var(--ink-500)]">{formatDateTime(lesson.updatedAt, displayPreferences)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lessons.length > PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
          <p className="text-xs text-[var(--ink-500)]">
            Showing {start + 1}-{Math.min(start + PAGE_SIZE, lessons.length)} of {lessons.length}
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
