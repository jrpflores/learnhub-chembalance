import Link from "next/link";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/lib/auth";
import { listLessonAnalytics } from "@/server/queries/lessons";
import {
  getTeacherTopicWeakness,
  listQuizAnalytics,
  quizQuestionAnalytics,
  teacherStudentAnalytics,
} from "@/server/queries/quizzes";
import { listSections, listTeacherSectionSubjectIds } from "@/server/queries/sections";
import { listTeacherSubjectSummaries } from "@/server/queries/subjects";

type TeacherAnalyticsPageProps = {
  searchParams: Promise<{
    sectionId?: string;
    subjectId?: string;
    quizPage?: string;
    studentPage?: string;
    lessonPage?: string;
  }>;
};

const QUIZ_PAGE_SIZE = 12;
const STUDENT_PAGE_SIZE = 12;
const LESSON_PAGE_SIZE = 12;

function parsePage(value?: string) {
  const parsed = Number(value ?? "1");
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export default async function TeacherAnalyticsPage({ searchParams }: TeacherAnalyticsPageProps) {
  const user = await requireRole(["TEACHER"]);
  const query = await searchParams;

  const sections = listSections({ teacherId: user.id, status: "ACTIVE" });
  const requestedSectionId = query.sectionId?.trim();
  const selectedSection = requestedSectionId ? sections.find((section) => section.id === requestedSectionId) ?? null : null;

  const subjects = listTeacherSubjectSummaries(user.id);
  const selectedSectionSubjectIds = selectedSection ? new Set(listTeacherSectionSubjectIds(selectedSection.id, user.id)) : null;
  const subjectOptions = selectedSectionSubjectIds
    ? subjects.filter((subject) => selectedSectionSubjectIds.has(subject.id))
    : subjects;

  const requestedSubjectId = query.subjectId?.trim();
  const selectedSubject =
    requestedSubjectId && subjectOptions.some((subject) => subject.id === requestedSubjectId)
      ? subjectOptions.find((subject) => subject.id === requestedSubjectId) ?? null
      : null;

  const filters = {
    sectionId: selectedSection?.id,
    subjectId: selectedSubject?.id,
  };

  const requestedQuizPage = parsePage(query.quizPage);
  const requestedStudentPage = parsePage(query.studentPage);
  const requestedLessonPage = parsePage(query.lessonPage);

  const quizAnalytics = listQuizAnalytics(user.id, filters);
  const questionAnalytics = quizQuestionAnalytics(user.id, filters);
  const studentAnalytics = teacherStudentAnalytics(user.id, filters);
  const lessonAnalytics = listLessonAnalytics(user.id, filters);
  const topicWeakness = getTeacherTopicWeakness(user.id, filters);
  const quizWithAttempts = quizAnalytics.filter((quiz) => quiz.takenCount > 0);
  const avgPassRate =
    quizWithAttempts.length > 0
      ? Number((quizWithAttempts.reduce((sum, quiz) => sum + quiz.passRate, 0) / quizWithAttempts.length).toFixed(1))
      : 0;
  const avgScore =
    quizWithAttempts.length > 0
      ? Number((quizWithAttempts.reduce((sum, quiz) => sum + quiz.averageScore, 0) / quizWithAttempts.length).toFixed(1))
      : 0;

  const quizPageCount = Math.max(1, Math.ceil(quizAnalytics.length / QUIZ_PAGE_SIZE));
  const quizPage = Math.min(requestedQuizPage, quizPageCount);
  const quizStart = (quizPage - 1) * QUIZ_PAGE_SIZE;
  const paginatedQuizAnalytics = quizAnalytics.slice(quizStart, quizStart + QUIZ_PAGE_SIZE);

  const studentPageCount = Math.max(1, Math.ceil(studentAnalytics.length / STUDENT_PAGE_SIZE));
  const studentPage = Math.min(requestedStudentPage, studentPageCount);
  const studentStart = (studentPage - 1) * STUDENT_PAGE_SIZE;
  const paginatedStudentAnalytics = studentAnalytics.slice(studentStart, studentStart + STUDENT_PAGE_SIZE);

  const lessonPageCount = Math.max(1, Math.ceil(lessonAnalytics.length / LESSON_PAGE_SIZE));
  const lessonPage = Math.min(requestedLessonPage, lessonPageCount);
  const lessonStart = (lessonPage - 1) * LESSON_PAGE_SIZE;
  const paginatedLessonAnalytics = lessonAnalytics.slice(lessonStart, lessonStart + LESSON_PAGE_SIZE);

  const paginationHref = (pageKey: "quizPage" | "studentPage" | "lessonPage", pageValue: number) => {
    const params = new URLSearchParams();
    if (selectedSection?.id) {
      params.set("sectionId", selectedSection.id);
    }
    if (selectedSubject?.id) {
      params.set("subjectId", selectedSubject.id);
    }
    params.set(pageKey, String(pageValue));
    if (pageKey !== "quizPage" && query.quizPage) {
      params.set("quizPage", query.quizPage);
    }
    if (pageKey !== "studentPage" && query.studentPage) {
      params.set("studentPage", query.studentPage);
    }
    if (pageKey !== "lessonPage" && query.lessonPage) {
      params.set("lessonPage", query.lessonPage);
    }
    return `/teacher/analytics?${params.toString()}`;
  };

  return (
    <div className="space-y-4">
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Section
            <select
              name="sectionId"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[220px] sm:w-auto"
              defaultValue={selectedSection?.id ?? ""}
            >
              <option value="">All assigned sections</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-[var(--ink-700)]">
            Subject
            <select
              name="subjectId"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[220px] sm:w-auto"
              defaultValue={selectedSubject?.id ?? ""}
            >
              <option value="">All assigned subjects</option>
              {subjectOptions.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} · {subject.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--brand-500)] px-4 text-sm font-semibold text-white hover:bg-[var(--brand-600)]"
          >
            Apply
          </button>
          <a
            href="/teacher/analytics"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--line-300)] bg-white px-4 text-sm font-semibold text-[var(--ink-700)] hover:bg-[var(--line-100)]"
          >
            Reset
          </a>
        </form>

        <p className="mt-3 text-sm text-[var(--ink-600)]">
          Context:{" "}
          <span className="font-semibold text-[var(--ink-900)]">{selectedSection?.name ?? "All sections"}</span> ·{" "}
          <span className="font-semibold text-[var(--ink-900)]">{selectedSubject?.name ?? "All subjects"}</span>
        </p>
        {selectedSection && subjectOptions.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-600)]">
            No subjects are assigned to you in the selected section.
          </p>
        ) : null}
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Quizzes with Attempts" value={quizWithAttempts.length} />
        <MetricCard label="Average Pass Rate" value={`${avgPassRate}%`} />
        <MetricCard label="Average Score" value={`${avgScore}%`} />
        <MetricCard label="Students Tracked" value={studentAnalytics.length} />
      </section>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Quiz Analytics</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Quiz</th>
                <th className="px-2 py-2 font-semibold">Taken</th>
                <th className="px-2 py-2 font-semibold">Pass Rate</th>
                <th className="px-2 py-2 font-semibold">Average</th>
                <th className="px-2 py-2 font-semibold">Highest</th>
                <th className="px-2 py-2 font-semibold">Lowest</th>
                <th className="px-2 py-2 font-semibold">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {paginatedQuizAnalytics.map((quiz) => (
                <tr key={quiz.quizId} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{quiz.title}</td>
                  <td className="px-2 py-2">{quiz.takenCount}</td>
                  <td className="px-2 py-2">{quiz.passRate}%</td>
                  <td className="px-2 py-2">{quiz.averageScore}%</td>
                  <td className="px-2 py-2">{quiz.highestScore}%</td>
                  <td className="px-2 py-2">{quiz.lowestScore}%</td>
                  <td className="px-2 py-2">{Math.round(quiz.averageTimeSpentSec / 60)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationLinks
          page={quizPage}
          pageCount={quizPageCount}
          total={quizAnalytics.length}
          pageSize={QUIZ_PAGE_SIZE}
          start={quizStart}
          hrefForPage={(nextPage) => paginationHref("quizPage", nextPage)}
        />
        {quizAnalytics.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
            No quiz analytics found for the selected filter context.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Question Difficulty</h2>
          <div className="mt-3 space-y-2">
            {questionAnalytics.slice(0, 10).map((question) => (
              <div key={question.questionId} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="line-clamp-2 text-sm font-semibold text-[var(--ink-800)]">{question.promptMarkdown}</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Topic: {question.topic} | Accuracy: {question.accuracy}% | Misses: {question.incorrectAnswers}
                </p>
              </div>
            ))}
            {questionAnalytics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                No question-level analytics yet.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-[var(--ink-900)]">Topic Mistake Concentration</h2>
          <div className="mt-3 space-y-2">
            {topicWeakness.map((topic) => (
              <div key={topic.topic} className="rounded-xl border border-[var(--line-200)] px-3 py-2">
                <p className="text-sm font-semibold text-[var(--ink-800)]">{topic.topic}</p>
                <p className="text-xs text-[var(--ink-500)]">
                  Wrong: {topic.wrongAnswers}/{topic.totalAnswers} ({topic.errorRate}% error)
                </p>
              </div>
            ))}
            {topicWeakness.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
                No topic weakness data available for this context.
              </p>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Student Analytics</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Student</th>
                <th className="px-2 py-2 font-semibold">Quiz Avg</th>
                <th className="px-2 py-2 font-semibold">Taken</th>
                <th className="px-2 py-2 font-semibold">Passed / Failed</th>
                <th className="px-2 py-2 font-semibold">Completed Lessons</th>
                <th className="px-2 py-2 font-semibold">In Progress</th>
                <th className="px-2 py-2 font-semibold">Streak</th>
              </tr>
            </thead>
            <tbody>
              {paginatedStudentAnalytics.map((student) => (
                <tr key={student.studentId} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{student.fullName}</td>
                  <td className="px-2 py-2">{student.averageScore}%</td>
                  <td className="px-2 py-2">{student.quizzesTaken}</td>
                  <td className="px-2 py-2">
                    {student.passedCount} / {student.failedCount}
                  </td>
                  <td className="px-2 py-2">{student.completedLessons}</td>
                  <td className="px-2 py-2">{student.inProgressLessons}</td>
                  <td className="px-2 py-2">{student.streakDays} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationLinks
          page={studentPage}
          pageCount={studentPageCount}
          total={studentAnalytics.length}
          pageSize={STUDENT_PAGE_SIZE}
          start={studentStart}
          hrefForPage={(nextPage) => paginationHref("studentPage", nextPage)}
        />
        {studentAnalytics.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
            No student analytics found for this context.
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-bold text-[var(--ink-900)]">Lesson Analytics</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Lesson</th>
                <th className="px-2 py-2 font-semibold">Views</th>
                <th className="px-2 py-2 font-semibold">Unique Students</th>
                <th className="px-2 py-2 font-semibold">Completion</th>
                <th className="px-2 py-2 font-semibold">Avg Time</th>
                <th className="px-2 py-2 font-semibold">Quiz Participation</th>
                <th className="px-2 py-2 font-semibold">Quiz Pass Rate</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLessonAnalytics.map((lesson) => (
                <tr key={lesson.lessonId} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2 font-medium text-[var(--ink-800)]">{lesson.title}</td>
                  <td className="px-2 py-2">{lesson.views}</td>
                  <td className="px-2 py-2">{lesson.uniqueStudents}</td>
                  <td className="px-2 py-2">{lesson.completionRate}%</td>
                  <td className="px-2 py-2">{Math.round(lesson.avgTimeSpentSec / 60)} min</td>
                  <td className="px-2 py-2">{lesson.quizParticipation}</td>
                  <td className="px-2 py-2">{lesson.quizPassRate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationLinks
          page={lessonPage}
          pageCount={lessonPageCount}
          total={lessonAnalytics.length}
          pageSize={LESSON_PAGE_SIZE}
          start={lessonStart}
          hrefForPage={(nextPage) => paginationHref("lessonPage", nextPage)}
        />
        {lessonAnalytics.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-[var(--line-300)] bg-[var(--line-100)] px-3 py-4 text-center text-sm text-[var(--ink-500)]">
            No lesson analytics found for this context.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="bg-[var(--line-100)]">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-xl font-black text-[var(--ink-900)]">{value}</p>
    </Card>
  );
}

function PaginationLinks({
  page,
  pageCount,
  total,
  pageSize,
  start,
  hrefForPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  start: number;
  hrefForPage: (nextPage: number) => string;
}) {
  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">
        Showing {start + 1}-{Math.min(start + pageSize, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={page > 1 ? hrefForPage(page - 1) : "#"}
          className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
            page > 1
              ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
              : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
          }`}
        >
          Previous
        </Link>
        <span className="text-xs font-semibold text-[var(--ink-600)]">
          Page {page}/{pageCount}
        </span>
        <Link
          href={page < pageCount ? hrefForPage(page + 1) : "#"}
          className={`inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-semibold ${
            page < pageCount
              ? "border-[var(--line-300)] bg-white text-[var(--ink-800)] hover:bg-[var(--line-100)]"
              : "pointer-events-none border-[var(--line-200)] bg-[var(--line-100)] text-[var(--ink-400)]"
          }`}
        >
          Next
        </Link>
      </div>
    </div>
  );
}
