import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Crumb = {
  label: string;
  href?: string;
};

type StudentPageHeaderProps = {
  title: string;
  description?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  className?: string;
};

export function StudentPageHeader({ title, description, crumbs, actions, className }: StudentPageHeaderProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {crumbs && crumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" /> : null}
                  {crumb.href && !isLast ? (
                    <Link href={crumb.href} className="hover:underline">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "font-semibold text-[var(--ink-800)]" : undefined}>{crumb.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-[var(--ink-900)]">{title}</h2>
          {description ? <p className="mt-1 text-sm text-[var(--ink-500)]">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export function studentPrimaryLinkClassName(className?: string) {
  return cn(
    "inline-flex h-10 min-w-[7.5rem] items-center justify-center rounded-xl bg-[var(--brand-500)] px-4 text-sm font-semibold !text-white shadow-sm transition hover:bg-[var(--brand-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-300)]",
    className,
  );
}

export function studentSecondaryLinkClassName(className?: string) {
  return cn(
    "inline-flex h-10 items-center justify-center rounded-xl border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-800)] transition hover:bg-[var(--line-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--line-300)]",
    className,
  );
}
