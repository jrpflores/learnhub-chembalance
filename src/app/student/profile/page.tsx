import { notFound } from "next/navigation";
import Link from "next/link";
import { ChangePasswordCard } from "@/components/account/change-password-card";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/date-display";
import { featureFlags } from "@/lib/feature-flags";
import { getStudentWeakStrongTopics, studentProfileData } from "@/server/queries/student";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

export default async function StudentProfilePage() {
  const user = await requireRole(["STUDENT"]);
  const displayPreferences = getSystemDisplayPreferences();
  const profile = studentProfileData(user.id);

  if (!profile) {
    notFound();
  }

  const topicAnalysis = getStudentWeakStrongTopics(user.id);

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Profile"
        description="Account details and topic strengths from your quiz work."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Profile" },
        ]}
        actions={
          <Link href="/student/achievements" className={studentSecondaryLinkClassName("h-9")}>
            Achievements
          </Link>
        }
      />

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileField label="Full Name" value={profile.fullName} />
          <ProfileField label="Email" value={profile.email} />
          <ProfileField label="Streak" value={`${profile.streakDays} days`} />
          <ProfileField label="Timezone" value={profile.timezone ?? "Not set"} />
          <ProfileField label="Locale" value={profile.locale ?? "Not set"} />
          <ProfileField label="Joined" value={formatDate(profile.createdAt, displayPreferences)} />
        </div>
      </Card>

      <ChangePasswordCard />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Strong Topics</h3>
          <div className="mt-3 space-y-2">
            {topicAnalysis.strengths.length === 0 ? (
              <p className="text-sm text-[var(--ink-500)]">Complete quizzes to surface strong topics.</p>
            ) : (
              topicAnalysis.strengths.map((topic) => (
                <div key={topic.topic} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                  <p className="font-semibold text-[var(--ink-800)]">{topic.topic}</p>
                  <p className="text-xs text-[var(--ink-500)]">Accuracy: {topic.accuracy}%</p>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Weak Topics</h3>
          <div className="mt-3 space-y-2">
            {topicAnalysis.weakAreas.length === 0 ? (
              <p className="text-sm text-[var(--ink-500)]">No weak topics flagged yet.</p>
            ) : (
              topicAnalysis.weakAreas.map((topic) => (
                <div key={topic.topic} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                  <p className="font-semibold text-[var(--ink-800)]">{topic.topic}</p>
                  <p className="text-xs text-[var(--ink-500)]">Accuracy: {topic.accuracy}%</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {featureFlags.showXp ? (
        <Card>
          <h3 className="text-lg font-bold text-[var(--ink-900)]">XP Timeline</h3>
          <div className="mt-3 space-y-2">
            {profile.xpEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="text-sm font-semibold text-[var(--ink-800)]">+{event.amount} XP</p>
                <p className="text-xs text-[var(--ink-500)]">{event.description ?? event.source}</p>
                <p className="text-xs text-[var(--ink-400)]">{formatDateTime(event.createdAt, displayPreferences)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
