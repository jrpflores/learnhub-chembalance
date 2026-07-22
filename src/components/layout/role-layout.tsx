import { requireRole } from "@/lib/auth";
import type { Role } from "@/domain/types";
import { roleNavigation } from "@/lib/navigation";
import { PortalShell } from "@/components/layout/portal-shell";
import { getPlatformBranding } from "@/server/queries/branding";

type RoleLayoutProps = {
  role: Role;
  children: React.ReactNode;
};

export async function RoleLayout({ role, children }: RoleLayoutProps) {
  const user = await requireRole([role]);
  const navItems = roleNavigation(role);
  const branding = getPlatformBranding();

  return (
    <PortalShell
      roleLabel={role.charAt(0) + role.slice(1).toLowerCase()}
      userName={user.fullName}
      navItems={navItems}
      brandName={branding.name}
      brandLogoUrl={branding.logoUrl}
    >
      {children}
    </PortalShell>
  );
}
