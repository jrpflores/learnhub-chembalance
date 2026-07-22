import { NextResponse } from "next/server";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { requireApiAuth } from "@/lib/rbac";
import { changeOwnPasswordSchema } from "@/lib/validators";
import { getUserById, resetUserPassword } from "@/server/queries/users";

export async function POST(request: Request) {
  const auth = await requireApiAuth();
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = changeOwnPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const user = getUserById(auth.user.id);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCurrentPasswordValid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!isCurrentPasswordValid) {
    return NextResponse.json(
      {
        error: "Current password is incorrect",
        details: {
          formErrors: [],
          fieldErrors: {
            currentPassword: ["Current password is incorrect"],
          },
        },
      },
      { status: 400 },
    );
  }

  const nextPasswordHash = await hashPassword(parsed.data.newPassword);
  resetUserPassword(user.id, nextPasswordHash);

  return NextResponse.json({
    success: true,
    message: "Password updated successfully.",
  });
}
