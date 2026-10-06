import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { checkOllamaReachable } from "@/server/services/ollama-client";

function resolvePath(inputPath: string) {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

export async function GET() {
  try {
    const db = getDb();
    const row = db.prepare<{ ok: number }>("SELECT 1 as ok").get();
    const dbHealthy = row?.ok === 1;

    const uploadsPath = resolvePath(env.uploadsDir);
    const logsPath = resolvePath(env.logsDir);
    const modelsPath = resolvePath(env.aiModelsDir);

    [uploadsPath, logsPath, modelsPath].forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
    });

    let graderHealthy: boolean | null = null;
    let ollamaHealthy: boolean | null = null;
    if (env.offlineAiEnabled) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), Math.min(env.offlineGraderTimeoutMs, 3000));
        const response = await fetch(`${env.offlineGraderUrl}/health`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        graderHealthy = response.ok;
      } catch {
        graderHealthy = false;
      }

      ollamaHealthy = await checkOllamaReachable(Math.min(env.offlineGraderTimeoutMs, 3000));
    }

    const healthy =
      dbHealthy &&
      (graderHealthy === null || graderHealthy === true) &&
      (ollamaHealthy === null || ollamaHealthy === true);

    return NextResponse.json(
      {
        status: healthy ? "ok" : "degraded",
        components: {
          db: dbHealthy,
          offlineAi: graderHealthy,
          ollama: ollamaHealthy,
        },
        storage: {
          uploadsPath,
          logsPath,
          modelsPath,
        },
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "down",
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
