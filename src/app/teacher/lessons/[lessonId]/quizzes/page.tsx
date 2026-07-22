import { redirect } from "next/navigation";

type TeacherLessonQuizzesIndexPageProps = {
  params: Promise<{ lessonId: string }>;
};

export default async function TeacherLessonQuizzesIndexPage({ params }: TeacherLessonQuizzesIndexPageProps) {
  const { lessonId } = await params;
  redirect(`/teacher/lessons/${lessonId}`);
}

