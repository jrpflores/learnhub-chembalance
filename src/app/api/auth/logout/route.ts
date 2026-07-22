import { NextResponse } from "next/server";
import { env } from "@/lib/env";

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
  const response = NextResponse.json({ success: true });
  response.cookies.set(env.sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: env.sessionCookieSecure && isHttpsRequest(request),
    path: "/",
    maxAge: 0,
  });

  return response;
}
