import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { abortChunkedUpload, completeChunkedUpload } from "@/server/services/media-upload-service";

const completeSchema = z.object({
  uploadId: z.string().uuid(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = completeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await completeChunkedUpload({
    userId: auth.user.id,
    uploadId: parsed.data.uploadId,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    url: result.url,
    fileName: result.fileName,
    mime: result.mime,
    size: result.size,
  });
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId")?.trim() ?? "";
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId is required." }, { status: 400 });
  }

  const result = await abortChunkedUpload({
    userId: auth.user.id,
    uploadId,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true });
}
