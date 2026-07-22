import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { chemicalEquationSchema } from "@/lib/validators";
import {
  canTeacherManageEquation,
  createChemicalEquation,
  listChemicalEquations,
  updateChemicalEquation,
} from "@/server/queries/equations";

export async function GET(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? undefined;
  const topic = url.searchParams.get("topic") ?? undefined;
  const includeArchived = url.searchParams.get("includeArchived") === "1";

  const equations = listChemicalEquations({
    teacherId: auth.user.role === "TEACHER" ? auth.user.id : undefined,
    includeGlobal: true,
    includeArchived,
    search,
    topic,
  });

  return NextResponse.json({ equations });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = chemicalEquationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const equationId = createChemicalEquation({
    ...parsed.data,
    teacherId: auth.user.id,
    balancedFormula: parsed.data.balancedFormula || null,
    explanationMarkdown: parsed.data.explanationMarkdown || null,
  });
  return NextResponse.json({ success: true, equationId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["TEACHER"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = (await request.json()) as { equationId?: string } & Record<string, unknown>;
  if (!body.equationId) {
    return NextResponse.json({ error: "equationId is required" }, { status: 400 });
  }
  if (!canTeacherManageEquation(auth.user.id, body.equationId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = chemicalEquationSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  updateChemicalEquation(body.equationId, {
    ...parsed.data,
    balancedFormula: parsed.data.balancedFormula === "" ? null : parsed.data.balancedFormula,
    explanationMarkdown: parsed.data.explanationMarkdown === "" ? null : parsed.data.explanationMarkdown,
  });
  return NextResponse.json({ success: true });
}
