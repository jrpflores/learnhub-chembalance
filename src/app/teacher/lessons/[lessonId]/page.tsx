import { notFound } from "next/navigation";
import { LessonDetail } from "@/components/teacher/lesson-detail";
import { requireRole } from "@/lib/auth";
import { canTeacherAccessLesson, getLessonById } from "@/server/queries/lessons";
import { listQuizGenerationJobsByLesson } from "@/server/queries/quiz-generation-jobs";
import { listQuizzes } from "@/server/queries/quizzes";
import { listTeacherSubjects } from "@/server/queries/subjects";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

type TeacherLessonDetailPageProps = {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ subjectId?: string; sectionId?: string; tab?: string; returnTab?: string }>;
};

export default async function TeacherLessonDetailPage({ params, searchParams }: TeacherLessonDetailPageProps) {
  const user = await requireRole(["TEACHER"]);
  const { lessonId } = await params;
  const query = await searchParams;

  const lesson = getLessonById(lessonId);
  if (!lesson || !canTeacherAccessLesson(user.id, lessonId)) {
    notFound();
  }

  const teacherQuizzes = listQuizzes({ accessibleTeacherId: user.id });
  const generationJobs = listQuizGenerationJobsByLesson({
    lessonId,
    teacherId: user.id,
  });
  const mappedQuizzes = teacherQuizzes.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    status: quiz.status,
    questionCount: quiz.questionCount,
    passingScore: quiz.passingScore,
    maxAttempts: quiz.maxAttempts,
    showAnswerKey: quiz.showAnswerKey,
    lessonId: quiz.lessonId,
    lessonTitle: quiz.lessonTitle,
  }));
  const teacherSubjects = listTeacherSubjects(user.id).map((subject) => subject.name);
  const subjectOptions = Array.from(new Set([...teacherSubjects, lesson.subject]));
  const requestedSubjectId = query.subjectId?.trim();
  const requestedSectionId = query.sectionId?.trim();
  const requestedTab = query.tab?.trim();
  const requestedReturnTab = query.returnTab?.trim();
  const initialTab: "content" | "quizzes" | "generation" =
    requestedTab === "quizzes" || requestedTab === "generation" ? requestedTab : "content";
  const returnTab =
    requestedReturnTab === "students" ||
    requestedReturnTab === "lessons" ||
    requestedReturnTab === "quizzes" ||
    requestedReturnTab === "background-jobs"
      ? requestedReturnTab
      : undefined;
  const breadcrumbSubjectContext = requestedSubjectId ? getTeacherSubjectContext(user.id, requestedSubjectId) : null;
  const breadcrumbSection = requestedSectionId
    ? breadcrumbSubjectContext?.sections.find((section) => section.id === requestedSectionId)
    : undefined;

  return (
    <LessonDetail
      lesson={{
        id: lesson.id,
        title: lesson.title,
        shortDescription: lesson.shortDescription,
        contentMarkdown: lesson.contentMarkdown,
        coverImageUrl: lesson.coverImageUrl,
        difficulty: lesson.difficulty,
        subject: lesson.subject,
        topic: lesson.topic,
        unit: lesson.unit,
        status: lesson.status,
        estimatedMinutes: lesson.estimatedMinutes,
        tags: lesson.tags,
        updatedAt: lesson.updatedAt,
        publishedAt: lesson.publishedAt,
      }}
      linkedQuizzes={mappedQuizzes.filter((quiz) => quiz.lessonId === lesson.id)}
      availableQuizzes={mappedQuizzes}
      generationJobs={generationJobs}
      subjectOptions={subjectOptions}
      initialTab={initialTab}
      breadcrumbContext={
        breadcrumbSubjectContext
          ? {
              subjectId: breadcrumbSubjectContext.subject.id,
              subjectName: breadcrumbSubjectContext.subject.name,
              sectionId: breadcrumbSection?.id,
              sectionName: breadcrumbSection?.name,
              returnTab,
            }
          : undefined
      }
    />
  );
}
