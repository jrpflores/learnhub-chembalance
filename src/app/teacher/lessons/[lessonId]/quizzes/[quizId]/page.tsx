import { notFound } from "next/navigation";
import { LessonQuizManager } from "@/components/teacher/lesson-quiz-manager";
import { requireRole } from "@/lib/auth";
import { canTeacherAccessLesson, getLessonById } from "@/server/queries/lessons";
import { listQuestions } from "@/server/queries/questions";
import { canTeacherAccessQuiz, getQuizById } from "@/server/queries/quizzes";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

type TeacherLessonQuizPageProps = {
  params: Promise<{ lessonId: string; quizId: string }>;
  searchParams: Promise<{ generate?: string; subjectId?: string; sectionId?: string; returnTab?: string }>;
};

export default async function TeacherLessonQuizPage({ params, searchParams }: TeacherLessonQuizPageProps) {
  const user = await requireRole(["TEACHER"]);
  const { lessonId, quizId } = await params;
  const query = await searchParams;

  const lesson = getLessonById(lessonId);
  if (!lesson || !canTeacherAccessLesson(user.id, lessonId)) {
    notFound();
  }

  const quiz = getQuizById(quizId);
  if (!quiz || !canTeacherAccessQuiz(user.id, quizId) || quiz.lessonId !== lessonId) {
    notFound();
  }

  const requestedSubjectId = query.subjectId?.trim();
  const requestedSectionId = query.sectionId?.trim();
  const requestedReturnTab = query.returnTab?.trim();
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

  const questionBank = listQuestions({ accessibleTeacherId: user.id }).map((question) => ({
    id: question.id,
    promptMarkdown: question.promptMarkdown,
    subject: question.subject,
    topic: question.topic,
    difficulty: question.difficulty,
    type: question.type,
  }));

  return (
    <LessonQuizManager
      lesson={{ id: lesson.id, title: lesson.title }}
      quiz={{
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        instructions: quiz.instructions,
        status: quiz.status,
        passingScore: quiz.passingScore,
        timeLimitSec: quiz.timeLimitSec,
        maxAttempts: quiz.maxAttempts,
        randomizeQuestions: quiz.randomizeQuestions,
        randomizeOptions: quiz.randomizeOptions,
        showAnswerKey: quiz.showAnswerKey,
        questions: quiz.questions,
      }}
      questionBank={questionBank}
      openGenerateOnLoad={query.generate === "1"}
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
