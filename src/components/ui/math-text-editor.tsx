"use client";

import type { ReactNode } from "react";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  Asterisk,
  Bold,
  Calculator,
  Eye,
  EyeOff,
  FlaskConical,
  HelpCircle,
  ImagePlus,
  Quote,
  Slash,
  Type,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EditorFormattingGuide } from "@/components/ui/editor-formatting-guide";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Progress } from "@/components/ui/progress";
import { uploadMediaFile } from "@/lib/media-upload";
import { cn } from "@/lib/utils";

const PREVIEW_STATE_KEY = "learnhub:math-editor-preview-visible";
const PREVIEW_SYNC_EVENT = "learnhub:math-editor-preview-changed";
let sharedPreviewVisibility: boolean | null = null;

type MathTextEditorProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  inputId?: string;
  maxLength?: number;
  minHeightClassName?: string;
  showToolbar?: boolean;
  allowMediaUpload?: boolean;
  className?: string;
  previewDefaultOpen?: boolean;
  showUtilityControls?: boolean;
};

export function MathTextEditor({
  label,
  value,
  onChange,
  onKeyDown,
  placeholder,
  disabled = false,
  inputId,
  maxLength,
  minHeightClassName = "min-h-40",
  showToolbar = true,
  allowMediaUpload = false,
  className = "",
  previewDefaultOpen = true,
  showUtilityControls = true,
}: MathTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [showPreview, setShowPreview] = useState(() => {
    if (sharedPreviewVisibility === null) {
      sharedPreviewVisibility = previewDefaultOpen;
    }
    return sharedPreviewVisibility;
  });
  const [uploading, setUploading] = useState(false);
  const [uploadKind, setUploadKind] = useState<"image" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  function setSharedPreview(nextValue: boolean) {
    sharedPreviewVisibility = nextValue;
    setShowPreview(nextValue);
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(PREVIEW_STATE_KEY, nextValue ? "1" : "0");
    } catch {
      // Ignore storage issues in restricted environments.
    }

    window.dispatchEvent(
      new CustomEvent<boolean>(PREVIEW_SYNC_EVENT, {
        detail: nextValue,
      }),
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored = window.localStorage.getItem(PREVIEW_STATE_KEY);
      if (stored !== null) {
        const nextValue = stored === "1";
        sharedPreviewVisibility = nextValue;
        setShowPreview(nextValue);
      }
    } catch {
      // Ignore storage issues in restricted environments.
    }

    const onPreviewSync = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === "boolean") {
        sharedPreviewVisibility = customEvent.detail;
        setShowPreview(customEvent.detail);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PREVIEW_STATE_KEY || event.newValue === null) {
        return;
      }
      const nextValue = event.newValue === "1";
      sharedPreviewVisibility = nextValue;
      setShowPreview(nextValue);
    };

    window.addEventListener(PREVIEW_SYNC_EVENT, onPreviewSync as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(PREVIEW_SYNC_EVENT, onPreviewSync as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function insertAtCursor(snippet: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange(`${value}\n${snippet}`.trim());
      return;
    }

    const start = textarea.selectionStart ?? value.length;
    const end = textarea.selectionEnd ?? value.length;
    const nextValue = `${value.slice(0, start)}${snippet}${value.slice(end)}`;
    onChange(nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorPos = start + snippet.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function insertSnippet(snippet: string) {
    const prefix = value.length > 0 && !value.endsWith("\n") ? "\n" : "";
    insertAtCursor(`${prefix}${snippet}`);
  }

  async function onUpload(file: File, type: "image" | "video") {
    setError(null);
    setUploading(true);
    setUploadKind(type);
    setUploadProgress(2);
    try {
      const uploaded = await uploadMediaFile(file, {
        onProgress: (ratio) => {
          setUploadProgress(Math.max(2, Math.min(100, Math.round(ratio * 100))));
        },
      });
      setUploadProgress(100);
      const snippet =
        type === "image"
          ? `![${uploaded.fileName}](${uploaded.url})`
          : `[Video: ${uploaded.fileName}](${uploaded.url})`;
      insertSnippet(snippet);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
      setUploadKind(null);
      setUploadProgress(0);
      if (imageInputRef.current) imageInputRef.current.value = "";
      if (videoInputRef.current) videoInputRef.current.value = "";
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {label ? <p className="text-sm font-semibold text-[var(--ink-700)]">{label}</p> : <span />}
        {showUtilityControls ? (
          <div className="flex flex-wrap gap-2">
            <ToolbarIconButton label="Equation Help" onClick={() => setGuideOpen(true)}>
              <HelpCircle className="h-4 w-4" />
            </ToolbarIconButton>
            <ToolbarIconButton
              label={showPreview ? "Hide Preview" : "Show Preview"}
              onClick={() => setSharedPreview(!showPreview)}
            >
              {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </ToolbarIconButton>
          </div>
        ) : null}
      </div>

      {allowMediaUpload ? (
        <>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onUpload(file, "image");
              }
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void onUpload(file, "video");
              }
            }}
          />
        </>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </div>
      ) : null}

      {uploading ? (
        <div
          className="rounded-xl border border-[var(--brand-300)] bg-[var(--brand-100)] px-3 py-3"
          role="status"
          aria-live="polite"
          aria-label={`Uploading ${uploadKind ?? "media"} ${uploadProgress}%`}
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-[var(--brand-700)]">
              Uploading {uploadKind === "video" ? "video" : "image"}…
            </p>
            <p className="tabular-nums font-bold text-[var(--brand-700)]">{uploadProgress}%</p>
          </div>
          <Progress value={uploadProgress} className="mt-2 h-2.5 bg-white/70" />
          <p className="mt-2 text-xs text-[var(--ink-600)]">
            {uploadKind === "video"
              ? "Large videos upload in chunks. Keep this tab open until it finishes."
              : "Please wait while the file is uploaded."}
          </p>
        </div>
      ) : null}

      <div className="group/editor space-y-2">
        {showToolbar ? (
          <>
            <div
              className={cn(
                "flex flex-wrap gap-2 overflow-hidden rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-2 transition-all duration-200",
                "max-h-0 -translate-y-1 opacity-0 pointer-events-none",
                "group-focus-within/editor:max-h-24 group-focus-within/editor:translate-y-0 group-focus-within/editor:opacity-100 group-focus-within/editor:pointer-events-auto",
              )}
            >
              <ToolbarIconButton label="Insert Heading" onClick={() => insertSnippet("## Section title")} disabled={disabled}>
                <Type className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Bold" onClick={() => insertSnippet("**Bold text**")} disabled={disabled}>
                <Bold className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Callout" onClick={() => insertSnippet("> Key point")} disabled={disabled}>
                <Quote className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Exponent" onClick={() => insertSnippet("$x^2$")} disabled={disabled}>
                <Asterisk className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Fraction" onClick={() => insertSnippet("$\\frac{a}{b}$")} disabled={disabled}>
                <Slash className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Subscript" onClick={() => insertSnippet("$H_2O$")} disabled={disabled}>
                <FlaskConical className="h-4 w-4" />
              </ToolbarIconButton>
              <ToolbarIconButton label="Insert Root" onClick={() => insertSnippet("$\\sqrt{x}$")} disabled={disabled}>
                <Calculator className="h-4 w-4" />
              </ToolbarIconButton>
              {allowMediaUpload ? (
                <>
                  <ToolbarIconButton
                    label={
                      uploading && uploadKind === "image"
                        ? `Uploading Image ${uploadProgress}%`
                        : "Upload Image"
                    }
                    onClick={() => imageInputRef.current?.click()}
                    disabled={disabled || uploading}
                  >
                    <ImagePlus className="h-4 w-4" />
                  </ToolbarIconButton>
                  <ToolbarIconButton
                    label={
                      uploading && uploadKind === "video"
                        ? `Uploading Video ${uploadProgress}%`
                        : "Upload Video"
                    }
                    onClick={() => videoInputRef.current?.click()}
                    disabled={disabled || uploading}
                  >
                    <Video className="h-4 w-4" />
                  </ToolbarIconButton>
                </>
              ) : null}
            </div>
            <p className="text-xs text-[var(--ink-500)] group-focus-within/editor:hidden">
              Focus the editor to show quick formatting tools.
            </p>
          </>
        ) : null}

        <div className={`grid gap-3 ${showPreview ? "lg:grid-cols-2" : "grid-cols-1"}`}>
          <textarea
            ref={textareaRef}
            id={inputId}
            className={`${minHeightClassName} w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm outline-none ring-[var(--brand-300)] transition focus:ring-2`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder ?? "Write content..."}
            disabled={disabled}
            maxLength={maxLength}
          />

          {showPreview ? (
            <Card className={`${minHeightClassName} overflow-auto`}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Preview</p>
              <MarkdownContent content={value || "Start writing to preview content..."} className="lesson-markdown text-sm" />
            </Card>
          ) : null}
        </div>
      </div>

      <EditorFormattingGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  );
}

type ToolbarIconButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
};

function ToolbarIconButton({ label, onClick, disabled, children }: ToolbarIconButtonProps) {
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="h-11 w-11 p-0 [&>svg]:h-5 [&>svg]:w-5"
    >
      <span className="sr-only">{label}</span>
      {children}
    </Button>
  );
}
