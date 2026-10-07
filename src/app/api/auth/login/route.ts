import { NextResponse } from "next/server";
import { createSessionToken, verifyPassword } from "@/lib/auth";
import { env } from "@/lib/env";
import { loginSchema } from "@/lib/validators";
import { getUserByEmail, touchLastLogin } from "@/server/queries/users";

function isHttpsRequest(request: Request) {
  const directProto = new URL(request.url).protocol;
  if (directProto === "https:") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (!forwardedProto) {
    return false;
  }

  return forwardedProto
    .split(",")
    .some((entry) => entry.trim().toLowerCase() === "https");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid login data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const user = getUserByEmail(parsed.data.email);

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const validPassword = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      gender: user.gender,
    });

    touchLastLogin(user.id);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });

    response.cookies.set(env.sessionCookieName, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.sessionCookieSecure && isHttpsRequest(request),
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Login failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
