import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { gradeShortAnswerWithOfflineAi } from "@/server/services/ai-short-answer-grading";
import { canStudentAccessLesson } from "@/server/queries/lessons";
import {
  canStudentAccessQuiz,
  canTeacherAccessQuiz,
  completeAiGradingJob,
  createAiGradingJob,
  createAttempt,
  createXpEvent,
  finalizeAttempt,
  getAttemptAiJobStats,
  getAttemptAnswers,
  getAttemptById,
  getNextAttemptNumber,
  getQuestionForGrading,
  getInProgressAttempt,
  getQuizAttemptUsage,
  getQuizById,
  getQuizForAttemptStart,
  getTeacherAttemptReviewById,
  markAttemptAnswerPendingAi,
  markAttemptAnswerGraded,
  markAttemptSubmitted,
  saveAttemptAnswer,
  summarizeAttemptAnswerScores,
  updateAttemptSummaryAfterTeacherReview,
} from "@/server/queries/quizzes";

function shuffleArray<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const SUBSCRIPT_DIGIT_MAP: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

const LEET_CHAR_MAP: Record<string, string> = {
  "@": "a",
  "€": "e",
  "$": "s",
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
};

const CONCEPT_ALIAS_GROUPS = [
  ["water", "h2o", "h₂o", "dihydrogen monoxide", "aqua"],
] as const;

const CONCEPT_ALIAS_MAP = (() => {
  const map = new Map<string, string>();
  for (const group of CONCEPT_ALIAS_GROUPS) {
    const canonical = group[0];
    for (const alias of group) {
      map.set(normalizeAnswer(alias), canonical);
    }
  }
  return map;
})();

function collapseSpacedLetters(value: string) {
  return value.replace(/\b(?:[a-z]\s+){2,}[a-z]\b/gi, (token) => token.replace(/\s+/g, ""));
}

function normalizeAnswer(value: string) {
  const replacedSubscripts = value.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (char) => SUBSCRIPT_DIGIT_MAP[char] ?? char);
  const normalizedUnicode = replacedSubscripts.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const collapsedLetters = collapseSpacedLetters(normalizedUnicode);
  const mappedLeet = collapsedLetters.replace(/[@€$0134]/g, (char) => LEET_CHAR_MAP[char] ?? char);
  return mappedLeet
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function conceptKey(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  const normalized = normalizeAnswer(value);
  return CONCEPT_ALIAS_MAP.get(normalized) ?? normalized;
}

function deterministicShortAnswerGrade(payload: {
  studentAnswer: string;
  referenceAnswer: string | null;
  keywords: string[];
  maxPoints: number;
  promptMarkdown?: string | null;
}) {
  const normalizedStudent = normalizeAnswer(payload.studentAnswer);
  const normalizedReference = payload.referenceAnswer ? normalizeAnswer(payload.referenceAnswer) : null;
  const studentConcept = conceptKey(payload.studentAnswer);
  const referenceConcept = conceptKey(payload.referenceAnswer);

  if (normalizedReference && (normalizedStudent === normalizedReference || (studentConcept && referenceConcept && studentConcept === referenceConcept))) {
    return {
      isFinal: true,
      isCorrect: true,
      earnedPoints: payload.maxPoints,
      feedback: "Exact match. Great job!",
    };
  }

  // If a reference answer exists but does not exactly match, escalate to AI-assisted validation.
  // This avoids false negatives for equivalent phrasing and concept-based responses.
  if (normalizedReference && normalizedStudent !== normalizedReference) {
    return { isFinal: false as const };
  }

  const keywords = payload.keywords.map((keyword) => normalizeAnswer(keyword)).filter(Boolean);
  if (keywords.length === 0) {
    return { isFinal: false as const };
  }

  let hits = 0;
  for (const keyword of keywords) {
    const keywordConcept = conceptKey(keyword);
    if (normalizedStudent.includes(keyword) || (keywordConcept && studentConcept && keywordConcept === studentConcept)) {
      hits += 1;
    }
  }

  const ratio = hits / keywords.length;
  if (ratio >= 0.9) {
    return {
      isFinal: true,
      isCorrect: true,
      earnedPoints: payload.maxPoints,
      feedback: "You covered the required concepts accurately.",
    };
  }

  if (ratio <= 0.15 && normalizedStudent.split(" ").length <= 4) {
    return {
      isFinal: true,
      isCorrect: false,
      earnedPoints: 0,
      feedback: "Please include the key concepts from the lesson and try again.",
    };
  }

  return { isFinal: false as const };
}

