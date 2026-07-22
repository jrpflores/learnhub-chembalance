"use client";

import { useRef, useState, useTransition } from "react";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { extractApiError } from "@/lib/api-error";
import { DEFAULT_BRAND_LOGO_URL } from "@/lib/branding-defaults";
import { uploadMediaFile } from "@/lib/media-upload";
import { publishToast } from "@/lib/toast-events";

type Setting = {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
};

type SettingsEditorProps = {
  settings: Setting[];
};

type BrandingFormState = {
  name: string;
  appTitle: string;
  logoUrl: string;
  faviconUrl: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value;
}

export function SettingsEditor({ settings }: SettingsEditorProps) {
  const brandingSetting = settings.find((setting) => setting.key === "platform.branding") ?? null;
  const brandingRaw = asRecord(brandingSetting?.value);
  const [brandingExtras] = useState<Record<string, unknown>>(() => {
    const next = { ...brandingRaw };
    delete next.name;
    delete next.appTitle;
    delete next.logoUrl;
    delete next.faviconUrl;
    return next;
  });
  const [branding, setBranding] = useState<BrandingFormState>({
    name: asString(brandingRaw.name, "ChemBalance"),
    appTitle: asString(brandingRaw.appTitle, ""),
    logoUrl: asString(brandingRaw.logoUrl, DEFAULT_BRAND_LOGO_URL),
    faviconUrl: asString(brandingRaw.faviconUrl, asString(brandingRaw.logoUrl, DEFAULT_BRAND_LOGO_URL)),
  });

  const [rows, setRows] = useState(
    settings
      .filter((setting) => setting.key !== "platform.branding")
      .map((setting) => ({
      ...setting,
      json: JSON.stringify(setting.value, null, 2),
      })),
  );
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<"logo" | "favicon" | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  async function parseResponsePayload(response: Response) {
    const raw = await response.text();
    if (!raw.trim()) {
      return {};
    }
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  function saveSetting(key: string, json: string, description: string | null) {
    startTransition(async () => {
      try {
        const value = JSON.parse(json);
        const response = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key, value, description: description ?? undefined }),
        });
        const payload = await parseResponsePayload(response);

        if (!response.ok) {
          const parsed = extractApiError(payload, "Unable to update setting.");
          setStatus(parsed.title);
          publishToast({ tone: "error", title: parsed.title, description: parsed.description });
          return;
        }

        setStatus(`Updated ${key}`);
        publishToast({ tone: "success", title: `Updated ${key}` });
      } catch {
        setStatus(`Invalid JSON for ${key}`);
        publishToast({ tone: "error", title: `Invalid JSON for ${key}` });
      }
    });
  }

  function saveBranding() {
    const name = branding.name.trim();
    if (!name) {
      const message = "Application name is required.";
      setStatus(message);
      publishToast({ tone: "error", title: message });
      return;
    }

    startTransition(async () => {
      const payloadValue: Record<string, unknown> = {
        ...brandingExtras,
        name,
      };

      const appTitle = branding.appTitle.trim();
      if (appTitle) {
        payloadValue.appTitle = appTitle;
      } else {
        delete payloadValue.appTitle;
      }

      const logoUrl = branding.logoUrl.trim();
      if (logoUrl) {
        payloadValue.logoUrl = logoUrl;
      } else {
        delete payloadValue.logoUrl;
      }

      const faviconUrl = branding.faviconUrl.trim();
      if (faviconUrl) {
        payloadValue.faviconUrl = faviconUrl;
      } else {
        delete payloadValue.faviconUrl;
      }

      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key: "platform.branding",
          value: payloadValue,
          description: brandingSetting?.description ?? "Platform name and branding",
        }),
      });

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        const parsed = extractApiError(payload, "Unable to update platform branding.");
        setStatus(parsed.title);
        publishToast({ tone: "error", title: parsed.title, description: parsed.description });
        return;
      }

      setStatus("Platform branding updated.");
      publishToast({
        tone: "success",
        title: "Branding updated",
        description: "Application title, logo, and favicon were saved.",
      });
    });
  }

  async function uploadAsset(kind: "logo" | "favicon", file: File) {
    setUploading(kind);
    setStatus(null);
    try {
      const uploaded = await uploadMediaFile(file);
      if (kind === "logo") {
        setBranding((prev) => ({ ...prev, logoUrl: uploaded.url }));
      } else {
        setBranding((prev) => ({ ...prev, faviconUrl: uploaded.url }));
      }
      publishToast({ tone: "success", title: `${kind === "logo" ? "Logo" : "Favicon"} uploaded` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed.";
      setStatus(message);
      publishToast({ tone: "error", title: message });
    } finally {
      setUploading(null);
    }
  }

  function useDefaultBrandAsset(kind: "logo" | "favicon" | "both") {
    setStatus(null);
    setBranding((prev) => {
      if (kind === "logo") {
        return { ...prev, logoUrl: DEFAULT_BRAND_LOGO_URL };
      }
      if (kind === "favicon") {
        return { ...prev, faviconUrl: DEFAULT_BRAND_LOGO_URL };
      }
      return {
        ...prev,
        logoUrl: DEFAULT_BRAND_LOGO_URL,
        faviconUrl: DEFAULT_BRAND_LOGO_URL,
      };
    });
    publishToast({
      tone: "info",
      title: kind === "both" ? "Default logo and favicon applied" : `Default ${kind} applied`,
      description: "Click Save Branding to keep this change.",
    });
  }

  return (
    <div className="space-y-4">
      {status ? <p className="rounded-xl bg-[var(--line-100)] px-3 py-2 text-sm text-[var(--ink-700)]">{status}</p> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[var(--ink-900)]">Platform Branding</h3>
            <p className="text-xs text-[var(--ink-500)]">Update application title, sidebar/login logo, and browser favicon.</p>
          </div>
          <Button size="sm" disabled={pending || uploading !== null} onClick={saveBranding}>
            Save Branding
          </Button>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Application Name
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm text-[var(--ink-900)]"
                value={branding.name}
                onChange={(event) => setBranding((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="ChemBalance"
              />
            </label>
            <label className="block text-sm font-semibold text-[var(--ink-700)]">
              Browser Title
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm text-[var(--ink-900)]"
                value={branding.appTitle}
                onChange={(event) => setBranding((prev) => ({ ...prev, appTitle: event.target.value }))}
                placeholder="ChemBalance LMS"
              />
            </label>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block text-sm font-semibold text-[var(--ink-700)]">
                Logo URL
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm text-[var(--ink-900)]"
                  value={branding.logoUrl}
                  onChange={(event) => setBranding((prev) => ({ ...prev, logoUrl: event.target.value }))}
                  placeholder="/media/..."
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*,.ico,image/x-icon,image/vnd.microsoft.icon"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadAsset("logo", file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || uploading !== null}
                  onClick={() => logoInputRef.current?.click()}
                >
                  {uploading === "logo" ? "Uploading..." : "Upload Logo"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || uploading !== null || branding.logoUrl === DEFAULT_BRAND_LOGO_URL}
                  onClick={() => useDefaultBrandAsset("logo")}
                >
                  Use Default
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <label className="block text-sm font-semibold text-[var(--ink-700)]">
                Favicon URL
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--line-300)] px-3 text-sm text-[var(--ink-900)]"
                  value={branding.faviconUrl}
                  onChange={(event) => setBranding((prev) => ({ ...prev, faviconUrl: event.target.value }))}
                  placeholder="/media/..."
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/*,.ico,image/x-icon,image/vnd.microsoft.icon"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      void uploadAsset("favicon", file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending || uploading !== null}
                  onClick={() => faviconInputRef.current?.click()}
                >
                  {uploading === "favicon" ? "Uploading..." : "Upload Favicon"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || uploading !== null || branding.faviconUrl === DEFAULT_BRAND_LOGO_URL}
                  onClick={() => useDefaultBrandAsset("favicon")}
                >
                  Use Default
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={
                  pending ||
                  uploading !== null ||
                  (branding.logoUrl === DEFAULT_BRAND_LOGO_URL && branding.faviconUrl === DEFAULT_BRAND_LOGO_URL)
                }
                onClick={() => useDefaultBrandAsset("both")}
              >
                Use Default Logo for Both
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line-200)] bg-[var(--line-100)] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-500)]">Preview</p>
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--line-200)] bg-white p-1">
                <BrandLogo src={branding.logoUrl || DEFAULT_BRAND_LOGO_URL} alt={`${branding.name || "App"} logo`} size={30} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[var(--brand-600)]">
                  {branding.name || "Application"}
                </p>
                <p className="truncate text-sm font-semibold text-[var(--ink-900)]">{branding.appTitle || `${branding.name || "App"} LMS`}</p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 rounded-xl border border-[var(--line-200)] bg-white px-3 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={branding.faviconUrl || branding.logoUrl || DEFAULT_BRAND_LOGO_URL}
                alt="Favicon preview"
                className="h-8 w-8 rounded-md border border-[var(--line-200)] bg-white object-contain p-0.5"
                loading="lazy"
                decoding="async"
              />
              <p className="text-xs text-[var(--ink-600)]">
                Favicon updates after Save Branding. Hard-reload the tab (Cmd+Shift+R) if the old icon sticks —
                browsers cache /favicon.ico aggressively.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div>
          <h3 className="text-sm font-bold text-[var(--ink-900)]">Advanced JSON Settings</h3>
          <p className="text-xs text-[var(--ink-500)]">Use this for feature toggles and system-level configuration values.</p>
        </div>
      </Card>

      {rows.map((setting, index) => (
        <Card key={setting.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[var(--ink-900)]">{setting.key}</h3>
              {setting.description ? <p className="text-xs text-[var(--ink-500)]">{setting.description}</p> : null}
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => saveSetting(setting.key, setting.json, setting.description)}
            >
              Save
            </Button>
          </div>

          <textarea
            className="mt-3 min-h-44 w-full rounded-xl border border-[var(--line-300)] bg-[var(--line-100)] p-3 text-xs font-mono"
            value={setting.json}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...setting, json: event.target.value };
              setRows(next);
            }}
          />
        </Card>
      ))}
    </div>
  );
}
