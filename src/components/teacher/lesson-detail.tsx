"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ChevronRight, ClipboardCheck, Eye, EyeOff, FolderOpen, Link2Off, PenSquare, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { ActionMenu } from "@/components/ui/action-menu";
import { stickyActionsTdClassName, stickyActionsThClassName, tableScrollClassName } from "@/components/ui/data-table";
import { usePersistedViewMode, ViewModeToggle } from "@/components/ui/view-mode-toggle";
import { LessonMarkdownEditor } from "@/components/teacher/lesson-markdown-editor";
import { SubjectLessonGenerationAction } from "@/components/teacher/subject-lesson-generation-action";
import { MathTextEditor } from "@/components/ui/math-text-editor";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { extractApiErrorMessage } from "@/lib/api-error";
import { QuizAiGenerationPanel } from "@/components/teacher/quiz-ai-generation-panel";
import { AiAccuracyDisclaimer } from "@/components/ui/ai-accuracy-disclaimer";
import { OfflineAiBusyBanner, offlineAiJobBusyPhase } from "@/components/teacher/offline-ai-generation-status";
import { formatDate, formatDateTime } from "@/lib/date-display";
import { uploadMediaFile } from "@/lib/media-upload";

type LessonStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type LessonDifficulty = "EASY" | "MEDIUM" | "HARD" | null;

type LessonDetails = {
  id: string;
  title: string;
  shortDescription: string;
  contentMarkdown: string;
  coverImageUrl: string | null;
  difficulty: LessonDifficulty;
  subject: string;
  topic: string;
  unit: string | null;
  status: LessonStatus;
  estimatedMinutes: number | null;
  tags: string[];
  updatedAt: string;
  publishedAt: string | null;
};

type QuizSummary = {
  id: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  questionCount: number;
  passingScore: number;
  maxAttempts: number;
  showAnswerKey: boolean;
  lessonId: string | null;
  lessonTitle: string | null;
};

