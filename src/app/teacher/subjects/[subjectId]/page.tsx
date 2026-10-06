import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, FolderOpen, GraduationCap, Plus, Settings } from "lucide-react";
import { SubjectBackgroundJobsPanel } from "@/components/teacher/subject-background-jobs-panel";
import { SubjectLessonGenerationAction } from "@/components/teacher/subject-lesson-generation-action";
import { SubjectSectionBreadcrumbSelect } from "@/components/teacher/subject-section-breadcrumb-select";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { requireRole } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/date-display";
import { listLessonGenerationJobsByContext } from "@/server/queries/lesson-generation-jobs";
import { getSystemDisplayPreferences } from "@/server/queries/system-locale";
import {
  getTeacherSubjectContext,
  listTeacherSectionLessons,
  listTeacherSectionQuizzes,
  listTeacherSectionRoster,
} from "@/server/queries/teacher-subject-context";

type TeacherSubjectDetailPageProps = {
  params: Promise<{ subjectId: string }>;
  searchParams: Promise<{
    sectionId?: string;
    tab?: string;
    studentSearch?: string;
    studentPage?: string;
    lessonSearch?: string;
    lessonStatus?: "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
    lessonPage?: string;
    quizSearch?: string;
    quizStatus?: "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";
    quizPage?: string;
  }>;
};

const TAB_VALUES = ["students", "lessons", "background-jobs", "quizzes"] as const;
type SubjectTab = (typeof TAB_VALUES)[number];

function toPage(value?: string) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function withQuery(path: string, values: Record<string, string | null | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value && value.trim().length > 0) {
      params.set(key, value);
    }
  });
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function pageRange<T>(result: { page: number; pageSize: number; total: number; data: T[] }) {
  if (result.total === 0) {
    return "0-0";
  }
  const start = (result.page - 1) * result.pageSize + 1;
  const end = Math.min(result.page * result.pageSize, result.total);
  return `${start}-${end}`;
}

