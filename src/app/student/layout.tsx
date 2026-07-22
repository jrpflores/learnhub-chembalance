import { RoleLayout } from "@/components/layout/role-layout";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="STUDENT">{children}</RoleLayout>;
}
