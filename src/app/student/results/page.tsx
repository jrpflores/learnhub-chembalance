import { StudentResultsList } from "@/components/student/results-list";
import { requireRole } from "@/lib/auth";
import { listStudentAttempts } from "@/server/queries/quizzes";

export default async function StudentResultsPage() {
  const user = await requireRole(["STUDENT"]);
  const attempts = listStudentAttempts(user.id);

  return <StudentResultsList attempts={attempts} />;
}
