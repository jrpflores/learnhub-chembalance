import { EquationLibraryManager } from "@/components/equations/equation-library-manager";
import { listChemicalEquations } from "@/server/queries/equations";
import { listSubjects } from "@/server/queries/subjects";

export default function AdminEquationsPage() {
  const equations = listChemicalEquations({ includeArchived: true });
  const subjects = listSubjects({ isActive: true }).map((subject) => ({
    id: subject.id,
    name: subject.name,
    code: subject.code,
  }));

  return (
    <EquationLibraryManager
      title="Chemical Equation Library"
      description="Platform-level equation bank reusable for practice, question generation, and analysis."
      initialEquations={equations}
      subjects={subjects}
      apiBasePath="/api/admin/equations"
    />
  );
}
