import { cn } from "@/lib/utils";

type AiAccuracyDisclaimerProps = {
  className?: string;
  compact?: boolean;
};

export function AiAccuracyDisclaimer({ className, compact = false }: AiAccuracyDisclaimerProps) {
  return (
    <p
      role="note"
      className={cn(
        "rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-600)]",
        compact ? "px-2.5 py-1.5 text-xs leading-relaxed" : "px-3 py-2 text-sm leading-relaxed",
        className,
      )}
    >
      {compact ? (
        <>
          <span className="font-semibold text-[var(--ink-700)]">AI may be wrong.</span> Review generated content and fix
          errors before publishing or using it in class.
        </>
      ) : (
        <>
          <span className="font-semibold text-[var(--ink-800)]">AI can be incorrect.</span> Generated lessons and quiz
          questions may contain factual or wording errors. Always review and edit before publishing.
        </>
      )}
    </p>
  );
}
