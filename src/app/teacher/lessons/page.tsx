import { LessonsManager } from "@/components/teacher/lessons-manager";
import { requireRole } from "@/lib/auth";
import { listLessons } from "@/server/queries/lessons";
import { listTeacherSubjects } from "@/server/queries/subjects";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

type TeacherLessonsPageProps = {
  searchParams: Promise<{ subject?: string; subjectId?: string; sectionId?: string; intent?: string; returnTab?: string }>;
};

export default async function TeacherLessonsPage({ searchParams }: TeacherLessonsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const params = await searchParams;
  const teacherSubjects = listTeacherSubjects(user.id).map((subject) => subject.name);
  const requestedSubjectId = params.subjectId?.trim();
  const requestedSectionId = params.sectionId?.trim();
  const requestedReturnTab = params.returnTab?.trim();
  const returnTab =
    requestedReturnTab === "students" ||
    requestedReturnTab === "lessons" ||
    requestedReturnTab === "quizzes" ||
    requestedReturnTab === "background-jobs"
      ? requestedReturnTab
      : undefined;

  const subjectContext = requestedSubjectId ? getTeacherSubjectContext(user.id, requestedSubjectId) : null;
  const activeSection =
    requestedSectionId && subjectContext
      ? subjectContext.sections.find((section) => section.id === requestedSectionId) ?? subjectContext.sections[0]
      : subjectContext?.sections[0];

  const selectedSubjectFromQuery =
    params.subject?.trim() && teacherSubjects.includes(params.subject.trim()) ? params.subject.trim() : undefined;
  const selectedSubject = subjectContext?.subject.name ?? selectedSubjectFromQuery;

  const lessons = listLessons({
    accessibleTeacherId: user.id,
    subject: selectedSubject || undefined,
    sectionId: activeSection?.id,
  }).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    shortDescription: lesson.shortDescription,
    subject: lesson.subject,
    topic: lesson.topic,
    status: lesson.status,
    difficulty: lesson.difficulty,
    updatedAt: lesson.updatedAt,
    estimatedMinutes: lesson.estimatedMinutes,
  }));

  const subjectOptions = Array.from(new Set([...teacherSubjects, ...lessons.map((lesson) => lesson.subject)]));

  return (
    <LessonsManager
      initialLessons={lessons}
      initialSubjectOptions={subjectOptions}
      selectedSubject={selectedSubject ?? null}
      initialIntent={params.intent?.trim()?.toLowerCase() === "import" ? "import" : null}
      breadcrumbContext={
        subjectContext
          ? {
              subjectId: subjectContext.subject.id,
              subjectName: subjectContext.subject.name,
              sectionId: activeSection?.id,
              sectionName: activeSection?.name,
              returnTab: returnTab ?? "lessons",
            }
          : undefined
      }
    />
  );
}
