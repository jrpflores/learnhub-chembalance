"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ClipboardCheck, GripVertical, Link2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { ActionMenu } from "@/components/ui/action-menu";
import { MathTextEditor } from "@/components/ui/math-text-editor";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { extractApiErrorMessage } from "@/lib/api-error";

type QuizStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER";

type LessonContext = {
  id: string;
  title: string;
};

type QuizQuestion = {
  quizQuestionId: string;
  questionId: string;
  position: number;
  points: number;
  isRequired: boolean;
  subject: string;
  topic: string;
  difficulty: string;
  type: QuestionType | string;
  promptMarkdown: string;
  explanationMarkdown: string | null;
  hintMarkdown: string | null;
  referenceAnswer: string | null;
  gradingKeywords: string[];
  options: {
    id: string;
    label: string;
    value: string;
    isCorrect: boolean;
    position: number;
  }[];
};

type QuizDetail = {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  status: QuizStatus;
  passingScore: number;
  timeLimitSec: number | null;
  maxAttempts: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showAnswerKey: boolean;
  questions: QuizQuestion[];
};

type QuestionBankItem = {
  id: string;
  promptMarkdown: string;
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: QuestionType | string;
};

type LessonQuizManagerProps = {
  lesson: LessonContext;
  quiz: QuizDetail;
  questionBank: QuestionBankItem[];
  openGenerateOnLoad?: boolean;
  breadcrumbContext?: {
    subjectId: string;
    subjectName: string;
    sectionId?: string;
    sectionName?: string;
    returnTab?: "students" | "lessons" | "quizzes" | "background-jobs";
  };
};

type QuestionForm = {
  subject: string;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  type: QuestionType;
  promptMarkdown: string;
  explanationMarkdown: string;
  referenceAnswer: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: "A" | "B" | "C" | "D";
};

const MAX_AI_GENERATED_QUESTIONS = 10;
const GENERATION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
  { value: "MULTIPLE_CHOICE", label: "Multiple Choice" },
  { value: "TRUE_FALSE", label: "True / False" },
  { value: "SHORT_ANSWER", label: "Short Answer" },
];

function defaultQuestionForm(subject: string, topic: string): QuestionForm {
  return {
    subject,
    topic,
    difficulty: "MEDIUM",
    type: "MULTIPLE_CHOICE",
    promptMarkdown: "",
    explanationMarkdown: "",
    referenceAnswer: "",
    optionA: "",
    optionB: "",
    optionC: "",
    optionD: "",
    correctOption: "A",
  };
}

function isShortAnswerReferenceMissing(form: QuestionForm) {
  return form.type === "SHORT_ANSWER" && form.referenceAnswer.trim().length === 0;
}

