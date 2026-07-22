import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
  className?: string;
};

export function Progress({ value, className }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--line-200)]", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-[var(--brand-400)] to-[var(--brand-600)] transition-[width] duration-200 ease-out"
        style={{ width: `${safeValue}%` }}
      />
    </div>
  );
}
