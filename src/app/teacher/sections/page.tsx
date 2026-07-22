import { SectionsManager } from "@/components/teacher/sections-manager";
import { requireRole } from "@/lib/auth";
import { listLessons } from "@/server/queries/lessons";
import { listQuizzes } from "@/server/queries/quizzes";
import { listSections, listTeacherAssignableStudents, sectionAnalytics } from "@/server/queries/sections";
import { listTeacherSubjects } from "@/server/queries/subjects";

export default async function TeacherSectionsPage() {
  const user = await requireRole(["TEACHER"]);

  const sections = listSections({ teacherId: user.id });
  const students = listTeacherAssignableStudents(user.id);
  const teacherSubjects = listTeacherSubjects(user.id);
  const subjects = teacherSubjects;
  const lessons = listLessons({ accessibleTeacherId: user.id, status: "PUBLISHED" }).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
  }));
  const quizzes = listQuizzes({ accessibleTeacherId: user.id, status: "PUBLISHED" }).map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
  }));
  const analytics = sectionAnalytics(user.id).summary;

  return (
    <SectionsManager
      initialSections={sections}
      students={students}
      subjects={subjects}
      lessons={lessons}
      quizzes={quizzes}
      analyticsSummary={analytics}
      readOnly
    />
  );
}
