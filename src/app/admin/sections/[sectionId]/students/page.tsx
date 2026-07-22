import { notFound } from "next/navigation";
import { SectionStudentsManager } from "@/components/sections/section-students-manager";
import { requireRole } from "@/lib/auth";
import { getSectionById, listStudentsAvailableForSection } from "@/server/queries/sections";

type AdminSectionStudentsPageProps = {
  params: Promise<{ sectionId: string }>;
};

export default async function AdminSectionStudentsPage({ params }: AdminSectionStudentsPageProps) {
  await requireRole(["ADMIN"]);
  const { sectionId } = await params;

  const section = getSectionById(sectionId);
  if (!section) {
    notFound();
  }

  // Only unassigned students + current section roster (one section per student).
  const students = listStudentsAvailableForSection(sectionId);

  return (
    <SectionStudentsManager
      role="ADMIN"
      section={{
        id: section.id,
        name: section.name,
        gradeLevel: section.gradeLevel,
        schoolYear: section.schoolYear,
        status: section.status,
        subjectName: section.subjectName,
      }}
      initialAssignedStudentIds={section.students.map((student) => student.studentId)}
      availableStudents={students}
      backHref="/admin/sections"
    />
  );
}
