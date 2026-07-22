"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PaginationControlsProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
};

function getPageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function PaginationControls({ page, pageSize, total, onPageChange, className }: PaginationControlsProps) {
  const pageCount = getPageCount(total, pageSize);
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, total);

  if (total <= pageSize) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2",
        className,
      )}
    >
      <p className="text-xs text-[var(--ink-500)]">
        Showing {start}-{end} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          Previous
        </Button>
        <span className="text-xs font-semibold text-[var(--ink-600)]">
          Page {safePage}/{pageCount}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
