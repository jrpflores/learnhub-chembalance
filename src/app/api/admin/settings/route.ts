import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { platformBrandingValueSchema, settingSchema } from "@/lib/validators";
import { getSystemSettings, upsertSystemSetting } from "@/server/queries/admin";

export async function GET() {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  return NextResponse.json({ settings: getSystemSettings() });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsed = settingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.key === "platform.branding") {
    const brandingParsed = platformBrandingValueSchema.safeParse(parsed.data.value);
    if (!brandingParsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: brandingParsed.error.flatten() }, { status: 400 });
    }
  }

  upsertSystemSetting({
    key: parsed.data.key,
    value: parsed.data.value,
    description: parsed.data.description,
    updatedById: auth.user?.id,
  });

  return NextResponse.json({ success: true });
}