async function gradeShortAnswerWithAiMode(payload: {
  answerId: string;
  question: NonNullable<ReturnType<typeof getQuestionForGrading>>;
  studentAnswer: string;
  maxPoints: number;
  pendingFeedback: string;
  requestPayload: Record<string, unknown>;
}): Promise<
  { status: "queued" } | { status: "graded"; isCorrect: boolean; earnedPoints: number }
> {
  if (env.aiGradingMode === "queue") {
    createAiGradingJob({
      attemptAnswerId: payload.answerId,
      requestPayload: payload.requestPayload,
    });
    markAttemptAnswerPendingAi({
      answerId: payload.answerId,
      feedback: payload.pendingFeedback,
    });
    return { status: "queued" };
  }

  const applied = await gradeShortAnswerWithOfflineAi({
    prompt: payload.question.promptMarkdown,
    studentAnswer: payload.studentAnswer,
    referenceAnswer: payload.question.referenceAnswer,
    keywords: payload.question.gradingKeywords,
    maxPoints: payload.maxPoints,
    rubric: payload.question.explanationMarkdown,
    explanationMarkdown: payload.question.explanationMarkdown,
  });

  markAttemptAnswerGraded({
    answerId: payload.answerId,
    isCorrect: applied.isCorrect,
    earnedPoints: applied.earnedPoints,
    feedback: applied.feedback,
    gradedByAi: applied.gradedByAi,
  });

  createAiGradingJob({
    attemptAnswerId: payload.answerId,
    requestPayload: payload.requestPayload,
  });
  completeAiGradingJob({
    attemptAnswerId: payload.answerId,
    status: "COMPLETED",
    score: applied.normalizedScore,
    feedback: applied.feedback,
    responsePayload: applied.responsePayload,
  });

  return {
    status: "graded",
    isCorrect: applied.isCorrect,
    earnedPoints: applied.earnedPoints,
  };
}

function nowWithinWindow(availableFrom: string | null, availableUntil: string | null) {
  const now = Date.now();
  if (availableFrom && now < new Date(availableFrom).getTime()) {
    return false;
  }

  if (availableUntil && now > new Date(availableUntil).getTime()) {
    return false;
  }

  return true;
}

function calculateXp(scorePercent: number, outcome: "PASSED" | "FAILED") {
  let xp = 20; // completion reward
  if (outcome === "PASSED") {
    xp += 35;
  }

  if (scorePercent >= 95) {
    xp += 15;
  }

  return xp;
}

