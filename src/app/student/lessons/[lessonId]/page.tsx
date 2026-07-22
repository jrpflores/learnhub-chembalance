import { notFound } from "next/navigation";
import { LessonDetailTabs } from "@/components/student/lesson-detail-tabs";
import { requireRole } from "@/lib/auth";
import { canStudentAccessLesson, getLessonById, recordLessonView } from "@/server/queries/lessons";
import {
  getOrCreateActiveLessonPracticeConversation,
  listLessonPracticeConversations,
  listLessonPracticeMessages,
} from "@/server/queries/lesson-practice";
import { listQuizzes } from "@/server/queries/quizzes";

export default async function StudentLessonDetailPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const user = await requireRole(["STUDENT"]);
  const { lessonId } = await params;

  if (!canStudentAccessLesson(user.id, lessonId)) {
    notFound();
  }

  const lesson = getLessonById(lessonId);
  if (!lesson) {
    notFound();
  }

  recordLessonView({
    lessonId,
    studentId: user.id,
    timeSpentSec: 120,
    completionPercent: 35,
  });

  const quizzes = listQuizzes({ lessonId, status: "PUBLISHED" }).map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    passingScore: quiz.passingScore,
    questionCount: quiz.questionCount,
    maxAttempts: quiz.maxAttempts,
  }));

  const activePracticeConversation = getOrCreateActiveLessonPracticeConversation({
    lessonId,
    studentId: user.id,
  });

  const practiceMessages = listLessonPracticeMessages({
    lessonId,
    studentId: user.id,
    conversationId: activePracticeConversation.id,
    limit: 40,
  });
  const practiceConversations = listLessonPracticeConversations({
    lessonId,
    studentId: user.id,
    limit: 20,
  });

  return (
    <LessonDetailTabs
      lesson={lesson}
      quizzes={quizzes}
      practiceConversation={{
        id: activePracticeConversation.id,
        createdAt: activePracticeConversation.createdAt,
      }}
      practiceConversations={practiceConversations}
      practiceMessages={practiceMessages}
    />
  );
}
