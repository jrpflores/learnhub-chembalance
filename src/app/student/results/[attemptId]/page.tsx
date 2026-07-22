import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { StudentResultRecheckAction } from "@/components/student/result-recheck-action";
import { ResultProcessingState } from "@/components/student/result-processing-state";
import { StudentPageHeader } from "@/components/student/student-page-header";
import { requireRole } from "@/lib/auth";
import { featureFlags } from "@/lib/feature-flags";
import { formatSeconds } from "@/lib/utils";
import { getAttemptAiJobStats, getAttemptById } from "@/server/queries/quizzes";
import { finalizeSubmittedAttemptIfReady } from "@/server/services/quiz-service";

export default async function StudentResultDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const user = await requireRole(["STUDENT"]);
  const { attemptId } = await params;

  let attempt = getAttemptById(attemptId);
  if (!attempt || attempt.studentId !== user.id) {
    notFound();
  }

  if (attempt.status === "SUBMITTED") {
    const maybeFinalized = finalizeSubmittedAttemptIfReady(attempt.id);
    if (maybeFinalized) {
      attempt = maybeFinalized;
    }
  }

  if (attempt.status === "SUBMITTED" || attempt.outcome === "PENDING") {
    const aiJobs = getAttemptAiJobStats(attempt.id);
    return <ResultProcessingState attemptId={attempt.id} quizTitle={attempt.quizTitle} initialAiJobs={aiJobs} />;
  }

  const passed = attempt.outcome === "PASSED";
  const canShowAnswerKey = attempt.showAnswerKey;

  const canShowExplanations =
    canShowAnswerKey &&
    (attempt.explanationMode === "ALWAYS" ||
      attempt.explanationMode === "AFTER_SUBMISSION" ||
      (attempt.explanationMode === "AFTER_PASS" && passed));
  const hasShortAnswers = attempt.answers.some((answer) => answer.type === "SHORT_ANSWER");

  return (
    <div className="space-y-4">
      <StudentPageHeader
        title="Quiz Result"
        description={attempt.quizTitle}
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Results", href: "/student/results" },
          { label: attempt.quizTitle },
        ]}
      />

      <Card className={passed ? "border-[var(--success-300)] bg-[var(--success-100)]" : "border-[var(--warning-300)] bg-[var(--warning-100)]"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ink-600)]">Quiz Result</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--ink-900)]">{attempt.quizTitle}</h2>
            <p className="mt-1 text-sm text-[var(--ink-700)]">
              {passed
                ? "Great job! You passed this quiz."
                : "Nice effort! Review the lesson and try again. You are getting closer."}
            </p>
          </div>

          <div className="rounded-xl bg-white/80 px-4 py-3 text-right">
            <p className="text-xs text-[var(--ink-500)]">Score</p>
            <p className="text-3xl font-black text-[var(--ink-900)]">{attempt.scorePercent ?? 0}%</p>
            <Chip tone={passed ? "success" : "warning"}>{attempt.outcome}</Chip>
          </div>
        </div>

        <div className={`mt-4 grid gap-3 ${featureFlags.showXp ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Metric label="Correct" value={attempt.correctCount ?? 0} />
          <Metric label="Wrong" value={attempt.wrongCount ?? 0} />
          <Metric label="Time Spent" value={formatSeconds(attempt.timeSpentSec)} />
          {featureFlags.showXp ? <Metric label="XP Earned" value={attempt.xpAwarded} /> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {hasShortAnswers ? <StudentResultRecheckAction attemptId={attempt.id} /> : null}
          <Link href={`/student/quizzes/${attempt.quizId}`}>
            <span className="inline-flex rounded-lg bg-[var(--brand-500)] px-3 py-2 text-sm font-semibold text-white">Try Again</span>
          </Link>
          <Link href="/student/results">
            <span className="inline-flex rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[var(--ink-800)]">Back to History</span>
          </Link>
        </div>
      </Card>

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Answer Review</h3>
        <div className="mt-3 space-y-4">
          {attempt.answers.map((answer, index) => {
            const statusTone = answer.isCorrect ? "success" : "warning";
            return (
              <div key={answer.id} className="rounded-2xl border border-[var(--line-200)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--ink-900)]">Question {index + 1}</p>
                  <Chip tone={statusTone}>{answer.isCorrect ? "Correct" : "Needs Review"}</Chip>
                </div>

                <div className="mt-3">
                  <MarkdownContent content={answer.promptMarkdown} className="lesson-markdown" />
                </div>

                <div className="mt-3 rounded-xl bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">
                  {answer.type === "SHORT_ANSWER" ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-[var(--ink-800)]">Your answer</p>
                      {answer.answerText ? (
                        <MarkdownContent content={answer.answerText} className="lesson-markdown text-sm" />
                      ) : (
                        <p>No answer</p>
                      )}
                      {canShowAnswerKey && answer.isCorrect === false && answer.referenceAnswer ? (
                        <div className="rounded-lg border border-[var(--line-200)] bg-white px-3 py-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">Correct Answer</p>
                          <MarkdownContent content={answer.referenceAnswer} className="lesson-markdown text-sm text-[var(--ink-800)]" />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p>
                        <strong>Your choice:</strong>{" "}
                        {answer.options
                          .filter((option) => answer.selectedOptionIds.includes(option.id))
                          .map((option) => option.value)
                          .join(", ") || "No choice"}
                      </p>
                      {canShowAnswerKey ? (
                        <p>
                          <strong>Correct:</strong>{" "}
                          {answer.options
                            .filter((option) => option.isCorrect)
                            .map((option) => option.value)
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                {answer.feedback && answer.type !== "SHORT_ANSWER" ? (
                  <p className="mt-2 text-sm text-[var(--ink-600)]">Feedback: {answer.feedback}</p>
                ) : null}

                {canShowExplanations && answer.explanationMarkdown ? (
                  <div className="mt-3 rounded-xl border border-[var(--line-200)] bg-white p-3">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">
                      {answer.type === "SHORT_ANSWER" ? "Evaluation Explanation" : "Explanation"}
                    </p>
                    <MarkdownContent content={answer.explanationMarkdown} className="lesson-markdown text-sm" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/50 bg-white/80 px-3 py-2">
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <p className="text-lg font-black text-[var(--ink-900)]">{value}</p>
    </div>
  );
}
