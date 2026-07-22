"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type StudentResultRecheckActionProps = {
  attemptId: string;
};

export function StudentResultRecheckAction({ attemptId }: StudentResultRecheckActionProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function closeModal() {
    if (pending) {
      return;
    }
    setOpen(false);
  }

  function queueRecheck() {
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/student/attempts/recheck", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ attemptId }),
      });

      let payload: { error?: string; message?: string } = {};
      try {
        payload = (await response.json()) as { error?: string; message?: string };
      } catch {
        payload = {};
      }

      if (!response.ok) {
        setError(payload.error ?? "Unable to queue short-answer recheck.");
        return;
      }

      setOpen(false);
      router.replace(`/student/results/${attemptId}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        disabled={pending}
      >
        <RefreshCcw className="h-4 w-4" />
        Recheck Short Answers
      </Button>

      <Modal
        open={open}
        onClose={closeModal}
        title="Recheck Short Answers"
        description="Queue your short-answer responses for another offline AI review."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
            <p>
              Your current short-answer grading will be re-evaluated in the background. You can leave this page and
              check back in Results.
            </p>
          </div>
          {error ? (
            <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={queueRecheck} disabled={pending}>
              {pending ? "Queuing..." : "Queue Recheck"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
