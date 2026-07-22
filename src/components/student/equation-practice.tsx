"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FlaskConical, Loader2, PlayCircle, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { StudentPageHeader, studentSecondaryLinkClassName } from "@/components/student/student-page-header";
import { formatDateTime } from "@/lib/date-display";

type EquationItem = {
  id: string;
  title: string;
  formula: string;
  balancedFormula: string | null;
  topic: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  hints: string[];
};

type PracticeSessionSummary = {
  id: string;
  topic: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  startedAt: string;
  completedAt: string | null;
  totalAttempts: number;
  correctAttempts: number;
};

type AttemptResult = {
  isCorrect: boolean;
  confidence: number;
  feedback: string;
  hint?: string;
};

type EquationPracticeProps = {
  initialSessions: PracticeSessionSummary[];
};

const SESSIONS_PAGE_SIZE = 10;

export function EquationPractice({ initialSessions }: EquationPracticeProps) {
  const [sessions, setSessions] = useState(initialSessions);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [topic, setTopic] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [equations, setEquations] = useState<EquationItem[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const current = equations[index] ?? null;
  const progress = equations.length === 0 ? 0 : Math.round(((index + 1) / equations.length) * 100);

  const accuracyPreview = useMemo(() => {
    if (sessions.length === 0) {
      return 0;
    }
    const totals = sessions.reduce(
      (acc, session) => {
        acc.total += session.totalAttempts;
        acc.correct += session.correctAttempts;
        return acc;
      },
      { total: 0, correct: 0 },
    );

    if (totals.total === 0) {
      return 0;
    }
    return Math.round((totals.correct / totals.total) * 100);
  }, [sessions]);
  const sessionsPageCount = Math.max(1, Math.ceil(sessions.length / SESSIONS_PAGE_SIZE));
  const safeSessionsPage = Math.min(sessionsPage, sessionsPageCount);
  const paginatedSessions = useMemo(() => {
    const start = (safeSessionsPage - 1) * SESSIONS_PAGE_SIZE;
    return sessions.slice(start, start + SESSIONS_PAGE_SIZE);
  }, [safeSessionsPage, sessions]);

  async function reloadSessions() {
    const response = await fetch("/api/student/equation-practice/sessions", { cache: "no-store" });
    if (!response.ok) {
      return;
    }

    const payload = (await response.json()) as { sessions: PracticeSessionSummary[] };
    setSessions(payload.sessions ?? []);
  }

  function startPractice() {
    setError(null);
    setResult(null);

    startTransition(async () => {
      const response = await fetch("/api/student/equation-practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic || undefined,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        sessionId?: string;
        equations?: EquationItem[];
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to start practice.");
        return;
      }

      setSessionId(payload.sessionId ?? null);
      setEquations(payload.equations ?? []);
      setIndex(0);
      setAnswer("");
      setResult(null);
      await reloadSessions();
    });
  }

  function submitAnswer() {
    if (!sessionId || !current || !answer.trim()) {
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/student/equation-practice/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          equationId: current.id,
          studentAnswer: answer,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: AttemptResult;
      };

      if (!response.ok || !payload.result) {
        setError(payload.error ?? "Unable to submit answer.");
        return;
      }

      setResult(payload.result);
      await reloadSessions();
    });
  }

  function nextQuestion() {
    setResult(null);
    setAnswer("");
    if (index + 1 >= equations.length) {
      finishPractice();
      return;
    }
    setIndex((prev) => prev + 1);
  }

  function finishPractice() {
    if (!sessionId) {
      return;
    }

    startTransition(async () => {
      await fetch("/api/student/equation-practice/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      setSessionId(null);
      setEquations([]);
      setIndex(0);
      setAnswer("");
      setResult(null);
      await reloadSessions();
    });
  }

  return (
    <div className="space-y-6">
      <StudentPageHeader
        title="Equation Practice"
        description="Balance chemical equations with instant checks and offline AI hints."
        crumbs={[
          { label: "Dashboard", href: "/student" },
          { label: "Practice" },
        ]}
        actions={
          <Link href="/student/lessons" className={studentSecondaryLinkClassName("h-9")}>
            Lessons
          </Link>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] px-3 py-2 text-sm font-semibold text-[var(--ink-700)]">
            Practice accuracy: {accuracyPreview}%
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            className="h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm sm:min-w-[230px] sm:w-auto"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Topic filter (optional)"
          />
          <Button onClick={startPractice} disabled={pending}>
            <PlayCircle className="h-4 w-4" />
            Start New Session
          </Button>
        </div>
      </Card>

      {current ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-500)]">
                Question {index + 1} of {equations.length}
              </p>
              <h3 className="text-lg font-bold text-[var(--ink-900)]">{current.title}</h3>
              <p className="mt-1 font-mono text-sm text-[var(--ink-800)]">{current.formula}</p>
            </div>
            <div className="flex items-center gap-2">
              <Chip tone={current.difficulty === "HARD" ? "danger" : current.difficulty === "MEDIUM" ? "warning" : "success"}>
                {current.difficulty}
              </Chip>
              <Chip tone="brand">{current.topic}</Chip>
            </div>
          </div>

          <div className="mt-4 h-2 rounded-full bg-[var(--line-200)]">
            <div className="h-full rounded-full bg-[var(--brand-500)]" style={{ width: `${progress}%` }} />
          </div>

          <label className="mt-4 block text-sm font-semibold text-[var(--ink-700)]">
            Your balanced equation answer
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 font-mono text-sm"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Type your balanced equation"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={submitAnswer} disabled={pending || !answer.trim() || Boolean(result)}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
              Submit
            </Button>
            <Button variant="secondary" onClick={finishPractice}>
              End Session
            </Button>
          </div>

          {result ? (
            <div
              className={`mt-4 rounded-xl border px-3 py-3 text-sm ${
                result.isCorrect
                  ? "border-[var(--success-500)] bg-[var(--success-100)] text-[var(--success-700)]"
                  : "border-[var(--warning-500)] bg-[var(--warning-100)] text-[var(--warning-700)]"
              }`}
            >
              <p className="font-semibold">{result.isCorrect ? "Correct" : "Needs Improvement"}</p>
              <p className="mt-1">{result.feedback}</p>
              {result.hint ? <p className="mt-1">Hint: {result.hint}</p> : null}
              <p className="mt-1 text-xs">Confidence: {Math.round(result.confidence * 100)}%</p>
              <div className="mt-3">
                <Button size="sm" onClick={nextQuestion}>
                  {index + 1 >= equations.length ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Finish Session
                    </>
                  ) : (
                    "Next Question"
                  )}
                </Button>
              </div>
            </div>
          ) : null}
        </Card>
      ) : (
        <Card className="text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-[var(--brand-600)]" />
          <p className="mt-2 text-sm text-[var(--ink-600)]">Start a session to practice equation balancing.</p>
        </Card>
      )}

      {error ? (
        <Card className="border-[var(--danger-500)] bg-[var(--danger-100)]">
          <p className="text-sm text-[var(--danger-700)]">{error}</p>
        </Card>
      ) : null}

      <Card>
        <h3 className="text-lg font-bold text-[var(--ink-900)]">Recent Practice Sessions</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--line-200)] text-left text-[var(--ink-500)]">
                <th className="px-2 py-2 font-semibold">Started</th>
                <th className="px-2 py-2 font-semibold">Topic</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold">Attempts</th>
                <th className="px-2 py-2 font-semibold">Correct</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSessions.map((session) => (
                <tr key={session.id} className="border-b border-[var(--line-100)]">
                  <td className="px-2 py-2">{formatDateTime(session.startedAt)}</td>
                  <td className="px-2 py-2">{session.topic ?? "General"}</td>
                  <td className="px-2 py-2">
                    <Chip tone={session.status === "COMPLETED" ? "success" : "warning"}>{session.status}</Chip>
                  </td>
                  <td className="px-2 py-2">{session.totalAttempts}</td>
                  <td className="px-2 py-2">{session.correctAttempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={safeSessionsPage}
          pageSize={SESSIONS_PAGE_SIZE}
          total={sessions.length}
          onPageChange={setSessionsPage}
        />
      </Card>
    </div>
  );
}
