import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/rbac";
import { env } from "@/lib/env";
import {
  classifyMediaMime,
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  mimeExtension,
} from "@/server/services/media-upload-service";

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(["TEACHER", "ADMIN"]);
    if (auth.error || !auth.user) {
      return auth.error;
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse body as FormData.";
      return NextResponse.json(
        {
          error: `${message} For videos or large files, use chunked upload.`,
        },
        { status: 413 },
      );
    }

    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const mime = file.type || "application/octet-stream";
    const kind = classifyMediaMime(mime);
    if (!kind) {
      return NextResponse.json({ error: "Only image and video uploads are supported." }, { status: 400 });
    }

    const maxBytes = kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    if (file.size <= 0 || file.size > maxBytes) {
      return NextResponse.json(
        { error: `Invalid file size. Max ${kind === "video" ? "200MB" : "10MB"} allowed.` },
        { status: 400 },
      );
    }

    // Prefer chunked path for large multipart payloads — FormData parsing is unreliable.
    if (kind === "video" || file.size > 1.5 * 1024 * 1024) {
      return NextResponse.json(
        {
          error: "Large media must use chunked upload. Retry from the editor video uploader.",
        },
        { status: 400 },
      );
    }

    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    const baseDir = path.resolve(env.uploadsDir);
    const relativeDir = path.join(year, month);
    const targetDir = path.join(baseDir, relativeDir);

    await fs.mkdir(targetDir, { recursive: true });

    const originalName = sanitizeSegment(file.name || "upload");
    const ext = mimeExtension(mime, originalName);
    const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const absolutePath = path.join(targetDir, uniqueName);

    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolutePath, bytes);

    const publicPath = `/media/${relativeDir.replaceAll(path.sep, "/")}/${uniqueName}`;

    return NextResponse.json({
      success: true,
      url: publicPath,
      fileName: originalName,
      mime,
      size: file.size,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Upload failed.",
      },
      { status: 500 },
    );
  }
}