function applyPostGradingEffects(payload: {
  attemptId: string;
  studentId: string;
  quiz: {
    id: string;
    title: string;
    lessonId?: string | null;
    questions: { topic: string }[];
  };
  scorePercent: number;
  outcome: "PASSED" | "FAILED";
  xpAwarded: number;
}) {
  createXpEvent({
    userId: payload.studentId,
    source: "QUIZ_COMPLETION",
    amount: 20,
    description: `Completed ${payload.quiz.title}`,
    referenceId: payload.attemptId,
  });

  if (payload.outcome === "PASSED") {
    createXpEvent({
      userId: payload.studentId,
      source: "QUIZ_PASS",
      amount: payload.xpAwarded - 20,
      description: `Passed ${payload.quiz.title}`,
      referenceId: payload.attemptId,
    });
  }

  maybeAwardBadge(payload.studentId, "FIRST_QUIZ", "Completed first quiz attempt");

  if (payload.scorePercent >= 100) {
    maybeAwardBadge(payload.studentId, "PERFECT_SCORE", `Perfect score on ${payload.quiz.title}`);
  }

  const db = getDb();
  const sciencePassCount = db
    .prepare<{ total: number }>(
      `SELECT COUNT(*) as total
       FROM quiz_attempts qa
       JOIN quizzes q ON q.id = qa.quiz_id
       JOIN lessons l ON l.id = q.lesson_id
       WHERE qa.student_id = ? AND qa.outcome = 'PASSED' AND l.subject = 'Science'`,
    )
    .get(payload.studentId)?.total;

  if ((sciencePassCount ?? 0) >= 3) {
    maybeAwardBadge(payload.studentId, "SCIENCE_EXPLORER", "Completed three science quiz passes");
  }

  const streak = db.prepare<{ streak_days: number }>("SELECT streak_days FROM users WHERE id = ?").get(payload.studentId)
    ?.streak_days;

  if ((streak ?? 0) >= 3) {
    maybeAwardBadge(payload.studentId, "STREAK_3", "Reached a 3-day learning streak");
  }

  if (payload.outcome === "FAILED") {
    upsertRecommendation({
      studentId: payload.studentId,
      type: "REVIEW_LESSON",
      title: "Review lesson before retry",
      description: `Nice effort. Review the related lesson for ${payload.quiz.title}, then try again.`,
      lessonId: payload.quiz.lessonId ?? undefined,
      quizId: payload.quiz.id,
      topic: payload.quiz.questions[0]?.topic,
      priority: 10,
    });

    upsertRecommendation({
      studentId: payload.studentId,
      type: "RETRY_QUIZ",
      title: "Retry quiz with confidence",
      description: "You are getting closer. Revisit weak questions and take another attempt.",
      quizId: payload.quiz.id,
      priority: 8,
    });
    return;
  }

  // Only recommend lessons the student can open (section-targeted + enrolled).
  const nextLesson = db
    .prepare<{
      id: string;
      title: string;
    }>(
      `SELECT l.id, l.title
       FROM lessons l
       JOIN lesson_sections ls ON ls.lesson_id = l.id
       JOIN section_students ss ON ss.section_id = ls.section_id
       JOIN sections sec ON sec.id = ss.section_id
       WHERE l.status = 'PUBLISHED'
         AND ss.student_id = ?
         AND ss.is_active = 1
         AND sec.status = 'ACTIVE'
         AND l.id NOT IN (
           SELECT lesson_id FROM lesson_progress WHERE student_id = ? AND status = 'COMPLETED'
         )
       ORDER BY l.published_at DESC
       LIMIT 1`,
    )
    .get(payload.studentId, payload.studentId);

  if (nextLesson) {
    upsertRecommendation({
      studentId: payload.studentId,
      type: "NEXT_LESSON",
      title: `Recommended: ${nextLesson.title}`,
      description: "Great momentum. Continue with this next lesson.",
      lessonId: nextLesson.id,
      priority: 6,
    });
  }
}

