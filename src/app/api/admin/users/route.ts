import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { requireApiAuth } from "@/lib/rbac";
import { createUserSchema, updateUserSchema } from "@/lib/validators";
import { z } from "zod";
import {
  createUser,
  deleteUserById,
  getUserByEmail,
  getUserById,
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

  const email = parsed.data.email.trim().toLowerCase();
  if (getUserByEmail(email)) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const userId = crypto.randomUUID();

  try {
    createUser({
      id: userId,
      email,
      fullName: parsed.data.fullName.trim(),
      gender: parsed.data.gender,
      role: parsed.data.role,
      passwordHash,
      createdById: auth.user?.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: users.email")) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    throw error;
  }

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

  if (parsed.data.email !== undefined) {
    const email = parsed.data.email.trim().toLowerCase();
    const existing = getUserByEmail(email);
    if (existing && existing.id !== parsed.data.id) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
  }

  if (!getUserById(parsed.data.id)) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  try {
    updateUser({
      id: parsed.data.id,
      fullName: parsed.data.fullName?.trim(),
      email: parsed.data.email?.trim().toLowerCase(),
      gender: parsed.data.gender,
      role: parsed.data.role,
      isActive: parsed.data.isActive,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed: users.email")) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    throw error;
  }

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
