import Link from "next/link";
import { BookOpen, FileQuestion, FlaskConical, GraduationCap, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { StudentPageHeader, studentPrimaryLinkClassName, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { requireRole } from "@/lib/auth";
import { formatDate } from "@/lib/date-display";
import { featureFlags } from "@/lib/feature-flags";
import { studentDashboardData } from "@/server/queries/student";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";

const quickLinks = [
  { href: "/student/subjects", label: "Subjects", hint: "Browse assigned courses", icon: GraduationCap },
  { href: "/student/lessons", label: "Lessons", hint: "Continue learning", icon: BookOpen },
  { href: "/student/quizzes", label: "Quizzes", hint: "Check understanding", icon: FileQuestion },
  { href: "/student/practice", label: "Practice", hint: "AI lesson practice", icon: FlaskConical },
  { href: "/student/results", label: "Results", hint: "Review attempts", icon: Trophy },
] as const;

export default async function StudentDashboardPage() {
  const user = await requireRole(["STUDENT"]);
  const displayPreferences = getSystemDisplayPreferences();
  const data = studentDashboardData(user.id);
  const greeting = (data.messages as { dashboardGreeting?: string }).dashboardGreeting;
  const encouragement = (data.messages as { encouragement?: string }).encouragement;

  return (
    <div className="space-y-6">
      <StudentPageHeader
        title={`Hi, ${user.fullName.split(" ")[0] || user.fullName}`}
        description="Pick up where you left off, or jump into a subject, lesson, or quiz."
      />

      <section
        className="rounded-3xl border border-white/60 p-6 text-white shadow-[0_18px_50px_rgba(13,148,136,0.28)]"
        style={{
          backgroundImage:
            "linear-gradient(135deg, var(--brand-500) 0%, var(--brand-600) 45%, var(--brand-800) 100%)",
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">Today&apos;s Focus</p>
        <h2 className="mt-2 text-2xl font-black sm:text-3xl">{greeting}</h2>
        <p className="mt-2 text-sm text-white/90">{encouragement}</p>

        {data.recommendedNext ? (
          <div className="mt-5 rounded-2xl border border-white/40 bg-white/15 p-4 backdrop-blur-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-white/85">Recommended Next</p>
            <h3 className="mt-1 text-lg font-bold">{data.recommendedNext.title}</h3>
            <p className="mt-1 text-sm text-white/90">{data.recommendedNext.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {data.recommendedNext.lessonId ? (
                <Link href={`/student/lessons/${data.recommendedNext.lessonId}`} className="student-hero-cta-primary">
                  Continue Lesson
                </Link>
              ) : null}
              {data.recommendedNext.quizId ? (
                <Link href={`/student/quizzes/${data.recommendedNext.quizId}`} className="student-hero-cta-secondary">
                  Take Quiz
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/student/lessons" className="student-hero-cta-primary">
              Browse Lessons
            </Link>
            <Link href="/student/quizzes" className="student-hero-cta-secondary">
              Browse Quizzes
            </Link>
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lessons" value={`${data.cards.completedLessons}/${data.cards.totalLessons}`} hint="Completed" href="/student/lessons" />
        <StatCard label="Quizzes Done" value={data.cards.completedQuizzes} hint={`${data.cards.totalQuizzes} available`} href="/student/quizzes" tone="neutral" />
        <StatCard label="Average Score" value={`${data.cards.averageScore}%`} href="/student/results" tone="warning" />
        <StatCard label="Streak" value={`${data.cards.streakDays} days`} href="/student/achievements" tone="success" />
        {featureFlags.showXp ? <StatCard label="Total XP" value={data.cards.totalXp} href="/student/achievements" tone="brand" /> : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {quickLinks.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-2xl border border-[var(--line-200)] bg-white p-4 transition hover:-translate-y-0.5 hover:border-[var(--brand-300)] hover:shadow-md"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand-100)] text-[var(--brand-700)]">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-bold text-[var(--ink-900)]">{item.label}</p>
              <p className="mt-1 text-xs text-[var(--ink-500)]">{item.hint}</p>
            </Link>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Recommendations</h3>
            <Link href="/student/lessons" className="text-sm font-semibold text-[var(--brand-700)] hover:underline">
              All lessons
            </Link>
          </div>
          <div className="mt-3 space-y-3">
            {data.recommendations.map((recommendation) => (
              <div key={recommendation.id} className="rounded-xl border border-[var(--line-200)] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--ink-900)]">{recommendation.title}</p>
                  <Chip tone="brand">{recommendation.type.replaceAll("_", " ")}</Chip>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-600)]">{recommendation.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recommendation.lessonId ? (
                    <Link href={`/student/lessons/${recommendation.lessonId}`} className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                      Continue Lesson
                    </Link>
                  ) : null}
                  {recommendation.quizId ? (
                    <Link href={`/student/quizzes/${recommendation.quizId}`} className={studentSecondaryLinkClassName("h-9")}>
                      Try Quiz
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
            {data.recommendations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-4 py-5 text-center">
                <p className="text-sm text-[var(--ink-500)]">No recommendations yet. Complete a lesson or quiz to get next steps.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Link href="/student/subjects" className={studentSecondaryLinkClassName("h-9")}>
                    Open Subjects
                  </Link>
                  <Link href="/student/quizzes" className={studentPrimaryLinkClassName("h-9 min-w-0")}>
                    Open Quizzes
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Recent Results</h3>
            <Link href="/student/results" className="text-sm font-semibold text-[var(--brand-700)] hover:underline">
              View all
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {data.recentQuizzes.map((attempt) => (
              <Link
                key={attempt.id}
                href={`/student/results/${attempt.id}`}
                className="block rounded-xl border border-[var(--line-200)] px-3 py-2 transition hover:bg-[var(--line-100)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-semibold text-[var(--ink-800)]">{attempt.quizTitle}</p>
                  <Chip tone={attempt.outcome === "PASSED" ? "success" : attempt.outcome === "FAILED" ? "warning" : "neutral"}>
                    {attempt.outcome === "PENDING" ? "Processing" : attempt.outcome}
                  </Chip>
                </div>
                <p className="mt-1 text-xs text-[var(--ink-500)]">
                  {attempt.scorePercent === null ? "--" : `${attempt.scorePercent}%`} • Attempt #{attempt.attemptNumber}
                </p>
              </Link>
            ))}
            {data.recentQuizzes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-5 text-center text-sm text-[var(--ink-500)]">
                No quiz attempts yet.
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Progress Trend</h3>
          <p className="text-sm text-[var(--ink-500)]">Recent quiz score progression.</p>
          <div className="mt-4 space-y-2">
            {data.trend.length === 0 ? (
              <p className="text-sm text-[var(--ink-500)]">No attempts yet. Start a quiz to build your trend.</p>
            ) : (
              data.trend.map((point, index) => (
                <div key={`${point.date}-${index}`}>
                  <div className="mb-1 flex items-center justify-between text-xs text-[var(--ink-500)]">
                    <span>{formatDate(point.date, displayPreferences)}</span>
                    <span>{point.score}%</span>
                  </div>
                  <Progress value={point.score} />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Badges</h3>
            <Link href="/student/achievements" className="text-sm font-semibold text-[var(--brand-700)] hover:underline">
              All
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {data.badges.slice(0, 4).map((badge) => (
              <div key={`${badge.id}-${badge.awardedAt}`} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="font-semibold text-[var(--ink-800)]">{badge.title}</p>
                <p className="text-xs text-[var(--ink-500)]">{badge.description}</p>
              </div>
            ))}
            {data.badges.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-5 text-center text-sm text-[var(--ink-500)]">
                Keep learning to unlock badges.
              </p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
