import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth";
import { parseUserImportCsv } from "@/lib/user-import-csv";
import { requireApiAuth } from "@/lib/rbac";
import { importUsersPasswordSchema } from "@/lib/validators";
import { importUsersFromRows } from "@/server/services/user-import";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_ROWS = 500;
const DEFAULT_TEMPORARY_PASSWORD = "12345678";

export async function POST(request: Request) {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file is required." }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "CSV file must be 1 MB or smaller." }, { status: 400 });
  }

  const passwordField = formData.get("temporaryPassword");
  const temporaryPassword =
    typeof passwordField === "string" && passwordField.trim().length > 0
      ? passwordField.trim()
      : DEFAULT_TEMPORARY_PASSWORD;

  const passwordParsed = importUsersPasswordSchema.safeParse({ temporaryPassword });
  if (!passwordParsed.success) {
    return NextResponse.json(
      { error: "Temporary password must be at least 8 characters.", details: passwordParsed.error.flatten() },
      { status: 400 },
    );
  }

  const csvText = await file.text();
  const parsed = parseUserImportCsv(csvText);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Import is limited to ${MAX_ROWS} rows per file.` }, { status: 400 });
  }

  const passwordHash = await hashPassword(passwordParsed.data.temporaryPassword);
  const summary = importUsersFromRows({
    rows: parsed.rows,
    passwordHash,
    createdById: auth.user?.id,
  });

  return NextResponse.json(summary);
}
