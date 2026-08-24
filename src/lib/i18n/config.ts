/**
 * Dashboard locales. Content locales are a separate, per-tenant concept driven
 * by `languages` in the database — a business may publish in languages the
 * dashboard itself is not translated into.
 */
export const DASHBOARD_LOCALES = ["en", "ar", "fa"] as const;
export type DashboardLocale = (typeof DASHBOARD_LOCALES)[number];

export const DEFAULT_LOCALE: DashboardLocale = "en";

export const RTL_LOCALES = new Set(["ar", "fa", "he", "ur", "ps", "ckb"]);

export const LOCALE_COOKIE = "lumos_locale";

export function isDashboardLocale(
  value: string | undefined | null,
): value is DashboardLocale {
  return !!value && (DASHBOARD_LOCALES as readonly string[]).includes(value);
}

export function textDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.has(locale.split("-")[0] ?? locale) ? "rtl" : "ltr";
}

export const LOCALE_LABELS: Record<
  string,
  { native: string; english: string }
> = {
  en: { native: "English", english: "English" },
  ar: { native: "العربية", english: "Arabic" },
  fa: { native: "فارسی", english: "Persian" },
  ur: { native: "اردو", english: "Urdu" },
  hi: { native: "हिन्दी", english: "Hindi" },
  fr: { native: "Français", english: "French" },
  tr: { native: "Türkçe", english: "Turkish" },
};
