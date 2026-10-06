/** Stale threshold: Ollama timeout plus one minute buffer before reclaiming PROCESSING jobs. */
export function generationJobStaleBeforeIso(ollamaTimeoutMs: number, nowMs = Date.now()) {
  return new Date(nowMs - ollamaTimeoutMs - 60_000).toISOString();
}

export const GENERATION_JOB_STALE_REQUEUE_MESSAGE = "Requeued after stalled processing.";

export const GENERATION_JOB_OFFLINE_AI_DISABLED_MESSAGE =
  "Offline AI is disabled. Enable OFFLINE_AI_ENABLED to run generation jobs.";

export const GRADING_JOB_MAX_REQUEUE_ATTEMPTS = 3;

export function gradingJobStaleBeforeIso(offlineGraderTimeoutMs: number, nowMs = Date.now()) {
  return new Date(nowMs - offlineGraderTimeoutMs - 60_000).toISOString();
}

export function parseGradingRequeueCount(errorMessage: string | null | undefined) {
  if (!errorMessage) {
    return 0;
  }
  const match = errorMessage.match(/^requeue:(\d+):/);
  if (!match) {
    return 0;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatGradingRequeueMessage(attempt: number) {
  return `requeue:${attempt}:Requeued after stalled AI grading.`;
}

export const GRADING_JOB_STALE_FAILED_MESSAGE =
  "AI grading stalled repeatedly. Answer requires teacher review.";
