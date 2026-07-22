import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function percent(value: number | null | undefined) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return `${safe.toFixed(1)}%`;
}

export function formatSeconds(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) {
    return "0m";
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }

  return `${mins}m ${secs}s`;
}

export function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sanitizeForLikeQuery(value: string) {
  return value.replace(/[\%_]/g, "");
}
