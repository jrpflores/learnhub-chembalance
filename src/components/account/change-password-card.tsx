"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractApiError } from "@/lib/api-error";

type ChangePasswordCardProps = {
  className?: string;
};

type VisibilityState = {
  current: boolean;
  next: boolean;
  confirm: boolean;
};

export function ChangePasswordCard({ className }: ChangePasswordCardProps) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<VisibilityState>({
    current: false,
    next: false,
    confirm: false,
  });
  const [pending, startTransition] = useTransition();

  const passwordPolicyOk = useMemo(() => form.newPassword.trim().length >= 8, [form.newPassword]);

  function toggleVisibility(key: keyof VisibilityState) {
    setVisibility((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function validate() {
    const nextErrors: Partial<Record<keyof typeof form, string>> = {};
    const currentPassword = form.currentPassword.trim();
    const newPassword = form.newPassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (!currentPassword) {
      nextErrors.currentPassword = "Current password is required";
    }
    if (newPassword.length < 8) {
      nextErrors.newPassword = "New password must be at least 8 characters";
    }
    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your new password";
    } else if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }
    if (currentPassword && newPassword && currentPassword === newPassword) {
      nextErrors.newPassword = "New password must be different from current password";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-learnhub-toast-success": "Password updated successfully.",
          "x-learnhub-toast-error": "Unable to update password.",
        },
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
          confirmPassword: form.confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        const parsed = extractApiError(payload, "Unable to update password.");
        const fieldErrorsRaw =
          payload && typeof payload.details === "object" && payload.details && "fieldErrors" in payload.details
            ? (payload.details as { fieldErrors?: Record<string, string[] | string> }).fieldErrors
            : undefined;

        const nextErrors: Partial<Record<keyof typeof form, string>> = {};
        if (fieldErrorsRaw?.currentPassword) {
          const value = fieldErrorsRaw.currentPassword;
          nextErrors.currentPassword = Array.isArray(value) ? value[0] : String(value);
        }
        if (fieldErrorsRaw?.newPassword) {
          const value = fieldErrorsRaw.newPassword;
          nextErrors.newPassword = Array.isArray(value) ? value[0] : String(value);
        }
        if (fieldErrorsRaw?.confirmPassword) {
          const value = fieldErrorsRaw.confirmPassword;
          nextErrors.confirmPassword = Array.isArray(value) ? value[0] : String(value);
        }
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
        }

        setFormError(parsed.title);
        return;
      }

      setForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setErrors({});
      setFormError(null);
      setVisibility({ current: false, next: false, confirm: false });
    });
  }

  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-[var(--brand-100)] p-2 text-[var(--brand-700)]">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Change Password</h3>
          <p className="mt-1 text-sm text-[var(--ink-500)]">
            Keep your account secure by updating your password regularly.
          </p>
        </div>
      </div>

      <form className="mt-4 space-y-3" onSubmit={onSubmit} noValidate>
        <PasswordInput
          id="current-password"
          label="Current Password"
          value={form.currentPassword}
          visible={visibility.current}
          error={errors.currentPassword}
          autoComplete="current-password"
          onChange={(value) => setForm((prev) => ({ ...prev, currentPassword: value }))}
          onToggleVisibility={() => toggleVisibility("current")}
        />

        <PasswordInput
          id="new-password"
          label="New Password"
          value={form.newPassword}
          visible={visibility.next}
          error={errors.newPassword}
          autoComplete="new-password"
          onChange={(value) => setForm((prev) => ({ ...prev, newPassword: value }))}
          onToggleVisibility={() => toggleVisibility("next")}
        />
        <p className="text-xs text-[var(--ink-500)]">Minimum 8 characters.</p>

        <PasswordInput
          id="confirm-password"
          label="Confirm New Password"
          value={form.confirmPassword}
          visible={visibility.confirm}
          error={errors.confirmPassword}
          autoComplete="new-password"
          onChange={(value) => setForm((prev) => ({ ...prev, confirmPassword: value }))}
          onToggleVisibility={() => toggleVisibility("confirm")}
        />

        {formError ? (
          <p className="rounded-lg border border-[var(--danger-200)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
            {formError}
          </p>
        ) : null}

        <div className="pt-1">
          <Button type="submit" disabled={pending || !passwordPolicyOk}>
            {pending ? "Updating..." : "Update Password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

type PasswordInputProps = {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
  onToggleVisibility: () => void;
};

function PasswordInput({
  id,
  label,
  value,
  visible,
  error,
  autoComplete,
  onChange,
  onToggleVisibility,
}: PasswordInputProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-[var(--ink-700)]" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 pr-11 text-sm"
        />
        <button
          type="button"
          onClick={onToggleVisibility}
          className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--ink-500)] hover:bg-[var(--line-100)]"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="mt-1 text-xs text-[var(--danger-700)]">{error}</p> : null}
    </div>
  );
}
