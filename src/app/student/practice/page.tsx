import { LessonPracticeHub } from "@/components/student/lesson-practice-hub";
import { requireRole } from "@/lib/auth";
import { listStudentLessons } from "@/server/queries/lessons";
import { listStudentPracticeHistory } from "@/server/queries/lesson-practice";

export default async function StudentPracticePage() {
  const user = await requireRole(["STUDENT"]);
  const lessons = listStudentLessons(user.id).map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    subject: lesson.subject,
    topic: lesson.topic,
    shortDescription: lesson.shortDescription,
  }));
  const history = listStudentPracticeHistory({ studentId: user.id, limit: 40 }).map((item) => ({
    id: item.id,
    lessonId: item.lessonId,
    lessonTitle: item.lessonTitle,
    lessonSubject: item.lessonSubject,
    lessonTopic: item.lessonTopic,
    isActive: item.isActive,
    messageCount: item.messageCount,
    preview: item.preview,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastMessageAt: item.lastMessageAt,
  }));

  return <LessonPracticeHub lessons={lessons} initialHistory={history} />;
}
