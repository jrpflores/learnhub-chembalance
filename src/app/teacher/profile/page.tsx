import { ChangePasswordCard } from "@/components/account/change-password-card";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function TeacherProfilePage() {
  const user = await requireRole(["TEACHER"]);

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-2xl font-black text-[var(--ink-900)]">Account</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <ProfileField label="Full Name" value={user.fullName} />
          <ProfileField label="Email" value={user.email} />
          <ProfileField label="Role" value="Teacher" />
        </div>
      </Card>

      <ChangePasswordCard />
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
