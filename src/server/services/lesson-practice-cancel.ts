import crypto from "node:crypto";

type InFlightPracticeRequest = {
  studentId: string;
  lessonId: string;
  controller: AbortController;
  createdAt: number;
};

const inFlightPracticeRequests = new Map<string, InFlightPracticeRequest>();
const MAX_ENTRY_AGE_MS = 10 * 60 * 1000;

function pruneInFlightRequests() {
  const now = Date.now();
  for (const [requestId, request] of inFlightPracticeRequests.entries()) {
    if (now - request.createdAt > MAX_ENTRY_AGE_MS) {
      inFlightPracticeRequests.delete(requestId);
    }
  }
}

export function registerLessonPracticeRequest(payload: {
  requestId?: string;
  studentId: string;
  lessonId: string;
  controller: AbortController;
}) {
  pruneInFlightRequests();
  const requestId = payload.requestId?.trim() || crypto.randomUUID();
  inFlightPracticeRequests.set(requestId, {
    studentId: payload.studentId,
    lessonId: payload.lessonId,
    controller: payload.controller,
    createdAt: Date.now(),
  });
  return requestId;
}

export function completeLessonPracticeRequest(requestId: string) {
  inFlightPracticeRequests.delete(requestId);
}

export function cancelLessonPracticeRequest(payload: {
  requestId: string;
  studentId: string;
  lessonId?: string;
}) {
  pruneInFlightRequests();
  const request = inFlightPracticeRequests.get(payload.requestId);
  if (!request) {
    return false;
  }
  if (request.studentId !== payload.studentId) {
    return false;
  }
  if (payload.lessonId && request.lessonId !== payload.lessonId) {
    return false;
  }

  request.controller.abort();
  inFlightPracticeRequests.delete(payload.requestId);
  return true;
}
