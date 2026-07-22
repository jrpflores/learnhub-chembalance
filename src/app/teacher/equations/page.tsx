import { EquationLibraryManager } from "@/components/equations/equation-library-manager";
import { requireRole } from "@/lib/auth";
import { listChemicalEquations } from "@/server/queries/equations";
import { listTeacherSubjects } from "@/server/queries/subjects";

export default async function TeacherEquationsPage() {
  const user = await requireRole(["TEACHER"]);
  const equations = listChemicalEquations({
    teacherId: user.id,
    includeGlobal: true,
    includeArchived: true,
  });
  const teacherSubjects = listTeacherSubjects(user.id);

  return (
    <EquationLibraryManager
      title="Equation Library"
      description="Build reusable chemistry equations for targeted practice and quiz support."
      initialEquations={equations}
      subjects={teacherSubjects}
      apiBasePath="/api/teacher/equations"
    />
  );
}
