import { StudentSubjectsList } from "@/components/student/subjects-list";
import { requireRole } from "@/lib/auth";
import { listStudentLessons } from "@/server/queries/lessons";
import { listStudentAssignedSubjects } from "@/server/queries/subjects";

export default async function StudentSubjectsPage() {
  const user = await requireRole(["STUDENT"]);
  const subjects = listStudentAssignedSubjects(user.id);
  const lessonCounts = new Map(
    subjects.map((subject) => [subject.name, listStudentLessons(user.id, { subject: subject.name }).length]),
  );

  return (
    <StudentSubjectsList
      subjects={subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        code: subject.code,
        lessonCount: lessonCounts.get(subject.name) ?? 0,
      }))}
    />
  );
}