export default async function TeacherSubjectDetailPage({ params, searchParams }: TeacherSubjectDetailPageProps) {
  const user = await requireRole(["TEACHER"]);
  const displayPreferences = getSystemDisplayPreferences();
  const { subjectId } = await params;
  const query = await searchParams;

  const context = getTeacherSubjectContext(user.id, subjectId);
  if (!context) {
    notFound();
  }

  const requestedTab = query.tab ?? "students";
  const activeTab: SubjectTab = TAB_VALUES.includes(requestedTab as SubjectTab) ? (requestedTab as SubjectTab) : "students";
  const availableSections = context.sections;
  const requestedSectionId = query.sectionId?.trim();
  const activeSection =
    (requestedSectionId ? availableSections.find((section) => section.id === requestedSectionId) : undefined) ??
    availableSections[0] ??
    null;

  const studentSearch = query.studentSearch?.trim() ?? "";
  const lessonSearch = query.lessonSearch?.trim() ?? "";
  const quizSearch = query.quizSearch?.trim() ?? "";
  const lessonStatus = query.lessonStatus && query.lessonStatus !== "ALL" ? query.lessonStatus : undefined;
  const quizStatus = query.quizStatus && query.quizStatus !== "ALL" ? query.quizStatus : undefined;

  const students =
    activeSection && activeTab === "students"
      ? listTeacherSectionRoster({
          teacherId: user.id,
          subjectId: context.subject.id,
          sectionId: activeSection.id,
          search: studentSearch || undefined,
          page: toPage(query.studentPage),
          pageSize: 12,
        })
      : null;

  const lessons =
    activeSection && activeTab === "lessons"
      ? listTeacherSectionLessons({
          teacherId: user.id,
          subjectId: context.subject.id,
          subjectName: context.subject.name,
          sectionId: activeSection.id,
          status: lessonStatus,
          search: lessonSearch || undefined,
          page: toPage(query.lessonPage),
          pageSize: 10,
        })
      : null;
  const lessonGenerationJobs =
    activeSection && activeTab === "background-jobs"
      ? listLessonGenerationJobsByContext({
          teacherId: user.id,
          subjectId: context.subject.id,
          sectionId: activeSection.id,
          limit: 10,
        })
      : [];

  const quizzes =
    activeSection && activeTab === "quizzes"
      ? listTeacherSectionQuizzes({
          teacherId: user.id,
          subjectId: context.subject.id,
          subjectName: context.subject.name,
          sectionId: activeSection.id,
          status: quizStatus,
          search: quizSearch || undefined,
          page: toPage(query.quizPage),
          pageSize: 10,
        })
      : null;

  const baseParams = {
    sectionId: activeSection?.id,
    studentSearch: studentSearch || undefined,
    lessonSearch: lessonSearch || undefined,
    lessonStatus: query.lessonStatus ?? "ALL",
    quizSearch: quizSearch || undefined,
    quizStatus: query.quizStatus ?? "ALL",
  };

  return (
    <div className="space-y-5">
      <nav aria-label="Subject context breadcrumb" className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 text-sm text-[var(--ink-500)]">
          <li>
            <Link href="/teacher/subjects" className="hover:underline">
              Subjects
            </Link>
          </li>
          <li className="flex items-center gap-1">
            <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
            <span>{context.subject.name}</span>
          </li>
          {activeSection ? (
            <li className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-[var(--ink-400)]" />
              <SubjectSectionBreadcrumbSelect
                subjectId={subjectId}
                sections={availableSections.map((section) => ({
                  id: section.id,
                  name: section.name,
                  studentCount: section.studentCount,
                }))}
                activeSectionId={activeSection.id}
                tab={activeTab}
              />
            </li>
          ) : null}
        </ol>
      </nav>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-600)]">{context.subject.code}</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--ink-900)]">{context.subject.name}</h2>
            {context.subject.description ? (
              <p className="mt-2 max-w-3xl text-sm text-[var(--ink-600)]">{context.subject.description}</p>
            ) : null}
            <p className="mt-2 text-sm text-[var(--ink-600)]">
              Assigned Teacher: <span className="font-semibold text-[var(--ink-900)]">{context.teacher.fullName}</span>
            </p>
          </div>
          {activeSection ? (
            <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
              <GraduationCap className="h-4 w-4 text-[var(--brand-600)]" />
              Active Section: {activeSection.name} • {activeSection.studentCount} students
            </div>
          ) : null}
        </div>
      </Card>

      {availableSections.length === 0 ? (
        <Card className="border-dashed bg-[var(--line-100)]">
          <p className="text-base font-semibold text-[var(--ink-800)]">No section assignment found for this subject.</p>
          <p className="mt-1 text-sm text-[var(--ink-600)]">
            Ask admin to assign you to at least one active section for {context.subject.name}.
          </p>
          <div className="mt-3">
            <Link
              href="/teacher/sections"
              className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-3 text-sm font-medium text-[var(--ink-900)] hover:bg-[var(--line-100)]"
            >
              Open Section Menu
            </Link>
          </div>
        </Card>
      ) : (
        <Card>
          {activeSection ? (
            <div className="mb-4 rounded-xl border border-[var(--brand-300)] bg-[var(--brand-100)] px-3 py-2 text-sm text-[var(--brand-700)]">
              Showing data for <span className="font-semibold">{activeSection.name}</span> ({activeSection.gradeLevel},{" "}
              {activeSection.schoolYear}) with <span className="font-semibold">{activeSection.studentCount}</span> assigned
              students.
            </div>
          ) : null}
          <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--line-200)] pb-3">
            <Link
              href={withQuery(`/teacher/subjects/${subjectId}`, {
                ...baseParams,
                tab: "students",
                studentPage: "1",
              })}
              className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
                activeTab === "students"
                  ? "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)]"
                  : "border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
              }`}
            >
              Class Roster / Students
            </Link>
            <Link
              href={withQuery(`/teacher/subjects/${subjectId}`, {
                ...baseParams,
                tab: "lessons",
                lessonPage: "1",
              })}
              className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
                activeTab === "lessons"
                  ? "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)]"
                  : "border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
              }`}
            >
              Lessons
            </Link>
            <Link
              href={withQuery(`/teacher/subjects/${subjectId}`, {
                ...baseParams,
                tab: "quizzes",
                quizPage: "1",
              })}
              className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
                activeTab === "quizzes"
                  ? "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)]"
                  : "border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
              }`}
            >
              Quizzes
            </Link>
            <Link
              href={withQuery(`/teacher/subjects/${subjectId}`, {
                ...baseParams,
                tab: "background-jobs",
              })}
              className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
                activeTab === "background-jobs"
                  ? "bg-[var(--brand-500)] !text-white hover:bg-[var(--brand-600)]"
                  : "border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
              }`}
            >
              Background Jobs
            </Link>
          </div>

          {activeTab === "students" && students ? (
            <div className="space-y-3">
              <form method="get" className="flex flex-wrap gap-2">
                <input type="hidden" name="tab" value="students" />
                <input type="hidden" name="sectionId" value={activeSection?.id ?? ""} />
                <input
                  name="studentSearch"
                  defaultValue={studentSearch}
                  placeholder="Search by student name or email"
                  className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
                />
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                >
                  Search
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                      <th className="px-2 py-2 font-semibold">Student</th>
                      <th className="px-2 py-2 font-semibold">Email</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">Enrolled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.data.map((student) => (
                      <tr key={student.id} className="border-b border-[var(--line-100)]">
                        <td className="px-2 py-2 font-semibold text-[var(--ink-900)]">{student.fullName}</td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">{student.email}</td>
                        <td className="px-2 py-2">
                          <Chip tone={student.isActive ? "success" : "warning"}>{student.isActive ? "Active" : "Inactive"}</Chip>
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">{formatDate(student.enrolledAt, displayPreferences)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {students.data.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                  No students found in this section context.
                </p>
              ) : null}

              {students.pageCount > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-500)]">
                  <span>
                    Showing {pageRange(students)} of {students.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "students",
                        studentPage: String(Math.max(1, students.page - 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${students.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Previous
                    </Link>
                    <span>
                      Page {students.page}/{students.pageCount}
                    </span>
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "students",
                        studentPage: String(Math.min(students.pageCount, students.page + 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${students.page >= students.pageCount ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "lessons" && lessons ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <form method="get" className="flex flex-wrap gap-2">
                  <input type="hidden" name="tab" value="lessons" />
                  <input type="hidden" name="sectionId" value={activeSection?.id ?? ""} />
                  <input
                    name="lessonSearch"
                    defaultValue={lessonSearch}
                    placeholder="Search lesson title"
                    className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
                  />
                  <select
                    name="lessonStatus"
                    defaultValue={query.lessonStatus ?? "ALL"}
                    className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
                  >
                    <option value="ALL">All Status</option>
                    <option value="DRAFT">Draft</option>
                    <option value="PUBLISHED">Published</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                  >
                    Apply
                  </button>
                </form>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={withQuery("/teacher/lessons", {
                      subject: context.subject.name,
                      subjectId: context.subject.id,
                      sectionId: activeSection?.id,
                      returnTab: "lessons",
                    })}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--brand-500)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-600)]"
                  >
                    <Plus className="h-4 w-4" />
                    Create Lesson
                  </Link>
                  <Link
                    href={withQuery("/teacher/lessons", {
                      subject: context.subject.name,
                      subjectId: context.subject.id,
                      sectionId: activeSection?.id,
                      intent: "import",
                      returnTab: "lessons",
                    })}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                  >
                    Import Lesson
                  </Link>
                  {activeSection ? (
                    <SubjectLessonGenerationAction
                      subjectId={context.subject.id}
                      subjectName={context.subject.name}
                      sectionId={activeSection.id}
                      sectionName={activeSection.name}
                      onQueuedRedirectHref={withQuery(`/teacher/subjects/${subjectId}`, {
                        sectionId: activeSection.id,
                        tab: "background-jobs",
                      })}
                    />
                  ) : null}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                      <th className="px-2 py-2 font-semibold">Lesson</th>
                      <th className="px-2 py-2 font-semibold">Topic</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">Updated</th>
                      <th className="px-2 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.data.map((lesson) => (
                      <tr key={lesson.id} className="border-b border-[var(--line-100)]">
                        <td className="px-2 py-2">
                          <Link
                            href={withQuery(`/teacher/lessons/${lesson.id}`, {
                              subjectId: context.subject.id,
                              sectionId: activeSection?.id,
                              returnTab: "lessons",
                            })}
                            className="font-semibold text-[var(--ink-900)] hover:underline"
                          >
                            {lesson.title}
                          </Link>
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">{lesson.topic}</td>
                        <td className="px-2 py-2">
                          <Chip tone={lesson.status === "PUBLISHED" ? "success" : lesson.status === "ARCHIVED" ? "warning" : "brand"}>
                            {lesson.status}
                          </Chip>
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">{formatDateTime(lesson.updatedAt, displayPreferences)}</td>
                        <td className="px-2 py-2">
                          <Link
                            href={withQuery(`/teacher/lessons/${lesson.id}`, {
                              subjectId: context.subject.id,
                              sectionId: activeSection?.id,
                              returnTab: "lessons",
                            })}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--line-300)] bg-white text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                            title="Open lesson details"
                            aria-label="Open lesson details"
                          >
                            <FolderOpen className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {lessons.data.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                  No lessons found for this subject and section context.
                </p>
              ) : null}

              {lessons.pageCount > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-500)]">
                  <span>
                    Showing {pageRange(lessons)} of {lessons.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "lessons",
                        lessonStatus: query.lessonStatus ?? "ALL",
                        lessonPage: String(Math.max(1, lessons.page - 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${lessons.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Previous
                    </Link>
                    <span>
                      Page {lessons.page}/{lessons.pageCount}
                    </span>
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "lessons",
                        lessonStatus: query.lessonStatus ?? "ALL",
                        lessonPage: String(Math.min(lessons.pageCount, lessons.page + 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${lessons.page >= lessons.pageCount ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === "background-jobs" ? (
            <SubjectBackgroundJobsPanel
              subjectId={context.subject.id}
              sectionId={activeSection?.id ?? ""}
              initialJobs={lessonGenerationJobs.map((job) => ({
                id: job.id,
                status: job.status,
                createdLessonId: job.createdLessonId,
                queuedAt: job.queuedAt,
                completedAt: job.completedAt,
                errorMessage: job.errorMessage,
                generatedLesson: job.generatedLesson,
              }))}
            />
          ) : null}

          {activeTab === "quizzes" && quizzes ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--ink-500)]">
                Use <span className="font-semibold text-[var(--ink-700)]">Quiz Settings</span> to control whether students can see correct answers and explanations after submission.
              </p>
              <form method="get" className="flex flex-wrap gap-2">
                <input type="hidden" name="tab" value="quizzes" />
                <input type="hidden" name="sectionId" value={activeSection?.id ?? ""} />
                <input
                  name="quizSearch"
                  defaultValue={quizSearch}
                  placeholder="Search quiz title"
                  className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
                />
                <select
                  name="quizStatus"
                  defaultValue={query.quizStatus ?? "ALL"}
                  className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:w-auto"
                >
                  <option value="ALL">All Status</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-800)] hover:bg-[var(--line-100)]"
                >
                  Apply
                </button>
              </form>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                      <th className="px-2 py-2 font-semibold">Quiz</th>
                      <th className="px-2 py-2 font-semibold">Lesson</th>
                      <th className="px-2 py-2 font-semibold">Status</th>
                      <th className="px-2 py-2 font-semibold">Attempts</th>
                      <th className="px-2 py-2 font-semibold">Student Review</th>
                      <th className="px-2 py-2 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quizzes.data.map((quiz) => (
                      <tr key={quiz.id} className="border-b border-[var(--line-100)]">
                        <td className="px-2 py-2 font-semibold text-[var(--ink-900)]">{quiz.title}</td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">{quiz.lessonTitle ?? "Unlinked lesson"}</td>
                        <td className="px-2 py-2">
                          <Chip tone={quiz.status === "PUBLISHED" ? "success" : quiz.status === "ARCHIVED" ? "warning" : "brand"}>
                            {quiz.status}
                          </Chip>
                        </td>
                        <td className="px-2 py-2 text-[var(--ink-700)]">
                          {quiz.maxAttempts <= 0 ? "Unlimited" : `Max ${quiz.maxAttempts}`}
                        </td>
                        <td className="px-2 py-2">
                          <Chip tone={quiz.showAnswerKey ? "success" : "warning"}>
                            {quiz.showAnswerKey ? "Answers Visible" : "Answers Hidden"}
                          </Chip>
                        </td>
                        <td className="px-2 py-2">
                          {quiz.lessonId ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={withQuery(`/teacher/lessons/${quiz.lessonId}/quizzes/${quiz.id}`, {
                                  subjectId: context.subject.id,
                                  sectionId: activeSection?.id,
                                  returnTab: "quizzes",
                                })}
                                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--line-300)] bg-white px-2 text-xs font-semibold text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                                title="Open quiz settings and question management"
                                aria-label="Open quiz settings and question management"
                              >
                                <Settings className="h-4 w-4" />
                                Quiz Settings
                              </Link>
                              <Link
                                href={withQuery(`/teacher/lessons/${quiz.lessonId}/quizzes/${quiz.id}/submissions`, {
                                  subjectId: context.subject.id,
                                  sectionId: activeSection?.id,
                                  returnTab: "quizzes",
                                })}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--line-300)] bg-white px-2 text-xs font-semibold text-[var(--ink-700)] hover:bg-[var(--line-100)]"
                              >
                                Submitted Answers
                              </Link>
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--ink-500)]">No lesson link</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {quizzes.data.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                  No quizzes found for this subject and section context.
                </p>
              ) : null}

              {quizzes.pageCount > 1 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-500)]">
                  <span>
                    Showing {pageRange(quizzes)} of {quizzes.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "quizzes",
                        quizStatus: query.quizStatus ?? "ALL",
                        quizPage: String(Math.max(1, quizzes.page - 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${quizzes.page <= 1 ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Previous
                    </Link>
                    <span>
                      Page {quizzes.page}/{quizzes.pageCount}
                    </span>
                    <Link
                      href={withQuery(`/teacher/subjects/${subjectId}`, {
                        ...baseParams,
                        tab: "quizzes",
                        quizStatus: query.quizStatus ?? "ALL",
                        quizPage: String(Math.min(quizzes.pageCount, quizzes.page + 1)),
                      })}
                      className={`rounded-md border px-2 py-1 ${quizzes.page >= quizzes.pageCount ? "pointer-events-none opacity-40" : "hover:bg-[var(--line-100)]"}`}
                    >
                      Next
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
