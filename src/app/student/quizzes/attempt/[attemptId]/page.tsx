import { QuizAttemptPlayer } from "@/components/student/quiz-attempt-player";
import { requireRole } from "@/lib/auth";
import { getAttemptById } from "@/server/queries/quizzes";

export default async function StudentQuizAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await requireRole(["STUDENT"]);
  const { attemptId } = await params;

  const attempt = getAttemptById(attemptId);
  if (!attempt || attempt.studentId !== user.id) {
    return <p className="rounded-xl bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">Attempt not found.</p>;
  }

  return <QuizAttemptPlayer attemptId={attemptId} />;
}