function maybeAwardBadge(studentId: string, code: string, reason: string) {
  const db = getDb();

  const badge = db
    .prepare<{ id: string; xp_reward: number }>(
      "SELECT id, xp_reward FROM badges WHERE code = ? AND is_active = 1 LIMIT 1",
    )
    .get(code);

  if (!badge) {
    return;
  }

  const hasBadge = db
    .prepare<{ total: number }>("SELECT COUNT(*) as total FROM user_badges WHERE user_id = ? AND badge_id = ?")
    .get(studentId, badge.id)?.total;

  if ((hasBadge ?? 0) > 0) {
    return;
  }

  db.prepare(
    `INSERT INTO user_badges (id, user_id, badge_id, reason, awarded_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), studentId, badge.id, reason, new Date().toISOString());

  if (badge.xp_reward > 0) {
    createXpEvent({
      userId: studentId,
      source: "ACHIEVEMENT",
      amount: badge.xp_reward,
      description: `Badge unlocked: ${code}`,
      referenceId: badge.id,
    });
  }
}

function upsertRecommendation(payload: {
  studentId: string;
  type: "REVIEW_LESSON" | "RETRY_QUIZ" | "NEXT_LESSON" | "PRACTICE_TOPIC";
  title: string;
  description: string;
  lessonId?: string;
  quizId?: string;
  topic?: string;
  priority?: number;
}) {
  const db = getDb();

  const existing = db
    .prepare<{ id: string }>(
      `SELECT id
       FROM recommendations
       WHERE student_id = ? AND type = ? AND is_dismissed = 0
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .get(payload.studentId, payload.type);

  if (existing) {
    db.prepare(
      `UPDATE recommendations
       SET title = ?, description = ?, lesson_id = ?, quiz_id = ?, topic = ?, priority = ?, created_at = ?
       WHERE id = ?`,
    ).run(
      payload.title,
      payload.description,
      payload.lessonId ?? null,
      payload.quizId ?? null,
      payload.topic ?? null,
      payload.priority ?? 5,
      new Date().toISOString(),
      existing.id,
    );
    return;
  }

  db.prepare(
    `INSERT INTO recommendations (
      id, student_id, type, title, description, lesson_id, quiz_id, topic, priority, is_dismissed, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(
    crypto.randomUUID(),
    payload.studentId,
    payload.type,
    payload.title,
    payload.description,
    payload.lessonId ?? null,
    payload.quizId ?? null,
    payload.topic ?? null,
    payload.priority ?? 5,
    new Date().toISOString(),
  );
}

export function startQuizAttempt(studentId: string, quizId: string) {
  const quiz = getQuizForAttemptStart(studentId, quizId);

  if (!quiz || quiz.status !== "PUBLISHED") {
    throw new Error("Quiz is not available");
  }

  if (!nowWithinWindow(quiz.available_from, quiz.available_until)) {
    throw new Error("Quiz is not currently available");
  }

  // Resume an open attempt instead of burning another slot against max_attempts.
  const inProgress = getInProgressAttempt(quizId, studentId);
  const usage = getQuizAttemptUsage(quizId, studentId);
  if (!inProgress && !usage.canStartNew) {
    throw new Error("No attempts remaining for this quiz");
  }

  const attemptId =
    inProgress?.id ??
    createAttempt({
      quizId,
      studentId,
      attemptNumber: getNextAttemptNumber(quizId, studentId),
    });

  const fullQuiz = getQuizById(quizId);
  if (!fullQuiz) {
    throw new Error("Quiz not found after attempt creation");
  }

  // Keep existing answer order stable when resuming; only shuffle for brand-new attempts.
  const questions = inProgress
    ? fullQuiz.questions
    : fullQuiz.randomizeQuestions
      ? shuffleArray(fullQuiz.questions)
      : fullQuiz.questions;

  const preparedQuestions = questions.map((question, index) => ({
    ...question,
    position: index + 1,
    options:
      inProgress || !fullQuiz.randomizeOptions ? question.options : shuffleArray(question.options),
  }));

  return {
    attemptId,
    resumed: Boolean(inProgress),
    quiz: {
      id: fullQuiz.id,
      title: fullQuiz.title,
      description: fullQuiz.description,
      instructions: fullQuiz.instructions,
      passingScore: fullQuiz.passingScore,
      timeLimitSec: fullQuiz.timeLimitSec,
      feedbackMode: fullQuiz.feedbackMode,
      explanationMode: fullQuiz.explanationMode,
      questions: preparedQuestions.map((question) => ({
        quizQuestionId: question.quizQuestionId,
        questionId: question.questionId,
        position: question.position,
        points: question.points,
        type: question.type,
        topic: question.topic,
        promptMarkdown: question.promptMarkdown,
        hintMarkdown: question.hintMarkdown,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          value: option.value,
        })),
      })),
    },
  };
}

export async function submitQuizAttempt(payload: {
  attemptId: string;
  answers: {
    quizQuestionId: string;
    questionId: string;
    selectedOptionIds?: string[];
    answerText?: string;
  }[];
  timeSpentSec: number;
}) {
  const attempt = getAttemptById(payload.attemptId);

  if (!attempt) {
    throw new Error("Attempt not found");
  }

  if (attempt.status !== "IN_PROGRESS") {
    throw new Error("Attempt is not open");
  }

  const quiz = getQuizById(attempt.quizId);
  if (!quiz) {
    throw new Error("Quiz not found");
  }

  payload.answers.forEach((answer) => {
    const question = quiz.questions.find((item) => item.quizQuestionId === answer.quizQuestionId);
    if (!question) {
      return;
    }

    saveAttemptAnswer({
      attemptId: payload.attemptId,
      quizQuestionId: answer.quizQuestionId,
      questionId: answer.questionId,
      selectedOptionIds: answer.selectedOptionIds,
      answerText: answer.answerText,
      maxPoints: question.points,
      topicSnapshot: question.topic,
    });
  });

  const answerRows = getAttemptAnswers(payload.attemptId);

  let totalPossiblePoints = 0;
  let totalEarnedPoints = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let queuedAiAnswerCount = 0;

  for (const answer of answerRows) {
    const question = getQuestionForGrading(answer.questionId);
    if (!question) {
      continue;
    }

    totalPossiblePoints += answer.maxPoints;

    if (question.type === "MULTIPLE_CHOICE" || question.type === "TRUE_FALSE" || question.type === "MULTI_SELECT") {
      const selected = [...(answer.selectedOptionIds ?? [])].sort();
      const correct = [...question.correctOptionIds].sort();
      const isCorrect = selected.length > 0 && selected.join("|") === correct.join("|");
      const earnedPoints = isCorrect ? answer.maxPoints : 0;

      markAttemptAnswerGraded({
        answerId: answer.id,
        isCorrect,
        earnedPoints,
        gradedByAi: false,
      });

      totalEarnedPoints += earnedPoints;
      if (isCorrect) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
      continue;
    }

    if (question.type === "SHORT_ANSWER") {
      const studentAnswer = (answer.answerText ?? "").trim();
      if (!studentAnswer) {
        markAttemptAnswerGraded({
          answerId: answer.id,
          isCorrect: false,
          earnedPoints: 0,
          feedback: "No answer submitted.",
          gradedByAi: false,
        });
        wrongCount += 1;
        continue;
      }

      const deterministicGrade = deterministicShortAnswerGrade({
        studentAnswer,
        referenceAnswer: question.referenceAnswer,
        keywords: question.gradingKeywords,
        maxPoints: answer.maxPoints,
        promptMarkdown: question.promptMarkdown,
      });
      const hasReferenceAnswer = Boolean(question.referenceAnswer?.trim());

      if (deterministicGrade.isFinal) {
        markAttemptAnswerGraded({
          answerId: answer.id,
          isCorrect: deterministicGrade.isCorrect,
          earnedPoints: deterministicGrade.earnedPoints,
          feedback: deterministicGrade.feedback,
          gradedByAi: false,
        });

        totalEarnedPoints += deterministicGrade.earnedPoints;
        if (deterministicGrade.isCorrect) {
          correctCount += 1;
        } else {
          wrongCount += 1;
        }
        continue;
      }

      // Requirement: only call AI when reference answer does not match.
      if (!hasReferenceAnswer) {
        markAttemptAnswerGraded({
          answerId: answer.id,
          isCorrect: false,
          earnedPoints: 0,
          feedback: "Answer checked with deterministic rules only. Teacher review may be required.",
          gradedByAi: false,
        });
        wrongCount += 1;
        continue;
      }

      const aiMode = await gradeShortAnswerWithAiMode({
        answerId: answer.id,
        question,
        studentAnswer,
        maxPoints: answer.maxPoints,
        pendingFeedback: "Submitted. Offline AI is checking this short answer.",
        requestPayload: {
          questionId: question.id,
          promptMarkdown: question.promptMarkdown,
          explanationMarkdown: question.explanationMarkdown,
          referenceAnswer: question.referenceAnswer,
          keywords: question.gradingKeywords,
        },
      });

      if (aiMode.status === "queued") {
        queuedAiAnswerCount += 1;
        continue;
      }

      totalEarnedPoints += aiMode.earnedPoints;
      const isCorrect = aiMode.isCorrect;
      if (isCorrect) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
      continue;
    }

    // Unsupported question types are marked incomplete for now.
    markAttemptAnswerGraded({
      answerId: answer.id,
      isCorrect: false,
      earnedPoints: 0,
      feedback: "Unsupported question type for automatic grading.",
      gradedByAi: false,
    });
    wrongCount += 1;
  }

  if (queuedAiAnswerCount > 0) {
    markAttemptSubmitted({
      attemptId: payload.attemptId,
      timeSpentSec: Math.max(1, payload.timeSpentSec),
    });
    return getAttemptById(payload.attemptId);
  }

  const scorePercent = totalPossiblePoints > 0 ? Number(((totalEarnedPoints / totalPossiblePoints) * 100).toFixed(1)) : 0;
  const outcome = scorePercent >= quiz.passingScore ? "PASSED" : "FAILED";
  const xpAwarded = calculateXp(scorePercent, outcome);

  finalizeAttempt({
    attemptId: payload.attemptId,
    scorePercent,
    correctCount,
    wrongCount,
    outcome,
    xpAwarded,
    timeSpentSec: Math.max(1, payload.timeSpentSec),
  });

  applyPostGradingEffects({
    attemptId: payload.attemptId,
    studentId: attempt.studentId,
    quiz: {
      id: quiz.id,
      title: quiz.title,
      lessonId: quiz.lessonId,
      questions: quiz.questions.map((question) => ({ topic: question.topic })),
    },
    scorePercent,
    outcome,
    xpAwarded,
  });

  return getAttemptById(payload.attemptId);
}

export function finalizeSubmittedAttemptIfReady(attemptId: string) {
  const attempt = getAttemptById(attemptId);
  if (!attempt) {
    return null;
  }

  if (attempt.status === "GRADED") {
    return attempt;
  }

  if (attempt.status !== "SUBMITTED") {
    return attempt;
  }

  const aiJobs = getAttemptAiJobStats(attemptId);
  if (aiJobs.pending > 0 || aiJobs.processing > 0) {
    return attempt;
  }
  const isRecheckFlow = Boolean(attempt.gradedAt);

  const quiz = getQuizById(attempt.quizId);
  if (!quiz) {
    throw new Error("Quiz not found while finalizing submission.");
  }

  const summary = summarizeAttemptAnswerScores(attemptId);
  const totalPossiblePoints = summary.totalPossible;
  const totalEarnedPoints = summary.totalEarned;
  const correctCount = summary.correctCount;
  const wrongCount = summary.wrongCount + summary.unansweredCount;
  const scorePercent = totalPossiblePoints > 0 ? Number(((totalEarnedPoints / totalPossiblePoints) * 100).toFixed(1)) : 0;
  const outcome = scorePercent >= quiz.passingScore ? "PASSED" : "FAILED";
  const xpAwarded = calculateXp(scorePercent, outcome);

  finalizeAttempt({
    attemptId,
    scorePercent,
    correctCount,
    wrongCount,
    outcome,
    xpAwarded,
    timeSpentSec: Math.max(1, attempt.timeSpentSec ?? 1),
  });

  if (!isRecheckFlow) {
    applyPostGradingEffects({
      attemptId,
      studentId: attempt.studentId,
      quiz: {
        id: quiz.id,
        title: quiz.title,
        lessonId: quiz.lessonId,
        questions: quiz.questions.map((question) => ({ topic: question.topic })),
      },
      scorePercent,
      outcome,
      xpAwarded,
    });
  }

  return getAttemptById(attemptId);
}

export async function recheckShortAnswersByStudent(payload: {
  studentId: string;
  attemptId: string;
}) {
  const attempt = getAttemptById(payload.attemptId);
  if (!attempt || attempt.studentId !== payload.studentId) {
    throw new Error("Attempt not found.");
  }
  if (attempt.status !== "GRADED" && attempt.status !== "SUBMITTED") {
    throw new Error("Attempt is not ready for short-answer recheck.");
  }

  const shortAnswers = attempt.answers.filter((answer) => answer.type === "SHORT_ANSWER");
  if (shortAnswers.length === 0) {
    throw new Error("This quiz has no short-answer questions to recheck.");
  }

  const aiJobs = getAttemptAiJobStats(payload.attemptId);
  if (aiJobs.pending > 0 || aiJobs.processing > 0) {
    throw new Error("Short-answer recheck is already in progress.");
  }

  let processedCount = 0;
  let queuedCount = 0;

  for (const answer of shortAnswers) {
    const question = getQuestionForGrading(answer.questionId);
    if (!question || question.type !== "SHORT_ANSWER") {
      continue;
    }

    const studentAnswer = (answer.answerText ?? "").trim();
    if (!studentAnswer) {
      markAttemptAnswerGraded({
        answerId: answer.id,
        isCorrect: false,
        earnedPoints: 0,
        feedback: "No answer submitted.",
        gradedByAi: false,
      });
      continue;
    }

    const aiMode = await gradeShortAnswerWithAiMode({
      answerId: answer.id,
      question,
      studentAnswer,
      maxPoints: answer.maxPoints,
      pendingFeedback: "Recheck requested. Offline AI is re-evaluating this short answer.",
      requestPayload: {
        questionId: question.id,
        promptMarkdown: question.promptMarkdown,
        explanationMarkdown: question.explanationMarkdown,
        referenceAnswer: question.referenceAnswer,
        keywords: question.gradingKeywords,
        recheckRequestedByStudent: payload.studentId,
      },
    });
    processedCount += 1;
    if (aiMode.status === "queued") {
      queuedCount += 1;
    }
  }

  if (processedCount === 0) {
    throw new Error("No short-answer responses available for recheck.");
  }

  if (queuedCount === 0) {
    finalizeSubmittedAttemptIfReady(payload.attemptId);
  } else {
    markAttemptSubmitted({
      attemptId: payload.attemptId,
      timeSpentSec: Math.max(1, attempt.timeSpentSec ?? 1),
    });
  }

  const refreshed = getAttemptById(payload.attemptId);
  if (!refreshed || refreshed.studentId !== payload.studentId) {
    throw new Error("Unable to load updated attempt.");
  }

  return refreshed;
}

export function reviewAttemptAnswerByTeacher(payload: {
  teacherId: string;
  attemptId: string;
  answerId: string;
  markCorrect: boolean;
  feedback?: string;
}) {
  const before = getTeacherAttemptReviewById(payload.teacherId, payload.attemptId);
  if (!before) {
    throw new Error("Attempt not found.");
  }
  if (before.status !== "GRADED" && before.status !== "SUBMITTED") {
    throw new Error("Attempt is not ready for teacher review.");
  }

  const targetAnswer = before.answers.find((answer) => answer.id === payload.answerId);
  if (!targetAnswer) {
    throw new Error("Answer not found in this attempt.");
  }

  const feedback =
    payload.feedback?.trim() ||
    (payload.markCorrect ? "Marked correct by teacher review." : "Marked incorrect by teacher review.");

  markAttemptAnswerGraded({
    answerId: payload.answerId,
    isCorrect: payload.markCorrect,
    earnedPoints: payload.markCorrect ? targetAnswer.maxPoints : 0,
    feedback,
    gradedByAi: false,
  });

  const afterMarking = getTeacherAttemptReviewById(payload.teacherId, payload.attemptId);
  if (!afterMarking) {
    throw new Error("Attempt not found after review update.");
  }

  const quiz = getQuizById(afterMarking.quizId);
  if (!quiz || !canTeacherAccessQuiz(payload.teacherId, quiz.id)) {
    throw new Error("Forbidden");
  }

  const totalPossiblePoints = afterMarking.answers.reduce((sum, answer) => sum + answer.maxPoints, 0);
  const totalEarnedPoints = afterMarking.answers.reduce(
    (sum, answer) => sum + clamp(answer.earnedPoints ?? 0, 0, answer.maxPoints),
    0,
  );
  const correctCount = afterMarking.answers.filter((answer) => answer.isCorrect === true).length;
  const wrongCount = afterMarking.answers.length - correctCount;
  const scorePercent =
    totalPossiblePoints > 0 ? Number(((totalEarnedPoints / totalPossiblePoints) * 100).toFixed(1)) : 0;
  const outcome = scorePercent >= quiz.passingScore ? "PASSED" : "FAILED";

  updateAttemptSummaryAfterTeacherReview({
    attemptId: payload.attemptId,
    scorePercent,
    correctCount,
    wrongCount,
    outcome,
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO activity_logs (
      id, user_id, role_snapshot, action, entity_type, entity_id, metadata_json, created_at
    ) VALUES (?, ?, 'TEACHER', ?, ?, ?, ?, ?)`,
  ).run(
    crypto.randomUUID(),
    payload.teacherId,
    "teacher_answer_override",
    "attempt_answer",
    payload.answerId,
    JSON.stringify({
      attemptId: payload.attemptId,
      previousIsCorrect: targetAnswer.isCorrect,
      nextIsCorrect: payload.markCorrect,
      previousEarnedPoints: targetAnswer.earnedPoints,
      nextEarnedPoints: payload.markCorrect ? targetAnswer.maxPoints : 0,
      feedback,
    }),
    new Date().toISOString(),
  );

  const reviewedAttempt = getTeacherAttemptReviewById(payload.teacherId, payload.attemptId);
  if (!reviewedAttempt) {
    throw new Error("Unable to load updated attempt.");
  }

  return reviewedAttempt;
}

export function getWeakTopicsForStudent(studentId: string) {
  const db = getDb();

  return db
    .prepare<
      {
        topic: string;
        misses: number;
      }[]
    >(
      `SELECT
         COALESCE(aa.topic_snapshot, qb.topic) AS topic,
         SUM(CASE WHEN aa.is_correct = 0 THEN 1 ELSE 0 END) AS misses
       FROM attempt_answers aa
       JOIN quiz_attempts qa ON qa.id = aa.attempt_id
       JOIN question_bank_entries qb ON qb.id = aa.question_id
       WHERE qa.student_id = ?
       GROUP BY topic
       HAVING misses > 0
       ORDER BY misses DESC`,
    )
    .all(studentId);
}

export function getStudentRecommendations(studentId: string) {
  const db = getDb();
  return db
    .prepare<
      {
        id: string;
        type: string;
        title: string;
        description: string;
        lesson_id: string | null;
        quiz_id: string | null;
        topic: string | null;
        priority: number;
      }[]
    >(
      `SELECT id, type, title, description, lesson_id, quiz_id, topic, priority
       FROM recommendations
       WHERE student_id = ? AND is_dismissed = 0
       ORDER BY priority DESC, created_at DESC
       LIMIT 12`,
    )
    .all(studentId)
    .map((row) => {
      // Drop stale targets from prior section enrollments so CTAs never 404.
      const lessonId =
        row.lesson_id && canStudentAccessLesson(studentId, row.lesson_id) ? row.lesson_id : undefined;
      const quizId = row.quiz_id && canStudentAccessQuiz(studentId, row.quiz_id) ? row.quiz_id : undefined;

      return {
        id: row.id,
        type: row.type,
        title: row.title,
        description: row.description,
        lessonId,
        quizId,
        topic: row.topic,
        priority: row.priority,
        hasAction: Boolean(lessonId || quizId),
      };
    })
    .filter((row) => row.hasAction)
    .slice(0, 5)
    .map(({ hasAction: _hasAction, ...row }) => row);
}

export function dismissRecommendation(studentId: string, recommendationId: string) {
  const db = getDb();

  db.prepare(
    `UPDATE recommendations
     SET is_dismissed = 1
     WHERE id = ? AND student_id = ?`,
  ).run(recommendationId, studentId);
}
