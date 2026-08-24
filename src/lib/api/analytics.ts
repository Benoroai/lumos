import "server-only";

import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Session identity for analytics is deliberately weak.
 *
 * The client's opaque session id is hashed together with the tenant, the UTC
 * date and the service-role secret. The result lets us count unique sessions
 * per business per day, and nothing else: it cannot be reversed, cannot be
 * joined across tenants, and rotates every midnight.
 */
export function hashSession(
  sessionId: string | undefined,
  tenantId: string,
): string | null {
  if (!sessionId) return null;
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256")
    .update(
      `${serverEnv().SUPABASE_SERVICE_ROLE_KEY}:${tenantId}:${day}:${sessionId}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/** Referrers are reduced to a host — no paths, no query strings, no tracking. */
export function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.slice(0, 200);
  } catch {
    return null;
  }
}

export function deviceTypeFromUserAgent(
  userAgent: string | null,
): "mobile" | "tablet" | "desktop" | "unknown" {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return "tablet";
  if (/mobi|android|iphone|ipod/.test(ua)) return "mobile";
  if (/mozilla|chrome|safari|firefox|edge/.test(ua)) return "desktop";
  return "unknown";
}
