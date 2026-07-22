"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MarkdownContent } from "@/components/ui/markdown-content";

type FormattingExample = {
  label: string;
  syntax: string;
};

const guideSections: { title: string; examples: FormattingExample[] }[] = [
  {
    title: "Basic formulas",
    examples: [
      { label: "Algebra expression", syntax: "$2x + 3 = 7$" },
      { label: "Classroom angle", syntax: "$\\angle ABC$" },
    ],
  },
  {
    title: "Fractions and roots",
    examples: [
      { label: "Fraction", syntax: "$\\frac{a}{b}$" },
      { label: "Square root", syntax: "$\\sqrt{x}$" },
    ],
  },
  {
    title: "Exponents and subscripts",
    examples: [
      { label: "Exponent", syntax: "$x^2$" },
      { label: "Subscript", syntax: "$H_2O$" },
      { label: "Carbon dioxide", syntax: "$CO_2$" },
    ],
  },
  {
    title: "Comparison and operators",
    examples: [
      { label: "Not equal", syntax: "$a \\neq b$" },
      { label: "Inequality", syntax: "$x \\leq 10$" },
      { label: "Multiplication", syntax: "$4 \\times 6$" },
      { label: "Division", syntax: "$18 \\div 3$" },
    ],
  },
  {
    title: "Greek letters and symbols",
    examples: [
      { label: "Pi", syntax: "$\\pi$" },
      { label: "Delta", syntax: "$\\Delta y$" },
      { label: "Theta", syntax: "$\\theta$" },
    ],
  },
  {
    title: "Chemistry examples",
    examples: [
      { label: "Formula", syntax: "$NaOH + HCl \\rightarrow NaCl + H_2O$" },
      { label: "Balancing cue", syntax: "$H_2 + O_2 \\rightarrow H_2O$" },
    ],
  },
  {
    title: "Common classroom notation",
    examples: [
      { label: "Scientific notation", syntax: "$3.2 \\times 10^5$" },
      { label: "Mixed expression", syntax: "$\\frac{2x}{3} + 5$" },
    ],
  },
];

type EditorFormattingGuideProps = {
  open: boolean;
  onClose: () => void;
};

export function EditorFormattingGuide({ open, onClose }: EditorFormattingGuideProps) {
  const [copiedSyntax, setCopiedSyntax] = useState<string | null>(null);

  async function copySyntax(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedSyntax(value);
      setTimeout(() => setCopiedSyntax((prev) => (prev === value ? null : prev)), 1200);
    } catch {
      setCopiedSyntax(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Math Symbols Guide"
      description="Use these ready-to-paste patterns while writing lesson, quiz, and question content."
    >
      <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1">
        {guideSections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h4 className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--ink-600)]">{section.title}</h4>
            <div className="space-y-2">
              {section.examples.map((example) => {
                const copied = copiedSyntax === example.syntax;
                return (
                  <div key={`${section.title}-${example.label}`} className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-[var(--ink-800)]">{example.label}</p>
                      <Button type="button" size="sm" variant="secondary" onClick={() => copySyntax(example.syntax)}>
                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <div className="grid gap-2 lg:grid-cols-2">
                      <div className="rounded-lg border border-[var(--line-300)] bg-white px-3 py-2 font-mono text-sm text-[var(--ink-700)]">
                        {example.syntax}
                      </div>
                      <div className="rounded-lg border border-[var(--line-300)] bg-white px-3 py-2">
                        <MarkdownContent content={example.syntax} className="lesson-markdown text-sm" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
