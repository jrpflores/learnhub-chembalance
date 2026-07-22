import bcrypt from "bcryptjs";
import { id, isoDate, openDatabase, readSchemaSql } from "./shared";

type Insertable = Record<string, unknown>;

const db = openDatabase();

function insert(table: string, payload: Insertable) {
  const keys = Object.keys(payload);
  const columns = keys.join(", ");
  const placeholders = keys.map((key) => `@${key}`).join(", ");
  db.prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`).run(payload);
}

function resetTables() {
  db.exec(`
    DELETE FROM equation_practice_attempts;
    DELETE FROM equation_practice_sessions;
    DELETE FROM chemical_equations;
    DELETE FROM quiz_sections;
    DELETE FROM lesson_sections;
    DELETE FROM section_students;
    DELETE FROM section_subject_teachers;
    DELETE FROM section_teachers;
    DELETE FROM section_subjects;
    DELETE FROM sections;
    DELETE FROM teacher_subjects;
    DELETE FROM subjects;
    DELETE FROM quiz_generation_jobs;
    DELETE FROM ai_grading_jobs;
    DELETE FROM activity_logs;
    DELETE FROM system_settings;
    DELETE FROM recommendations;
    DELETE FROM leaderboard_snapshots;
    DELETE FROM xp_events;
    DELETE FROM user_badges;
    DELETE FROM badges;
    DELETE FROM attempt_answers;
    DELETE FROM quiz_attempts;
    DELETE FROM quiz_questions;
    DELETE FROM quizzes;
    DELETE FROM question_options;
    DELETE FROM question_bank_entries;
    DELETE FROM lesson_views;
    DELETE FROM lesson_progress;
    DELETE FROM lessons;
    DELETE FROM teacher_student_assignments;
    DELETE FROM users;
  `);
}

async function seed() {
  db.exec(readSchemaSql());

  const adminPassword = await bcrypt.hash("Admin123!", 12);
  const teacherPassword = await bcrypt.hash("Teacher123!", 12);
  const studentPassword = await bcrypt.hash("Student123!", 12);

  const adminId = id("usr");
  const teacherId = id("usr");
  const studentIds = Array.from({ length: 5 }, () => id("usr"));

  const lessonIds = [id("les"), id("les"), id("les")];
  const quizIds = [id("qz"), id("qz"), id("qz")];
  const subjectIds = {
    science: id("sub"),
    math: id("sub"),
    english: id("sub"),
  };
  const sectionIds = [id("sec"), id("sec")];
  const equationIds = [id("eq"), id("eq"), id("eq"), id("eq")];

  const tx = db.transaction(() => {
    resetTables();

    insert("users", {
      id: adminId,
      email: "admin@learnhub.local",
      password_hash: adminPassword,
      full_name: "Alya Reyes",
      role: "ADMIN",
      is_active: 1,
      timezone: "Asia/Manila",
      locale: "en-PH",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });

    insert("users", {
      id: teacherId,
      email: "teacher@learnhub.local",
      password_hash: teacherPassword,
      full_name: "Marco Santos",
      role: "TEACHER",
      is_active: 1,
      timezone: "Asia/Manila",
      locale: "en-PH",
      created_by_id: adminId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_login_at: new Date().toISOString(),
    });

    const studentNames = [
      "Jasmin Cruz",
      "Kyle Ramos",
      "Liam Dela Cruz",
      "Nica Flores",
      "Paolo Tan",
    ];

    studentIds.forEach((studentId, index) => {
      insert("users", {
        id: studentId,
        email: `student${index + 1}@learnhub.local`,
        password_hash: studentPassword,
        full_name: studentNames[index],
        role: "STUDENT",
        is_active: 1,
        timezone: "Asia/Manila",
        locale: "en-PH",
        streak_days: index % 3 === 0 ? 3 : 1,
        created_by_id: teacherId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_login_at: new Date().toISOString(),
      });

      insert("teacher_student_assignments", {
        id: id("asg"),
        teacher_id: teacherId,
        student_id: studentId,
        assigned_by_id: adminId,
        is_active: 1,
        assigned_at: isoDate(-14),
      });
    });

    insert("subjects", {
      id: subjectIds.science,
      name: "Science",
      code: "SCI",
      description: "Integrated science curriculum for junior high school.",
      is_active: 1,
      created_by_id: adminId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insert("subjects", {
      id: subjectIds.math,
      name: "Mathematics",
      code: "MATH",
      description: "Numeracy, algebra, and quantitative reasoning.",
      is_active: 1,
      created_by_id: adminId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insert("subjects", {
      id: subjectIds.english,
      name: "English",
      code: "ENG",
      description: "Reading comprehension and communication.",
      is_active: 1,
      created_by_id: adminId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insert("teacher_subjects", {
      id: id("tsub"),
      teacher_id: teacherId,
      subject_id: subjectIds.science,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-20),
    });

    insert("teacher_subjects", {
      id: id("tsub"),
      teacher_id: teacherId,
      subject_id: subjectIds.math,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-20),
    });

    const badgeIds = {
      firstQuiz: id("bdg"),
      perfectScore: id("bdg"),
      scienceExplorer: id("bdg"),
      streak3: id("bdg"),
    };

    insert("badges", {
      id: badgeIds.firstQuiz,
      code: "FIRST_QUIZ",
      title: "First Quiz Completed",
      description: "Completed your first quiz attempt.",
      icon: "spark",
      category: "MILESTONE",
      xp_reward: 20,
      is_active: 1,
    });

    insert("badges", {
      id: badgeIds.perfectScore,
      code: "PERFECT_SCORE",
      title: "Perfect Score",
      description: "Scored 100% on a quiz.",
      icon: "target",
      category: "PERFORMANCE",
      xp_reward: 50,
      is_active: 1,
    });

    insert("badges", {
      id: badgeIds.scienceExplorer,
      code: "SCIENCE_EXPLORER",
      title: "Science Explorer",
      description: "Completed three science quizzes.",
      icon: "flask",
      category: "EXPLORATION",
      xp_reward: 40,
      is_active: 1,
    });

    insert("badges", {
      id: badgeIds.streak3,
      code: "STREAK_3",
      title: "3-Day Streak",
      description: "Maintained a learning streak for 3 days.",
      icon: "flame",
      category: "CONSISTENCY",
      xp_reward: 35,
      is_active: 1,
    });

    const lessons = [
      {
        id: lessonIds[0],
        title: "Balancing Chemical Equations",
        short_description:
          "Learn how atoms are conserved and how to balance equations step by step.",
        content_markdown: `# Balancing Chemical Equations\n\nAn equation is balanced when each atom count is equal on both sides.\n\nExample:\n\n- Unbalanced: \`H2 + O2 -> H2O\`\n- Balanced: \`2H2 + O2 -> 2H2O\`\n\n## Strategy\n\n1. Balance metals first\n2. Then non-metals\n3. Hydrogen and oxygen last\n\n> Keep the smallest whole-number coefficients.`,
        cover_image_url:
          "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80",
        difficulty: "MEDIUM",
        subject: "Science",
        topic: "Chemistry",
        unit: "Matter and Reactions",
        status: "PUBLISHED",
        estimated_minutes: 20,
        tags_json: JSON.stringify(["chemistry", "equations", "stoichiometry"]),
        published_at: isoDate(-8),
      },
      {
        id: lessonIds[1],
        title: "Scientific Notation and Exponents",
        short_description: "Represent very large and very small numbers with confidence.",
        content_markdown: `# Scientific Notation\n\nScientific notation format: \`a x 10^n\` where \`1 <= a < 10\`.\n\nExamples:\n\n- \`4,500,000 = 4.5 x 10^6\`\n- \`0.00032 = 3.2 x 10^-4\`\n\nIf decimal moves left, exponent is positive. If it moves right, exponent is negative.`,
        cover_image_url:
          "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=1200&q=80",
        difficulty: "EASY",
        subject: "Mathematics",
        topic: "Exponents",
        unit: "Numbers",
        status: "PUBLISHED",
        estimated_minutes: 15,
        tags_json: JSON.stringify(["math", "notation", "powers"]),
        published_at: isoDate(-6),
      },
      {
        id: lessonIds[2],
        title: "Forces and Motion Basics",
        short_description: "Explore Newton's laws, balanced forces, and acceleration in daily life.",
        content_markdown: `# Forces and Motion\n\nForce is a push or pull.\n\n## Newton's Second Law\n\n\`F = m * a\`\n\nWhere \`F\` is force, \`m\` is mass, and \`a\` is acceleration.\n\nTry identifying forces in cycling, basketball, and elevators.`,
        cover_image_url:
          "https://images.unsplash.com/photo-1535909339361-9b3f84f8f75d?auto=format&fit=crop&w=1200&q=80",
        difficulty: "MEDIUM",
        subject: "Science",
        topic: "Physics",
        unit: "Motion",
        status: "PUBLISHED",
        estimated_minutes: 18,
        tags_json: JSON.stringify(["physics", "forces", "motion"]),
        published_at: isoDate(-3),
      },
    ];

    lessons.forEach((lesson) => {
      insert("lessons", {
        ...lesson,
        teacher_id: teacherId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    const questionRows = [
      {
        id: id("q"),
        subject: "Science",
        topic: "Chemistry",
        difficulty: "MEDIUM",
        type: "MULTIPLE_CHOICE",
        prompt_markdown: "Which equation is correctly balanced?",
        explanation_markdown: "A balanced equation has equal atom counts for every element.",
        options: [
          { label: "A", value: "H2 + O2 -> H2O", isCorrect: 0 },
          { label: "B", value: "2H2 + O2 -> 2H2O", isCorrect: 1 },
          { label: "C", value: "H2 + 2O2 -> H2O", isCorrect: 0 },
          { label: "D", value: "4H + O2 -> H2O", isCorrect: 0 },
        ],
      },
      {
        id: id("q"),
        subject: "Science",
        topic: "Chemistry",
        difficulty: "EASY",
        type: "TRUE_FALSE",
        prompt_markdown: "True or False: Coefficients change the formula of a compound.",
        explanation_markdown:
          "Coefficients change quantity of molecules, not the formula of the compound itself.",
        options: [
          { label: "True", value: "true", isCorrect: 0 },
          { label: "False", value: "false", isCorrect: 1 },
        ],
      },
      {
        id: id("q"),
        subject: "Science",
        topic: "Chemistry",
        difficulty: "MEDIUM",
        type: "SHORT_ANSWER",
        prompt_markdown: "Balance this equation and explain briefly: Fe + O2 -> Fe2O3",
        explanation_markdown: "Balanced form is 4Fe + 3O2 -> 2Fe2O3",
        reference_answer: "4Fe + 3O2 -> 2Fe2O3",
        grading_keywords_json: JSON.stringify(["4Fe", "3O2", "2Fe2O3", "balanced"]),
        options: [],
      },
      {
        id: id("q"),
        subject: "Mathematics",
        topic: "Exponents",
        difficulty: "EASY",
        type: "MULTIPLE_CHOICE",
        prompt_markdown: "What is 4,500,000 in scientific notation?",
        explanation_markdown: "Move decimal 6 places left: 4.5 x 10^6",
        options: [
          { label: "A", value: "4.5 x 10^6", isCorrect: 1 },
          { label: "B", value: "45 x 10^5", isCorrect: 0 },
          { label: "C", value: "0.45 x 10^7", isCorrect: 0 },
          { label: "D", value: "4.5 x 10^-6", isCorrect: 0 },
        ],
      },
      {
        id: id("q"),
        subject: "Mathematics",
        topic: "Exponents",
        difficulty: "EASY",
        type: "TRUE_FALSE",
        prompt_markdown: "True or False: 3.2 x 10^-4 equals 0.00032",
        explanation_markdown: "10^-4 means move decimal 4 places to the left.",
        options: [
          { label: "True", value: "true", isCorrect: 1 },
          { label: "False", value: "false", isCorrect: 0 },
        ],
      },
      {
        id: id("q"),
        subject: "Science",
        topic: "Physics",
        difficulty: "MEDIUM",
        type: "MULTIPLE_CHOICE",
        prompt_markdown: "If mass is constant, increasing force will:",
        explanation_markdown: "From F = m*a, larger force means larger acceleration.",
        options: [
          { label: "A", value: "Decrease acceleration", isCorrect: 0 },
          { label: "B", value: "Increase acceleration", isCorrect: 1 },
          { label: "C", value: "Keep acceleration unchanged", isCorrect: 0 },
          { label: "D", value: "Always reverse direction", isCorrect: 0 },
        ],
      },
      {
        id: id("q"),
        subject: "Science",
        topic: "Physics",
        difficulty: "MEDIUM",
        type: "SHORT_ANSWER",
        prompt_markdown: "Using F = m*a, calculate force if m=3 kg and a=2 m/s^2.",
        explanation_markdown: "F = 3 x 2 = 6 N",
        reference_answer: "6 N",
        grading_keywords_json: JSON.stringify(["6", "N", "newton"]),
        options: [],
      },
    ];

    questionRows.forEach((question) => {
      insert("question_bank_entries", {
        id: question.id,
        teacher_id: teacherId,
        subject: question.subject,
        topic: question.topic,
        difficulty: question.difficulty,
        type: question.type,
        prompt_markdown: question.prompt_markdown,
        explanation_markdown: question.explanation_markdown,
        reference_answer: question.reference_answer ?? null,
        grading_keywords_json: question.grading_keywords_json ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      question.options.forEach((option, position) => {
        insert("question_options", {
          id: id("opt"),
          question_id: question.id,
          label: option.label,
          value: option.value,
          is_correct: option.isCorrect,
          position,
          created_at: new Date().toISOString(),
        });
      });
    });

    const chemistryQuestionIds = questionRows.filter((q) => q.topic === "Chemistry").map((q) => q.id);
    const mathQuestionIds = questionRows.filter((q) => q.topic === "Exponents").map((q) => q.id);
    const physicsQuestionIds = questionRows.filter((q) => q.topic === "Physics").map((q) => q.id);

    insert("quizzes", {
      id: quizIds[0],
      teacher_id: teacherId,
      lesson_id: lessonIds[0],
      title: "Chemistry Equation Challenge",
      description: "Check your balancing equation skills.",
      instructions: "Answer one question at a time. Review before final submission.",
      passing_score: 70,
      time_limit_sec: 900,
      max_attempts: 3,
      status: "PUBLISHED",
      available_from: isoDate(-5),
      available_until: isoDate(14),
      randomize_questions: 1,
      randomize_options: 1,
      feedback_mode: "INSTANT",
      explanation_mode: "AFTER_SUBMISSION",
      published_at: isoDate(-5),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insert("quizzes", {
      id: quizIds[1],
      teacher_id: teacherId,
      lesson_id: lessonIds[1],
      title: "Scientific Notation Sprint",
      description: "Practice conversion with scientific notation.",
      instructions: "Read carefully and answer quickly.",
      passing_score: 75,
      time_limit_sec: 600,
      max_attempts: 2,
      status: "PUBLISHED",
      available_from: isoDate(-4),
      available_until: isoDate(14),
      randomize_questions: 0,
      randomize_options: 1,
      feedback_mode: "DELAYED",
      explanation_mode: "AFTER_PASS",
      published_at: isoDate(-4),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    insert("quizzes", {
      id: quizIds[2],
      teacher_id: teacherId,
      lesson_id: lessonIds[2],
      title: "Forces and Motion Checkpoint",
      description: "Apply core formulas and force concepts.",
      instructions: "Use your scratch notes for calculations.",
      passing_score: 70,
      time_limit_sec: 720,
      max_attempts: 3,
      status: "PUBLISHED",
      available_from: isoDate(-2),
      available_until: isoDate(14),
      randomize_questions: 0,
      randomize_options: 0,
      feedback_mode: "INSTANT",
      explanation_mode: "AFTER_SUBMISSION",
      published_at: isoDate(-2),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const addQuizQuestions = (quizId: string, questionIds: string[]) => {
      questionIds.forEach((questionId, index) => {
        const questionType = questionRows.find((row) => row.id === questionId)?.type;
        insert("quiz_questions", {
          id: id("qq"),
          quiz_id: quizId,
          question_id: questionId,
          position: index + 1,
          points: questionType === "SHORT_ANSWER" ? 2 : 1,
          is_required: 1,
        });
      });
    };

    addQuizQuestions(quizIds[0], chemistryQuestionIds);
    addQuizQuestions(quizIds[1], mathQuestionIds);
    addQuizQuestions(quizIds[2], physicsQuestionIds);

    insert("sections", {
      id: sectionIds[0],
      teacher_id: teacherId,
      subject_id: subjectIds.science,
      name: "Grade 8 - Newton",
      grade_level: "Grade 8",
      school_year: "2025-2026",
      status: "ACTIVE",
      description: "Science-focused section with chemistry and physics emphasis.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    insert("section_subjects", {
      id: id("ssub"),
      section_id: sectionIds[0],
      subject_id: subjectIds.science,
      assigned_by_id: adminId,
      created_at: isoDate(-14),
    });
    insert("section_teachers", {
      id: id("sectch"),
      section_id: sectionIds[0],
      teacher_id: teacherId,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-14),
      ended_at: null,
    });
    insert("section_subject_teachers", {
      id: id("sstch"),
      section_id: sectionIds[0],
      subject_id: subjectIds.science,
      teacher_id: teacherId,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-14),
      ended_at: null,
    });

    insert("sections", {
      id: sectionIds[1],
      teacher_id: teacherId,
      subject_id: subjectIds.math,
      name: "Grade 7 - Exponents",
      grade_level: "Grade 7",
      school_year: "2025-2026",
      status: "ACTIVE",
      description: "Math section focused on scientific notation and powers.",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    insert("section_subjects", {
      id: id("ssub"),
      section_id: sectionIds[1],
      subject_id: subjectIds.math,
      assigned_by_id: adminId,
      created_at: isoDate(-13),
    });
    insert("section_teachers", {
      id: id("sectch"),
      section_id: sectionIds[1],
      teacher_id: teacherId,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-13),
      ended_at: null,
    });
    insert("section_subject_teachers", {
      id: id("sstch"),
      section_id: sectionIds[1],
      subject_id: subjectIds.math,
      teacher_id: teacherId,
      assigned_by_id: adminId,
      is_active: 1,
      assigned_at: isoDate(-13),
      ended_at: null,
    });

    studentIds.slice(0, 3).forEach((studentId) => {
      insert("section_students", {
        id: id("secstu"),
        section_id: sectionIds[0],
        student_id: studentId,
        assigned_by_id: teacherId,
        is_active: 1,
        enrolled_at: isoDate(-12),
      });
    });

    studentIds.slice(2).forEach((studentId) => {
      insert("section_students", {
        id: id("secstu"),
        section_id: sectionIds[1],
        student_id: studentId,
        assigned_by_id: teacherId,
        is_active: 1,
        enrolled_at: isoDate(-11),
      });
    });

    insert("lesson_sections", {
      id: id("ls"),
      lesson_id: lessonIds[0],
      section_id: sectionIds[0],
      assigned_by_id: teacherId,
      created_at: isoDate(-10),
    });
    insert("lesson_sections", {
      id: id("ls"),
      lesson_id: lessonIds[2],
      section_id: sectionIds[0],
      assigned_by_id: teacherId,
      created_at: isoDate(-9),
    });
    insert("lesson_sections", {
      id: id("ls"),
      lesson_id: lessonIds[1],
      section_id: sectionIds[1],
      assigned_by_id: teacherId,
      created_at: isoDate(-8),
    });

    insert("quiz_sections", {
      id: id("qs"),
      quiz_id: quizIds[0],
      section_id: sectionIds[0],
      assigned_by_id: teacherId,
      created_at: isoDate(-8),
    });
    insert("quiz_sections", {
      id: id("qs"),
      quiz_id: quizIds[2],
      section_id: sectionIds[0],
      assigned_by_id: teacherId,
      created_at: isoDate(-7),
    });
    insert("quiz_sections", {
      id: id("qs"),
      quiz_id: quizIds[1],
      section_id: sectionIds[1],
      assigned_by_id: teacherId,
      created_at: isoDate(-7),
    });

    const chemistryQuizQuestions = db
      .prepare("SELECT id, question_id FROM quiz_questions WHERE quiz_id = ? ORDER BY position")
      .all(quizIds[0]) as { id: string; question_id: string }[];

    const mathQuizQuestions = db
      .prepare("SELECT id, question_id FROM quiz_questions WHERE quiz_id = ? ORDER BY position")
      .all(quizIds[1]) as { id: string; question_id: string }[];

    const firstAttemptId = id("att");
    const secondAttemptId = id("att");
    const thirdAttemptId = id("att");

    insert("quiz_attempts", {
      id: firstAttemptId,
      quiz_id: quizIds[0],
      student_id: studentIds[0],
      attempt_number: 1,
      status: "GRADED",
      outcome: "PASSED",
      started_at: isoDate(-2),
      submitted_at: isoDate(-2),
      graded_at: isoDate(-2),
      time_spent_sec: 1520,
      score_percent: 88,
      correct_count: 2,
      wrong_count: 1,
      pass_threshold: 70,
      xp_awarded: 55,
      created_at: isoDate(-2),
      updated_at: isoDate(-2),
    });

    insert("quiz_attempts", {
      id: secondAttemptId,
      quiz_id: quizIds[0],
      student_id: studentIds[1],
      attempt_number: 1,
      status: "GRADED",
      outcome: "FAILED",
      started_at: isoDate(-1),
      submitted_at: isoDate(-1),
      graded_at: isoDate(-1),
      time_spent_sec: 1140,
      score_percent: 52,
      correct_count: 1,
      wrong_count: 2,
      pass_threshold: 70,
      xp_awarded: 20,
      created_at: isoDate(-1),
      updated_at: isoDate(-1),
    });

    insert("quiz_attempts", {
      id: thirdAttemptId,
      quiz_id: quizIds[1],
      student_id: studentIds[0],
      attempt_number: 1,
      status: "GRADED",
      outcome: "PASSED",
      started_at: isoDate(-1),
      submitted_at: isoDate(-1),
      graded_at: isoDate(-1),
      time_spent_sec: 620,
      score_percent: 100,
      correct_count: 2,
      wrong_count: 0,
      pass_threshold: 75,
      xp_awarded: 70,
      created_at: isoDate(-1),
      updated_at: isoDate(-1),
    });

    const questionTypeMap = new Map(questionRows.map((row) => [row.id, row.type]));

    const pickOptionId = (questionId: string, correct: boolean) => {
      const row = db
        .prepare(
          `SELECT id FROM question_options WHERE question_id = ? AND is_correct = ? ORDER BY position LIMIT 1`,
        )
        .get(questionId, correct ? 1 : 0) as { id: string } | undefined;
      return row?.id;
    };

    chemistryQuizQuestions.forEach((quizQuestion, index) => {
      const questionType = questionTypeMap.get(quizQuestion.question_id);
      const isShort = questionType === "SHORT_ANSWER";

      if (isShort) {
        insert("attempt_answers", {
          id: id("ans"),
          attempt_id: firstAttemptId,
          quiz_question_id: quizQuestion.id,
          question_id: quizQuestion.question_id,
          answer_text: "4Fe + 3O2 -> 2Fe2O3, balanced by matching Fe and O atoms.",
          is_correct: 1,
          earned_points: 2,
          max_points: 2,
          feedback: "Great balancing logic and correct coefficients.",
          graded_by_ai: 1,
          topic_snapshot: "Chemistry",
          created_at: isoDate(-2),
          updated_at: isoDate(-2),
        });
      } else {
        const correctOptionId = pickOptionId(quizQuestion.question_id, true);
        if (!correctOptionId) return;
        insert("attempt_answers", {
          id: id("ans"),
          attempt_id: firstAttemptId,
          quiz_question_id: quizQuestion.id,
          question_id: quizQuestion.question_id,
          selected_option_ids_json: JSON.stringify([correctOptionId]),
          is_correct: 1,
          earned_points: 1,
          max_points: 1,
          topic_snapshot: "Chemistry",
          created_at: isoDate(-2),
          updated_at: isoDate(-2),
        });
      }

      if (isShort) {
        const answerId = id("ans");
        insert("attempt_answers", {
          id: answerId,
          attempt_id: secondAttemptId,
          quiz_question_id: quizQuestion.id,
          question_id: quizQuestion.question_id,
          answer_text: "Fe + O2 -> Fe2O3 needs balancing.",
          is_correct: 0,
          earned_points: 0.5,
          max_points: 2,
          feedback: "Partial concept understanding; coefficients are incomplete.",
          graded_by_ai: 1,
          topic_snapshot: "Chemistry",
          created_at: isoDate(-1),
          updated_at: isoDate(-1),
        });

        insert("ai_grading_jobs", {
          id: id("grd"),
          attempt_answer_id: answerId,
          status: "COMPLETED",
          score: 0.25,
          feedback: "Identified idea but balancing coefficients were incorrect.",
          request_payload_json: JSON.stringify({ rubric: "equation_accuracy + reasoning" }),
          response_payload_json: JSON.stringify({ confidence: 0.81 }),
          queued_at: isoDate(-1),
          started_at: isoDate(-1),
          completed_at: isoDate(-1),
        });
      } else {
        const optionId =
          index === 0
            ? pickOptionId(quizQuestion.question_id, true)
            : pickOptionId(quizQuestion.question_id, false);

        insert("attempt_answers", {
          id: id("ans"),
          attempt_id: secondAttemptId,
          quiz_question_id: quizQuestion.id,
          question_id: quizQuestion.question_id,
          selected_option_ids_json: optionId ? JSON.stringify([optionId]) : null,
          is_correct: index === 0 ? 1 : 0,
          earned_points: index === 0 ? 1 : 0,
          max_points: 1,
          topic_snapshot: "Chemistry",
          created_at: isoDate(-1),
          updated_at: isoDate(-1),
        });
      }
    });

    mathQuizQuestions.forEach((quizQuestion) => {
      const correctOptionId = pickOptionId(quizQuestion.question_id, true);
      insert("attempt_answers", {
        id: id("ans"),
        attempt_id: thirdAttemptId,
        quiz_question_id: quizQuestion.id,
        question_id: quizQuestion.question_id,
        selected_option_ids_json: correctOptionId ? JSON.stringify([correctOptionId]) : null,
        is_correct: 1,
        earned_points: 1,
        max_points: 1,
        topic_snapshot: "Exponents",
        created_at: isoDate(-1),
        updated_at: isoDate(-1),
      });
    });

    const equations = [
      {
        id: equationIds[0],
        subject_id: subjectIds.science,
        teacher_id: teacherId,
        title: "Hydrogen Combustion",
        formula: "H2 + O2 -> H2O",
        balanced_formula: "2H2 + O2 -> 2H2O",
        difficulty: "EASY",
        topic: "Balancing Equations",
        hints_json: JSON.stringify(["Balance hydrogen first", "Adjust oxygen last"]),
        explanation_markdown: "Use coefficients only. Keep formulas unchanged.",
        tags_json: JSON.stringify(["chemistry", "combustion"]),
        is_archived: 0,
      },
      {
        id: equationIds[1],
        subject_id: subjectIds.science,
        teacher_id: teacherId,
        title: "Iron Oxide Formation",
        formula: "Fe + O2 -> Fe2O3",
        balanced_formula: "4Fe + 3O2 -> 2Fe2O3",
        difficulty: "MEDIUM",
        topic: "Balancing Equations",
        hints_json: JSON.stringify(["Balance iron first", "Use smallest whole numbers"]),
        explanation_markdown: "Equalize both Fe and O atom counts using integer coefficients.",
        tags_json: JSON.stringify(["chemistry", "oxidation"]),
        is_archived: 0,
      },
      {
        id: equationIds[2],
        subject_id: subjectIds.science,
        teacher_id: null,
        title: "Sodium Chloride Synthesis",
        formula: "Na + Cl2 -> NaCl",
        balanced_formula: "2Na + Cl2 -> 2NaCl",
        difficulty: "EASY",
        topic: "Balancing Equations",
        hints_json: JSON.stringify(["Chlorine is diatomic"]),
        explanation_markdown: "Two sodium atoms are needed per chlorine molecule.",
        tags_json: JSON.stringify(["chemistry", "ionic"]),
        is_archived: 0,
      },
      {
        id: equationIds[3],
        subject_id: subjectIds.science,
        teacher_id: null,
        title: "Methane Combustion",
        formula: "CH4 + O2 -> CO2 + H2O",
        balanced_formula: "CH4 + 2O2 -> CO2 + 2H2O",
        difficulty: "MEDIUM",
        topic: "Combustion",
        hints_json: JSON.stringify(["Carbon first", "Hydrogen second", "Oxygen last"]),
        explanation_markdown: "Balance C and H, then use O to complete coefficients.",
        tags_json: JSON.stringify(["chemistry", "combustion"]),
        is_archived: 0,
      },
    ];

    equations.forEach((equation) => {
      insert("chemical_equations", {
        ...equation,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    const practiceSessionId = id("ps");
    insert("equation_practice_sessions", {
      id: practiceSessionId,
      student_id: studentIds[0],
      section_id: sectionIds[0],
      topic: "Balancing Equations",
      status: "COMPLETED",
      started_at: isoDate(-1),
      completed_at: isoDate(-1),
      created_at: isoDate(-1),
      updated_at: isoDate(-1),
    });

    insert("equation_practice_attempts", {
      id: id("pa"),
      session_id: practiceSessionId,
      equation_id: equationIds[0],
      student_answer: "2H2 + O2 -> 2H2O",
      normalized_answer: "2H2+O2->2H2O",
      is_correct: 1,
      confidence: 0.98,
      feedback: "Correct. Atoms are balanced.",
      hint: null,
      ai_provider: "deterministic",
      grading_metadata_json: JSON.stringify({ match_type: "exact" }),
      created_at: isoDate(-1),
    });

    insert("equation_practice_attempts", {
      id: id("pa"),
      session_id: practiceSessionId,
      equation_id: equationIds[1],
      student_answer: "2Fe + O2 -> Fe2O3",
      normalized_answer: "2Fe+O2->Fe2O3",
      is_correct: 0,
      confidence: 0.9,
      feedback: "Not balanced yet. Recount oxygen atoms.",
      hint: "Try making oxygen count equal on both sides.",
      ai_provider: "deterministic",
      grading_metadata_json: JSON.stringify({ match_type: "not_balanced" }),
      created_at: isoDate(-1),
    });

    const lessonProgressRows = [
      {
        id: id("lp"),
        lesson_id: lessonIds[0],
        student_id: studentIds[0],
        status: "COMPLETED",
        completion_percent: 100,
        time_spent_sec: 1320,
        last_viewed_at: isoDate(-2),
        completed_at: isoDate(-2),
      },
      {
        id: id("lp"),
        lesson_id: lessonIds[1],
        student_id: studentIds[0],
        status: "IN_PROGRESS",
        completion_percent: 72,
        time_spent_sec: 700,
        last_viewed_at: isoDate(-1),
      },
      {
        id: id("lp"),
        lesson_id: lessonIds[0],
        student_id: studentIds[1],
        status: "IN_PROGRESS",
        completion_percent: 55,
        time_spent_sec: 680,
        last_viewed_at: isoDate(-1),
      },
      {
        id: id("lp"),
        lesson_id: lessonIds[2],
        student_id: studentIds[2],
        status: "COMPLETED",
        completion_percent: 100,
        time_spent_sec: 980,
        last_viewed_at: isoDate(-1),
        completed_at: isoDate(-1),
      },
    ];

    lessonProgressRows.forEach((row) => {
      insert("lesson_progress", {
        ...row,
        created_at: row.last_viewed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    const xpRows = [
      {
        id: id("xp"),
        user_id: studentIds[0],
        source: "QUIZ_COMPLETION",
        amount: 20,
        description: "Completed Chemistry Equation Challenge",
        reference_id: firstAttemptId,
      },
      {
        id: id("xp"),
        user_id: studentIds[0],
        source: "QUIZ_PASS",
        amount: 35,
        description: "Passed Chemistry Equation Challenge",
        reference_id: firstAttemptId,
      },
      {
        id: id("xp"),
        user_id: studentIds[0],
        source: "QUIZ_PASS",
        amount: 70,
        description: "Perfect score on Scientific Notation Sprint",
        reference_id: thirdAttemptId,
      },
      {
        id: id("xp"),
        user_id: studentIds[1],
        source: "QUIZ_COMPLETION",
        amount: 20,
        description: "Completed Chemistry Equation Challenge",
        reference_id: secondAttemptId,
      },
      {
        id: id("xp"),
        user_id: studentIds[0],
        source: "STREAK",
        amount: 15,
        description: "3-day activity streak",
        reference_id: "streak-3",
      },
    ];

    xpRows.forEach((row) => insert("xp_events", row));

    insert("user_badges", {
      id: id("ub"),
      user_id: studentIds[0],
      badge_id: badgeIds.firstQuiz,
      reason: "First completed quiz",
      awarded_at: isoDate(-2),
    });

    insert("user_badges", {
      id: id("ub"),
      user_id: studentIds[0],
      badge_id: badgeIds.perfectScore,
      reason: "Perfect score on Scientific Notation Sprint",
      awarded_at: isoDate(-1),
    });

    insert("user_badges", {
      id: id("ub"),
      user_id: studentIds[0],
      badge_id: badgeIds.streak3,
      reason: "Maintained a 3-day learning streak",
      awarded_at: isoDate(-1),
    });

    insert("user_badges", {
      id: id("ub"),
      user_id: studentIds[1],
      badge_id: badgeIds.firstQuiz,
      reason: "First completed quiz",
      awarded_at: isoDate(-1),
    });

    insert("recommendations", {
      id: id("rec"),
      student_id: studentIds[1],
      type: "REVIEW_LESSON",
      title: "Review balancing equations",
      description:
        "You missed key coefficients. Review the lesson, then retry the chemistry quiz.",
      lesson_id: lessonIds[0],
      quiz_id: quizIds[0],
      topic: "Chemistry",
      priority: 10,
      is_dismissed: 0,
    });

    insert("recommendations", {
      id: id("rec"),
      student_id: studentIds[0],
      type: "NEXT_LESSON",
      title: "Try Forces and Motion",
      description: "You are doing well in science. Move to the next physics lesson.",
      lesson_id: lessonIds[2],
      quiz_id: quizIds[2],
      topic: "Physics",
      priority: 7,
      is_dismissed: 0,
    });

    const settings = [
      {
        key: "platform.branding",
        value: {
          name: "ChemBalance",
          appTitle: "ChemBalance LMS",
          logoUrl: "/branding/logo.png",
          faviconUrl: "/branding/logo.png",
          accentColor: "#0ea5a0",
        },
        description: "Platform name and branding",
      },
      {
        key: "quiz.defaults",
        value: {
          defaultPassingScore: 70,
          defaultMaxAttempts: 3,
          defaultTimeLimitSec: 900,
        },
        description: "Quiz default configuration",
      },
      {
        key: "features.gamification",
        value: {
          xpEnabled: true,
          badgesEnabled: true,
          streakEnabled: true,
          leaderboardEnabled: true,
        },
        description: "Gamification feature toggles",
      },
      {
        key: "leaderboard.settings",
        value: {
          mode: "XP",
          topOnly: true,
          topCount: 10,
          anonymizeLowerRanks: true,
        },
        description: "Leaderboard behavior settings",
      },
      {
        key: "student.messages",
        value: {
          dashboardGreeting: "Welcome back. Ready to level up your learning?",
          encouragement: "Great progress, keep going!",
          retry: "Nice effort! Review and try again.",
        },
        description: "Student-facing customized messages",
      },
      {
        key: "system.locale",
        value: {
          timezone: "Asia/Manila",
          locale: "en-PH",
        },
        description: "Default locale configuration",
      },
      {
        key: "grading.offlineAi",
        value: {
          enabled: true,
          endpoint: "http://offline-grader:8001",
          timeoutMs: 5000,
          executionMode: "sync",
          fallbackBehavior: "manual_review",
          queueEnabled: true,
          highConfidenceThreshold: 0.9,
          mediumConfidenceThreshold: 0.7,
          perSubject: {
            science: true,
            mathematics: true,
            english: true,
          },
        },
        description: "Offline AI grading subsystem settings",
      },
      {
        key: "features.sections",
        value: {
          enabled: true,
          sectionAnalyticsEnabled: true,
        },
        description: "Section and class grouping feature toggles",
      },
      {
        key: "features.equationPractice",
        value: {
          enabled: true,
          maxQuestionsPerSession: 10,
          aiHintsEnabled: true,
        },
        description: "Chemical equation practice and AI feedback settings",
      },
    ];

    settings.forEach((setting) => {
      insert("system_settings", {
        id: id("set"),
        key: setting.key,
        value_json: JSON.stringify(setting.value),
        description: setting.description,
        updated_by_id: adminId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    const activities = [
      {
        user_id: adminId,
        role_snapshot: "ADMIN",
        action: "USER_CREATE",
        entity_type: "USER",
        entity_id: teacherId,
        metadata: { role: "TEACHER" },
      },
      {
        user_id: teacherId,
        role_snapshot: "TEACHER",
        action: "LESSON_PUBLISH",
        entity_type: "LESSON",
        entity_id: lessonIds[0],
      },
      {
        user_id: studentIds[0],
        role_snapshot: "STUDENT",
        action: "QUIZ_SUBMIT",
        entity_type: "QUIZ_ATTEMPT",
        entity_id: firstAttemptId,
      },
      {
        user_id: studentIds[1],
        role_snapshot: "STUDENT",
        action: "QUIZ_SUBMIT",
        entity_type: "QUIZ_ATTEMPT",
        entity_id: secondAttemptId,
      },
    ];

    activities.forEach((activity) => {
      insert("activity_logs", {
        id: id("log"),
        user_id: activity.user_id,
        role_snapshot: activity.role_snapshot,
        action: activity.action,
        entity_type: activity.entity_type,
        entity_id: activity.entity_id,
        metadata_json: activity.metadata ? JSON.stringify(activity.metadata) : null,
      });
    });

    insert("leaderboard_snapshots", {
      id: id("lb"),
      mode: "XP",
      scope: "GLOBAL",
      period_start: isoDate(-7),
      period_end: isoDate(0),
      entries_json: JSON.stringify([
        { userId: studentIds[0], rank: 1, score: 140 },
        { userId: studentIds[1], rank: 2, score: 20 },
      ]),
      created_at: new Date().toISOString(),
    });
  });

  tx();

  console.log("Demo data seeded.");
  console.log("\nDemo accounts:");
  console.log("Admin   : admin@learnhub.local / Admin123!");
  console.log("Teacher : teacher@learnhub.local / Teacher123!");
  console.log("Student : student1@learnhub.local / Student123!");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
