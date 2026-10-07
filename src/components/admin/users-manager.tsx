"use client";

import { useEffect, useState, useTransition } from "react";
import { Edit3, KeyRound, Trash2, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";

type UserItem = {
  id: string;
  fullName: string;
  email: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  isActive: boolean;
  streakDays: number;
};

type UsersManagerProps = {
  initialUsers: UserItem[];
};

const PAGE_SIZE = 20;

export function UsersManager({ initialUsers }: UsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"ALL" | "ADMIN" | "TEACHER" | "STUDENT">("ALL");
  const [createRole, setCreateRole] = useState<"ADMIN" | "TEACHER" | "STUDENT">("STUDENT");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserItem | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [viewMode, setViewMode] = usePersistedViewMode();
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: PAGE_SIZE,
    total: initialUsers.length,
    pageCount: Math.max(1, Math.ceil(initialUsers.length / PAGE_SIZE)),
  });
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  async function reloadUsers(next?: { page?: number; role?: "ALL" | "ADMIN" | "TEACHER" | "STUDENT"; search?: string }) {
    const nextRole = next?.role ?? role;
    const nextSearch = next?.search ?? search;
    const nextPage = next?.page ?? pagination.page;
    const params = new URLSearchParams();
    if (nextRole !== "ALL") {
      params.set("role", nextRole);
    }
    if (nextSearch) {
      params.set("search", nextSearch);
    }
    params.set("page", String(nextPage));
    params.set("pageSize", String(pagination.pageSize));

    const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
    const payload = (await response.json()) as {
      data?: UserItem[];
      total?: number;
      page?: number;
      pageSize?: number;
      pageCount?: number;
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error ?? "Unable to load users.");
      return;
    }

    const resolvedPageCount = Math.max(1, payload.pageCount ?? 1);
    if (nextPage > resolvedPageCount) {
      await reloadUsers({ page: resolvedPageCount, role: nextRole, search: nextSearch });
      return;
    }

    setUsers(Array.isArray(payload.data) ? payload.data : []);
    setPagination({
      page: payload.page ?? nextPage,
      pageSize: payload.pageSize ?? pagination.pageSize,
      total: payload.total ?? 0,
      pageCount: resolvedPageCount,
    });
  }

  useEffect(() => {
    void reloadUsers({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateSearch(nextSearch: string) {
    setSearch(nextSearch);
    setError(null);
    startTransition(async () => {
      await reloadUsers({ page: 1, search: nextSearch });
    });
  }

  function updateRole(nextRole: "ALL" | "ADMIN" | "TEACHER" | "STUDENT") {
    setRole(nextRole);
    setError(null);
    startTransition(async () => {
      await reloadUsers({ page: 1, role: nextRole });
    });
  }

  function goToPage(nextPage: number) {
    startTransition(async () => {
      await reloadUsers({ page: nextPage });
    });
  }

  async function readApiError(response: Response, fallback: string) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error?.trim() || fallback;
    } catch {
      return fallback;
    }
  }

  function onCreateUser() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          role: createRole,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, "Unable to create user"));
        return;
      }

      setForm({
        fullName: "",
        email: "",
        password: "",
      });
      await reloadUsers({ page: pagination.page });
    });
  }

  function toggleActive(user: UserItem) {
    setError(null);
    startTransition(async () => {
      await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: user.id,
          isActive: !user.isActive,
        }),
      });

      await reloadUsers({ page: pagination.page });
    });
  }

  function openEditModal(user: UserItem) {
    setError(null);
    setEditingUser(user);
    setEditFullName(user.fullName);
  }

  function saveUserName() {
    if (!editingUser) {
      return;
    }

    const trimmedName = editFullName.trim();
    if (!trimmedName || trimmedName === editingUser.fullName) {
      setEditingUser(null);
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingUser.id,
          fullName: trimmedName,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, "Unable to update name"));
        return;
      }

      setEditingUser(null);
      await reloadUsers({ page: pagination.page });
    });
  }

  function openResetPassword(user: UserItem) {
    setPasswordTarget(user);
    setNewPassword("");
  }

  function submitResetPassword() {
    if (!passwordTarget || newPassword.trim().length < 8) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/admin/users/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: passwordTarget.id,
          newPassword,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, "Unable to reset password"));
        return;
      }

      setPasswordTarget(null);
      setNewPassword("");
      await reloadUsers({ page: pagination.page });
    });
  }

  function openDeleteModal(user: UserItem) {
    setError(null);
    setDeleteTarget(user);
  }

  function deleteUser() {
    if (!deleteTarget) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: deleteTarget.id,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, "Unable to delete user"));
        return;
      }

      setDeleteTarget(null);
      await reloadUsers({ page: pagination.page });
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Create User</h2>
        <p className="text-sm text-[var(--ink-500)]">Create admins, teachers, and students with role-aware defaults.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            placeholder="Full name"
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
          />
          <input
            placeholder="Email"
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          />
          <input
            placeholder="Temporary password"
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.password}
            type="password"
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
          <select
            className="h-10 rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={createRole}
            onChange={(event) => setCreateRole(event.target.value as "ADMIN" | "TEACHER" | "STUDENT")}
          >
            <option value="STUDENT">Student</option>
            <option value="TEACHER">Teacher</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--danger-600)]">{error}</p> : null}

        <div className="mt-4">
          <Button onClick={onCreateUser} disabled={pending}>
            {pending ? "Saving..." : "Create User"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--ink-900)]">User Management</h2>
          <div className="flex flex-wrap gap-2">
            <input
              placeholder="Search users"
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              value={search}
              onChange={(event) => updateSearch(event.target.value)}
            />
            <select
              className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
              value={role}
              onChange={(event) => updateRole(event.target.value as "ALL" | "ADMIN" | "TEACHER" | "STUDENT")}
            >
              <option value="ALL">All roles</option>
              <option value="ADMIN">Admins</option>
              <option value="TEACHER">Teachers</option>
              <option value="STUDENT">Students</option>
            </select>
            <Button
              variant="secondary"
              onClick={() => {
                startTransition(async () => {
                  await reloadUsers({ page: pagination.page });
                });
              }}
              disabled={pending}
            >
              Refresh
            </Button>
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {error}
          </div>
        ) : null}

        {viewMode === "list" ? (
          <div className={tableScrollClassName}>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                  <th className="px-2 py-2 font-semibold">Name</th>
                  <th className="px-2 py-2 font-semibold">Email</th>
                  <th className="px-2 py-2 font-semibold">Role</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className={stickyActionsThClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-[var(--line-100)]">
                    <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{user.fullName}</td>
                    <td className="px-2 py-2 text-[var(--ink-600)]">{user.email}</td>
                    <td className="px-2 py-2">
                      <Chip tone={user.role === "ADMIN" ? "warning" : user.role === "TEACHER" ? "brand" : "success"}>
                        {user.role}
                      </Chip>
                    </td>
                    <td className="px-2 py-2">
                      <Chip tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Inactive"}</Chip>
                    </td>
                    <td className={stickyActionsTdClassName}>
                      <ActionButtons
                        user={user}
                        onEdit={openEditModal}
                        onToggle={toggleActive}
                        onReset={openResetPassword}
                        onDelete={openDeleteModal}
                        className="ml-auto"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => (
              <div key={user.id} className="relative rounded-xl border border-[var(--line-200)] bg-white p-4 pr-14">
                <ActionButtons
                  user={user}
                  onEdit={openEditModal}
                  onToggle={toggleActive}
                  onReset={openResetPassword}
                  onDelete={openDeleteModal}
                  className="absolute right-3 top-3"
                />
                <div>
                  <p className="font-semibold text-[var(--ink-900)]">{user.fullName}</p>
                  <p className="text-xs text-[var(--ink-500)]">{user.email}</p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Chip tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Active" : "Inactive"}</Chip>
                  <Chip tone={user.role === "ADMIN" ? "warning" : user.role === "TEACHER" ? "brand" : "success"}>
                    {user.role}
                  </Chip>
                </div>
              </div>
            ))}
          </div>
        )}

        {users.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center text-sm text-[var(--ink-500)]">
            No users found for this filter.
          </div>
        ) : null}
        <PaginationControls
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={pagination.total}
          onPageChange={goToPage}
        />
      </Card>

      <Modal
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        title="Edit User Name"
        description="Update the full name and save changes."
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Full Name
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={editFullName}
              onChange={(event) => setEditFullName(event.target.value)}
              placeholder="Enter full name"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={saveUserName} disabled={pending}>
              Save Name
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete User"
        description="This action is permanent. If the account has dependent records, deletion may be blocked."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {deleteTarget ? (
              <>
                You are deleting <strong>{deleteTarget.fullName}</strong> ({deleteTarget.email}).
              </>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteUser} disabled={pending}>
              Delete User
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => setPasswordTarget(null)}
        title="Reset Password"
        description={passwordTarget ? `Set a new password for ${passwordTarget.fullName}.` : "Set a new password."}
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            New Password
            <input
              type="password"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minimum 8 characters"
            />
          </label>
          <p className="text-xs text-[var(--ink-500)]">Use at least 8 characters.</p>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPasswordTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitResetPassword} disabled={pending || newPassword.trim().length < 8}>
              Reset Password
            </Button>
          </div>
        </div>
      </Modal>

    </div>
  );
}

function ActionButtons({
  user,
  onEdit,
  onToggle,
  onReset,
  onDelete,
  className,
}: {
  user: UserItem;
  onEdit: (user: UserItem) => void;
  onToggle: (user: UserItem) => void;
  onReset: (user: UserItem) => void;
  onDelete: (user: UserItem) => void;
  className?: string;
}) {
  return (
    <ActionMenu
      className={className}
      iconTrigger
      ariaLabel="User actions"
      groups={[
        {
          items: [
            {
              label: "Edit Name",
              icon: <Edit3 className="h-4 w-4" />,
              onSelect: () => onEdit(user),
            },
            {
              label: user.isActive ? "Deactivate" : "Reactivate",
              icon: user.isActive ? <UserRoundX className="h-4 w-4" /> : <UserRoundCheck className="h-4 w-4" />,
              onSelect: () => onToggle(user),
            },
            {
              label: "Reset Password",
              icon: <KeyRound className="h-4 w-4" />,
              onSelect: () => onReset(user),
            },
          ],
        },
        {
          items: [
            {
              label: "Delete",
              icon: <Trash2 className="h-4 w-4" />,
              tone: "danger",
              onSelect: () => onDelete(user),
            },
          ],
        },
      ]}
    />
  );
}
