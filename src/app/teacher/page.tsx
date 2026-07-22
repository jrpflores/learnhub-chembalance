import { Card } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { requireRole } from "@/lib/auth";
import { teacherDashboardSummary } from "@/server/queries/teacher";
import { listSections } from "@/server/queries/sections";

type TeacherDashboardPageProps = {
  searchParams: Promise<{ sectionId?: string }>;
};

export default async function TeacherDashboardPage({ searchParams }: TeacherDashboardPageProps) {
  const user = await requireRole(["TEACHER"]);
  const params = await searchParams;
  const sections = listSections({ teacherId: user.id, status: "ACTIVE" });
  const selectedSectionId = params.sectionId && sections.some((section) => section.id === params.sectionId) ? params.sectionId : undefined;
  const summary = teacherDashboardSummary(user.id, selectedSectionId);

  return (
    <div className="space-y-6">
      <Card>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Section Filter
            <select
              name="sectionId"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[220px] sm:w-auto"
              defaultValue={selectedSectionId ?? ""}
            >
              <option value="">All assigned sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--brand-500)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-600)]"
          >
            Apply
          </button>
          <a
            href="/teacher"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-700)] hover:bg-[var(--line-100)]"
          >
            Reset
          </a>
        </form>
        <p className="mt-3 text-sm text-[var(--ink-600)]">
          Context: <span className="font-semibold text-[var(--ink-900)]">{sections.find((section) => section.id === selectedSectionId)?.name ?? "All sections"}</span>
        </p>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Students" value={summary.cards.students.total} hint="Assigned to you" href="/teacher/students" />
        <StatCard label="Avg Streak" value={`${summary.cards.students.avgStreak} days`} tone="success" />
        <StatCard label="Lessons" value={summary.cards.lessons} href="/teacher/lessons" tone="neutral" />
        <StatCard label="Quizzes" value={summary.cards.quizzes} href="/teacher/lessons" tone="warning" />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Students Needing Attention</h2>
          <p className="text-sm text-[var(--ink-500)]">Learners with lower average scores or repeated failed attempts.</p>

          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Student</th>
                  <th className="px-2 py-2 font-semibold">Avg Score</th>
                  <th className="px-2 py-2 font-semibold">Failed Attempts</th>
                </tr>
              </thead>
              <tbody>
                {summary.studentsNeedingAttention.map((student) => (
                  <tr key={student.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{student.fullName}</td>
                    <td className="px-2 py-2">{student.averageScore}%</td>
                    <td className="px-2 py-2">{student.failedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 space-y-2 md:hidden">
            {summary.studentsNeedingAttention.map((student) => (
              <div key={student.id} className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
                <p className="font-semibold text-[var(--ink-900)]">{student.fullName}</p>
                <p className="mt-1 text-xs text-[var(--ink-600)]">
                  Avg Score: {student.averageScore}% | Failed Attempts: {student.failedCount}
                </p>
              </div>
            ))}
          </div>
          {summary.studentsNeedingAttention.length === 0 ? (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
              No students currently need attention in this context.
            </p>
          ) : null}
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Hardest Quizzes</h2>
          <div className="mt-3 space-y-2">
            {summary.hardestQuizzes.map((quiz) => (
              <div key={quiz.quizId} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="text-sm font-semibold text-[var(--ink-800)]">{quiz.title}</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Pass rate: {quiz.passRate}% | Attempts: {quiz.takenCount}
                </p>
              </div>
            ))}
            {summary.hardestQuizzes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                No quiz attempt data yet.
              </p>
            ) : null}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Low Engagement Lessons</h2>
          <div className="mt-3 space-y-2">
            {summary.lowEngagementLessons.map((lesson) => (
              <div key={lesson.id} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="font-semibold text-[var(--ink-800)]">{lesson.title}</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Viewers: {lesson.viewerCount} | Completion: {lesson.completionRate}%
                </p>
              </div>
            ))}
            {summary.lowEngagementLessons.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                No lesson engagement data yet.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Most Difficult Questions</h2>
          <div className="mt-3 space-y-2">
            {summary.questionInsights.map((question) => (
              <div key={question.questionId} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="line-clamp-2 text-sm font-semibold text-[var(--ink-800)]">{question.promptMarkdown}</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Accuracy: {question.accuracy}% | Wrong: {question.incorrectAnswers}
                </p>
              </div>
            ))}
            {summary.questionInsights.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                No question-level analytics yet.
              </p>
            ) : null}
          </div>
        </Card>
      </section>
    </div>
  );
}
