import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { subjectSchema } from "@/lib/validators";
import { createSubject, deleteSubjectById, listSubjects, updateSubject } from "@/server/queries/subjects";

const deleteSubjectSchema = z.object({
  subjectId: z.string().min(1),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const includeInactive = url.searchParams.get("includeInactive") === "1";

  return NextResponse.json({
    subjects: listSubjects({ search, isActive: includeInactive ? undefined : true }),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = subjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const subjectId = createSubject({
    ...parsed.data,
    createdById: auth.user.id,
  });

  return NextResponse.json({ success: true, subjectId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = (await request.json()) as { subjectId?: string } & Record<string, unknown>;
  if (!body.subjectId) {
    return NextResponse.json({ error: "subjectId is required" }, { status: 400 });
  }

  const parsed = subjectSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  updateSubject(body.subjectId, {
    ...parsed.data,
    description: parsed.data.description === "" ? null : parsed.data.description,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = deleteSubjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = deleteSubjectById(parsed.data.subjectId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
