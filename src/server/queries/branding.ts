import { getDb, parseJson } from "@/lib/db";
import { DEFAULT_BRAND_LOGO_URL } from "@/lib/branding-defaults";

type PlatformBrandingSetting = {
  name?: unknown;
  appTitle?: unknown;
  logoUrl?: unknown;
  faviconUrl?: unknown;
};

export type PlatformBranding = {
  name: string;
  appTitle: string;
  logoUrl: string;
  faviconUrl: string;
  updatedAt: string | null;
};

export const DEFAULT_BRAND_ASSET = DEFAULT_BRAND_LOGO_URL;

const DEFAULT_BRANDING: PlatformBranding = {
  name: "ChemBalance",
  appTitle: "ChemBalance LMS",
  logoUrl: DEFAULT_BRAND_ASSET,
  faviconUrl: DEFAULT_BRAND_ASSET,
  updatedAt: null,
};

const LEGACY_BRAND_ASSETS = new Set([
  "/branding/cpsu-seal.png",
  "/branding/cpsu-seal-720.png",
  "/branding/123.png",
]);

function asNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveUrl(value: unknown, fallback: string) {
  const next = asNonEmptyString(value);
  if (!next) {
    return fallback;
  }
  if (next.startsWith("/")) {
    // Swap stock CPSU defaults to the ChemBalance mark without wiping custom uploads.
    return LEGACY_BRAND_ASSETS.has(next) ? fallback : next;
  }
  if (next.startsWith("http://") || next.startsWith("https://")) {
    return next;
  }
  return fallback;
}

export function getPlatformBranding(): PlatformBranding {
  const db = getDb();
  const row = db
    .prepare<{ value_json: string; updated_at: string | null }>(
      "SELECT value_json, updated_at FROM system_settings WHERE key = ? LIMIT 1",
    )
    .get("platform.branding");

  if (!row) {
    return DEFAULT_BRANDING;
  }

  const value = parseJson<PlatformBrandingSetting>(row.value_json, {});
  const name = asNonEmptyString(value.name) ?? DEFAULT_BRANDING.name;
  const appTitle = asNonEmptyString(value.appTitle) ?? (name.toLowerCase().includes("lms") ? name : `${name} LMS`);
  const logoUrl = resolveUrl(value.logoUrl, DEFAULT_BRANDING.logoUrl);
  const faviconUrl = resolveUrl(value.faviconUrl, logoUrl);

  return {
    name,
    appTitle,
    logoUrl,
    faviconUrl,
    updatedAt: row.updated_at,
  };
}
