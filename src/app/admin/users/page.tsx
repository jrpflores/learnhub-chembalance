import { UsersManager } from "@/components/admin/users-manager";
import { listUsers } from "@/server/queries/users";

export default function AdminUsersPage() {
  const users = listUsers({ page: 1, pageSize: 20 }).data;

  return <UsersManager initialUsers={users} />;
}
