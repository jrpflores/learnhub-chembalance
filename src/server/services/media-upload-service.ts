import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_CHUNK_SIZE } from "@/lib/media-upload-constants";
import { env } from "@/lib/env";

export { MEDIA_CHUNK_SIZE };
export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD_BYTES = 200 * 1024 * 1024;

type ChunkSessionMeta = {
  uploadId: string;
  userId: string;
  fileName: string;
  mime: string;
  size: number;
  totalChunks: number;
  received: number[];
  createdAt: string;
};

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function mimeExtension(fileType: string, originalName: string) {
  const mapped: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
  };

  if (mapped[fileType]) {
    return mapped[fileType];
  }

  const ext = path.extname(originalName);
  return ext || "";
}

export function classifyMediaMime(mime: string) {
  if (mime.startsWith("image/")) {
    return "image" as const;
  }
  if (mime.startsWith("video/")) {
    return "video" as const;
  }
  return null;
}

function chunksRootDir() {
  return path.join(path.resolve(env.uploadsDir), ".chunks");
}

function sessionDir(uploadId: string) {
  const safeId = sanitizeSegment(uploadId);
  return path.join(chunksRootDir(), safeId);
}

function metaPath(uploadId: string) {
  return path.join(sessionDir(uploadId), "meta.json");
}

function chunkPath(uploadId: string, index: number) {
  return path.join(sessionDir(uploadId), `${index}.part`);
}

async function readMeta(uploadId: string): Promise<ChunkSessionMeta | null> {
  try {
    const raw = await fs.readFile(metaPath(uploadId), "utf8");
    return JSON.parse(raw) as ChunkSessionMeta;
  } catch {
    return null;
  }
}

async function writeMeta(meta: ChunkSessionMeta) {
  await fs.writeFile(metaPath(meta.uploadId), JSON.stringify(meta), "utf8");
}

async function removeSession(uploadId: string) {
  await fs.rm(sessionDir(uploadId), { recursive: true, force: true });
}

export async function initChunkedUpload(payload: {
  userId: string;
  fileName: string;
  mime: string;
  size: number;
}) {
  const kind = classifyMediaMime(payload.mime);
  if (!kind) {
    return { success: false as const, status: 400 as const, error: "Only image and video uploads are supported." };
  }

  const maxBytes = kind === "video" ? MAX_VIDEO_UPLOAD_BYTES : MAX_IMAGE_UPLOAD_BYTES;
  if (!Number.isFinite(payload.size) || payload.size <= 0 || payload.size > maxBytes) {
    return {
      success: false as const,
      status: 400 as const,
      error: `Invalid file size. Max ${kind === "video" ? "200MB" : "10MB"} allowed.`,
    };
  }

  const uploadId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(payload.size / MEDIA_CHUNK_SIZE));
  const dir = sessionDir(uploadId);
  await fs.mkdir(dir, { recursive: true });

  const meta: ChunkSessionMeta = {
    uploadId,
    userId: payload.userId,
    fileName: sanitizeSegment(payload.fileName || "upload"),
    mime: payload.mime,
    size: payload.size,
    totalChunks,
    received: [],
    createdAt: new Date().toISOString(),
  };
  await writeMeta(meta);

  return {
    success: true as const,
    uploadId,
    chunkSize: MEDIA_CHUNK_SIZE,
    totalChunks,
  };
}

export async function storeUploadChunk(payload: {
  userId: string;
  uploadId: string;
  chunkIndex: number;
  bytes: Buffer;
}) {
  const meta = await readMeta(payload.uploadId);
  if (!meta) {
    return { success: false as const, status: 404 as const, error: "Upload session not found." };
  }
  if (meta.userId !== payload.userId) {
    return { success: false as const, status: 403 as const, error: "Upload session does not belong to this user." };
  }
  if (
    !Number.isInteger(payload.chunkIndex) ||
    payload.chunkIndex < 0 ||
    payload.chunkIndex >= meta.totalChunks
  ) {
    return { success: false as const, status: 400 as const, error: "Invalid chunk index." };
  }
  if (payload.bytes.length <= 0) {
    return { success: false as const, status: 400 as const, error: "Empty chunk." };
  }
  if (payload.bytes.length > MEDIA_CHUNK_SIZE) {
    return { success: false as const, status: 400 as const, error: "Chunk exceeds allowed size." };
  }

  // Last chunk may be shorter; earlier chunks must be full size.
  const isLast = payload.chunkIndex === meta.totalChunks - 1;
  if (!isLast && payload.bytes.length !== MEDIA_CHUNK_SIZE) {
    return { success: false as const, status: 400 as const, error: "Incomplete chunk payload." };
  }

  await fs.writeFile(chunkPath(payload.uploadId, payload.chunkIndex), payload.bytes);

  if (!meta.received.includes(payload.chunkIndex)) {
    meta.received.push(payload.chunkIndex);
    meta.received.sort((a, b) => a - b);
    await writeMeta(meta);
  }

  return {
    success: true as const,
    receivedCount: meta.received.length,
    totalChunks: meta.totalChunks,
  };
}

export async function completeChunkedUpload(payload: { userId: string; uploadId: string }) {
  const meta = await readMeta(payload.uploadId);
  if (!meta) {
    return { success: false as const, status: 404 as const, error: "Upload session not found." };
  }
  if (meta.userId !== payload.userId) {
    return { success: false as const, status: 403 as const, error: "Upload session does not belong to this user." };
  }
  if (meta.received.length !== meta.totalChunks) {
    return {
      success: false as const,
      status: 400 as const,
      error: `Missing chunks (${meta.received.length}/${meta.totalChunks}).`,
    };
  }

  for (let index = 0; index < meta.totalChunks; index += 1) {
    if (!meta.received.includes(index)) {
      return { success: false as const, status: 400 as const, error: `Missing chunk ${index}.` };
    }
  }

  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const baseDir = path.resolve(env.uploadsDir);
  const relativeDir = path.join(year, month);
  const targetDir = path.join(baseDir, relativeDir);
  await fs.mkdir(targetDir, { recursive: true });

  const ext = mimeExtension(meta.mime, meta.fileName);
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const absolutePath = path.join(targetDir, uniqueName);

  const handle = await fs.open(absolutePath, "w");
  try {
    let written = 0;
    for (let index = 0; index < meta.totalChunks; index += 1) {
      const part = await fs.readFile(chunkPath(payload.uploadId, index));
      await handle.write(part);
      written += part.length;
    }
    if (written !== meta.size) {
      await handle.close();
      await fs.rm(absolutePath, { force: true });
      return {
        success: false as const,
        status: 400 as const,
        error: "Assembled file size does not match declared size.",
      };
    }
  } finally {
    await handle.close().catch(() => undefined);
  }

  await removeSession(payload.uploadId);

  return {
    success: true as const,
    url: `/media/${relativeDir.replaceAll(path.sep, "/")}/${uniqueName}`,
    fileName: meta.fileName,
    mime: meta.mime,
    size: meta.size,
  };
}

export async function abortChunkedUpload(payload: { userId: string; uploadId: string }) {
  const meta = await readMeta(payload.uploadId);
  if (!meta) {
    return { success: true as const };
  }
  if (meta.userId !== payload.userId) {
    return { success: false as const, status: 403 as const, error: "Upload session does not belong to this user." };
  }
  await removeSession(payload.uploadId);
  return { success: true as const };
}
