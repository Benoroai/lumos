/**
 * Locale negotiation for the public API.
 *
 * Kept free of `server-only` and of any database import so the fallback chain —
 * the part a customer actually notices when a translation is missing — can be
 * unit-tested directly.
 */

export type LocaleCapableBusiness = {
  defaultLocale: string;
  supportedLocales: string[];
};

/** Resolves the response locale: request → tenant default. */
export function resolveLocale(
  requested: string | null | undefined,
  business: LocaleCapableBusiness,
): { locale: string; fallbackLocale: string } {
  const fallbackLocale = business.defaultLocale;
  if (!requested) return { locale: fallbackLocale, fallbackLocale };

  const normalized = requested.toLowerCase();
  const base = normalized.split("-")[0] ?? normalized;

  if (business.supportedLocales.includes(normalized))
    return { locale: normalized, fallbackLocale };
  if (business.supportedLocales.includes(base))
    return { locale: base, fallbackLocale };

  return { locale: fallbackLocale, fallbackLocale };
}

/** Reads the preferred locale from `?locale=` or `Accept-Language`. */
export function requestedLocale(
  request: Request,
  searchParams: URLSearchParams,
): string | null {
  const fromQuery = searchParams.get("locale");
  if (fromQuery) return fromQuery;

  const header = request.headers.get("accept-language");
  if (!header) return null;

  const first = header.split(",")[0]?.split(";")[0]?.trim();
  return first || null;
}
