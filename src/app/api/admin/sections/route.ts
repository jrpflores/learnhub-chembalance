import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { sectionSchema } from "@/lib/validators";
import { createSection, getSectionById, listSections, setSectionStudents, updateSection } from "@/server/queries/sections";
import { addTeacherSubjectAssignment, getSubjectById } from "@/server/queries/subjects";
import { getUserById } from "@/server/queries/users";

const subjectTeacherAssignmentSchema = z.object({
  subjectId: z.string().min(1),
  teacherId: z.string().min(1),
});

const adminSectionCreateSchema = sectionSchema.extend({
  teacherId: z.string().min(1).optional(),
  subjectId: z.string().min(1).optional(),
  subjectIds: z.array(z.string().min(1)).optional(),
  subjectTeacherAssignments: z.array(subjectTeacherAssignmentSchema).optional(),
});

const adminSectionPatchSchema = sectionSchema
  .partial()
  .extend({
    sectionId: z.string().min(1),
    teacherId: z.string().min(1).optional(),
    subjectId: z.string().min(1).nullable().optional(),
    subjectIds: z.array(z.string().min(1)).optional(),
    subjectTeacherAssignments: z.array(subjectTeacherAssignmentSchema).optional(),
  })
  .strict();

function validateTeacher(teacherId: string) {
  const teacher = getUserById(teacherId);
  if (!teacher || teacher.role !== "TEACHER") {
    return null;
  }
  return teacher;
}

