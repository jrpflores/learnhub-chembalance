import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const params = await context.params;
  const requested = params.path ?? [];
  if (requested.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }

  const baseDir = path.resolve(env.uploadsDir);
  const absolutePath = path.resolve(path.join(baseDir, ...requested));

  if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const file = await fs.readFile(absolutePath);
    return new NextResponse(file, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(absolutePath),
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
