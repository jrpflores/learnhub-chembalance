import { StudentsManager } from "@/components/teacher/students-manager";
import { requireRole } from "@/lib/auth";
import { teacherStudentAnalytics } from "@/server/queries/quizzes";
import { listSections } from "@/server/queries/sections";
import { listTeacherStudentsPaginated } from "@/server/queries/users";

type TeacherStudentsPageProps = {
  searchParams: Promise<{
    sectionId?: string;
    search?: string;
    page?: string;
  }>;
};

function toPage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export default async function TeacherStudentsPage({ searchParams }: TeacherStudentsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const params = await searchParams;
  const sections = listSections({ teacherId: user.id, status: "ACTIVE" });
  const requestedSectionId = params.sectionId?.trim();
  const selectedSectionId =
    requestedSectionId && sections.some((section) => section.id === requestedSectionId) ? requestedSectionId : "";
  const search = params.search?.trim() ?? "";
  const page = toPage(params.page);
  const initialStudents = listTeacherStudentsPaginated({
    teacherId: user.id,
    sectionId: selectedSectionId || undefined,
    search: search || undefined,
    page,
    pageSize: 12,
  });

  return (
    <StudentsManager
      initialResult={initialStudents}
      sections={sections.map((section) => ({
        id: section.id,
        name: section.name,
        studentCount: section.studentCount,
      }))}
      initialSectionId={selectedSectionId}
      initialSearch={search}
      analytics={teacherStudentAnalytics(user.id, { sectionId: selectedSectionId || undefined })}
      readOnly
    />
  );
}
