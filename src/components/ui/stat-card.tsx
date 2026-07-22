import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: "brand" | "success" | "neutral" | "warning";
};

const toneBorder: Record<NonNullable<StatCardProps["tone"]>, string> = {
  brand: "border-l-[var(--brand-500)]",
  success: "border-l-[var(--success-500)]",
  neutral: "border-l-[var(--line-400)]",
  warning: "border-l-[var(--warning-500)]",
};

export function StatCard({ label, value, hint, href, tone = "brand" }: StatCardProps) {
  const content = (
    <Card
      className={cn(
        "h-full border-l-4 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)]",
        toneBorder[tone],
        href ? "transition hover:-translate-y-0.5 hover:shadow-lg" : "",
      )}
    >
      <p className="text-sm font-medium text-[var(--ink-500)]">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-[var(--ink-900)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--ink-500)]">{hint}</p> : null}
    </Card>
  );

  if (!href) {
    return content;
  }

  return <Link href={href}>{content}</Link>;
}
