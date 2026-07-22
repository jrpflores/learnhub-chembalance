# ChemBalance UML Class Diagram (Current Implementation)

This diagram is aligned to the current ChemBalance implementation and replaces the outdated model that used `Assignment` and modeled `AI` as an entity.

- `Assignment` is removed.
- `AI` is represented as services/infrastructure, not a core domain class.
- `ChemicalEquation` is represented as a question/grading concern (via question type + validator), not a top-level aggregate.

```mermaid
classDiagram
direction LR

class User {
  +id: string
  +email: string
  +fullName: string
  +role: Role
  +isActive: boolean
}

class Admin
class Teacher
class Student
User <|-- Admin
User <|-- Teacher
User <|-- Student

class TeacherStudentAssignment {
  +id: string
  +teacherId: string
  +studentId: string
  +isActive: boolean
  +assignedAt: datetime
}
Teacher "1" --> "0..*" TeacherStudentAssignment
Student "1" --> "0..*" TeacherStudentAssignment

class Lesson {
  +id: string
  +teacherId: string
  +title: string
  +subject: string
  +topic: string
  +status: LessonStatus
}
Teacher "1" --> "0..*" Lesson : creates

class Quiz {
  +id: string
  +lessonId: string?
  +teacherId: string
  +title: string
  +status: QuizStatus
  +passingScore: int
  +timeLimitSec: int
  +maxAttempts: int
}
Lesson "1" --> "0..*" Quiz : contains
Teacher "1" --> "0..*" Quiz : owns

class QuestionBankEntry {
  +id: string
  +teacherId: string
  +type: QuestionType
  +promptMarkdown: text
  +referenceAnswer: text?
  +gradingKeywordsJson: json?
}
Teacher "1" --> "0..*" QuestionBankEntry : authors

class QuestionOption {
  +id: string
  +questionId: string
  +label: string
  +value: string
  +isCorrect: boolean
}
QuestionBankEntry "1" --> "0..*" QuestionOption

class QuizQuestion {
  +id: string
  +quizId: string
  +questionId: string
  +position: int
  +points: float
  +isRequired: boolean
}
Quiz "1" --> "1..*" QuizQuestion
QuestionBankEntry "1" --> "0..*" QuizQuestion

class QuizAttempt {
  +id: string
  +quizId: string
  +studentId: string
  +attemptNumber: int
  +status: AttemptStatus
  +outcome: AttemptOutcome
  +scorePercent: float?
  +correctCount: int?
  +wrongCount: int?
}
Student "1" --> "0..*" QuizAttempt : submits
Quiz "1" --> "0..*" QuizAttempt

class AttemptAnswer {
  +id: string
  +attemptId: string
  +quizQuestionId: string
  +questionId: string
  +answerText: text?
  +selectedOptionIdsJson: json?
  +isCorrect: boolean?
  +earnedPoints: float?
  +feedback: text?
  +gradedByAi: boolean
}
QuizAttempt "1" --> "1..*" AttemptAnswer
QuizQuestion "1" --> "0..*" AttemptAnswer
QuestionBankEntry "1" --> "0..*" AttemptAnswer

class AIGradingJob {
  +id: string
  +attemptAnswerId: string
  +status: JobStatus
  +score: float?
  +feedback: text?
  +errorMessage: text?
}
AttemptAnswer "1" --> "0..1" AIGradingJob

class QuizGenerationJob {
  +id: string
  +teacherId: string
  +lessonId: string
  +quizId: string
  +status: JobStatus
  +questionCount: int
  +questionTypesJson: json
}
Teacher "1" --> "0..*" QuizGenerationJob
Lesson "1" --> "0..*" QuizGenerationJob
Quiz "1" --> "0..*" QuizGenerationJob

class Recommendation {
  +id: string
  +studentId: string
  +type: RecommendationType
  +title: string
  +description: string
  +lessonId: string?
  +quizId: string?
}
Student "1" --> "0..*" Recommendation

class ActivityLog {
  +id: string
  +userId: string?
  +action: string
  +entityType: string
  +entityId: string?
  +metadataJson: json?
}
User "1" --> "0..*" ActivityLog

class SystemSetting {
  +id: string
  +key: string
  +valueJson: json
  +updatedById: string?
}
Admin "1" --> "0..*" SystemSetting : manages

class MediaAsset {
  +path: string
  +contentType: string
  +sizeBytes: int
}
Lesson "0..1" --> "0..*" MediaAsset : cover/content media
QuestionBankEntry "0..1" --> "0..*" MediaAsset : image/media refs

%% Service layer (not persisted entities)
class AIService {
  <<service>>
  +generateQuestionsFromLesson()
  +gradeShortAnswer()
}
class DeterministicValidator {
  <<service>>
  +gradeObjective()
  +validateChemMathSyntax()
}
class TeacherReviewService {
  <<service>>
  +overrideAnswer()
  +recalculateAttempt()
}
class QuizGenerationWorker {
  <<worker>>
  +processGenerationQueue()
}

AIService ..> AIGradingJob
AIService ..> QuizGenerationJob
DeterministicValidator ..> AttemptAnswer
TeacherReviewService ..> AttemptAnswer
TeacherReviewService ..> QuizAttempt
QuizGenerationWorker ..> QuizGenerationJob
```

