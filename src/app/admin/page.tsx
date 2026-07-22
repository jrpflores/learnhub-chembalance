import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { formatDateTime } from "@/lib/date-display";
import { adminOverview } from "@/server/queries/admin";
import { listRecentActivities } from "@/server/queries/quizzes";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

type AdminDashboardPageProps = {
  searchParams: Promise<{ teacherPage?: string }>;
};

const TEACHER_PAGE_SIZE = 10;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AdminDashboardPage({ searchParams }: AdminDashboardPageProps) {
  const query = await searchParams;
  const displayPreferences = getSystemDisplayPreferences();
  const overview = adminOverview();
  const activity = listRecentActivities(10);
  const requestedTeacherPage = parsePage(query.teacherPage);
  const teacherPageCount = Math.max(1, Math.ceil(overview.teacherActivity.length / TEACHER_PAGE_SIZE));
  const teacherPage = Math.min(requestedTeacherPage, teacherPageCount);
  const teacherStart = (teacherPage - 1) * TEACHER_PAGE_SIZE;
  const paginatedTeacherActivity = overview.teacherActivity.slice(teacherStart, teacherStart + TEACHER_PAGE_SIZE);
  const teacherPageHref = (nextPage: number) => `/admin?teacherPage=${nextPage}`;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={overview.users.students} hint="Active learners" href="/admin/users" />
        <StatCard label="Teachers" value={overview.users.teachers} hint="Instruction team" href="/admin/users" tone="neutral" />
        <StatCard label="Published Lessons" value={overview.content.lessons} tone="success" />
        <StatCard label="Published Quizzes" value={overview.content.quizzes} tone="warning" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Teacher Activity</h2>
          <p className="mt-1 text-sm text-[var(--ink-500)]">Monitor lesson and quiz contribution across teachers.</p>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[580px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Teacher</th>
                  <th className="px-2 py-2 font-semibold">Lessons</th>
                  <th className="px-2 py-2 font-semibold">Quizzes</th>
                  <th className="px-2 py-2 font-semibold">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTeacherActivity.map((teacher) => (
                  <tr key={teacher.teacherId} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{teacher.teacherName}</td>
                    <td className="px-2 py-2">{teacher.lessonCount}</td>
                    <td className="px-2 py-2">{teacher.quizCount}</td>
                    <td className="px-2 py-2 text-[var(--ink-500)]">
                      {teacher.lastActivity ? formatDateTime(teacher.lastActivity, displayPreferences) : "No activity"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {paginatedTeacherActivity.map((teacher) => (
              <div key={teacher.teacherId} className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
                <p className="font-semibold text-[var(--ink-900)]">{teacher.teacherName}</p>
                <p className="mt-1 text-xs text-[var(--ink-600)]">
                  Lessons: {teacher.lessonCount} | Quizzes: {teacher.quizCount}
                </p>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  Last Activity: {teacher.lastActivity ? formatDateTime(teacher.lastActivity, displayPreferences) : "No activity"}
                </p>
              </div>
            ))}
          </div>
          {overview.teacherActivity.length > TEACHER_PAGE_SIZE ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
              <p className="text-xs text-[var(--ink-500)]">
                Showing {teacherStart + 1}-{Math.min(teacherStart + TEACHER_PAGE_SIZE, overview.teacherActivity.length)} of{" "}
                {overview.teacherActivity.length}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={teacherPage > 1 ? teacherPageHref(teacherPage - 1) : "#"}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                    teacherPage > 1
                      ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                      : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                  }`}
                >
                  Previous
                </Link>
                <span className="text-xs font-semibold text-[var(--ink-600)]">
                  Page {teacherPage}/{teacherPageCount}
                </span>
                <Link
                  href={teacherPage < teacherPageCount ? teacherPageHref(teacherPage + 1) : "#"}
                  className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                    teacherPage < teacherPageCount
                      ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                      : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                  }`}
                >
                  Next
                </Link>
              </div>
            </div>
          ) : null}
          {overview.teacherActivity.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
              No teacher activity records available.
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Platform Pulse</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="rounded-xl bg-[var(--line-100)] px-3 py-2">
              <p className="text-[var(--ink-500)]">Active students</p>
              <p className="text-lg font-bold text-[var(--ink-900)]">{overview.participation.activeStudents}</p>
            </li>
            <li className="rounded-xl bg-[var(--line-100)] px-3 py-2">
              <p className="text-[var(--ink-500)]">Quiz attempts (7d)</p>
              <p className="text-lg font-bold text-[var(--ink-900)]">{overview.participation.attemptsThisWeek}</p>
            </li>
            <li className="rounded-xl bg-[var(--line-100)] px-3 py-2">
              <p className="text-[var(--ink-500)]">Lesson views (7d)</p>
              <p className="text-lg font-bold text-[var(--ink-900)]">{overview.participation.lessonsViewedThisWeek}</p>
            </li>
            <li className="rounded-xl bg-[var(--line-100)] px-3 py-2">
              <p className="text-[var(--ink-500)]">Inactive users</p>
              <p className="text-lg font-bold text-[var(--ink-900)]">{overview.users.inactive}</p>
            </li>
          </ul>
        </Card>
      </section>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Recent System Activity</h2>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Action</th>
                <th className="px-2 py-2 font-semibold">Entity</th>
                <th className="px-2 py-2 font-semibold">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((item) => (
                <tr key={item.id} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand-600)]">{item.action}</td>
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{item.entityType}</td>
                  <td className="px-2 py-2 text-[var(--ink-500)]">{formatDateTime(item.createdAt, displayPreferences)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2 md:hidden">
          {activity.map((item) => (
            <div key={item.id} className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-600)]">{item.action}</p>
              <p className="text-sm font-medium text-[var(--ink-800)]">{item.entityType}</p>
              <p className="text-xs text-[var(--ink-500)]">{formatDateTime(item.createdAt, displayPreferences)}</p>
            </div>
          ))}
        </div>
        {activity.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
            No recent system activity found.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
