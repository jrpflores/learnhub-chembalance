import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { requireApiAuth } from "@/lib/rbac";
import { resetPasswordSchema } from "@/lib/validators";
import { resetUserPassword } from "@/server/queries/users";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  resetUserPassword(parsed.data.userId, passwordHash);

  return NextResponse.json({ success: true });
}
