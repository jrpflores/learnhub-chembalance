"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { subscribeToast, type ToastEvent, type ToastTone } from "@/lib/toast-events";

type ActiveToast = ToastEvent & {
  id: string;
  tone: ToastTone;
};

const DEFAULT_DURATION_MS = 3600;
const ERROR_DURATION_MS = 5200;

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `toast_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function Toaster() {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timerMapRef = useRef<Map<string, number>>(new Map());
  const dedupeMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timerMap = timerMapRef.current;
    return () => {
      for (const timeoutId of timerMap.values()) {
        window.clearTimeout(timeoutId);
      }
      timerMap.clear();
    };
  }, []);

  useEffect(() => {
    return subscribeToast((event) => {
      const tone = event.tone ?? "info";
      const title = event.title?.trim();
      if (!title) {
        return;
      }

      const signature = `${tone}|${title}|${event.description?.trim() ?? ""}`;
      const now = Date.now();
      const lastTimestamp = dedupeMapRef.current.get(signature) ?? 0;
      if (now - lastTimestamp < 1200) {
        return;
      }
      dedupeMapRef.current.set(signature, now);

      const id = createToastId();
      const nextToast: ActiveToast = {
        id,
        tone,
        title,
        description: event.description?.trim() || undefined,
        durationMs: event.durationMs,
      };

      setToasts((current) => [...current, nextToast].slice(-4));
      const duration = event.durationMs ?? (tone === "error" ? ERROR_DURATION_MS : DEFAULT_DURATION_MS);
      const timeoutId = window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        timerMapRef.current.delete(id);
      }, duration);
      timerMapRef.current.set(id, timeoutId);
    });
  }, []);

  const renderedToasts = useMemo(() => toasts, [toasts]);

  function dismissToast(id: string) {
    const timeoutId = timerMapRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timerMapRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex justify-center px-3 sm:justify-end sm:px-6">
      <div className="flex w-full max-w-md flex-col gap-2">
        {renderedToasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto rounded-xl border bg-white shadow-lg backdrop-blur transition",
              toast.tone === "success" && "border-[var(--success-300)]",
              toast.tone === "error" && "border-[var(--danger-200)]",
              toast.tone === "info" && "border-[var(--line-300)]",
            )}
            role="status"
            aria-live={toast.tone === "error" ? "assertive" : "polite"}
          >
            <div className="flex items-start gap-2 p-3">
              <span
                className={cn(
                  "mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center",
                  toast.tone === "success" && "text-[var(--success-700)]",
                  toast.tone === "error" && "text-[var(--danger-700)]",
                  toast.tone === "info" && "text-[var(--brand-700)]",
                )}
              >
                {toast.tone === "success" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : toast.tone === "error" ? (
                  <AlertCircle className="h-5 w-5" />
                ) : (
                  <Info className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ink-900)]">{toast.title}</p>
                {toast.description ? <p className="mt-0.5 text-sm text-[var(--ink-600)]">{toast.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-md border border-[var(--line-200)] bg-white text-[var(--ink-500)] hover:bg-[var(--line-100)]"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
