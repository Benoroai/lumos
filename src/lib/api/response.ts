import "server-only";

import { NextResponse } from "next/server";
import { resolveCorsHeaders } from "./cors";
import { serverEnv } from "@/lib/env";

export type ApiMeta = {
  locale?: string;
  fallbackLocale?: string;
  currency?: { code: string; symbol: string; decimalDigits: number };
  generatedAt?: string;
  [key: string]: unknown;
};

export const API_VERSION = "v1";

export type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "forbidden"
  | "subscription_inactive"
  | "rate_limited"
  | "origin_not_allowed"
  | "internal_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  forbidden: 403,
  not_found: 404,
  subscription_inactive: 402,
  rate_limited: 429,
  origin_not_allowed: 403,
  internal_error: 500,
};

/**
 * Every public response has the same envelope, so a client can rely on
 * `data` / `meta` / `error` without special-casing endpoints.
 */
export function apiSuccess<T>(
  data: T,
  options: {
    origin: string | null;
    meta?: ApiMeta;
    cacheSeconds?: number;
    extraHeaders?: Record<string, string>;
  },
): NextResponse {
  const cacheSeconds =
    options.cacheSeconds ?? serverEnv().PUBLIC_API_CACHE_SECONDS;

  return NextResponse.json(
    {
      data,
      meta: {
        generatedAt: new Date().toISOString(),
        version: API_VERSION,
        ...options.meta,
      },
    },
    {
      status: 200,
      headers: {
        ...resolveCorsHeaders(options.origin),
        ...(options.extraHeaders ?? {}),
        "Cache-Control": cacheSeconds
          ? `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 2}`
          : "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  options: {
    origin: string | null;
    details?: unknown;
    status?: number;
    extraHeaders?: Record<string, string>;
  },
): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(options.details ? { details: options.details } : {}),
      },
    },
    {
      status: options.status ?? STATUS_BY_CODE[code],
      headers: {
        ...resolveCorsHeaders(options.origin),
        ...(options.extraHeaders ?? {}),
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export function preflight(origin: string | null): NextResponse {
  return new NextResponse(null, {
    status: 204,
    headers: resolveCorsHeaders(origin),
  });
}
