import { z } from "zod";

const appMediaUrlSchema = z.string().regex(/^\/[^\s]*$/, {
  message: "Invalid URL",
});

const externalHttpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("http://") || value.startsWith("https://"), {
    message: "Invalid URL",
  });

const mediaUrlSchema = z.union([externalHttpUrlSchema, appMediaUrlSchema, z.literal("")]).optional();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(120),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]),
  password: z.string().min(8).max(128),
});

export const updateUserSchema = z.object({
  id: z.string(),
  fullName: z.string().min(2).max(120).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "TEACHER", "STUDENT"]).optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  userId: z.string(),
  newPassword: z.string().min(8).max(128),
});

export const changeOwnPasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }

    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must be different from your current password",
      });
    }
  });

export const lessonSchema = z.object({
  title: z.string().min(3).max(180),
  shortDescription: z.string().min(10).max(400),
  contentMarkdown: z.string().min(20),
  coverImageUrl: mediaUrlSchema,
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).nullable().optional(),
  subject: z.string().min(2).max(100),
  topic: z.string().min(2).max(100),
  unit: z.string().max(120).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  estimatedMinutes: z.number().int().positive().max(300).optional(),
  tags: z.array(z.string().min(1).max(32)).optional(),
});

export const enqueueLessonGenerationSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().min(1),
  promptText: z.string().min(20).max(2400),
  preferredTitle: z.string().min(3).max(180).optional(),
  preferredTopic: z.string().min(2).max(100).optional(),
  preferredDifficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  preferredEstimatedMinutes: z.number().int().min(5).max(300).optional(),
});

export const lessonPracticePromptSchema = z.object({
  lessonId: z.string().min(1),
  conversationId: z.string().min(1).max(120).optional(),
  message: z.string().min(2).max(1200),
});

export const lessonPracticeStopSchema = z.object({
  requestId: z.string().min(1).max(120),
  lessonId: z.string().min(1),
});

export const lessonPracticeConversationSchema = z.object({
  lessonId: z.string().min(1),
});

export const lessonPracticeStartSessionSchema = z.object({
  lessonId: z.string().min(1),
});

export const lessonPracticeConversationSelectSchema = z.object({
  lessonId: z.string().min(1),
  conversationId: z.string().min(1).max(120),
});

export const questionOptionSchema = z.object({
  label: z.string().min(1).max(16),
  value: z.string().min(1).max(240),
  isCorrect: z.boolean(),
});

export const questionSchema = z.object({
  subject: z.string().min(2).max(100),
  topic: z.string().min(2).max(100),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  type: z.enum([
    "MULTIPLE_CHOICE",
    "TRUE_FALSE",
    "SHORT_ANSWER",
    "MULTI_SELECT",
    "MATCHING",
    "FILL_BLANK",
    "SEQUENCING",
    "IMAGE_BASED",
  ]),
  promptMarkdown: z.string().min(3),
  explanationMarkdown: z.string().optional(),
  hintMarkdown: z.string().optional(),
  referenceAnswer: z.string().optional(),
  gradingKeywords: z.array(z.string().min(1).max(80)).optional(),
  imageUrl: mediaUrlSchema,
  options: z.array(questionOptionSchema).optional(),
});

export const quizSchema = z.object({
  lessonId: z.string().optional(),
  title: z.string().min(3).max(180),
  description: z.string().min(6).max(500),
  instructions: z.string().max(1000).optional(),
  passingScore: z.number().int().min(1).max(100),
  // 0 means "no time limit"
  timeLimitSec: z.number().int().min(0).max(7200).optional(),
  // 0 means "unlimited attempts"
  maxAttempts: z.number().int().min(0).max(20),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  availableFrom: z.string().datetime().optional(),
  availableUntil: z.string().datetime().optional(),
  randomizeQuestions: z.boolean().optional(),
  randomizeOptions: z.boolean().optional(),
  feedbackMode: z.enum(["INSTANT", "DELAYED"]).optional(),
  explanationMode: z.enum(["ALWAYS", "AFTER_SUBMISSION", "AFTER_PASS", "NEVER"]).optional(),
  showAnswerKey: z.boolean().optional(),
  questionAssignments: z
    .array(
      z.object({
        questionId: z.string(),
        position: z.number().int().positive(),
        points: z.number().positive().max(10),
        isRequired: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const saveAttemptAnswerSchema = z.object({
  attemptId: z.string(),
  quizQuestionId: z.string(),
  questionId: z.string(),
  selectedOptionIds: z.array(z.string()).optional(),
  answerText: z.string().optional(),
});

export const submitAttemptSchema = z.object({
  attemptId: z.string(),
  answers: z.array(
    z.object({
      quizQuestionId: z.string(),
      questionId: z.string(),
      selectedOptionIds: z.array(z.string()).optional(),
      answerText: z.string().optional(),
    }),
  ),
  timeSpentSec: z.number().int().positive().max(60 * 60 * 6),
});

export const settingSchema = z.object({
  key: z.string().min(3),
  value: z.unknown(),
  description: z.string().optional(),
});

const optionalBrandingUrlSchema = z.union([externalHttpUrlSchema, appMediaUrlSchema, z.literal("")]).optional();

export const platformBrandingValueSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    appTitle: z.string().trim().min(3).max(120).optional(),
    logoUrl: optionalBrandingUrlSchema,
    faviconUrl: optionalBrandingUrlSchema,
    accentColor: z
      .string()
      .trim()
      .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, { message: "Invalid color value" })
      .optional(),
  })
  .passthrough();

export const subjectSchema = z.object({
  name: z.string().min(2).max(120),
  code: z
    .string()
    .min(2)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
});

export const sectionSchema = z.object({
  name: z.string().min(2).max(120),
  gradeLevel: z.string().min(1).max(32),
  schoolYear: z.string().min(4).max(32),
  subjectId: z.string().optional(),
  subjectIds: z.array(z.string()).optional(),
  subjectTeacherAssignments: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        teacherId: z.string().min(1),
      }),
    )
    .optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  description: z.string().max(500).optional(),
  studentIds: z.array(z.string()).optional(),
});

export const sectionStudentUpdateSchema = z.object({
  sectionId: z.string(),
  studentIds: z.array(z.string().min(1)),
});

export const lessonSectionAssignSchema = z.object({
  lessonId: z.string(),
  sectionIds: z.array(z.string()),
});

export const quizSectionAssignSchema = z.object({
  quizId: z.string(),
  sectionIds: z.array(z.string()),
});

export const chemicalEquationSchema = z.object({
  title: z.string().min(2).max(140),
  formula: z.string().min(3).max(300),
  balancedFormula: z.string().max(300).optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  topic: z.string().min(2).max(120),
  subjectId: z.string().optional(),
  hints: z.array(z.string().min(1).max(240)).optional(),
  explanationMarkdown: z.string().max(2000).optional(),
  tags: z.array(z.string().min(1).max(40)).optional(),
  isArchived: z.boolean().optional(),
});

export const equationPracticeStartSchema = z.object({
  topic: z.string().max(120).optional(),
  sectionId: z.string().optional(),
});

export const equationPracticeAttemptSchema = z.object({
  sessionId: z.string(),
  equationId: z.string(),
  studentAnswer: z.string().min(1).max(400),
});
