"use client";

import {
  MEDIA_CHUNK_SIZE,
  SIMPLE_UPLOAD_THRESHOLD_BYTES,
} from "@/lib/media-upload-constants";

export type UploadedMedia = {
  url: string;
  fileName: string;
  mime: string;
  size: number;
};

type UploadOptions = {
  onProgress?: (ratio: number) => void;
};

const SILENT_TOAST_HEADERS = {
  "x-learnhub-toast-silent": "1",
} as const;

async function parseJsonResponse<T extends Record<string, unknown>>(response: Response): Promise<T> {
  const raw = await response.text();
  if (!raw.trim()) {
    return {} as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

function throwUploadError(response: Response, payload: { error?: string }) {
  if (payload.error) {
    throw new Error(payload.error);
  }
  if (response.status === 413) {
    throw new Error("Upload rejected because the file is too large for current server limits.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error("You are not authorized to upload media. Please sign in again.");
  }
  throw new Error(`Upload failed (HTTP ${response.status}).`);
}

async function uploadSimple(file: File, options?: UploadOptions): Promise<UploadedMedia> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: {
      "x-learnhub-toast-success": "Media uploaded successfully.",
      "x-learnhub-toast-error": "Unable to upload media.",
    },
    body: formData,
  });

  const payload = await parseJsonResponse<{
    error?: string;
    url?: string;
    fileName?: string;
    mime?: string;
    size?: number;
  }>(response);

  if (!response.ok || !payload.url || !payload.fileName || !payload.mime || typeof payload.size !== "number") {
    throwUploadError(response, payload);
  }

  options?.onProgress?.(1);
  return {
    url: payload.url!,
    fileName: payload.fileName!,
    mime: payload.mime!,
    size: payload.size!,
  };
}

async function uploadChunked(file: File, options?: UploadOptions): Promise<UploadedMedia> {
  const mime = file.type || "application/octet-stream";
  const initResponse = await fetch("/api/media/upload/init", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...SILENT_TOAST_HEADERS,
    },
    body: JSON.stringify({
      fileName: file.name || "upload",
      mime,
      size: file.size,
    }),
  });

  const initPayload = await parseJsonResponse<{
    error?: string;
    uploadId?: string;
    chunkSize?: number;
    totalChunks?: number;
  }>(initResponse);

  if (!initResponse.ok || !initPayload.uploadId || !initPayload.chunkSize || !initPayload.totalChunks) {
    throwUploadError(initResponse, initPayload);
  }

  const uploadId = initPayload.uploadId!;
  const chunkSize = initPayload.chunkSize ?? MEDIA_CHUNK_SIZE;
  const totalChunks = initPayload.totalChunks!;

  try {
    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * chunkSize;
      const end = Math.min(file.size, start + chunkSize);
      const blob = file.slice(start, end);

      const chunkResponse = await fetch(
        `/api/media/upload/chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            ...SILENT_TOAST_HEADERS,
          },
          body: blob,
        },
      );

      const chunkPayload = await parseJsonResponse<{ error?: string }>(chunkResponse);
      if (!chunkResponse.ok) {
        throwUploadError(chunkResponse, chunkPayload);
      }

      options?.onProgress?.((index + 1) / totalChunks);
    }

    const completeResponse = await fetch("/api/media/upload/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-learnhub-toast-success": "Media uploaded successfully.",
        "x-learnhub-toast-error": "Unable to upload media.",
      },
      body: JSON.stringify({ uploadId }),
    });

    const completePayload = await parseJsonResponse<{
      error?: string;
      url?: string;
      fileName?: string;
      mime?: string;
      size?: number;
    }>(completeResponse);

    if (
      !completeResponse.ok ||
      !completePayload.url ||
      !completePayload.fileName ||
      !completePayload.mime ||
      typeof completePayload.size !== "number"
    ) {
      throwUploadError(completeResponse, completePayload);
    }

    return {
      url: completePayload.url!,
      fileName: completePayload.fileName!,
      mime: completePayload.mime!,
      size: completePayload.size!,
    };
  } catch (error) {
    await fetch(`/api/media/upload/complete?uploadId=${encodeURIComponent(uploadId)}`, {
      method: "DELETE",
      headers: SILENT_TOAST_HEADERS,
    }).catch(() => undefined);
    throw error;
  }
}

/**
 * Images/small files use multipart FormData.
 * Videos/large files use chunked binary uploads to avoid FormData body parse failures.
 */
export async function uploadMediaFile(file: File, options?: UploadOptions): Promise<UploadedMedia> {
  const isVideo = (file.type || "").startsWith("video/");
  const useChunked = isVideo || file.size > SIMPLE_UPLOAD_THRESHOLD_BYTES;

  if (useChunked) {
    return uploadChunked(file, options);
  }

  try {
    return await uploadSimple(file, options);
  } catch (error) {
    // Fall back to chunked when multipart parsing fails on larger images.
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (message.includes("formdata") || message.includes("parse body")) {
      return uploadChunked(file, options);
    }
    throw error;
  }
}
