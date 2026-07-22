import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/date-display";
import { featureFlags } from "@/lib/feature-flags";
import { leaderboardForStudent, studentDashboardData } from "@/server/queries/student";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

export default async function StudentAchievementsPage() {
  const user = await requireRole(["STUDENT"]);
  const displayPreferences = getSystemDisplayPreferences();
  const dashboard = studentDashboardData(user.id);
  const leaderboard = leaderboardForStudent(user.id);

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Achievements"
        description="Celebrate wins, keep streaks, and see how you rank."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Achievements" },
        ]}
        actions={
          <Link href="/student/results" className={studentSecondaryLinkClassName("h-9")}>
            View Results
          </Link>
        }
      />

      <Card>
        <div className={`grid gap-3 ${featureFlags.showXp ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {featureFlags.showXp ? <AchievementStat label="Total XP" value={dashboard.cards.totalXp} /> : null}
          <AchievementStat label="Current Streak" value={`${dashboard.cards.streakDays} days`} />
          <AchievementStat label="Badges" value={dashboard.badges.length} />
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Badges Earned</h3>
        {dashboard.badges.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-4 py-5 text-center text-sm text-[var(--ink-500)]">
            No badges yet. Complete lessons and quizzes to unlock achievements.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.badges.map((badge) => (
              <div key={`${badge.id}-${badge.awardedAt}`} className="rounded-2xl border border-[var(--line-200)] bg-white p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-[var(--brand-600)]">Badge</p>
                <h4 className="mt-1 text-lg font-bold text-[var(--ink-900)]">{badge.title}</h4>
                <p className="mt-1 text-sm text-[var(--ink-600)]">{badge.description}</p>
                <p className="mt-2 text-xs text-[var(--ink-500)]">Awarded {formatDate(badge.awardedAt, displayPreferences)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Leaderboard</h3>
        {!leaderboard.enabled ? (
          <p className="mt-2 text-sm text-[var(--ink-500)]">Leaderboard is currently disabled by your school settings.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {leaderboard.entries.map((entry) => (
              <div
                key={`${entry.rank}-${entry.userId}`}
                className={`flex items-center justify-between rounded-xl border px-3 py-2 ${
                  entry.isCurrent ? "border-[var(--brand-500)] bg-[var(--brand-100)]" : "border-[var(--line-200)] bg-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg font-black text-[var(--ink-900)]">#{entry.rank}</span>
                  <p className="text-sm font-semibold text-[var(--ink-800)]">{entry.name}</p>
                  {entry.isCurrent ? <Chip tone="brand">You</Chip> : null}
                </div>
                <p className="text-sm font-bold text-[var(--ink-800)]">{entry.score}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AchievementStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-xl font-black text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
