"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { extractApiError } from "@/lib/api-error";
import { publishToast } from "@/lib/toast-events";

type ClientRuntimeProps = {
  children: ReactNode;
};

type JsonBody = Record<string, unknown> | null;

type PatchedWindow = Window & {
  __learnHubOriginalFetch?: typeof window.fetch;
  __learnHubFetchPatched?: boolean;
};

const SILENT_TOAST_HEADER = "x-learnhub-toast-silent";
const SUCCESS_TOAST_HEADER = "x-learnhub-toast-success";
const ERROR_TOAST_HEADER = "x-learnhub-toast-error";

export function ClientRuntime({ children }: ClientRuntimeProps) {
  useEffect(() => {
    const win = window as PatchedWindow;
    if (win.__learnHubFetchPatched) {
      return;
    }

    const originalFetch = win.fetch.bind(win);
    win.__learnHubOriginalFetch = originalFetch;
    win.__learnHubFetchPatched = true;

    win.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestMeta = extractRequestMeta(input, init);
      const shouldShowToast = requestMeta.isApiMutation && requestMeta.silent !== true;

      try {
        const response = await originalFetch(input, init);
        if (!shouldShowToast) {
          return response;
        }

        const payload = await readJsonBody(response);
        if (response.ok) {
          publishToast({
            tone: "success",
            title:
              requestMeta.successMessage ??
              payloadString(payload, "message") ??
              defaultSuccessMessage(requestMeta.method, requestMeta.pathname),
          });
          return response;
        }

        const fallbackTitle = defaultErrorTitle(payload, response.status);
        const parsedError = extractApiError(payload, fallbackTitle);
        publishToast({
          tone: "error",
          title: requestMeta.errorMessage ?? parsedError.title,
          description: parsedError.description,
        });
        return response;
      } catch (error) {
        if (shouldShowToast) {
          publishToast({
            tone: "error",
            title: requestMeta.errorMessage ?? "Request failed",
            description: error instanceof Error ? error.message : "Unable to complete the request.",
          });
        }
        throw error;
      }
    };
  }, []);

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}

function extractRequestMeta(input: RequestInfo | URL, init?: RequestInit) {
  const requestMethod = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const inputUrl = resolveInputUrl(input);
  const pathname = resolvePathname(inputUrl);
  const headers = mergeHeaders(input, init?.headers);
  const silentValue = readHeaderValue(headers, SILENT_TOAST_HEADER);
  const successMessage = readHeaderValue(headers, SUCCESS_TOAST_HEADER);
  const errorMessage = readHeaderValue(headers, ERROR_TOAST_HEADER);

  return {
    method: requestMethod,
    pathname,
    isApiMutation: pathname.startsWith("/api/") && requestMethod !== "GET" && requestMethod !== "HEAD",
    // Chunked media upload steps must stay silent; only the final complete/simple upload toasts.
    silent:
      silentValue?.toLowerCase() === "1" ||
      silentValue?.toLowerCase() === "true" ||
      pathname === "/api/media/upload/init" ||
      pathname === "/api/media/upload/chunk",
    successMessage,
    errorMessage,
  };
}

function resolveInputUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function resolvePathname(url: string) {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return new URL(url).pathname;
    }
    if (url.startsWith("/")) {
      return url.split("?")[0]?.split("#")[0] ?? url;
    }
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url;
  }
}

function mergeHeaders(input: RequestInfo | URL, initHeaders?: HeadersInit) {
  const combined = new Headers();
  if (input instanceof Request) {
    input.headers.forEach((value, key) => combined.set(key, value));
  }
  if (!initHeaders) {
    return combined;
  }
  const incoming = new Headers(initHeaders);
  incoming.forEach((value, key) => combined.set(key, value));
  return combined;
}

function readHeaderValue(headers: Headers, key: string) {
  return headers.get(key);
}

async function readJsonBody(response: Response): Promise<JsonBody> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  const text = await response.clone().text();
  if (!text.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function payloadString(payload: JsonBody, key: string) {
  if (!payload) {
    return null;
  }
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function defaultSuccessMessage(method: string, pathname: string) {
  if (pathname === "/api/auth/login") {
    return "Signed in successfully.";
  }
  if (pathname === "/api/auth/logout") {
    return "Signed out.";
  }
  if (pathname.endsWith("/attempts/submit")) {
    return "Submission saved.";
  }

  if (method === "POST") {
    return "Saved successfully.";
  }
  if (method === "PATCH" || method === "PUT") {
    return "Updated successfully.";
  }
  if (method === "DELETE") {
    return "Deleted successfully.";
  }
  return "Request completed successfully.";
}

function defaultErrorTitle(payload: JsonBody, status: number) {
  const explicitError = payloadString(payload, "error");
  if (explicitError) {
    return explicitError;
  }
  const explicitMessage = payloadString(payload, "message");
  if (explicitMessage) {
    return explicitMessage;
  }

  if (status >= 500) {
    return "Server error. Please try again.";
  }
  if (status === 401) {
    return "You are not authorized for this action.";
  }
  if (status === 403) {
    return "You do not have permission for this action.";
  }
  if (status === 404) {
    return "Resource not found.";
  }
  return "Unable to save changes.";
}
