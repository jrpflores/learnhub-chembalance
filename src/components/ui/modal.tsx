"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  widthClassName?: string;
};

export function Modal({ open, title, description, children, onClose, widthClassName }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto px-0 py-0 sm:px-6 sm:py-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
        aria-label="Close modal"
      />

      <div className="relative flex min-h-full items-start justify-center py-2 sm:items-center sm:py-0">
        <div
          className={cn(
            "relative my-0 w-full max-w-full rounded-none border border-[var(--line-200)] bg-white p-5 shadow-[0_24px_60px_rgba(2,6,23,0.25)] sm:my-6 sm:rounded-2xl sm:max-h-[calc(100dvh-3rem)] md:w-[80vw] md:max-w-[80vw]",
            widthClassName,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-[var(--ink-900)]">{title}</h3>
              {description ? <p className="mt-1 text-sm text-[var(--ink-500)]">{description}</p> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line-200)] bg-white text-[var(--ink-600)] transition hover:bg-[var(--line-100)]"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 sm:max-h-[calc(100dvh-12rem)] sm:overflow-y-auto sm:pr-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
