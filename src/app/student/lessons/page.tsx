import { StudentLessonsList } from "@/components/student/lessons-list";
import { requireRole } from "@/lib/auth";
import { listStudentLessons } from "@/server/queries/lessons";
import { listStudentAssignedSubjects } from "@/server/queries/subjects";

type StudentLessonsPageProps = {
  searchParams: Promise<{ subject?: string }>;
};

export default async function StudentLessonsPage({ searchParams }: StudentLessonsPageProps) {
  const user = await requireRole(["STUDENT"]);
  const params = await searchParams;
  const selectedSubject = params.subject?.trim() || null;
  const assignedSubjects = listStudentAssignedSubjects(user.id).map((subject) => subject.name);
  const safeSelectedSubject = selectedSubject && assignedSubjects.includes(selectedSubject) ? selectedSubject : null;
  const lessons = listStudentLessons(user.id, { subject: safeSelectedSubject ?? undefined });

  return <StudentLessonsList lessons={lessons} selectedSubject={safeSelectedSubject} />;
}