type QuizGenerationJob = {
  id: string;
  quizId: string;
  quizTitle: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  questionCount: number;
  questionTypes: ("MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER")[];
  createdCount: number;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

type LessonDetailProps = {
  lesson: LessonDetails;
  linkedQuizzes: QuizSummary[];
  availableQuizzes: QuizSummary[];
  generationJobs: QuizGenerationJob[];
  subjectOptions: string[];
  initialTab?: "content" | "quizzes" | "generation";
  breadcrumbContext?: {
    subjectId: string;
    subjectName: string;
    sectionId?: string;
    sectionName?: string;
    returnTab?: "students" | "lessons" | "quizzes" | "background-jobs";
  };
};

type LessonForm = {
  title: string;
  shortDescription: string;
  subject: string;
  topic: string;
  unit: string;
  difficulty: "" | "EASY" | "MEDIUM" | "HARD";
  status: LessonStatus;
  estimatedMinutes: string;
  tags: string;
  coverImageUrl: string;
  contentMarkdown: string;
};

function mapLessonToForm(lesson: LessonDetails): LessonForm {
  return {
    title: lesson.title,
    shortDescription: lesson.shortDescription,
    subject: lesson.subject,
    topic: lesson.topic,
    unit: lesson.unit ?? "",
    difficulty: lesson.difficulty ?? "",
    status: lesson.status,
    estimatedMinutes: String(lesson.estimatedMinutes ?? 20),
    tags: lesson.tags.join(", "),
    coverImageUrl: lesson.coverImageUrl ?? "",
    contentMarkdown: lesson.contentMarkdown,
  };
}

export function LessonDetail({
  lesson,
  linkedQuizzes,
  availableQuizzes,
  generationJobs,
  subjectOptions,
  initialTab = "content",
  breadcrumbContext,
}: LessonDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"content" | "quizzes" | "generation">(initialTab);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteLessonOpen, setDeleteLessonOpen] = useState(false);
  const [deleteQuizTarget, setDeleteQuizTarget] = useState<QuizSummary | null>(null);
  const [quizViewMode, setQuizViewMode] = usePersistedViewMode("learnhub:view:teacher-lesson-quizzes");
  const [form, setForm] = useState<LessonForm>(() => mapLessonToForm(lesson));
  const [jobs, setJobs] = useState<QuizGenerationJob[]>(generationJobs);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [editingLesson, setEditingLesson] = useState(false);
  const [createQuizOpen, setCreateQuizOpen] = useState(false);
  const [linkQuizOpen, setLinkQuizOpen] = useState(false);
  const [generateQuizOpen, setGenerateQuizOpen] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [selectedQuizToLink, setSelectedQuizToLink] = useState("");
  const [selectedQuizForGeneration, setSelectedQuizForGeneration] = useState("");
  const coverFileInputRef = useRef<HTMLInputElement | null>(null);
  const [quizForm, setQuizForm] = useState({
    title: "",
    description: "",
    instructions: "Answer each question carefully.",
    passingScore: "70",
    timeLimitSec: "900",
    maxAttempts: "3",
    noTimeLimit: false,
    unlimitedAttempts: false,
    showAnswerKey: true,
  });
  const selectableSubjects = useMemo(() => {
    const normalized = subjectOptions.map((subject) => subject.trim()).filter(Boolean);
    return Array.from(new Set([...normalized, lesson.subject, form.subject])).filter(Boolean);
  }, [form.subject, lesson.subject, subjectOptions]);

  const linkableQuizzes = useMemo(
    () => availableQuizzes.filter((quiz) => quiz.lessonId !== lesson.id && quiz.status !== "ARCHIVED"),
    [availableQuizzes, lesson.id],
  );

  const hasActiveGenerationJobs = useMemo(
    () => jobs.some((job) => job.status === "PENDING" || job.status === "PROCESSING"),
    [jobs],
  );

  useEffect(() => {
    setJobs(generationJobs);
  }, [generationJobs]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const loadGenerationJobs = useCallback(async () => {
    setJobsLoading(true);
    try {
      const response = await fetch(`/api/teacher/quizzes/generation-jobs?lessonId=${lesson.id}`, { cache: "no-store" });
      const payload = (await response.json()) as Record<string, unknown> & { jobs?: QuizGenerationJob[] };
      if (!response.ok || !payload.jobs) {
        throw new Error(extractApiErrorMessage(payload, "Unable to load generation jobs."));
      }
      setJobs(payload.jobs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load generation jobs.");
    } finally {
      setJobsLoading(false);
    }
  }, [lesson.id]);

  useEffect(() => {
    if (!hasActiveGenerationJobs || activeTab !== "generation") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadGenerationJobs();
    }, 6000);

    return () => window.clearInterval(timer);
  }, [activeTab, hasActiveGenerationJobs, loadGenerationJobs]);

  function cancelLessonEditing() {
    setForm(mapLessonToForm(lesson));
    setEditingLesson(false);
    setError(null);
    setSuccess(null);
  }

  function openGenerateQuizFlow() {
    if (linkedQuizzes.length === 0) {
      setError("Create or link a quiz first, then generate questions with AI.");
      return;
    }

    setError(null);
    setSuccess(null);
    setSelectedQuizForGeneration(linkedQuizzes[0]?.id ?? "");
    setGenerateQuizOpen(true);
  }

  function afterGenerationQueued() {
    setGenerateQuizOpen(false);
    setSuccess("Generation job queued. You can keep navigating while questions are generated.");
    if (breadcrumbContext?.subjectId) {
      const params = new URLSearchParams();
      params.set("tab", "generation");
      params.set("subjectId", breadcrumbContext.subjectId);
      if (breadcrumbContext.sectionId) {
        params.set("sectionId", breadcrumbContext.sectionId);
      }
      if (breadcrumbContext.returnTab) {
        params.set("returnTab", breadcrumbContext.returnTab);
      }
      router.push(`/teacher/lessons/${lesson.id}?${params.toString()}`);
      return;
    }
    setActiveTab("generation");
    void loadGenerationJobs();
    router.refresh();
  }

  function afterGenerationSaved() {
    setGenerateQuizOpen(false);
    setSuccess("Generated questions were added to the selected quiz.");
    router.refresh();
  }

  function saveLessonDetails() {
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          title: form.title,
          shortDescription: form.shortDescription,
          subject: form.subject,
          topic: form.topic,
          unit: form.unit || null,
          difficulty: form.difficulty || null,
          status: form.status,
          estimatedMinutes: Number(form.estimatedMinutes),
          tags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          coverImageUrl: form.coverImageUrl || "",
          contentMarkdown: form.contentMarkdown,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to update lesson."));
        return;
      }

      setEditingLesson(false);
      router.refresh();
    });
  }

  async function uploadCover(file: File) {
    setError(null);
    setSuccess(null);
    setCoverUploading(true);
    try {
      const uploaded = await uploadMediaFile(file);
      setForm((prev) => ({ ...prev, coverImageUrl: uploaded.url }));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Cover upload failed.");
    } finally {
      setCoverUploading(false);
    }
  }

  function setQuizStatus(quizId: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, status }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to update quiz status."));
        return;
      }

      router.refresh();
    });
  }

  function setQuizAnswerKeyVisibility(quizId: string, showAnswerKey: boolean) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, showAnswerKey }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to update student answer visibility."));
        return;
      }
      setSuccess(
        showAnswerKey
          ? "Students can now view correct answers and explanations after submission."
          : "Correct answers and explanations are now hidden from student results.",
      );
      router.refresh();
    });
  }

  function unlinkQuiz(quizId: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, lessonId: null }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to unlink quiz."));
        return;
      }

      router.refresh();
    });
  }

  function deleteLinkedQuiz() {
    if (!deleteQuizTarget) {
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: deleteQuizTarget.id, hardDelete: true }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to delete quiz."));
        return;
      }

      setDeleteQuizTarget(null);
      setSuccess("Quiz deleted.");
      router.refresh();
    });
  }

  function deleteCurrentLesson() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/lessons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId: lesson.id, hardDelete: true }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to delete lesson."));
        return;
      }

      setDeleteLessonOpen(false);
      if (breadcrumbContext?.subjectId) {
        const params = new URLSearchParams();
        if (breadcrumbContext.sectionId) {
          params.set("sectionId", breadcrumbContext.sectionId);
        }
        params.set("tab", breadcrumbContext.returnTab ?? "lessons");
        const query = params.toString();
        router.push(`/teacher/subjects/${breadcrumbContext.subjectId}?${query}`);
      } else {
        router.push("/teacher/lessons");
      }
      router.refresh();
    });
  }

  function linkExistingQuiz() {
    if (!selectedQuizToLink) {
      return;
    }
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: selectedQuizToLink, lessonId: lesson.id }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to link quiz."));
        return;
      }

      setLinkQuizOpen(false);
      setSelectedQuizToLink("");
      router.refresh();
    });
  }

  function createQuizForLesson() {
    const parsedTimeLimit = Number.parseInt(quizForm.timeLimitSec, 10);
    const parsedMaxAttempts = Number.parseInt(quizForm.maxAttempts, 10);

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          title: quizForm.title,
          description: quizForm.description,
          instructions: quizForm.instructions,
          passingScore: Number(quizForm.passingScore),
          timeLimitSec: quizForm.noTimeLimit ? 0 : Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0 ? parsedTimeLimit : 900,
          maxAttempts:
            quizForm.unlimitedAttempts ? 0 : Number.isFinite(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : 3,
          randomizeQuestions: true,
          randomizeOptions: true,
          feedbackMode: "INSTANT",
          explanationMode: "AFTER_SUBMISSION",
          showAnswerKey: quizForm.showAnswerKey,
          status: "DRAFT",
        }),
      });

      const payload = (await response.json()) as Record<string, unknown> & { quizId?: string };
      if (!response.ok || !payload.quizId) {
        setError(extractApiErrorMessage(payload, "Unable to create quiz."));
        return;
      }

      setQuizForm({
        title: "",
        description: "",
        instructions: "Answer each question carefully.",
        passingScore: "70",
        timeLimitSec: "900",
        maxAttempts: "3",
        noTimeLimit: false,
        unlimitedAttempts: false,
        showAnswerKey: true,
      });
      setCreateQuizOpen(false);
      const params = new URLSearchParams();
      if (breadcrumbContext?.subjectId) {
        params.set("subjectId", breadcrumbContext.subjectId);
      }
      if (breadcrumbContext?.sectionId) {
        params.set("sectionId", breadcrumbContext.sectionId);
      }
      if (breadcrumbContext?.returnTab) {
        params.set("returnTab", breadcrumbContext.returnTab);
      }
      const query = params.toString();
      router.push(query ? `/teacher/lessons/${lesson.id}/quizzes/${payload.quizId}?${query}` : `/teacher/lessons/${lesson.id}/quizzes/${payload.quizId}`);
      router.refresh();
    });
  }

  const subjectContextHref = useMemo(() => {
    if (!breadcrumbContext) {
      return null;
    }
    const params = new URLSearchParams();
    if (breadcrumbContext.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }
    if (breadcrumbContext.returnTab) {
      params.set("tab", breadcrumbContext.returnTab);
    }
    const query = params.toString();
    return query
      ? `/teacher/subjects/${breadcrumbContext.subjectId}?${query}`
      : `/teacher/subjects/${breadcrumbContext.subjectId}`;
  }, [breadcrumbContext]);
  const quizContextQuery = useMemo(() => {
    if (!breadcrumbContext) {
      return "";
    }
    const params = new URLSearchParams();
    params.set("subjectId", breadcrumbContext.subjectId);
    if (breadcrumbContext.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }
    if (breadcrumbContext.returnTab) {
      params.set("returnTab", breadcrumbContext.returnTab);
    }
    return params.toString();
  }, [breadcrumbContext]);
  const withQuizContext = useCallback(
    (path: string) => {
      if (!quizContextQuery) {
        return path;
      }
      return `${path}?${quizContextQuery}`;
    },
    [quizContextQuery],
  );

  function quizActionsMenu(quiz: QuizSummary) {
    return (
      <ActionMenu
        className="w-auto"
        iconTrigger
        ariaLabel="Quiz actions"
        groups={[
          {
            items: [
              {
                label: "Quiz Settings & Questions",
                icon: <PenSquare className="h-4 w-4" />,
                onSelect: () => router.push(withQuizContext(`/teacher/lessons/${lesson.id}/quizzes/${quiz.id}`)),
              },
              {
                label: "Submitted Answers",
                icon: <ClipboardCheck className="h-4 w-4" />,
                onSelect: () =>
                  router.push(withQuizContext(`/teacher/lessons/${lesson.id}/quizzes/${quiz.id}/submissions`)),
              },
              {
                label: "Generate Questions",
                icon: <Sparkles className="h-4 w-4" />,
                onSelect: () => {
                  setSelectedQuizForGeneration(quiz.id);
                  setGenerateQuizOpen(true);
                },
              },
              {
                label: quiz.showAnswerKey ? "Hide Answers in Student Results" : "Show Answers in Student Results",
                icon: quiz.showAnswerKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                onSelect: () => setQuizAnswerKeyVisibility(quiz.id, !quiz.showAnswerKey),
              },
            ],
          },
          {
            items: [
              {
                label: "Set Draft",
                icon: <FolderOpen className="h-4 w-4" />,
                onSelect: () => setQuizStatus(quiz.id, "DRAFT"),
              },
              {
                label: "Publish",
                icon: <Upload className="h-4 w-4" />,
                onSelect: () => setQuizStatus(quiz.id, "PUBLISHED"),
              },
            ],
          },
          {
            items: [
              {
                label: "Archive",
                icon: <Archive className="h-4 w-4" />,
                tone: "danger",
                onSelect: () => setQuizStatus(quiz.id, "ARCHIVED"),
              },
              {
                label: "Unlink",
                icon: <Link2Off className="h-4 w-4" />,
                tone: "danger",
                onSelect: () => unlinkQuiz(quiz.id),
              },
              {
                label: "Delete",
                icon: <Trash2 className="h-4 w-4" />,
                tone: "danger",
                onSelect: () => setDeleteQuizTarget(quiz),
              },
            ],
          },
        ]}
      />
    );
  }

  return (
    <div className="space-y-4">
      {breadcrumbContext ? (
        <nav aria-label="Lesson context breadcrumb" className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
            <li>
              <Link href="/teacher/subjects" className="hover:underline">
                Subjects
              </Link>
            </li>
            {subjectContextHref ? (
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                <Link href={subjectContextHref} className="hover:underline">
                  {breadcrumbContext.subjectName}
                </Link>
              </li>
            ) : null}
            {breadcrumbContext.sectionName ? (
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                {subjectContextHref ? (
                  <Link href={subjectContextHref} className="hover:underline">
                    {breadcrumbContext.sectionName}
                  </Link>
                ) : (
                  <span>{breadcrumbContext.sectionName}</span>
                )}
              </li>
            ) : null}
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
              <span className="font-semibold text-[var(--ink-900)]">{lesson.title}</span>
            </li>
          </ol>
        </nav>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">Teacher Lesson</p>
            <h2 className="text-2xl font-black text-[var(--ink-900)]">{lesson.title}</h2>
            <p className="text-sm text-[var(--ink-500)]">
              Updated {formatDateTime(lesson.updatedAt)}
              {lesson.publishedAt ? ` • Published ${formatDate(lesson.publishedAt)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Chip tone={lesson.status === "PUBLISHED" ? "success" : lesson.status === "ARCHIVED" ? "danger" : "warning"}>
              {lesson.status}
            </Chip>
            {breadcrumbContext?.subjectId && breadcrumbContext.sectionId ? (
              <SubjectLessonGenerationAction
                subjectId={breadcrumbContext.subjectId}
                subjectName={breadcrumbContext.subjectName}
                sectionId={breadcrumbContext.sectionId}
                sectionName={breadcrumbContext.sectionName ?? "Selected Section"}
              />
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <TabButton active={activeTab === "content"} onClick={() => setActiveTab("content")}>
            Lesson Content
          </TabButton>
          <TabButton active={activeTab === "quizzes"} onClick={() => setActiveTab("quizzes")}>
            Quizzes ({linkedQuizzes.length})
          </TabButton>
          <TabButton active={activeTab === "generation"} onClick={() => setActiveTab("generation")}>
            Generation Jobs ({jobs.length})
          </TabButton>
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-[var(--success-500)] bg-[var(--success-100)] px-3 py-2 text-sm text-[var(--success-700)]">
          {success}
        </div>
      ) : null}

      {activeTab === "content" ? (
        <Card>
          {!editingLesson ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Chip tone="brand">{lesson.subject}</Chip>
                  <Chip tone="neutral">{lesson.topic}</Chip>
                  {lesson.difficulty ? <Chip tone="neutral">{lesson.difficulty}</Chip> : null}
                  {lesson.estimatedMinutes ? <Chip tone="neutral">{lesson.estimatedMinutes} min</Chip> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setEditingLesson(true)}>Edit Lesson</Button>
                  <Button variant="danger" onClick={() => setDeleteLessonOpen(true)} disabled={pending}>
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>

              {lesson.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lesson.coverImageUrl}
                  alt={`${lesson.title} cover`}
                  className="max-h-[280px] w-full rounded-xl border border-[var(--line-200)] object-cover"
                />
              ) : null}

              <section className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Short Description</p>
                <p className="mt-2 text-sm text-[var(--ink-700)]">{lesson.shortDescription}</p>
              </section>

              {lesson.tags.length > 0 ? (
                <section className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Tags</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {lesson.tags.map((tag) => (
                      <Chip key={tag} tone="neutral">
                        {tag}
                      </Chip>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="rounded-xl border border-[var(--line-200)] bg-white p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Lesson Content</p>
                <MarkdownContent content={lesson.contentMarkdown} className="lesson-markdown text-sm" />
              </section>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <InputField label="Title" value={form.title} onChange={(value) => setForm((prev) => ({ ...prev, title: value }))} />
                <label className="text-sm font-semibold text-[var(--ink-700)]">
                  Subject
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                    value={form.subject}
                    onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                  >
                    {selectableSubjects.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                </label>
                <InputField label="Topic" value={form.topic} onChange={(value) => setForm((prev) => ({ ...prev, topic: value }))} />
                <InputField
                  label="Unit (optional)"
                  value={form.unit}
                  onChange={(value) => setForm((prev) => ({ ...prev, unit: value }))}
                />
                <label className="text-sm font-semibold text-[var(--ink-700)]">
                  Difficulty
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                    value={form.difficulty}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, difficulty: event.target.value as LessonForm["difficulty"] }))
                    }
                  >
                    <option value="">Not set</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </label>
                <label className="text-sm font-semibold text-[var(--ink-700)]">
                  Status
                  <select
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
                    value={form.status}
                    onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as LessonStatus }))}
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
                <InputField
                  label="Estimated Minutes"
                  type="number"
                  value={form.estimatedMinutes}
                  onChange={(value) => setForm((prev) => ({ ...prev, estimatedMinutes: value }))}
                />
                <InputField
                  label="Tags (comma-separated)"
                  value={form.tags}
                  onChange={(value) => setForm((prev) => ({ ...prev, tags: value }))}
                  className="sm:col-span-2"
                />
                <InputField
                  label="Cover Image URL"
                  value={form.coverImageUrl}
                  onChange={(value) => setForm((prev) => ({ ...prev, coverImageUrl: value }))}
                  className="sm:col-span-2"
                />
                <label className="flex items-end text-sm font-semibold text-[var(--ink-700)]">
                  <input
                    ref={coverFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void uploadCover(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => coverFileInputRef.current?.click()}
                    disabled={pending || coverUploading}
                  >
                    {coverUploading ? "Uploading..." : "Upload Cover"}
                  </Button>
                </label>
              </div>

              <label className="mt-4 block text-sm font-semibold text-[var(--ink-700)]">
                Short Description
                <textarea
                  className="mt-1 min-h-20 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-sm"
                  value={form.shortDescription}
                  onChange={(event) => setForm((prev) => ({ ...prev, shortDescription: event.target.value }))}
                />
              </label>

              <div className="mt-4">
                <p className="mb-1 text-sm font-semibold text-[var(--ink-700)]">Lesson Content</p>
                <LessonMarkdownEditor
                  value={form.contentMarkdown}
                  onChange={(next) => setForm((prev) => ({ ...prev, contentMarkdown: next }))}
                  minHeightClassName="min-h-80"
                  disabled={pending}
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={cancelLessonEditing} disabled={pending}>
                  Cancel
                </Button>
                <Button onClick={saveLessonDetails} disabled={pending}>
                  {pending ? "Saving..." : "Save Lesson"}
                </Button>
              </div>
            </>
          )}
        </Card>
      ) : activeTab === "quizzes" ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Linked Quizzes</h3>
            <div className="flex flex-wrap gap-2">
              <ViewModeToggle value={quizViewMode} onChange={setQuizViewMode} />
              <Button onClick={() => setCreateQuizOpen(true)}>Create Quiz</Button>
              <Button variant="secondary" onClick={() => setLinkQuizOpen(true)}>
                Add Existing Quiz
              </Button>
              <Button variant="secondary" onClick={openGenerateQuizFlow}>
                <Sparkles className="h-4 w-4" />
                Generate Questions
              </Button>
            </div>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-500)]">
            Queue AI generation from lesson content. Questions are added to the selected quiz once the job completes.
          </p>
          <p className="mt-1 text-xs text-[var(--ink-500)]">
            Tip: open <span className="font-semibold text-[var(--ink-700)]">Quiz Settings & Questions</span> to configure whether students can view answer keys after submission.
          </p>

          {linkedQuizzes.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--ink-500)]">No quizzes linked yet. Create one or attach an existing quiz.</p>
          ) : quizViewMode === "list" ? (
            <div className={tableScrollClassName}>
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                    <th className="px-2 py-2 font-semibold">Quiz</th>
                    <th className="px-2 py-2 font-semibold">Status</th>
                    <th className="px-2 py-2 font-semibold">Questions</th>
                    <th className="px-2 py-2 font-semibold">Pass</th>
                    <th className="px-2 py-2 font-semibold">Attempts</th>
                    <th className="px-2 py-2 font-semibold">Student Review</th>
                    <th className={stickyActionsThClassName}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedQuizzes.map((quiz) => (
                    <tr key={quiz.id} className="border-b border-[var(--line-100)]">
                      <td className="px-2 py-2">
                        <p className="font-semibold text-[var(--ink-900)]">{quiz.title}</p>
                        <p className="line-clamp-2 text-xs text-[var(--ink-500)]">{quiz.description}</p>
                      </td>
                      <td className="px-2 py-2">
                        <Chip tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "danger" : "warning"}>
                          {quiz.status}
                        </Chip>
                      </td>
                      <td className="px-2 py-2 text-[var(--ink-700)]">{quiz.questionCount}</td>
                      <td className="px-2 py-2 text-[var(--ink-700)]">{quiz.passingScore}%</td>
                      <td className="px-2 py-2 text-[var(--ink-700)]">
                        {quiz.maxAttempts <= 0 ? "Unlimited" : `Max ${quiz.maxAttempts}`}
                      </td>
                      <td className="px-2 py-2">
                        <Chip tone={quiz.showAnswerKey ? "success" : "warning"}>
                          {quiz.showAnswerKey ? "Visible" : "Hidden"}
                        </Chip>
                      </td>
                      <td className={stickyActionsTdClassName}>{quizActionsMenu(quiz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {linkedQuizzes.map((quiz) => (
                <div key={quiz.id} className="rounded-xl border border-[var(--line-200)] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-base font-bold text-[var(--ink-900)]">{quiz.title}</h4>
                    <div className="flex items-center gap-2">
                      <Chip tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "danger" : "warning"}>
                        {quiz.status}
                      </Chip>
                      {quizActionsMenu(quiz)}
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-600)]">{quiz.description}</p>
                  <p className="mt-2 text-xs text-[var(--ink-500)]">
                    {quiz.questionCount} questions • Pass {quiz.passingScore}% •{" "}
                    {quiz.maxAttempts <= 0 ? "Unlimited attempts" : `Max ${quiz.maxAttempts} attempts`}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[var(--ink-600)]">
                    Student answer review:{" "}
                    <span className={quiz.showAnswerKey ? "text-[var(--success-700)]" : "text-[var(--warning-700)]"}>
                      {quiz.showAnswerKey ? "Visible" : "Hidden"}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-[var(--ink-900)]">Generation Jobs</h3>
            <Button variant="secondary" onClick={() => void loadGenerationJobs()} disabled={jobsLoading}>
              {jobsLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
          <p className="mt-1 text-sm text-[var(--ink-500)]">
            Quiz generation runs in the background. You can continue editing lessons and quizzes while jobs are processing.
          </p>
          {hasActiveGenerationJobs ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-600)]">
              Active jobs detected. Status auto-refreshes every few seconds.
            </p>
          ) : null}

          <div className="mt-4 space-y-3">
            {jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-5 text-sm text-[var(--ink-500)]">
                No generation jobs yet. Open the Quizzes tab and click <strong>Generate Questions</strong> on the toolbar or on a quiz card.
              </div>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="rounded-xl border border-[var(--line-200)] bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[var(--ink-900)]">{job.quizTitle}</p>
                      <p className="text-xs text-[var(--ink-500)]">
                        {job.questionCount} question(s) • {job.questionTypes.join(", ").replace(/_/g, " ")}
                      </p>
                    </div>
                    <Chip
                      tone={
                        job.status === "COMPLETED"
                          ? "success"
                          : job.status === "FAILED"
                            ? "danger"
                            : job.status === "PROCESSING"
                              ? "brand"
                              : "warning"
                      }
                    >
                      {job.status}
                    </Chip>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-[var(--ink-600)] sm:grid-cols-2 lg:grid-cols-4">
                    <p>Queued: {formatDateTime(job.queuedAt)}</p>
                    <p>Started: {job.startedAt ? formatDateTime(job.startedAt) : "Not started"}</p>
                    <p>Completed: {job.completedAt ? formatDateTime(job.completedAt) : "In progress"}</p>
                    <p>Created Questions: {job.createdCount}</p>
                  </div>
                  {(() => {
                    const busyPhase = offlineAiJobBusyPhase(job.status);
                    return busyPhase ? <OfflineAiBusyBanner phase={busyPhase} className="mt-3" /> : null;
                  })()}
                  {job.errorMessage ? (
                    <div className="mt-3 rounded-lg border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
                      {job.errorMessage}
                    </div>
                  ) : null}
                  {job.status === "COMPLETED" ? (
                    <div className="mt-3">
                      <Link href={withQuizContext(`/teacher/lessons/${lesson.id}/quizzes/${job.quizId}`)}>
                        <span className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] px-3 text-sm font-medium text-[var(--ink-800)] hover:bg-[var(--line-100)]">
                          Open Quiz Questions
                        </span>
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <Modal
        open={linkQuizOpen}
        onClose={() => setLinkQuizOpen(false)}
        title="Add Existing Quiz"
        description="Attach one of your quizzes to this lesson."
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Select Quiz
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={selectedQuizToLink}
              onChange={(event) => setSelectedQuizToLink(event.target.value)}
            >
              <option value="">Choose a quiz</option>
              {linkableQuizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title} {quiz.lessonTitle ? `(currently: ${quiz.lessonTitle})` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLinkQuizOpen(false)}>
              Cancel
            </Button>
            <Button onClick={linkExistingQuiz} disabled={!selectedQuizToLink || pending}>
              Add Quiz
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={createQuizOpen}
        onClose={() => setCreateQuizOpen(false)}
        title="Create Quiz for Lesson"
        description="Create a new quiz, then continue directly to question management."
      >
        <div className="space-y-4">
          <InputField
            label="Quiz Title"
            value={quizForm.title}
            onChange={(value) => setQuizForm((prev) => ({ ...prev, title: value }))}
          />
          <MathTextEditor
            label="Description"
            value={quizForm.description}
            onChange={(next) => setQuizForm((prev) => ({ ...prev, description: next }))}
            minHeightClassName="min-h-20"
            allowMediaUpload={false}
            showUtilityControls
          />
          <MathTextEditor
            label="Instructions"
            value={quizForm.instructions}
            onChange={(next) => setQuizForm((prev) => ({ ...prev, instructions: next }))}
            minHeightClassName="min-h-20"
            allowMediaUpload={false}
            showUtilityControls={false}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <InputField
              label="Passing Score"
              type="number"
              value={quizForm.passingScore}
              onChange={(value) => setQuizForm((prev) => ({ ...prev, passingScore: value }))}
            />
            <InputField
              label="Time Limit (sec)"
              type="number"
              value={quizForm.timeLimitSec}
              onChange={(value) => setQuizForm((prev) => ({ ...prev, timeLimitSec: value }))}
              disabled={quizForm.noTimeLimit}
              hint={quizForm.noTimeLimit ? "Timer disabled for this quiz." : undefined}
            />
            <InputField
              label="Max Attempts"
              type="number"
              value={quizForm.maxAttempts}
              onChange={(value) => setQuizForm((prev) => ({ ...prev, maxAttempts: value }))}
              disabled={quizForm.unlimitedAttempts}
              hint={quizForm.unlimitedAttempts ? "Students can retake this quiz without attempt limits." : undefined}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
              <input
                type="checkbox"
                checked={quizForm.noTimeLimit}
                onChange={(event) => setQuizForm((prev) => ({ ...prev, noTimeLimit: event.target.checked }))}
                className="mt-1"
              />
              <span>
                No Time Limit
                <span className="block text-xs font-normal text-[var(--ink-500)]">Disable timer for this quiz.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
              <input
                type="checkbox"
                checked={quizForm.unlimitedAttempts}
                onChange={(event) => setQuizForm((prev) => ({ ...prev, unlimitedAttempts: event.target.checked }))}
                className="mt-1"
              />
              <span>
                Unlimited Attempts
                <span className="block text-xs font-normal text-[var(--ink-500)]">Allow unlimited retakes.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)] sm:col-span-2">
              <input
                type="checkbox"
                checked={quizForm.showAnswerKey}
                onChange={(event) => setQuizForm((prev) => ({ ...prev, showAnswerKey: event.target.checked }))}
                className="mt-1"
              />
              <span>
                Show Correct Answers and Explanations to Students
                <span className="block text-xs font-normal text-[var(--ink-500)]">Default ON. You can change this later in Quiz Settings.</span>
              </span>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateQuizOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createQuizForLesson} disabled={pending}>
              Create Quiz
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={generateQuizOpen}
        onClose={() => setGenerateQuizOpen(false)}
        title="Generate Questions"
        description="Preview with offline AI, add to a quiz, or queue a background job."
      >
        <div className="space-y-4">
          <AiAccuracyDisclaimer compact />
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Quiz
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={selectedQuizForGeneration}
              onChange={(event) => setSelectedQuizForGeneration(event.target.value)}
            >
              <option value="">Select quiz</option>
              {linkedQuizzes.map((quiz) => (
                <option key={quiz.id} value={quiz.id}>
                  {quiz.title}
                </option>
              ))}
            </select>
          </label>
          {selectedQuizForGeneration ? (
            <QuizAiGenerationPanel
              lessonId={lesson.id}
              quizId={selectedQuizForGeneration}
              conflictTrackingHint="Track it on this page’s Generation tab."
              onQueued={afterGenerationQueued}
              onSaved={afterGenerationSaved}
            />
          ) : (
            <p className="text-sm text-[var(--ink-500)]">Select a quiz to preview or generate questions.</p>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setGenerateQuizOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteLessonOpen}
        onClose={() => setDeleteLessonOpen(false)}
        title="Delete Lesson"
        description="This permanently removes the lesson, linked quizzes, and related student attempts."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            Delete <strong>{lesson.title}</strong>? This cannot be undone.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteLessonOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteCurrentLesson} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Lesson
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteQuizTarget)}
        onClose={() => setDeleteQuizTarget(null)}
        title="Delete Quiz"
        description="This permanently removes the quiz and related student attempts."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {deleteQuizTarget ? (
              <>
                Delete <strong>{deleteQuizTarget.title}</strong>? This cannot be undone.
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteQuizTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteLinkedQuiz} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Quiz
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-[var(--brand-500)] text-white" : "bg-[var(--line-100)] text-[var(--ink-600)]"
      }`}
    >
      {children}
    </button>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  className = "",
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  className?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className={`block text-sm font-semibold text-[var(--ink-700)] ${className}`}>
      {label}
      <input
        className={`mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm ${disabled ? "cursor-not-allowed bg-[var(--line-100)] text-[var(--ink-500)]" : ""}`}
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-[var(--ink-500)]">{hint}</span> : null}
    </label>
  );
}
