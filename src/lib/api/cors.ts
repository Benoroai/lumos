import "server-only";

import { corsAllowlist } from "@/lib/env";

/**
 * CORS for the public API. The allowlist is environment-driven so a deployment
 * decides which frontends may call it; `*` is honoured but should only ever be
 * set in development.
 */
export function resolveCorsHeaders(
  origin: string | null,
): Record<string, string> {
  const allowlist = corsAllowlist();
  const headers: Record<string, string> = {
    Vary: "Origin, Accept-Language",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept-Language, X-Lumos-Session",
    "Access-Control-Max-Age": "86400",
  };

  if (allowlist.includes("*")) {
    headers["Access-Control-Allow-Origin"] = "*";
    return headers;
  }

  if (origin && allowlist.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function isOriginAllowed(origin: string | null): boolean {
  const allowlist = corsAllowlist();
  if (allowlist.includes("*")) return true;
  if (!origin) return true; // server-to-server calls send no Origin
  return allowlist.includes(origin);
}
