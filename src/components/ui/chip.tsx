import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "brand" | "neutral" | "success" | "warning" | "danger";
};

const toneClass: Record<NonNullable<ChipProps["tone"]>, string> = {
  brand: "bg-[var(--brand-100)] text-[var(--brand-700)]",
  neutral: "bg-[var(--line-100)] text-[var(--ink-600)]",
  success: "bg-[var(--success-100)] text-[var(--success-700)]",
  warning: "bg-[var(--warning-100)] text-[var(--warning-700)]",
  danger: "bg-[var(--danger-100)] text-[var(--danger-700)]",
};

export function Chip({ className, tone = "neutral", ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
        toneClass[tone],
        className,
      )}
      {...props}
    />
  );
}
