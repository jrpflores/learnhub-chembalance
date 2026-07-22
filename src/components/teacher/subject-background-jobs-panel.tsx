"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { extractApiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/date-display";

type LessonGenerationJob = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  createdLessonId: string | null;
  queuedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
};

type BackgroundJobsResponse = {
  jobs?: LessonGenerationJob[];
  error?: string;
  details?: unknown;
};

type SubjectBackgroundJobsPanelProps = {
  subjectId: string;
  sectionId: string;
  initialJobs: LessonGenerationJob[];
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

export function SubjectBackgroundJobsPanel({ subjectId, sectionId, initialJobs }: SubjectBackgroundJobsPanelProps) {
  const [jobs, setJobs] = useState(initialJobs);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const activeJobCount = useMemo(
    () => jobs.filter((job) => job.status === "PENDING" || job.status === "PROCESSING").length,
    [jobs],
  );

  const refreshJobs = useCallback(async (silent = false) => {
    if (!subjectId || !sectionId) {
      return;
    }
    if (refreshing) {
      return;
    }
    setError(null);
    if (!silent) {
      setRefreshing(true);
    }

    try {
      const params = new URLSearchParams({
        subjectId,
        sectionId,
        limit: "10",
      });
      const response = await fetch(`/api/teacher/lessons/generation-jobs?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as BackgroundJobsResponse | null;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to refresh background jobs."));
        return;
      }

      setJobs(Array.isArray(payload?.jobs) ? payload.jobs : []);
      setLastCheckedAt(new Date().toISOString());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh background jobs.");
    } finally {
      if (!silent) {
        setRefreshing(false);
      }
    }
  }, [refreshing, sectionId, subjectId]);

  useEffect(() => {
    if (activeJobCount <= 0) {
      return;
    }
    const poller = window.setInterval(() => {
      void refreshJobs(true);
    }, 5000);
    return () => window.clearInterval(poller);
  }, [activeJobCount, refreshJobs]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink-800)]">Background Jobs</p>
          <p className="mt-1 text-xs text-[var(--ink-500)]">Showing the latest 10 lesson generation jobs for this section.</p>
          <p className="mt-1 text-xs text-[var(--ink-500)]">
            {activeJobCount > 0
              ? `${activeJobCount} job${activeJobCount === 1 ? "" : "s"} in progress.`
              : "No active jobs right now."}
            {lastCheckedAt ? ` Last checked ${formatDateTime(lastCheckedAt)}.` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshJobs(false)}
          disabled={refreshing}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[var(--line-300)] bg-white px-3 text-sm font-semibold text-[var(--ink-800)] hover:bg-[var(--line-100)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--danger-200)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">{error}</p>
      ) : null}

      {jobs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
          No background jobs yet. Use <span className="font-semibold">Generate Lesson</span> in the Lessons tab to queue one.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Queued</th>
                <th className="px-2 py-2 font-semibold">Completed</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Result</th>
                <th className="px-2 py-2 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 text-[var(--ink-700)]">{formatDateTime(job.queuedAt)}</td>
                  <td className="px-2 py-2 text-[var(--ink-700)]">{job.completedAt ? formatDateTime(job.completedAt) : "—"}</td>
                  <td className="px-2 py-2">
                    <Chip tone={job.status === "COMPLETED" ? "success" : job.status === "FAILED" ? "danger" : "brand"}>
                      {job.status}
                    </Chip>
                  </td>
                  <td className="px-2 py-2">
                    {job.createdLessonId ? (
                      <Link
                        href={withQuery(`/teacher/lessons/${job.createdLessonId}`, {
                          subjectId,
                          sectionId,
                        })}
                        className="inline-flex text-[var(--brand-700)] hover:underline"
                      >
                        Open generated lesson
                      </Link>
                    ) : (
                      <span className="text-[var(--ink-500)]">No lesson created</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-[var(--ink-700)]">{job.errorMessage || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
