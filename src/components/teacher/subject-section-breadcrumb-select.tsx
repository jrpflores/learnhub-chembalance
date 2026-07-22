"use client";

import { useRouter } from "next/navigation";

type SectionOption = {
  id: string;
  name: string;
  studentCount: number;
};

type SubjectSectionBreadcrumbSelectProps = {
  subjectId: string;
  sections: SectionOption[];
  activeSectionId: string;
  tab: string;
};

function withQuery(path: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value && value.trim().length > 0) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function SubjectSectionBreadcrumbSelect({
  subjectId,
  sections,
  activeSectionId,
  tab,
}: SubjectSectionBreadcrumbSelectProps) {
  const router = useRouter();

  if (sections.length === 0) {
    return null;
  }

  if (sections.length === 1) {
    return <span className="font-semibold text-[var(--ink-800)]">{sections[0].name}</span>;
  }

  return (
    <label className="inline-flex items-center gap-1">
      <span className="sr-only">Section</span>
      <select
        value={activeSectionId}
        onChange={(event) => {
          const sectionId = event.target.value;
          router.push(
            withQuery(`/teacher/subjects/${subjectId}`, {
              sectionId,
              tab,
            }),
          );
        }}
        className="h-8 max-w-[min(100vw-8rem,22rem)] rounded-md border border-[var(--line-300)] bg-white px-2 text-sm font-semibold text-[var(--ink-800)] shadow-sm hover:bg-[var(--line-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)]"
        aria-label="Select section"
      >
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name} ({section.studentCount} students)
          </option>
        ))}
      </select>
    </label>
  );
}
