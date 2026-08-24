import "server-only";

import {
  apiError,
  apiSuccess,
  preflight,
  type ApiMeta,
} from "@/lib/api/response";
import { isOriginAllowed } from "@/lib/api/cors";
import {
  checkRateLimit,
  clientKey,
  rateLimitHeaders,
} from "@/lib/api/rate-limit";
import { serverEnv } from "@/lib/env";
import {
  findBusinessBySlug,
  resolveLocale,
  requestedLocale,
  type PublicBusiness,
} from "./catalog";
import { slugParamSchema } from "@/lib/api/public-schemas";

export type PublicContext = {
  request: Request;
  origin: string | null;
  searchParams: URLSearchParams;
  business: PublicBusiness;
  locale: string;
  fallbackLocale: string;
  meta: ApiMeta;
  extraHeaders: Record<string, string>;
};

/**
 * Shared entry point for every public GET endpoint.
 *
 * Ordering matters: origin allowlist, then rate limit, then business lookup.
 * A rejected origin never gets to consume a lookup, and a rate-limited caller
 * never reaches the database at all.
 *
 * A missing business and a suspended or expired one both return 404 rather
 * than distinguishing between them — the API should not confirm that a slug
 * exists for a business that has chosen not to publish.
 */
export async function handlePublicRequest(
  request: Request,
  slugValue: string,
  handler: (context: PublicContext) => Promise<unknown>,
): Promise<Response> {
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin)) {
    return apiError(
      "origin_not_allowed",
      "This origin is not allowed to call the public API.",
      {
        origin,
      },
    );
  }

  const env = serverEnv();
  const limit = await checkRateLimit(
    clientKey(request, "public-api"),
    env.PUBLIC_API_RATE_LIMIT_PER_MINUTE,
  );

  if (!limit.allowed) {
    return apiError("rate_limited", "Too many requests. Please slow down.", {
      origin,
      extraHeaders: rateLimitHeaders(limit),
    });
  }

  const parsedSlug = slugParamSchema.safeParse(slugValue);
  if (!parsedSlug.success) {
    return apiError("bad_request", "Invalid business identifier.", { origin });
  }

  const business = await findBusinessBySlug(parsedSlug.data);
  if (!business) {
    return apiError(
      "not_found",
      "No published business matches that identifier.",
      { origin },
    );
  }

  const url = new URL(request.url);
  const { locale, fallbackLocale } = resolveLocale(
    requestedLocale(request, url.searchParams),
    business,
  );

  try {
    const data = await handler({
      request,
      origin,
      searchParams: url.searchParams,
      business,
      locale,
      fallbackLocale,
      meta: {},
      extraHeaders: {},
    });

    return apiSuccess(data, {
      origin,
      meta: {
        locale,
        fallbackLocale,
        currency: business.currency,
      },
      extraHeaders: rateLimitHeaders(limit),
    });
  } catch (error) {
    // Handlers signal "this resource is not published" by throwing with a code;
    // anything else is a genuine fault and must not leak its message.
    if (
      error instanceof Error &&
      (error as { code?: string }).code === "not_found"
    ) {
      return apiError("not_found", "That resource is not available.", {
        origin,
      });
    }
    console.error("[public-api] handler failed", error);
    return apiError(
      "internal_error",
      "Something went wrong handling that request.",
      { origin },
    );
  }
}

export function handlePreflight(request: Request): Response {
  return preflight(request.headers.get("origin"));
}
