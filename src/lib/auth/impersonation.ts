import "server-only";

import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Support impersonation.
 *
 * The cookie is HMAC-signed with the service-role key and short-lived, so it
 * cannot be forged or replayed indefinitely. Entering and leaving the mode is
 * audited, and `getTenantSession()` re-checks that the bearer is still an
 * active platform operator on every request — the cookie alone grants nothing.
 */
const COOKIE_NAME = "lumos_support_session";
const MAX_AGE_SECONDS = 60 * 60; // one hour

export type ImpersonationClaim = {
  tenantId: string;
  platformUserId: string;
  startedAt: string;
};

function sign(payload: string): string {
  return createHmac("sha256", serverEnv().SUPABASE_SERVICE_ROLE_KEY)
    .update(payload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function startImpersonation(
  claim: ImpersonationClaim,
): Promise<void> {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function stopImpersonation(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function readImpersonation(): Promise<ImpersonationClaim | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  const separator = raw.lastIndexOf(".");
  if (separator <= 0) return null;

  const payload = raw.slice(0, separator);
  const signature = raw.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  try {
    const claim = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as ImpersonationClaim;
    const age = Date.now() - new Date(claim.startedAt).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_SECONDS * 1000) return null;
    return claim;
  } catch {
    return null;
  }
}
