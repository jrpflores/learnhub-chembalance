import { StudentQuizzesList } from "@/components/student/quizzes-list";
import { requireRole } from "@/lib/auth";
import { listStudentQuizzes } from "@/server/queries/quizzes";

export default async function StudentQuizzesPage() {
  const user = await requireRole(["STUDENT"]);
  const quizzes = listStudentQuizzes(user.id);

  return <StudentQuizzesList quizzes={quizzes} />;
}
