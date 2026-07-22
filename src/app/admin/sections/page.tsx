import { SectionsManager } from "@/components/admin/sections-manager";
import { listSections } from "@/server/queries/sections";
import { listSubjects } from "@/server/queries/subjects";
import { listUsers } from "@/server/queries/users";

export default function AdminSectionsPage() {
  const sections = listSections().map((section) => ({
    id: section.id,
    teacherId: section.teacherId,
    teacherName: section.teacherName,
    subjectId: section.subjectId,
    subjectName: section.subjectName,
    subjectIds: section.subjectIds,
    name: section.name,
    gradeLevel: section.gradeLevel,
    schoolYear: section.schoolYear,
    status: section.status,
    description: section.description,
    studentCount: section.studentCount,
    updatedAt: section.updatedAt,
  }));

  const teachers = listUsers({ role: "TEACHER", page: 1, pageSize: 500 }).data.map((teacher) => ({
    id: teacher.id,
    fullName: teacher.fullName,
    email: teacher.email,
    isActive: teacher.isActive,
  }));

  const subjects = listSubjects({ isActive: true }).map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
    isActive: subject.isActive,
  }));

  return <SectionsManager initialSections={sections} teachers={teachers} subjects={subjects} />;
}
