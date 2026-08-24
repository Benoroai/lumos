import type { LocalizedText } from "@/lib/types/app";

export type TranslationRow = {
  locale: string;
  name?: string | null;
  description?: string | null;
  ingredients?: string | null;
  status?: string;
};

/** Collapses translation rows into a `{ locale: value }` map. */
export function toLocalizedMap(
  rows: readonly TranslationRow[] | null | undefined,
  field: "name" | "description" | "ingredients" = "name",
): LocalizedText {
  const out: LocalizedText = {};
  for (const row of rows ?? []) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) out[row.locale] = value;
  }
  return out;
}

/**
 * Requested locale → tenant default → any non-empty translation. The last step
 * matters: a half-translated catalog should still render something readable
 * rather than a blank card.
 */
export function pickLocale(
  translations: LocalizedText | null | undefined,
  requested: string,
  fallback: string,
): string {
  if (!translations) return "";
  return (
    translations[requested] ||
    translations[requested.split("-")[0] ?? requested] ||
    translations[fallback] ||
    Object.values(translations).find((v) => v && v.length > 0) ||
    ""
  );
}

export function localizedFromRows(
  rows: readonly TranslationRow[] | null | undefined,
  requested: string,
  fallback: string,
  field: "name" | "description" | "ingredients" = "name",
): string {
  return pickLocale(toLocalizedMap(rows, field), requested, fallback);
}
