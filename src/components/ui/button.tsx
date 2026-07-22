import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const variantClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)] focus-visible:ring-[var(--brand-300)]",
  secondary:
    "border border-[var(--line-300)] bg-white text-[var(--ink-900)] hover:bg-[var(--line-100)] focus-visible:ring-[var(--line-300)]",
  ghost: "bg-transparent text-[var(--ink-700)] hover:bg-[var(--line-100)] focus-visible:ring-[var(--line-300)]",
  danger: "bg-[var(--danger-500)] text-white hover:bg-[var(--danger-600)] focus-visible:ring-[var(--danger-200)]",
};

const sizeClass: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({ className, variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      )}
      {...props}
    />
  );
}
