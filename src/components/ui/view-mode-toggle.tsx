"use client";

import { LayoutGrid, List } from "lucide-react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

export type ViewMode = "tile" | "list";

const VIEW_MODE_STORAGE_KEY = "learnhub:view-mode";

export function usePersistedViewMode(defaultMode: ViewMode = "list") {
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window === "undefined") {
      return defaultMode;
    }
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      return stored === "tile" || stored === "list" ? stored : defaultMode;
    } catch {
      return defaultMode;
    }
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // No-op for private browsing or restricted environments.
    }
  }, []);

  return [viewMode, setViewMode] as const;
}

type ViewModeToggleProps = {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
};

export function ViewModeToggle({ value, onChange, className }: ViewModeToggleProps) {
  return (
    <div
      className={cn("inline-flex w-full items-center rounded-lg border border-[var(--line-300)] bg-white p-1 sm:w-auto", className)}
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        onClick={() => onChange("tile")}
        className={cn(
          "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition sm:flex-none",
          value === "tile" ? "bg-[var(--brand-500)] text-white" : "text-[var(--ink-700)] hover:bg-[var(--line-100)]",
        )}
        aria-pressed={value === "tile"}
        title="Tile view"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Tiles
      </button>
      <button
        type="button"
        onClick={() => onChange("list")}
        className={cn(
          "inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md px-2.5 text-xs font-semibold transition sm:flex-none",
          value === "list" ? "bg-[var(--brand-500)] text-white" : "text-[var(--ink-700)] hover:bg-[var(--line-100)]",
        )}
        aria-pressed={value === "list"}
        title="List view"
      >
        <List className="h-3.5 w-3.5" />
        List
      </button>
    </div>
  );
}
