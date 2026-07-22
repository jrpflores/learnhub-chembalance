import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { requireApiAuth } from "@/lib/rbac";
import { createUserSchema, updateUserSchema } from "@/lib/validators";
import { z } from "zod";
import {
  createUser,
  deleteUserById,
  listUsers,
  updateUser,
} from "@/server/queries/users";

const deleteUserSchema = z.object({
  id: z.string(),
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const url = new URL(request.url);

  const roleParam = url.searchParams.get("role");
  const search = url.searchParams.get("search") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");

  const role =
    roleParam === "ADMIN" || roleParam === "TEACHER" || roleParam === "STUDENT" ? roleParam : undefined;

  const users = listUsers({ role, search, page, pageSize });

  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = createUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = crypto.randomUUID();

  createUser({
    id: userId,
    email: parsed.data.email,
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    passwordHash,
    createdById: auth.user?.id,
  });

  return NextResponse.json({ success: true, userId });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  updateUser({
    id: parsed.data.id,
    fullName: parsed.data.fullName,
    email: parsed.data.email,
    role: parsed.data.role,
    isActive: parsed.data.isActive,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = deleteUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.id === auth.user.id) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const result = deleteUserById(parsed.data.id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
