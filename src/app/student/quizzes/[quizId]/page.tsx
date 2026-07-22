import { notFound } from "next/navigation";
import Link from "next/link";
import { StartQuizCard } from "@/components/student/start-quiz-card";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireRole } from "@/lib/auth";
import { getQuizAttemptUsage, getQuizById, canStudentAccessQuiz } from "@/server/queries/quizzes";

export default async function StudentQuizDetailPage({ params }: { params: Promise<{ quizId: string }> }) {
  const user = await requireRole(["STUDENT"]);
  const { quizId } = await params;
  const quiz = getQuizById(quizId);

  if (!quiz || quiz.status !== "PUBLISHED" || !canStudentAccessQuiz(user.id, quizId)) {
    notFound();
  }

  const usage = getQuizAttemptUsage(quizId, user.id);

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title={quiz.title}
        description={quiz.description}
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Quizzes", href: "/student/quizzes" },
          { label: quiz.title },
        ]}
        actions={
          <>
            {quiz.lessonId ? (
              <Link href={`/student/lessons/${quiz.lessonId}`} className={studentSecondaryLinkClassName("h-9")}>
                Open Lesson
              </Link>
            ) : null}
            <Link href="/student/results" className={studentSecondaryLinkClassName("h-9")}>
              Results
            </Link>
          </>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="brand">{quiz.lessonTitle ?? "Lesson Quiz"}</Chip>
          <Chip tone="neutral">Pass score: {quiz.passingScore}%</Chip>
          <Chip tone={usage.unlimited || (usage.remaining ?? 0) > 0 ? "success" : "warning"}>
            {usage.unlimited ? "Attempts: Unlimited" : `Attempts left: ${usage.remaining ?? 0}`}
          </Chip>
        </div>

        {quiz.instructions ? (
          <div className="mt-4 rounded-xl bg-[var(--line-100)] p-3 text-sm text-[var(--ink-700)]">
            <p className="font-semibold">Instructions</p>
            <p className="mt-1">{quiz.instructions}</p>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Questions" value={quiz.questions.length} />
          <Metric label="Time Limit" value={quiz.timeLimitSec ? `${Math.round(quiz.timeLimitSec / 60)} min` : "No limit"} />
          <Metric label="Feedback" value={quiz.feedbackMode === "INSTANT" ? "Instant" : "Delayed"} />
        </div>
      </Card>

      <StartQuizCard quizId={quizId} canAttempt={usage.unlimited || (usage.remaining ?? 0) > 0} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-base font-bold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
