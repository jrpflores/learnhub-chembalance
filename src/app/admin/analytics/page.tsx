import Link from "next/link";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/date-display";
import { featureFlags } from "@/lib/feature-flags";
import { adminOverview, getUserActivitySummaries } from "@/server/queries/admin";
import { listRecentActivities } from "@/server/queries/quizzes";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

type AdminAnalyticsPageProps = {
  searchParams: Promise<{ usersPage?: string }>;
};

const USERS_PAGE_SIZE = 20;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const query = await searchParams;
  const displayPreferences = getSystemDisplayPreferences();
  const overview = adminOverview();
  const users = getUserActivitySummaries();
  const recentActivity = listRecentActivities(10);
  const requestedUsersPage = parsePage(query.usersPage);
  const usersPageCount = Math.max(1, Math.ceil(users.length / USERS_PAGE_SIZE));
  const usersPage = Math.min(requestedUsersPage, usersPageCount);
  const usersStart = (usersPage - 1) * USERS_PAGE_SIZE;
  const paginatedUsers = users.slice(usersStart, usersStart + USERS_PAGE_SIZE);
  const usersPageHref = (nextPage: number) => `/admin/analytics?usersPage=${nextPage}`;

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Platform-wide Analytics</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Admins" value={overview.users.admins} />
          <Metric label="Teachers" value={overview.users.teachers} />
          <Metric label="Students" value={overview.users.students} />
          <Metric label="Inactive Users" value={overview.users.inactive} />
          <Metric label="Lessons" value={overview.content.lessons} />
          <Metric label="Quizzes" value={overview.content.quizzes} />
          <Metric label="Attempts (7d)" value={overview.participation.attemptsThisWeek} />
          <Metric label="Lesson Views (7d)" value={overview.participation.lessonsViewedThisWeek} />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">User Activity Summaries</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Name</th>
                <th className="px-2 py-2 font-semibold">Role</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Attempts</th>
                {featureFlags.showXp ? <th className="px-2 py-2 font-semibold">XP</th> : null}
                <th className="px-2 py-2 font-semibold">Lessons Completed</th>
              </tr>
            </thead>
            <tbody>
              {paginatedUsers.map((user) => (
                <tr key={user.id} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{user.fullName}</td>
                  <td className="px-2 py-2">{user.role}</td>
                  <td className="px-2 py-2">{user.isActive ? "Active" : "Inactive"}</td>
                  <td className="px-2 py-2">{user.attempts}</td>
                  {featureFlags.showXp ? <td className="px-2 py-2">{user.xp}</td> : null}
                  <td className="px-2 py-2">{user.lessonsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {users.length > USERS_PAGE_SIZE ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
            <p className="text-xs text-[var(--ink-500)]">
              Showing {usersStart + 1}-{Math.min(usersStart + USERS_PAGE_SIZE, users.length)} of {users.length}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={usersPage > 1 ? usersPageHref(usersPage - 1) : "#"}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                  usersPage > 1
                    ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                    : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                }`}
              >
                Previous
              </Link>
              <span className="text-xs font-semibold text-[var(--ink-600)]">
                Page {usersPage}/{usersPageCount}
              </span>
              <Link
                href={usersPage < usersPageCount ? usersPageHref(usersPage + 1) : "#"}
                className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
                  usersPage < usersPageCount
                    ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                    : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
                }`}
              >
                Next
              </Link>
            </div>
          </div>
        ) : null}
        {users.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
            No user activity data found.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Recent System Activity</h2>
        <div className="mt-3 space-y-2">
          {recentActivity.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
              No recent activity found.
            </p>
          ) : (
            recentActivity.map((activity) => (
              <div
                key={activity.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--ink-900)]">{activity.action}</p>
                  <p className="text-xs text-[var(--ink-500)]">
                    {activity.entityType} • {activity.userName ?? "System"}
                  </p>
                </div>
                <p className="text-xs text-[var(--ink-500)]">{formatDateTime(activity.createdAt, displayPreferences)}</p>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-xl font-black text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
