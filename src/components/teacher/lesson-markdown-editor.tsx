"use client";

import { MathTextEditor } from "@/components/ui/math-text-editor";

type LessonMarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeightClassName?: string;
};

export function LessonMarkdownEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  minHeightClassName = "min-h-56",
}: LessonMarkdownEditorProps) {
  return (
    <MathTextEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder ?? "Write lesson content in markdown..."}
      disabled={disabled}
      minHeightClassName={minHeightClassName}
      showToolbar
      allowMediaUpload
      previewDefaultOpen
    />
  );
}
