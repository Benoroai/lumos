import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  limit: number;
};

/**
 * Fixed-window limiter backed by Postgres.
 *
 * A database counter is used rather than process memory because serverless
 * instances are ephemeral and numerous — an in-memory limiter would let an
 * attacker multiply their budget by fanning out across cold starts.
 *
 * If the limiter itself fails we fail *open* for reads: losing availability of
 * the whole public API because a counter table hiccuped is the worse outcome.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc(
      "rate_limit_hit" as never,
      {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      } as never,
    );

    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      { allowed: boolean; remaining: number; reset_at: string } | undefined;

    if (!row) throw new Error("rate limiter returned no row");

    return {
      allowed: row.allowed,
      remaining: row.remaining,
      resetAt: row.reset_at,
      limit,
    };
  } catch (error) {
    console.error("[rate-limit] check failed, allowing request", error);
    return {
      allowed: true,
      remaining: limit,
      resetAt: new Date(Date.now() + windowSeconds * 1000).toISOString(),
      limit,
    };
  }
}

export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(
      Math.floor(new Date(result.resetAt).getTime() / 1000),
    ),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": String(
            Math.max(
              1,
              Math.ceil(
                (new Date(result.resetAt).getTime() - Date.now()) / 1000,
              ),
            ),
          ),
        }),
  };
}

/** Coarse client key for the public API. Never stores the raw address. */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  return `${scope}:${ip}`;
}
