"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { UserImportSummary } from "@/lib/user-import-types";

type UsersImportCardProps = {
  onImported: () => void | Promise<void>;
};

const DEFAULT_TEMPORARY_PASSWORD = "12345678";
const TEMPLATE_DOWNLOAD_PATH = "/api/admin/users/import/template";

const linkButtonClassName =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[var(--line-300)] bg-white px-4 text-sm font-medium text-[var(--ink-900)] transition-colors hover:bg-[var(--line-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--line-300)]";

export function UsersImportCard({ onImported }: UsersImportCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [temporaryPassword, setTemporaryPassword] = useState(DEFAULT_TEMPORARY_PASSWORD);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UserImportSummary | null>(null);

  function onImportClick() {
    fileInputRef.current?.click();
  }

  function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setError(null);
    setSummary(null);

    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("temporaryPassword", temporaryPassword.trim() || DEFAULT_TEMPORARY_PASSWORD);

      const response = await fetch("/api/admin/users/import", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as UserImportSummary & { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Import failed.");
        return;
      }

      setSummary(payload);
      await onImported();
    });
  }

  const resultItems = summary?.results.filter((entry) => entry.status !== "created") ?? [];

  return (
    <Card>
      <div>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Import Users</h2>
        <p className="text-sm text-[var(--ink-500)]">
          Upload CSV with full name, email, gender (male/female), user type, and optional section. If the section name
          is new, an active section is created automatically. New users share one temporary password. Existing students
          with no section can be assigned by re-importing the same email with a section column.
        </p>
        <p className="mt-1 text-sm text-[var(--ink-500)]">
          Download the template first so column headers match what the importer expects.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm text-[var(--ink-600)]">
          <span className="mb-1 block font-medium">Temporary password</span>
          <input
            type="password"
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            autoComplete="new-password"
          />
        </label>
      </div>

      <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFileSelected} />

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={TEMPLATE_DOWNLOAD_PATH} className={cn(linkButtonClassName)} download>
          <Download className="size-4" aria-hidden />
          Download template
        </a>
        <Button type="button" onClick={onImportClick} disabled={pending}>
          <Upload className="size-4" aria-hidden />
          {pending ? "Importing..." : "Choose CSV and Import"}
        </Button>
      </div>

      {error ? <p className="mt-3 text-sm text-[var(--danger-600)]">{error}</p> : null}

      {summary ? (
        <div className="mt-4 space-y-3 rounded-xl border border-[var(--line-200)] bg-[var(--line-50)] p-4 text-sm">
          <p className="font-semibold text-[var(--ink-800)]">
            Created {summary.created}, enrolled {summary.enrolled}, skipped {summary.skipped}, errors {summary.errors},
            warnings {summary.warnings}
          </p>
          {resultItems.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-[var(--ink-600)]">
              {resultItems.map((entry, index) => (
                <li key={`${entry.rowNumber}-${entry.status}-${index}`}>
                  Row {entry.rowNumber}:{" "}
                  {entry.status === "skipped"
                    ? `${entry.email} — ${entry.reason}`
                    : entry.status === "error"
                      ? `${entry.email} — ${entry.reason}`
                      : entry.status === "enrolled"
                        ? `${entry.email} — assigned to section`
                        : `${entry.email} — ${entry.message}`}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[var(--ink-500)]">All rows imported without skips or warnings.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}
