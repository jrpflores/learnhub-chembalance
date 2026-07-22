import { EquationPractice } from "@/components/student/equation-practice";
import { requireRole } from "@/lib/auth";
import { listStudentPracticeSessions } from "@/server/queries/equations";

export default async function StudentEquationPracticePage() {
  const user = await requireRole(["STUDENT"]);
  const sessions = listStudentPracticeSessions(user.id);
  return <EquationPractice initialSessions={sessions} />;
}
