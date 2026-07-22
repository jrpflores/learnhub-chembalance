import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAuth } from "@/lib/rbac";
import { initChunkedUpload } from "@/server/services/media-upload-service";

const initSchema = z.object({
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(120),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = initSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await initChunkedUpload({
    userId: auth.user.id,
    fileName: parsed.data.fileName,
    mime: parsed.data.mime,
    size: parsed.data.size,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    uploadId: result.uploadId,
    chunkSize: result.chunkSize,
    totalChunks: result.totalChunks,
  });
}
