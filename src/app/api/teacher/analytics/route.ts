import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { listLessonAnalytics } from "@/server/queries/lessons";
import {
  getTeacherTopicWeakness,
  listQuizAnalytics,
  quizQuestionAnalytics,
  teacherStudentAnalytics,
} from "@/server/queries/quizzes";
import { teacherDashboardSummary } from "@/server/queries/teacher";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const teacherId = auth.user.id;
  const url = new URL(request.url);
  const sectionId = url.searchParams.get("sectionId")?.trim() || undefined;
  const subjectId = url.searchParams.get("subjectId")?.trim() || undefined;
  const filters = { sectionId, subjectId };

  return NextResponse.json({
    summary: teacherDashboardSummary(teacherId, sectionId),
    quizAnalytics: listQuizAnalytics(teacherId, filters),
    questionAnalytics: quizQuestionAnalytics(teacherId, filters),
    lessonAnalytics: listLessonAnalytics(teacherId, filters),
    studentAnalytics: teacherStudentAnalytics(teacherId, filters),
    topicWeakness: getTeacherTopicWeakness(teacherId, filters),
  });
}
