import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { USER_IMPORT_TEMPLATE_FILENAME, userImportCsvTemplateContent } from "@/lib/user-import-csv";

export async function GET() {
  const auth = await requireApiAuth(["ADMIN"]);
  if (auth.error) {
    return auth.error;
  }

  return new NextResponse(userImportCsvTemplateContent(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${USER_IMPORT_TEMPLATE_FILENAME}"`,
      "Cache-Control": "no-store",
    },
  });
}
