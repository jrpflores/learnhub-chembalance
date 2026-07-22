import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifySessionToken } from "@/lib/auth";
import type { Role } from "@/domain/types";
import { getUserById } from "@/server/queries/users";

export async function requireApiAuth(roles?: Role[]) {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;

  if (!token) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }

  const payload = await verifySessionToken(token);
  if (!payload?.sub) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }

  const user = getUserById(payload.sub);
  if (!user || !user.isActive) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }

  if (roles && !roles.includes(user.role)) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      user: null,
    };
  }

  return {
    error: null,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      email: user.email,
    },
  };
}

export function assertTeacherAccess(userRole: Role) {
  return userRole === "TEACHER" || userRole === "ADMIN";
}

export function assertStudentAccess(userRole: Role) {
  return userRole === "STUDENT";
}

export function assertAdminAccess(userRole: Role) {
  return userRole === "ADMIN";
}