export function LessonQuizManager({
  lesson,
  quiz,
  questionBank,
  openGenerateOnLoad = false,
  breadcrumbContext,
}: LessonQuizManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteQuizOpen, setDeleteQuizOpen] = useState(false);
  const [quizForm, setQuizForm] = useState({
    title: quiz.title,
    description: quiz.description,
    instructions: quiz.instructions ?? "",
    status: quiz.status,
    passingScore: String(quiz.passingScore),
    timeLimitSec: String(quiz.timeLimitSec ?? 900),
    maxAttempts: String(quiz.maxAttempts > 0 ? quiz.maxAttempts : 3),
    noTimeLimit: !quiz.timeLimitSec || quiz.timeLimitSec <= 0,
    unlimitedAttempts: quiz.maxAttempts <= 0,
    randomizeQuestions: quiz.randomizeQuestions,
    randomizeOptions: quiz.randomizeOptions,
    showAnswerKey: quiz.showAnswerKey,
  });
  const [addQuestionOpen, setAddQuestionOpen] = useState(false);
  const [attachQuestionOpen, setAttachQuestionOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editQuestionOpen, setEditQuestionOpen] = useState(false);
  const [selectedBankQuestionId, setSelectedBankQuestionId] = useState("");
  const [questionToRemove, setQuestionToRemove] = useState<QuizQuestion | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestion | null>(null);
  const [createForm, setCreateForm] = useState<QuestionForm>(() => defaultQuestionForm("Science", lesson.title));
  const [editForm, setEditForm] = useState<QuestionForm>(() => defaultQuestionForm("Science", lesson.title));
  const [generationCount, setGenerationCount] = useState("5");
  const [generationTypes, setGenerationTypes] = useState<QuestionType[]>([
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
  ]);
  const [draggingQuestionId, setDraggingQuestionId] = useState<string | null>(null);
  const [dragOverQuestionId, setDragOverQuestionId] = useState<string | null>(null);

  function sanitizeGenerationCount(value: string) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return 5;
    }
    return Math.max(1, Math.min(parsed, MAX_AI_GENERATED_QUESTIONS));
  }

  useEffect(() => {
    if (openGenerateOnLoad) {
      setGenerateOpen(true);
    }
    // We intentionally want this to run once on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const attachedQuestionIds = useMemo(
    () => new Set(quiz.questions.map((question) => question.questionId)),
    [quiz.questions],
  );

  const linkableBankQuestions = useMemo(
    () =>
      questionBank.filter(
        (question) => !attachedQuestionIds.has(question.id) && (question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE" || question.type === "SHORT_ANSWER"),
      ),
    [questionBank, attachedQuestionIds],
  );

  const orderedQuestions = useMemo(
    () => [...quiz.questions].sort((a, b) => a.position - b.position),
    [quiz.questions],
  );
  const contextQuery = useMemo(() => {
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
  const withContext = (path: string) => (contextQuery ? `${path}?${contextQuery}` : path);
  const lessonGenerationJobsHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tab", "generation");
    if (breadcrumbContext?.subjectId) {
      params.set("subjectId", breadcrumbContext.subjectId);
    }
    if (breadcrumbContext?.sectionId) {
      params.set("sectionId", breadcrumbContext.sectionId);
    }
    if (breadcrumbContext?.returnTab) {
      params.set("returnTab", breadcrumbContext.returnTab);
    }
    return `/teacher/lessons/${lesson.id}?${params.toString()}`;
  }, [breadcrumbContext?.returnTab, breadcrumbContext?.sectionId, breadcrumbContext?.subjectId, lesson.id]);
  const subjectDetailHref = useMemo(() => {
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
    return query ? `/teacher/subjects/${breadcrumbContext.subjectId}?${query}` : `/teacher/subjects/${breadcrumbContext.subjectId}`;
  }, [breadcrumbContext]);

  function questionAssignmentsFromIds(questionIds: { questionId: string; points: number; isRequired: boolean }[]) {
    return questionIds.map((question, index) => ({
      questionId: question.questionId,
      position: index + 1,
      points: question.points,
      isRequired: question.isRequired,
    }));
  }

  function saveQuizSettings() {
    const parsedTimeLimit = Number.parseInt(quizForm.timeLimitSec, 10);
    const parsedMaxAttempts = Number.parseInt(quizForm.maxAttempts, 10);

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          title: quizForm.title,
          description: quizForm.description,
          instructions: quizForm.instructions,
          status: quizForm.status,
          passingScore: Number(quizForm.passingScore),
          timeLimitSec: quizForm.noTimeLimit ? 0 : Number.isFinite(parsedTimeLimit) && parsedTimeLimit > 0 ? parsedTimeLimit : 900,
          maxAttempts:
            quizForm.unlimitedAttempts ? 0 : Number.isFinite(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : 3,
          randomizeQuestions: quizForm.randomizeQuestions,
          randomizeOptions: quizForm.randomizeOptions,
          showAnswerKey: quizForm.showAnswerKey,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to save quiz settings."));
        return;
      }

      router.refresh();
    });
  }

  function deleteCurrentQuiz() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quiz.id, hardDelete: true }),
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to delete quiz."));
        return;
      }

      setDeleteQuizOpen(false);
      router.push(withContext(`/teacher/lessons/${lesson.id}`));
      router.refresh();
    });
  }

  function persistQuestionOrder(current: QuizQuestion[]) {
    const assignmentPayload = questionAssignmentsFromIds(
      current.map((item) => ({ questionId: item.questionId, points: item.points, isRequired: item.isRequired })),
    );

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          questionAssignments: assignmentPayload,
        }),
      });

      const responseText = await response.text();
      let payload: Record<string, unknown> = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as Record<string, unknown>;
        } catch {
          payload = {};
        }
      }
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to reorder questions."));
        return;
      }
      router.refresh();
    });
  }

  function handleQuestionDrop(targetQuestionId: string) {
    if (!draggingQuestionId || draggingQuestionId === targetQuestionId) {
      setDraggingQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }

    const current = [...orderedQuestions];
    const fromIndex = current.findIndex((question) => question.questionId === draggingQuestionId);
    const toIndex = current.findIndex((question) => question.questionId === targetQuestionId);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingQuestionId(null);
      setDragOverQuestionId(null);
      return;
    }

    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);

    setDraggingQuestionId(null);
    setDragOverQuestionId(null);
    persistQuestionOrder(current);
  }

  function removeQuestionFromQuiz() {
    if (!questionToRemove) {
      return;
    }

    const assignmentPayload = questionAssignmentsFromIds(
      quiz.questions
        .filter((question) => question.questionId !== questionToRemove.questionId)
        .sort((a, b) => a.position - b.position)
        .map((item) => ({ questionId: item.questionId, points: item.points, isRequired: item.isRequired })),
    );

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          questionAssignments: assignmentPayload,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to remove question."));
        return;
      }

      setQuestionToRemove(null);
      router.refresh();
    });
  }

  function attachExistingQuestion() {
    if (!selectedBankQuestionId) {
      return;
    }

    const assignmentPayload = questionAssignmentsFromIds(
      [
        ...quiz.questions
          .sort((a, b) => a.position - b.position)
          .map((item) => ({ questionId: item.questionId, points: item.points, isRequired: item.isRequired })),
        { questionId: selectedBankQuestionId, points: 1, isRequired: true },
      ],
    );

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          questionAssignments: assignmentPayload,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to attach question."));
        return;
      }

      setSelectedBankQuestionId("");
      setAttachQuestionOpen(false);
      router.refresh();
    });
  }

  function openEditQuestion(question: QuizQuestion) {
    setEditingQuestion(question);
    const options = question.options.sort((a, b) => a.position - b.position);
    const correct = options.find((option) => option.isCorrect);

    setEditForm({
      subject: question.subject,
      topic: question.topic,
      difficulty: (question.difficulty as "EASY" | "MEDIUM" | "HARD") ?? "MEDIUM",
      type: question.type === "SHORT_ANSWER" ? "SHORT_ANSWER" : question.type === "TRUE_FALSE" ? "TRUE_FALSE" : "MULTIPLE_CHOICE",
      promptMarkdown: question.promptMarkdown,
      explanationMarkdown: question.explanationMarkdown ?? "",
      referenceAnswer: question.referenceAnswer ?? "",
      optionA: options[0]?.value ?? "",
      optionB: options[1]?.value ?? "",
      optionC: options[2]?.value ?? "",
      optionD: options[3]?.value ?? "",
      correctOption: (correct?.label as "A" | "B" | "C" | "D") ?? "A",
    });
    setEditQuestionOpen(true);
  }

  function createQuestionInQuiz() {
    if (isShortAnswerReferenceMissing(createForm)) {
      setError("Reference answer is required for short-answer questions.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const options =
        createForm.type === "SHORT_ANSWER"
          ? []
          : [createForm.optionA, createForm.optionB, createForm.optionC, createForm.optionD]
              .filter((value) => value.trim().length > 0)
              .map((value, index) => {
                const label = String.fromCharCode(65 + index);
                return {
                  label,
                  value,
                  isCorrect: label === createForm.correctOption,
                };
              });

      const createResponse = await fetch("/api/teacher/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: createForm.subject,
          topic: createForm.topic,
          difficulty: createForm.difficulty,
          type: createForm.type,
          promptMarkdown: createForm.promptMarkdown,
          explanationMarkdown: createForm.explanationMarkdown || undefined,
          referenceAnswer: createForm.type === "SHORT_ANSWER" ? createForm.referenceAnswer : undefined,
          gradingKeywords:
            createForm.type === "SHORT_ANSWER"
              ? createForm.referenceAnswer
                  .split(/[^a-zA-Z0-9]+/)
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 8)
              : undefined,
          options,
        }),
      });

      const createPayload = (await createResponse.json()) as Record<string, unknown> & { questionId?: string };
      if (!createResponse.ok || !createPayload.questionId) {
        setError(extractApiErrorMessage(createPayload, "Unable to create question."));
        return;
      }

      const assignmentPayload = questionAssignmentsFromIds(
        [
          ...quiz.questions
            .sort((a, b) => a.position - b.position)
            .map((item) => ({ questionId: item.questionId, points: item.points, isRequired: item.isRequired })),
          { questionId: createPayload.questionId, points: 1, isRequired: true },
        ],
      );

      const attachResponse = await fetch("/api/teacher/quizzes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quizId: quiz.id,
          questionAssignments: assignmentPayload,
        }),
      });

      const attachPayload = (await attachResponse.json()) as Record<string, unknown>;
      if (!attachResponse.ok) {
        setError(extractApiErrorMessage(attachPayload, "Question created but not attached."));
        return;
      }

      setCreateForm(defaultQuestionForm(createForm.subject, createForm.topic));
      setAddQuestionOpen(false);
      router.refresh();
    });
  }

  function saveEditedQuestion() {
    if (!editingQuestion) {
      return;
    }

    if (isShortAnswerReferenceMissing(editForm)) {
      setError("Reference answer is required for short-answer questions.");
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const options =
        editForm.type === "SHORT_ANSWER"
          ? []
          : [editForm.optionA, editForm.optionB, editForm.optionC, editForm.optionD]
              .filter((value) => value.trim().length > 0)
              .map((value, index) => {
                const label = String.fromCharCode(65 + index);
                return {
                  label,
                  value,
                  isCorrect: label === editForm.correctOption,
                };
              });

      const response = await fetch("/api/teacher/questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: editingQuestion.questionId,
          subject: editForm.subject,
          topic: editForm.topic,
          difficulty: editForm.difficulty,
          type: editForm.type,
          promptMarkdown: editForm.promptMarkdown,
          explanationMarkdown: editForm.explanationMarkdown || undefined,
          referenceAnswer: editForm.type === "SHORT_ANSWER" ? editForm.referenceAnswer : undefined,
          gradingKeywords:
            editForm.type === "SHORT_ANSWER"
              ? editForm.referenceAnswer
                  .split(/[^a-zA-Z0-9]+/)
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 8)
              : undefined,
          options,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to update question."));
        return;
      }

      setEditQuestionOpen(false);
      setEditingQuestion(null);
      router.refresh();
    });
  }

  function queueGenerationJob() {
    const sanitizedCount = sanitizeGenerationCount(generationCount);
    const sanitizedTypes = generationTypes.length > 0 ? generationTypes : (["MULTIPLE_CHOICE"] as QuestionType[]);
    setGenerationCount(String(sanitizedCount));
    setGenerationTypes(sanitizedTypes);
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const response = await fetch("/api/teacher/quizzes/generation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          quizId: quiz.id,
          questionCount: sanitizedCount,
          questionTypes: sanitizedTypes,
        }),
      });

      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        setError(extractApiErrorMessage(payload, "Unable to queue generation job."));
        return;
      }

      setGenerateOpen(false);
      setSuccess("Generation queued in background. You can keep navigating while questions are generated.");
      router.push(lessonGenerationJobsHref);
    });
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Quiz management breadcrumb" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
          <li>
            <Link href={breadcrumbContext?.sectionId ? `/teacher/subjects?sectionId=${breadcrumbContext.sectionId}` : "/teacher/subjects"} className="hover:underline">
              Subjects
            </Link>
          </li>
          {breadcrumbContext ? (
            <>
              <li className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                {subjectDetailHref ? (
                  <Link href={subjectDetailHref} className="hover:underline">
                    {breadcrumbContext.subjectName}
                  </Link>
                ) : (
                  <span>{breadcrumbContext.subjectName}</span>
                )}
              </li>
              {breadcrumbContext.sectionName ? (
                <li className="flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
                  {subjectDetailHref ? (
                    <Link href={subjectDetailHref} className="hover:underline">
                      {breadcrumbContext.sectionName}
                    </Link>
                  ) : (
                    <span>{breadcrumbContext.sectionName}</span>
                  )}
                </li>
              ) : null}
            </>
          ) : (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
              <Link href="/teacher/lessons" className="hover:underline">
                Lessons
              </Link>
            </li>
          )}
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <Link href={withContext(`/teacher/lessons/${lesson.id}`)} className="hover:underline">
              {lesson.title}
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <span className="font-semibold text-[var(--ink-900)]">{quiz.title}</span>
          </li>
        </ol>
      </nav>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand-600)]">Question Management</p>
            <h2 className="text-2xl font-black text-[var(--ink-900)]">{quiz.title}</h2>
            <p className="text-sm text-[var(--ink-500)]">Manage quiz settings and questions in this lesson context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "danger" : "warning"}>
              {quiz.status}
            </Chip>
            <Button variant="danger" onClick={() => setDeleteQuizOpen(true)} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Quiz
            </Button>
          </div>
        </div>
      </Card>

      {error ? (
        <div className="rounded-xl border border-[var(--danger-500)] bg-[var(--danger-100)] px-3 py-2 text-sm text-[var(--danger-700)]">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-[var(--success-500)] bg-[var(--success-100)] px-3 py-2 text-sm text-[var(--success-700)]">
          {success}{" "}
          <Link href={withContext(`/teacher/lessons/${lesson.id}`)} className="font-semibold underline">
            View generation jobs
          </Link>
        </div>
      ) : null}

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Quiz Settings</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InputField label="Title" value={quizForm.title} onChange={(value) => setQuizForm((prev) => ({ ...prev, title: value }))} />
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
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Status
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={quizForm.status}
              onChange={(event) => setQuizForm((prev) => ({ ...prev, status: event.target.value as QuizStatus }))}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
            <input
              type="checkbox"
              checked={quizForm.randomizeQuestions}
              onChange={(event) => setQuizForm((prev) => ({ ...prev, randomizeQuestions: event.target.checked }))}
              className="mt-1"
            />
            <span>
              Randomize Questions
              <span className="block text-xs font-normal text-[var(--ink-500)]">Shuffle question order per attempt.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
            <input
              type="checkbox"
              checked={quizForm.randomizeOptions}
              onChange={(event) => setQuizForm((prev) => ({ ...prev, randomizeOptions: event.target.checked }))}
              className="mt-1"
            />
            <span>
              Randomize Choices
              <span className="block text-xs font-normal text-[var(--ink-500)]">Shuffle answer options for objective questions.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
            <input
              type="checkbox"
              checked={quizForm.noTimeLimit}
              onChange={(event) => setQuizForm((prev) => ({ ...prev, noTimeLimit: event.target.checked }))}
              className="mt-1"
            />
            <span>
              No Time Limit
              <span className="block text-xs font-normal text-[var(--ink-500)]">Disable the countdown timer for this quiz.</span>
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
              <span className="block text-xs font-normal text-[var(--ink-500)]">Allow students to retake this quiz anytime.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-lg border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)] sm:col-span-2 lg:col-span-4">
            <input
              type="checkbox"
              checked={quizForm.showAnswerKey}
              onChange={(event) => setQuizForm((prev) => ({ ...prev, showAnswerKey: event.target.checked }))}
              className="mt-1"
            />
            <span>
              Show Correct Answers and Explanations to Students
              <span className="block text-xs font-normal text-[var(--ink-500)]">
                Enabled by default. Turn off to hide answer keys and explanation content in student results.
              </span>
            </span>
          </label>
        </div>

        <div className="mt-4">
          <MathTextEditor
            label="Description"
            value={quizForm.description}
            onChange={(next) => setQuizForm((prev) => ({ ...prev, description: next }))}
            minHeightClassName="min-h-28"
            allowMediaUpload={false}
            showUtilityControls
          />
        </div>

        <div className="mt-4">
          <MathTextEditor
            label="Instructions"
            value={quizForm.instructions}
            onChange={(next) => setQuizForm((prev) => ({ ...prev, instructions: next }))}
            minHeightClassName="min-h-24"
            allowMediaUpload={false}
            showUtilityControls={false}
          />
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={saveQuizSettings} disabled={pending}>
            {pending ? "Saving..." : "Save Quiz Settings"}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-[var(--ink-900)]">Questions ({quiz.questions.length})</h3>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button onClick={() => setAddQuestionOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
            <ActionMenu
              className="w-auto"
              iconTrigger
              ariaLabel="Question actions"
              groups={[
                {
                  items: [
                    {
                      label: "Attach Existing",
                      icon: <Link2 className="h-4 w-4" />,
                      onSelect: () => setAttachQuestionOpen(true),
                    },
                    {
                      label: "Submitted Answers",
                      icon: <ClipboardCheck className="h-4 w-4" />,
                      onSelect: () => router.push(withContext(`/teacher/lessons/${lesson.id}/quizzes/${quiz.id}/submissions`)),
                    },
                    {
                      label: "Generate Questions",
                      icon: <Sparkles className="h-4 w-4" />,
                      onSelect: () => {
                        setError(null);
                        setSuccess(null);
                        setGenerateOpen(true);
                      },
                      disabled: pending,
                    },
                  ],
                },
              ]}
            />
          </div>
        </div>
        {quiz.questions.length > 1 ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">
            Drag and drop questions to reorder
          </p>
        ) : null}

        {quiz.questions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] p-6 text-center">
            <p className="text-base font-semibold text-[var(--ink-800)]">No questions yet</p>
            <p className="mt-1 text-sm text-[var(--ink-500)]">Create your first question or attach one from your question bank.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {orderedQuestions.map((question, index) => (
                <div
                  key={question.quizQuestionId}
                  draggable={!pending}
                  onDragStart={() => setDraggingQuestionId(question.questionId)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverQuestionId(question.questionId);
                  }}
                  onDragLeave={() => setDragOverQuestionId((current) => (current === question.questionId ? null : current))}
                  onDrop={() => handleQuestionDrop(question.questionId)}
                  onDragEnd={() => {
                    setDraggingQuestionId(null);
                    setDragOverQuestionId(null);
                  }}
                  className={`rounded-xl border bg-white p-4 ${dragOverQuestionId === question.questionId ? "border-[var(--brand-500)]" : "border-[var(--line-200)]"}`}
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex cursor-grab items-center gap-1 rounded-md border border-[var(--line-200)] px-2 py-1 text-xs text-[var(--ink-600)]">
                        <GripVertical className="h-3.5 w-3.5" />
                        Drag
                      </span>
                      <Chip tone="brand">Q{index + 1}</Chip>
                      <Chip tone="neutral">{question.type}</Chip>
                      <Chip tone="neutral">{question.topic}</Chip>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEditQuestion(question)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setQuestionToRemove(question)}>
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                  <MarkdownContent content={question.promptMarkdown} className="lesson-markdown text-sm" />
                </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={addQuestionOpen}
        onClose={() => setAddQuestionOpen(false)}
        title="Add Question to Quiz"
        description="Create a new question and attach it directly to this quiz."
      >
        <QuestionFormEditor form={createForm} onChange={setCreateForm} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddQuestionOpen(false)}>
            Cancel
          </Button>
          <Button onClick={createQuestionInQuiz} disabled={pending || isShortAnswerReferenceMissing(createForm)}>
            Add Question
          </Button>
        </div>
      </Modal>

      <Modal
        open={editQuestionOpen}
        onClose={() => setEditQuestionOpen(false)}
        title="Edit Question"
        description="Update question content while staying in this quiz context."
      >
        <QuestionFormEditor form={editForm} onChange={setEditForm} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditQuestionOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveEditedQuestion} disabled={pending || isShortAnswerReferenceMissing(editForm)}>
            Save Question
          </Button>
        </div>
      </Modal>

      <Modal
        open={attachQuestionOpen}
        onClose={() => setAttachQuestionOpen(false)}
        title="Attach Existing Question"
        description="Reuse a question from your question bank."
      >
        <div className="space-y-4">
          <label className="block text-sm font-semibold text-[var(--ink-700)]">
            Question
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={selectedBankQuestionId}
              onChange={(event) => setSelectedBankQuestionId(event.target.value)}
            >
              <option value="">Select a question</option>
              {linkableBankQuestions.map((question) => (
                <option key={question.id} value={question.id}>
                  [{question.type}] {question.topic} — {question.promptMarkdown.slice(0, 80)}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAttachQuestionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={attachExistingQuestion} disabled={!selectedBankQuestionId || pending}>
              Attach Question
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(questionToRemove)}
        onClose={() => setQuestionToRemove(null)}
        title="Remove Question from Quiz"
        description="This removes the question from this quiz only. It stays in your question bank."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            {questionToRemove ? (
              <>
                Remove <strong>Q{questionToRemove.position}</strong> from this quiz?
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setQuestionToRemove(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={removeQuestionFromQuiz} disabled={pending}>
              Remove
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        title="Generate Questions"
        description="Queue generation in background. Questions will be added to this quiz when the job completes."
      >
        <div className="space-y-4">
          <InputField
            label="Question Count"
            type="number"
            value={generationCount}
            onChange={setGenerationCount}
            min={1}
            max={MAX_AI_GENERATED_QUESTIONS}
            hint={`Max ${MAX_AI_GENERATED_QUESTIONS} questions per generation.`}
          />
          <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Question Types</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {GENERATION_TYPE_OPTIONS.map((option) => {
                const selected = generationTypes.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setGenerationTypes((prev) =>
                        prev.includes(option.value) ? prev.filter((item) => item !== option.value) : [...prev, option.value],
                      )
                    }
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                      selected
                        ? "border-[var(--brand-600)] bg-[var(--brand-500)] text-white"
                        : "border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-[var(--ink-500)]">Select at least one type. Background generation limit is 10 questions.</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setGenerateOpen(false)}>
              Close
            </Button>
            <Button onClick={queueGenerationJob} disabled={generationTypes.length === 0 || pending}>
              {pending ? "Queueing..." : "Queue Generation"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteQuizOpen}
        onClose={() => setDeleteQuizOpen(false)}
        title="Delete Quiz"
        description="This permanently removes the quiz and related student attempts."
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
            Delete <strong>{quiz.title}</strong>? This cannot be undone.
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteQuizOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={deleteCurrentQuiz} disabled={pending}>
              <Trash2 className="h-4 w-4" />
              Delete Quiz
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  hint,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
  min?: number;
  max?: number;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-semibold text-[var(--ink-700)]">
      {label}
      <input
        className={`mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm ${disabled ? "cursor-not-allowed bg-[var(--line-100)] text-[var(--ink-500)]" : ""}`}
        value={value}
        type={type}
        min={type === "number" ? min : undefined}
        max={type === "number" ? max : undefined}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-[var(--ink-500)]">{hint}</span> : null}
    </label>
  );
}

function QuestionFormEditor({
  form,
  onChange,
}: {
  form: QuestionForm;
  onChange: (value: QuestionForm) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InputField label="Subject" value={form.subject} onChange={(value) => onChange({ ...form, subject: value })} />
        <InputField label="Topic" value={form.topic} onChange={(value) => onChange({ ...form, topic: value })} />
        <label className="text-sm font-semibold text-[var(--ink-700)]">
          Difficulty
          <select
            className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.difficulty}
            onChange={(event) => onChange({ ...form, difficulty: event.target.value as QuestionForm["difficulty"] })}
          >
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-[var(--ink-700)]">
          Type
          <select
            className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
            value={form.type}
            onChange={(event) => onChange({ ...form, type: event.target.value as QuestionType })}
          >
            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short Answer</option>
          </select>
        </label>
      </div>

      <MathTextEditor
        label="Question Text"
        value={form.promptMarkdown}
        onChange={(next) => onChange({ ...form, promptMarkdown: next })}
        minHeightClassName="min-h-24"
        allowMediaUpload={false}
        showUtilityControls
      />

      <MathTextEditor
        label="Explanation / Rationale"
        value={form.explanationMarkdown}
        onChange={(next) => onChange({ ...form, explanationMarkdown: next })}
        minHeightClassName="min-h-20"
        allowMediaUpload={false}
        showUtilityControls={false}
      />

      {form.type === "SHORT_ANSWER" ? (
        <div className="space-y-2">
          <MathTextEditor
            label="Reference Answer"
            value={form.referenceAnswer}
            onChange={(next) => onChange({ ...form, referenceAnswer: next })}
            minHeightClassName="min-h-16"
            allowMediaUpload={false}
            showToolbar={false}
            previewDefaultOpen={false}
            showUtilityControls={false}
          />
          {isShortAnswerReferenceMissing(form) ? (
            <div className="rounded-xl border border-[var(--warning-500)] bg-[var(--warning-100)] px-3 py-2 text-sm text-[var(--warning-700)]">
              Reference answer is required for short-answer validation and AI fallback.
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <MathTextEditor
            label="Choice A"
            value={form.optionA}
            onChange={(next) => onChange({ ...form, optionA: next })}
            minHeightClassName="min-h-16"
            allowMediaUpload={false}
            showToolbar={false}
            previewDefaultOpen={false}
            showUtilityControls={false}
          />
          <MathTextEditor
            label="Choice B"
            value={form.optionB}
            onChange={(next) => onChange({ ...form, optionB: next })}
            minHeightClassName="min-h-16"
            allowMediaUpload={false}
            showToolbar={false}
            previewDefaultOpen={false}
            showUtilityControls={false}
          />
          <MathTextEditor
            label="Choice C (optional)"
            value={form.optionC}
            onChange={(next) => onChange({ ...form, optionC: next })}
            minHeightClassName="min-h-16"
            allowMediaUpload={false}
            showToolbar={false}
            previewDefaultOpen={false}
            showUtilityControls={false}
          />
          <MathTextEditor
            label="Choice D (optional)"
            value={form.optionD}
            onChange={(next) => onChange({ ...form, optionD: next })}
            minHeightClassName="min-h-16"
            allowMediaUpload={false}
            showToolbar={false}
            previewDefaultOpen={false}
            showUtilityControls={false}
          />

          <label className="text-sm font-semibold text-[var(--ink-700)] sm:col-span-2">
            Correct Option
            <select
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm"
              value={form.correctOption}
              onChange={(event) => onChange({ ...form, correctOption: event.target.value as QuestionForm["correctOption"] })}
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
              <option value="D">D</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
