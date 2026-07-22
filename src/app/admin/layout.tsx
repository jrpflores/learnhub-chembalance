import { RoleLayout } from "@/components/layout/role-layout";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RoleLayout role="ADMIN">{children}</RoleLayout>;
}
