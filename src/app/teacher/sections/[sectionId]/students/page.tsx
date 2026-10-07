import { notFound } from "next/navigation";
import { SectionStudentsManager } from "@/components/sections/section-students-manager";
import { requireRole } from "@/lib/auth";
import { canTeacherAccessSection, getSectionById, listStudentsAvailableForSection } from "@/server/queries/sections";

type TeacherSectionStudentsPageProps = {
  params: Promise<{ sectionId: string }>;
};

export default async function TeacherSectionStudentsPage({ params }: TeacherSectionStudentsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const { sectionId } = await params;

  if (!canTeacherAccessSection(user.id, sectionId)) {
    notFound();
  }

  const section = getSectionById(sectionId);
  if (!section) {
    notFound();
  }

  // Same rule as admin: no active section, plus this roster. Archived enrollment does not block assignment.
  const availableById = new Map(listStudentsAvailableForSection(sectionId).map((student) => [student.id, student]));
  for (const enrolled of section.students) {
    if (!availableById.has(enrolled.studentId)) {
      availableById.set(enrolled.studentId, {
        id: enrolled.studentId,
        fullName: enrolled.fullName,
        email: enrolled.email,
        isActive: true,
      });
    }
  }

  return (
    <SectionStudentsManager
      role="TEACHER"
      section={{
        id: section.id,
        name: section.name,
        gradeLevel: section.gradeLevel,
        schoolYear: section.schoolYear,
        status: section.status,
        subjectName: section.subjectName,
      }}
      initialAssignedStudentIds={section.students.map((student) => student.studentId)}
      availableStudents={Array.from(availableById.values())}
      backHref="/teacher/sections"
    />
  );
}
