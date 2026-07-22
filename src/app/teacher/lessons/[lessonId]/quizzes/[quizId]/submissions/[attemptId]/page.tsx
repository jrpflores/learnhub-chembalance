import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { QuizAttemptReview } from "@/components/teacher/quiz-attempt-review";
import { requireRole } from "@/lib/auth";
import { canTeacherAccessLesson, getLessonById } from "@/server/queries/lessons";
import { canTeacherAccessQuiz, getQuizById, getTeacherAttemptReviewById } from "@/server/queries/quizzes";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

type TeacherAttemptReviewPageProps = {
  params: Promise<{ lessonId: string; quizId: string; attemptId: string }>;
  searchParams: Promise<{ subjectId?: string; sectionId?: string }>;
};

export default async function TeacherAttemptReviewPage({ params, searchParams }: TeacherAttemptReviewPageProps) {
  const user = await requireRole(["TEACHER"]);
  const { lessonId, quizId, attemptId } = await params;
  const query = await searchParams;

  const lesson = getLessonById(lessonId);
  if (!lesson || !canTeacherAccessLesson(user.id, lessonId)) {
    notFound();
  }

  const quiz = getQuizById(quizId);
  if (!quiz || !canTeacherAccessQuiz(user.id, quizId) || quiz.lessonId !== lessonId) {
    notFound();
  }

  const attempt = getTeacherAttemptReviewById(user.id, attemptId);
  if (!attempt || attempt.quizId !== quizId) {
    notFound();
  }

  const requestedSubjectId = query.subjectId?.trim();
  const requestedSectionId = query.sectionId?.trim();
  const breadcrumbSubjectContext = requestedSubjectId ? getTeacherSubjectContext(user.id, requestedSubjectId) : null;
  const breadcrumbSection = requestedSectionId
    ? breadcrumbSubjectContext?.sections.find((section) => section.id === requestedSectionId)
    : undefined;
  const contextQuery = new URLSearchParams();
  if (breadcrumbSubjectContext?.subject.id) {
    contextQuery.set("subjectId", breadcrumbSubjectContext.subject.id);
  }
  if (breadcrumbSection?.id) {
    contextQuery.set("sectionId", breadcrumbSection.id);
  }
  const contextQueryString = contextQuery.toString();
  const withContext = (path: string) => (contextQueryString ? `${path}?${contextQueryString}` : path);
  const subjectDetailHref = breadcrumbSubjectContext
    ? breadcrumbSection
      ? `/teacher/subjects/${breadcrumbSubjectContext.subject.id}?sectionId=${breadcrumbSection.id}`
      : `/teacher/subjects/${breadcrumbSubjectContext.subject.id}`
    : null;

  return (
    <div className="space-y-4">
      <nav aria-label="Attempt review breadcrumb" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
          <li>
            <Link href={breadcrumbSection ? `/teacher/subjects?sectionId=${breadcrumbSection.id}` : "/teacher/subjects"} className="hover:underline">
              Subjects
            </Link>
          </li>
          {breadcrumbSubjectContext ? (
            <>
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                {subjectDetailHref ? (
                  <Link href={subjectDetailHref} className="hover:underline">
                    {breadcrumbSubjectContext.subject.name}
                  </Link>
                ) : (
                  <span>{breadcrumbSubjectContext.subject.name}</span>
                )}
              </li>
              {breadcrumbSection ? (
                <li className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                  {subjectDetailHref ? (
                    <Link href={subjectDetailHref} className="hover:underline">
                      {breadcrumbSection.name}
                    </Link>
                  ) : (
                    <span>{breadcrumbSection.name}</span>
                  )}
                </li>
              ) : null}
            </>
          ) : null}
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lessonId}`)} className="hover:underline">
              {lesson.title}
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}`)} className="hover:underline">
              {quiz.title}
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lessonId}/quizzes/${quizId}/submissions`)} className="hover:underline">
              Submitted Answers
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <span className="font-semibold text-[var(--ink-900)]">Attempt #{attempt.attemptNumber}</span>
          </li>
        </ol>
      </nav>

      <QuizAttemptReview
        lessonId={lessonId}
        quizId={quizId}
        contextQuery={contextQueryString || undefined}
        initialAttempt={{
          id: attempt.id,
          quizId: attempt.quizId,
          studentId: attempt.studentId,
          studentName: attempt.studentName,
          attemptNumber: attempt.attemptNumber,
          status: attempt.status,
          outcome: attempt.outcome,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          gradedAt: attempt.gradedAt,
          timeSpentSec: attempt.timeSpentSec,
          scorePercent: attempt.scorePercent,
          correctCount: attempt.correctCount,
          wrongCount: attempt.wrongCount,
          passingScore: attempt.passingScore,
          answers: attempt.answers,
        }}
      />
    </div>
  );
}