function normalizeSubjectTeacherAssignments(payload: {
  subjectTeacherAssignments?: { subjectId: string; teacherId: string }[];
  subjectId?: string | null;
  subjectIds?: string[];
  teacherId?: string | null;
  fallbackTeacherId?: string | null;
}) {
  if (payload.subjectTeacherAssignments) {
    const map = new Map<string, string>();
    for (const assignment of payload.subjectTeacherAssignments) {
      const subjectId = assignment.subjectId?.trim();
      const teacherId = assignment.teacherId?.trim();
      if (!subjectId || !teacherId) {
        continue;
      }
      map.set(subjectId, teacherId);
    }
    return Array.from(map.entries()).map(([subjectId, teacherId]) => ({ subjectId, teacherId }));
  }

  const fallbackTeacherId = payload.teacherId?.trim() || payload.fallbackTeacherId?.trim() || null;
  const subjectIds = Array.from(
    new Set((payload.subjectIds?.length ? payload.subjectIds : payload.subjectId ? [payload.subjectId] : []).filter(Boolean)),
  )
    .map((subjectId) => subjectId.trim())
    .filter(Boolean);

  if (!fallbackTeacherId || subjectIds.length === 0) {
    return [] as { subjectId: string; teacherId: string }[];
  }

  return subjectIds.map((subjectId) => ({ subjectId, teacherId: fallbackTeacherId }));
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam === "ACTIVE" || statusParam === "ARCHIVED" ? statusParam : undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const schoolYear = url.searchParams.get("schoolYear") ?? undefined;
  const teacherId = url.searchParams.get("teacherId") ?? undefined;
  const sectionId = url.searchParams.get("sectionId");

  if (sectionId) {
    const section = getSectionById(sectionId);
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }
    return NextResponse.json({ section });
  }

  return NextResponse.json({
    sections: listSections({
      teacherId,
      status,
      search,
      schoolYear,
    }),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = adminSectionCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const subjectTeacherAssignments = normalizeSubjectTeacherAssignments(parsed.data);
  if (subjectTeacherAssignments.length === 0) {
    return NextResponse.json({ error: "At least one subject with assigned teacher is required." }, { status: 400 });
  }

  for (const assignment of subjectTeacherAssignments) {
    const teacher = validateTeacher(assignment.teacherId);
    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }
  }

  for (const assignment of subjectTeacherAssignments) {
    const subject = getSubjectById(assignment.subjectId);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
  }

  for (const assignment of subjectTeacherAssignments) {
    addTeacherSubjectAssignment(assignment.subjectId, assignment.teacherId, auth.user.id);
  }

  const subjectIds = Array.from(new Set(subjectTeacherAssignments.map((assignment) => assignment.subjectId)));
  for (const subjectId of subjectIds) {
    const subject = getSubjectById(subjectId);
    if (!subject) {
      return NextResponse.json({ error: "Subject not found" }, { status: 404 });
    }
  }
  const primaryTeacherId = subjectTeacherAssignments[0].teacherId;

  try {
    const sectionId = createSection({
      teacherId: primaryTeacherId,
      subjectId: subjectIds[0] ?? null,
      subjectIds,
      subjectTeacherAssignments,
      name: parsed.data.name,
      gradeLevel: parsed.data.gradeLevel,
      schoolYear: parsed.data.schoolYear,
      status: parsed.data.status,
      description: parsed.data.description || null,
      studentIds: parsed.data.studentIds,
      assignedById: auth.user.id,
    });

    return NextResponse.json({ success: true, sectionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create section.";
    const status = message.includes("one section") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = adminSectionPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const existing = getSectionById(parsed.data.sectionId);
  if (!existing) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  if (parsed.data.teacherId) {
    const teacher = validateTeacher(parsed.data.teacherId);
    if (!teacher) {
      return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
    }
  }

  let requestedSubjectTeacherAssignments: { subjectId: string; teacherId: string }[] | undefined;
  if (parsed.data.subjectTeacherAssignments !== undefined) {
    requestedSubjectTeacherAssignments = normalizeSubjectTeacherAssignments(parsed.data);
    if (requestedSubjectTeacherAssignments.length === 0) {
      return NextResponse.json({ error: "At least one subject with assigned teacher is required." }, { status: 400 });
    }

    for (const assignment of requestedSubjectTeacherAssignments) {
      const teacher = validateTeacher(assignment.teacherId);
      if (!teacher) {
        return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
      }

      const subject = getSubjectById(assignment.subjectId);
      if (!subject) {
        return NextResponse.json({ error: "Subject not found" }, { status: 404 });
      }

      addTeacherSubjectAssignment(assignment.subjectId, assignment.teacherId, auth.user.id);
    }
  } else {
    const requestedSubjectIds =
      parsed.data.subjectIds !== undefined
        ? Array.from(new Set(parsed.data.subjectIds.filter(Boolean)))
        : parsed.data.subjectId
          ? [parsed.data.subjectId]
          : undefined;

    if (requestedSubjectIds) {
      if (requestedSubjectIds.length === 0) {
        return NextResponse.json({ error: "At least one subject is required." }, { status: 400 });
      }
      for (const subjectId of requestedSubjectIds) {
        const subject = getSubjectById(subjectId);
        if (!subject) {
          return NextResponse.json({ error: "Subject not found" }, { status: 404 });
        }
      }
    }

    const effectiveTeacherId = parsed.data.teacherId ?? existing.teacherId;
    const effectiveSubjectIds =
      requestedSubjectIds ?? (existing.subjectIds?.length ? existing.subjectIds : existing.subjectId ? [existing.subjectId] : []);
    for (const subjectId of effectiveSubjectIds) {
      addTeacherSubjectAssignment(subjectId, effectiveTeacherId, auth.user.id);
    }
  }

  const fallbackRequestedSubjectIds =
    parsed.data.subjectIds !== undefined
      ? Array.from(new Set(parsed.data.subjectIds.filter(Boolean)))
      : parsed.data.subjectId
        ? [parsed.data.subjectId]
        : undefined;

  updateSection(parsed.data.sectionId, {
    teacherId: parsed.data.teacherId,
    subjectId: parsed.data.subjectId,
    subjectIds: fallbackRequestedSubjectIds,
    subjectTeacherAssignments: requestedSubjectTeacherAssignments,
    name: parsed.data.name,
    gradeLevel: parsed.data.gradeLevel,
    schoolYear: parsed.data.schoolYear,
    status: parsed.data.status,
    description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
  });

  if (parsed.data.studentIds) {
    try {
      setSectionStudents(parsed.data.sectionId, parsed.data.studentIds, auth.user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update section students.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
  }

  return NextResponse.json({ success: true });
}
