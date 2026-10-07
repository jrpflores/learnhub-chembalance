export type Role = "ADMIN" | "TEACHER" | "STUDENT";
export type Gender = "MALE" | "FEMALE";

export type LessonStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type DifficultyLevel = "EASY" | "MEDIUM" | "HARD";
export type LessonProgressStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

export type QuestionType =
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "SHORT_ANSWER"
  | "MULTI_SELECT"
  | "MATCHING"
  | "FILL_BLANK"
  | "SEQUENCING"
  | "IMAGE_BASED";

export type QuizStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type FeedbackMode = "INSTANT" | "DELAYED";
export type ExplanationMode = "ALWAYS" | "AFTER_SUBMISSION" | "AFTER_PASS" | "NEVER";

export type AttemptStatus = "IN_PROGRESS" | "SUBMITTED" | "GRADED" | "ABANDONED";
export type AttemptOutcome = "PENDING" | "PASSED" | "FAILED";

export type BadgeCategory = "MILESTONE" | "PERFORMANCE" | "CONSISTENCY" | "EXPLORATION";
export type XpSource =
  | "QUIZ_COMPLETION"
  | "QUIZ_PASS"
  | "LESSON_COMPLETE"
  | "STREAK"
  | "ACHIEVEMENT"
  | "BONUS";

export type LeaderboardMode = "XP" | "QUIZ_COMPLETION" | "STREAK";
export type RecommendationType = "REVIEW_LESSON" | "RETRY_QUIZ" | "NEXT_LESSON" | "PRACTICE_TOPIC";
export type GradingJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export type SectionStatus = "ACTIVE" | "ARCHIVED";
export type PracticeSessionStatus = "IN_PROGRESS" | "COMPLETED" | "ABANDONED";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  gender: Gender | null;
};

export type DbUser = SessionUser & {
  passwordHash: string;
  streakDays: number;
  timezone: string | null;
  locale: string | null;
};

export type Pagination = {
  page?: number;
  pageSize?: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};
