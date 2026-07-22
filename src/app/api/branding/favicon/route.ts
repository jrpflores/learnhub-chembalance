import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { env } from "@/lib/env";
import { getPlatformBranding } from "@/server/queries/branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function contentTypeFor(filePath: string, fallbackUrl: string) {
  const ext = path.extname(filePath || fallbackUrl).toLowerCase();
  if (ext === ".ico") return "image/x-icon";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  return "image/png";
}

function cacheHeaders(updatedAt: string | null) {
  const etag = updatedAt ? `"brand-favicon-${Date.parse(updatedAt) || updatedAt}"` : `"brand-favicon-default"`;
  return {
    "Cache-Control": "no-cache, must-revalidate",
    ETag: etag,
  };
}

async function readLocalBrandingFile(faviconUrl: string) {
  const clean = faviconUrl.split("?")[0] ?? faviconUrl;

  if (clean.startsWith("/branding/")) {
    const relative = clean.replace(/^\/+/, "");
    const absolutePath = path.resolve(process.cwd(), "public", relative);
    const publicRoot = path.resolve(process.cwd(), "public");
    if (!absolutePath.startsWith(publicRoot + path.sep)) {
      return null;
    }
    const bytes = await fs.readFile(absolutePath);
    return { bytes, contentType: contentTypeFor(absolutePath, clean) };
  }

  if (clean.startsWith("/media/")) {
    const relative = clean.replace(/^\/media\//, "");
    const baseDir = path.resolve(env.uploadsDir);
    const absolutePath = path.resolve(baseDir, relative);
    if (!absolutePath.startsWith(baseDir + path.sep) && absolutePath !== baseDir) {
      return null;
    }
    const bytes = await fs.readFile(absolutePath);
    return { bytes, contentType: contentTypeFor(absolutePath, clean) };
  }

  return null;
}

/**
 * Serves the configured platform favicon.
 * Used by /favicon.ico rewrite so browsers stop showing the stale App Router .ico.
 */
export async function GET() {
  noStore();
  const branding = getPlatformBranding();
  const headers = cacheHeaders(branding.updatedAt);

  try {
    const local = await readLocalBrandingFile(branding.faviconUrl);
    if (local) {
      return new NextResponse(new Uint8Array(local.bytes), {
        status: 200,
        headers: {
          ...headers,
          "Content-Type": local.contentType,
        },
      });
    }
  } catch {
    // Fall through to redirect / default.
  }

  if (branding.faviconUrl.startsWith("http://") || branding.faviconUrl.startsWith("https://")) {
    return NextResponse.redirect(branding.faviconUrl, 302);
  }

  // Last resort: default ChemBalance mark in public/.
  try {
    const fallbackPath = path.resolve(process.cwd(), "public/branding/logo.png");
    const bytes = await fs.readFile(fallbackPath);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "image/png",
      },
    });
  } catch {
    return NextResponse.json({ error: "Favicon not found." }, { status: 404 });
  }
}
