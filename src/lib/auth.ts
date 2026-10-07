import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import type { Role, SessionUser } from "@/domain/types";
import { getUserById } from "@/server/queries/users";

const secretKey = new TextEncoder().encode(env.jwtSecret);

type SessionTokenPayload = {
  sub: string;
  role: Role;
  email: string;
  name: string;
  isActive: boolean;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSessionToken(user: SessionUser) {
  return new SignJWT({
    role: user.role,
    email: user.email,
    name: user.fullName,
    isActive: user.isActive,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);

    if (!payload.sub || !payload.role || !payload.email || !payload.name) {
      return null;
    }

    return {
      sub: payload.sub,
      role: payload.role as Role,
      email: payload.email as string,
      name: payload.name as string,
      isActive: Boolean(payload.isActive),
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(env.sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload?.sub) {
    return null;
  }

  const user = getUserById(payload.sub);
  if (!user || !user.isActive) {
    return null;
  }

  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    gender: user.gender,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await requireUser();

  if (!roles.includes(user.role)) {
    if (user.role === "ADMIN") {
      redirect("/admin");
    }
    if (user.role === "TEACHER") {
      redirect("/teacher");
    }
    redirect("/student");
  }

  return user;
}
