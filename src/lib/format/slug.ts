/**
 * Slugs appear in public URLs, so they are ASCII-only and hyphenated. Arabic
 * and Persian names transliterate poorly, so when nothing usable survives we
 * fall back to a prefixed random suffix rather than producing an empty slug.
 */
export function slugify(input: string, fallbackPrefix = "item"): string {
  const base = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  if (base.length >= 2) return base;
  return `${fallbackPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isValidSlug(value: string): boolean {
  return (
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value) &&
    value.length >= 2 &&
    value.length <= 63
  );
}

export function isValidCode(value: string): boolean {
  return (
    /^[a-z0-9]+([_-][a-z0-9]+)*$/.test(value) &&
    value.length >= 2 &&
    value.length <= 63
  );
}
