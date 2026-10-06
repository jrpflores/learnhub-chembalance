import { env } from "@/lib/env";

export type OllamaGenerateInput = {
  prompt: string;
  stream?: boolean;
  format?: "json";
  temperature?: number;
  numPredict?: number;
  signal?: AbortSignal;
  onChunk?: (chunk: string) => void;
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function candidateModels() {
  return [env.ollamaModel, ...env.ollamaFallbackModels].filter(
    (model, index, list) => Boolean(model) && list.indexOf(model) === index,
  );
}

function timeoutErrorMessage(model: string) {
  return `Ollama request timed out after ${env.ollamaTimeoutMs}ms on model "${model}". Try fewer questions, a shorter lesson, a smaller OLLAMA_MODEL, or increase OLLAMA_TIMEOUT_MS.`;
}

async function readOllamaStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string) => void,
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let rawAssistantContent = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      try {
        const frame = JSON.parse(line) as { response?: unknown };
        const chunk = typeof frame.response === "string" ? frame.response : "";
        if (chunk.length > 0) {
          rawAssistantContent += chunk;
          onChunk?.(chunk);
        }
      } catch {
        // Ignore malformed stream frames.
      }
    }
  }

  if (buffer.trim().length > 0) {
    try {
      const frame = JSON.parse(buffer.trim()) as { response?: unknown };
      const chunk = typeof frame.response === "string" ? frame.response : "";
      if (chunk.length > 0) {
        rawAssistantContent += chunk;
        onChunk?.(chunk);
      }
    } catch {
      // Ignore malformed trailing frame.
    }
  }

  return rawAssistantContent;
}

export async function ollamaGenerateText(input: OllamaGenerateInput): Promise<string> {
  const models = candidateModels();
  let lastError: Error | null = null;
  const attemptErrors: string[] = [];
  const temperature = Math.min(Math.max(input.temperature ?? env.ollamaTemperature, 0), 0.4);
  const numPredict = Math.max(256, Math.min(input.numPredict ?? env.ollamaNumPredict, 8192));

  for (const model of models) {
    const controller = new AbortController();
    let timedOut = false;
    const abortHandler = () => controller.abort();
    if (input.signal) {
      input.signal.addEventListener("abort", abortHandler, { once: true });
    }
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, env.ollamaTimeoutMs);

    try {
      const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: input.prompt,
          stream: Boolean(input.stream),
          ...(input.format ? { format: input.format } : {}),
          options: { temperature, num_predict: numPredict },
          keep_alive: "10m",
        }),
        signal: input.signal ?? controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const rawError = await response.text();
        const notInstalled =
          response.status === 404 && /model .* not found/i.test(rawError);
        const message = notInstalled
          ? `Model "${model}" is not installed. Run: ollama pull ${model}`
          : `Model "${model}" returned HTTP ${response.status}${rawError ? ` (${rawError.slice(0, 180)})` : ""}`;
        attemptErrors.push(message);
        lastError = new Error(message);
        continue;
      }

      if (input.stream && input.onChunk && response.body) {
        const content = await readOllamaStream(response.body, input.onChunk);
        if (!content.trim()) {
          const message = `Model "${model}" returned empty content.`;
          attemptErrors.push(message);
          lastError = new Error(message);
          continue;
        }
        return content;
      }

      const payload = (await response.json()) as { response?: string };
      const content = payload.response?.trim() ?? "";
      if (!content) {
        const message = `Model "${model}" returned empty content.`;
        attemptErrors.push(message);
        lastError = new Error(message);
        continue;
      }
      return content;
    } catch (error) {
      if (isAbortError(error)) {
        if (input.signal?.aborted && !timedOut) {
          throw error instanceof Error ? error : new Error("Ollama request aborted.");
        }
        if (timedOut) {
          const message = timeoutErrorMessage(model);
          attemptErrors.push(message);
          lastError = new Error(message);
          continue;
        }
      }
      const message = error instanceof Error ? error.message : `Model "${model}" request failed.`;
      attemptErrors.push(message);
      lastError = error instanceof Error ? error : new Error(message);
    } finally {
      if (input.signal) {
        input.signal.removeEventListener("abort", abortHandler);
      }
      clearTimeout(timeout);
    }
  }

  if (attemptErrors.length > 1) {
    throw new Error(`All configured Ollama models failed: ${attemptErrors.join(" | ")}`);
  }

  throw lastError ?? new Error("No configured Ollama model could complete the request.");
}

export async function checkOllamaReachable(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.ollamaBaseUrl.replace(/\/$/, "")}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
