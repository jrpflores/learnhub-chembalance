import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { enqueueLessonGenerationSchema } from "@/lib/validators";
import {
  createLessonGenerationJob,
  listLessonGenerationJobsByContext,
} from "@/server/queries/lesson-generation-jobs";
import { getTeacherSubjectContext } from "@/server/queries/teacher-subject-context";

const listSchema = z.object({
  subjectId: z.string().min(1),
  sectionId: z.string().min(1),
  limit: z.number().int().min(1).max(30).optional(),
});

function canTeacherAccessSubjectSectionContext(payload: {
  teacherId: string;
  subjectId: string;
  sectionId: string;
}) {
  const context = getTeacherSubjectContext(payload.teacherId, payload.subjectId);
  if (!context) {
    return false;
  }
  return context.sections.some((section) => section.id === payload.sectionId);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const parsed = listSchema.safeParse({
    subjectId: url.searchParams.get("subjectId"),
    sectionId: url.searchParams.get("sectionId"),
    limit: (() => {
      const raw = url.searchParams.get("limit");
      if (!raw) {
        return undefined;
      }
      const value = Number.parseInt(raw, 10);
      return Number.isFinite(value) ? value : undefined;
    })(),
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (
    !canTeacherAccessSubjectSectionContext({
      teacherId: auth.user.id,
      subjectId: parsed.data.subjectId,
      sectionId: parsed.data.sectionId,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobs = listLessonGenerationJobsByContext({
    teacherId: auth.user.id,
    subjectId: parsed.data.subjectId,
    sectionId: parsed.data.sectionId,
    limit: parsed.data.limit,
  });

  return NextResponse.json({ jobs });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as Record<string, unknown>;
  const normalizedBody = {
    ...body,
    promptText: typeof body.promptText === "string" ? body.promptText.trim() : body.promptText,
    preferredTitle: typeof body.preferredTitle === "string" ? body.preferredTitle.trim() || undefined : undefined,
    preferredTopic: typeof body.preferredTopic === "string" ? body.preferredTopic.trim() || undefined : undefined,
    preferredDifficulty:
      typeof body.preferredDifficulty === "string" ? body.preferredDifficulty.trim().toUpperCase() : undefined,
    preferredEstimatedMinutes: (() => {
      if (body.preferredEstimatedMinutes === null || body.preferredEstimatedMinutes === undefined) {
        return undefined;
      }
      const value =
        typeof body.preferredEstimatedMinutes === "number"
          ? body.preferredEstimatedMinutes
          : Number.parseInt(String(body.preferredEstimatedMinutes), 10);
      return Number.isFinite(value) ? value : undefined;
    })(),
  };
  const parsed = enqueueLessonGenerationSchema.safeParse(normalizedBody);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (
    !canTeacherAccessSubjectSectionContext({
      teacherId: auth.user.id,
      subjectId: parsed.data.subjectId,
      sectionId: parsed.data.sectionId,
    })
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const jobId = createLessonGenerationJob({
    teacherId: auth.user.id,
    subjectId: parsed.data.subjectId,
    sectionId: parsed.data.sectionId,
    promptText: parsed.data.promptText,
    preferredTitle: parsed.data.preferredTitle,
    preferredTopic: parsed.data.preferredTopic,
    preferredDifficulty: parsed.data.preferredDifficulty,
    preferredEstimatedMinutes: parsed.data.preferredEstimatedMinutes,
  });

  return NextResponse.json({ success: true, jobId }, { status: 202 });
}
