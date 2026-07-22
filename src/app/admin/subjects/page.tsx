import { SubjectsManager } from "@/components/admin/subjects-manager";
import { listSubjects } from "@/server/queries/subjects";

export default function AdminSubjectsPage() {
  const subjects = listSubjects().map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
    description: subject.description,
    isActive: subject.isActive,
    lessonCount: subject.lessonCount,
    quizCount: subject.quizCount,
    teacherCount: subject.teacherCount,
  }));

  return <SubjectsManager initialSubjects={subjects} />;
}
