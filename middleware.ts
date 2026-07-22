import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const sessionCookieName = process.env.SESSION_COOKIE_NAME ?? "learnhub_session";
const jwtSecret = process.env.JWT_SECRET ?? "dev-change-this-to-a-long-random-secret";

const secretKey = new TextEncoder().encode(jwtSecret);

async function getSessionPayload(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey);
    return payload as {
      sub?: string;
      role?: "ADMIN" | "TEACHER" | "STUDENT";
      isActive?: boolean;
    };
  } catch {
    return null;
  }
}

function redirectForRole(request: NextRequest, role: "ADMIN" | "TEACHER" | "STUDENT") {
  if (role === "ADMIN") {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  if (role === "TEACHER") {
    return NextResponse.redirect(new URL("/teacher", request.url));
  }
  return NextResponse.redirect(new URL("/student", request.url));
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (path.startsWith("/_next") || path.startsWith("/favicon.ico") || path.startsWith("/public")) {
    return NextResponse.next();
  }

  const session = await getSessionPayload(request);

  if (path === "/login") {
    // Important: do not redirect here based only on token claims.
    // Protected pages perform DB-backed auth checks and can invalidate stale tokens.
    // Keeping /login reachable avoids redirect loops when token claims and DB state diverge.
    return NextResponse.next();
  }

  const requiresAuth =
    path.startsWith("/admin") ||
    path.startsWith("/teacher") ||
    path.startsWith("/student") ||
    path.startsWith("/api/admin") ||
    path.startsWith("/api/teacher") ||
    path.startsWith("/api/student");

  if (!requiresAuth) {
    return NextResponse.next();
  }

  if (!session?.sub || !session.role || session.isActive === false) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) {
    if (session.role !== "ADMIN") {
      return redirectForRole(request, session.role);
    }
  }

  if (path.startsWith("/teacher") || path.startsWith("/api/teacher")) {
    if (session.role !== "TEACHER" && session.role !== "ADMIN") {
      return redirectForRole(request, session.role);
    }
  }

  if (path.startsWith("/student") || path.startsWith("/api/student")) {
    if (session.role !== "STUDENT") {
      return redirectForRole(request, session.role);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
