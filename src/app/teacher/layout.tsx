import { RoleLayout } from "@/components/layout/role-layout";

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="TEACHER">{children}</RoleLayout>;
}
