import { TeacherSubjectsList } from "@/components/teacher/subjects-list";
import { requireRole } from "@/lib/auth";
import { listSections, listTeacherSectionSubjectIds } from "@/server/queries/sections";
import { listTeacherSubjectSummaries } from "@/server/queries/subjects";

type TeacherSubjectsPageProps = {
  searchParams: Promise<{ sectionId?: string }>;
};

export default async function TeacherSubjectsPage({ searchParams }: TeacherSubjectsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const params = await searchParams;
  const assignedSections = listSections({ teacherId: user.id, status: "ACTIVE" });
  const selectedSection =
    params.sectionId && assignedSections.some((section) => section.id === params.sectionId)
      ? assignedSections.find((section) => section.id === params.sectionId) ?? null
      : null;
  const subjects = listTeacherSubjectSummaries(user.id, selectedSection?.id ?? undefined);

  const selectedSectionSubjectIds = selectedSection ? listTeacherSectionSubjectIds(selectedSection.id, user.id) : [];

  const visibleSubjects = selectedSection
    ? subjects.filter((subject) => selectedSectionSubjectIds.includes(subject.id))
    : subjects;

  return (
    <TeacherSubjectsList
      sections={assignedSections.map((section) => ({
        id: section.id,
        name: section.name,
      }))}
      subjects={visibleSubjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        lessonCount: subject.lessonCount,
        sectionCount: subject.sectionCount,
      }))}
      selectedSection={
        selectedSection
          ? {
              id: selectedSection.id,
              name: selectedSection.name,
              subjectId: selectedSection.subjectId,
              studentCount: selectedSection.studentCount,
            }
          : null
      }
    />
  );
}
