import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { storeUploadChunk } from "@/server/services/media-upload-service";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
  if (auth.error || !auth.user) {
    return auth.error;
  }

  const url = new URL(request.url);
  const uploadId = url.searchParams.get("uploadId")?.trim() ?? "";
  const chunkIndexRaw = url.searchParams.get("index")?.trim() ?? "";
  const chunkIndex = Number(chunkIndexRaw);

  if (!uploadId || !Number.isInteger(chunkIndex)) {
    return NextResponse.json({ error: "uploadId and index are required." }, { status: 400 });
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  const result = await storeUploadChunk({
    userId: auth.user.id,
    uploadId,
    chunkIndex,
    bytes,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    success: true,
    receivedCount: result.receivedCount,
    totalChunks: result.totalChunks,
  });
}
