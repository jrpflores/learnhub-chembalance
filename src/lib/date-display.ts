export type DisplayPreferences = {
  timeZone: string;
  locale: string;
};

const FALLBACK_TIMEZONE = "UTC";
const FALLBACK_LOCALE = "en-PH";

type InputDate = string | number | Date | null | undefined;

declare global {
  interface Window {
    __learnhubDisplayPreferences?: Partial<DisplayPreferences>;
  }
}

function safeDate(value: InputDate) {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return FALLBACK_TIMEZONE;
  }
  const candidate = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

export function normalizeLocale(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return FALLBACK_LOCALE;
  }
  const candidate = value.trim();
  return Intl.DateTimeFormat.supportedLocalesOf([candidate]).length > 0 ? candidate : FALLBACK_LOCALE;
}

function readClientPreferences(): Partial<DisplayPreferences> {
  if (typeof window === "undefined") {
    return {};
  }

  if (window.__learnhubDisplayPreferences) {
    return window.__learnhubDisplayPreferences;
  }

  const element = document.documentElement;
  const timeZone = element.dataset.learnhubTimezone;
  const locale = element.dataset.learnhubLocale;
  return { timeZone, locale };
}

function resolvePreferences(options?: Partial<DisplayPreferences>): DisplayPreferences {
  const fromClient = readClientPreferences();
  return {
    timeZone: normalizeTimeZone(options?.timeZone ?? fromClient.timeZone),
    locale: normalizeLocale(options?.locale ?? fromClient.locale),
  };
}

export function formatDateTime(value: InputDate, options?: Partial<DisplayPreferences>) {
  const date = safeDate(value);
  if (!date) {
    return "—";
  }
  const { locale, timeZone } = resolvePreferences(options);
  return date.toLocaleString(locale, { timeZone });
}

export function formatDate(value: InputDate, options?: Partial<DisplayPreferences>) {
  const date = safeDate(value);
  if (!date) {
    return "—";
  }
  const { locale, timeZone } = resolvePreferences(options);
  return date.toLocaleDateString(locale, { timeZone });
}

export function formatTime(value: InputDate, options?: Partial<DisplayPreferences>) {
  const date = safeDate(value);
  if (!date) {
    return "—";
  }
  const { locale, timeZone } = resolvePreferences(options);
  return date.toLocaleTimeString(locale, { timeZone });
}
