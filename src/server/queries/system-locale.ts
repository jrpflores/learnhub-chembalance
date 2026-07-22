import { cache } from "react";
import { normalizeLocale, normalizeTimeZone, type DisplayPreferences } from "@/lib/date-display";
import { getSettingValue } from "@/server/queries/admin";

type LocaleSetting = {
  timezone?: string;
  locale?: string;
};

const FALLBACK: DisplayPreferences = {
  timeZone: "Asia/Manila",
  locale: "en-PH",
};

export const getSystemDisplayPreferences = cache((): DisplayPreferences => {
  const setting = getSettingValue<LocaleSetting>("system.locale", {
    timezone: FALLBACK.timeZone,
    locale: FALLBACK.locale,
  });

  return {
    timeZone: normalizeTimeZone(setting.timezone ?? FALLBACK.timeZone),
    locale: normalizeLocale(setting.locale ?? FALLBACK.locale),
  };
});
