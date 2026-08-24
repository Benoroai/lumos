import { NextResponse } from "next/server";
import { apiError, preflight } from "@/lib/api/response";
import { isOriginAllowed, resolveCorsHeaders } from "@/lib/api/cors";
import {
  checkRateLimit,
  clientKey,
  rateLimitHeaders,
} from "@/lib/api/rate-limit";
import {
  analyticsBatchSchema,
  analyticsEventSchema,
  type AnalyticsEventInput,
} from "@/lib/api/public-schemas";
import {
  deviceTypeFromUserAgent,
  hashSession,
  referrerHost,
} from "@/lib/api/analytics";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createPublicSupabase } from "@/lib/supabase/public";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/public/analytics/events
 *
 * Ingests menu-usage events from the separate customer frontend.
 *
 * The anon key has no INSERT grant on `analytics_events`, so events cannot be
 * forged by calling PostgREST directly with the public key — everything must
 * come through here, where it is validated, rate limited, and stripped of
 * anything identifying before it is written with the service role.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  if (!isOriginAllowed(origin)) {
    return apiError(
      "origin_not_allowed",
      "This origin is not allowed to submit analytics.",
      {
        origin,
      },
    );
  }

  const env = serverEnv();
  const limit = await checkRateLimit(
    clientKey(request, "public-analytics"),
    env.PUBLIC_API_ANALYTICS_RATE_LIMIT_PER_MINUTE,
  );

  if (!limit.allowed) {
    return apiError("rate_limited", "Too many events. Please batch them.", {
      origin,
      extraHeaders: rateLimitHeaders(limit),
    });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("bad_request", "Body must be valid JSON.", { origin });
  }

  // Accept a single event or a batch — a menu screen often has several to send.
  const looksBatched =
    typeof payload === "object" && payload !== null && "events" in payload;

  const parsed = looksBatched
    ? analyticsBatchSchema.safeParse(payload)
    : analyticsEventSchema.safeParse(payload);

  if (!parsed.success) {
    // Report the issues from the shape the caller actually sent, not from the
    // other branch — "expected array, received undefined" is useless feedback
    // to someone who posted a single event with one bad field.
    return apiError("bad_request", "Invalid analytics payload.", {
      origin,
      details: parsed.error.issues.map((issue) =>
        issue.path.length
          ? `${issue.path.join(".")}: ${issue.message}`
          : issue.message,
      ),
    });
  }

  const batch = looksBatched
    ? (parsed.data as { events: AnalyticsEventInput[] })
    : { events: [parsed.data as AnalyticsEventInput] };

  const publicClient = createPublicSupabase();
  const admin = createAdminSupabase();
  const userAgent = request.headers.get("user-agent");
  const referrer = referrerHost(request.headers.get("referer"));

  const rows: Record<string, unknown>[] = [];
  let rejected = 0;

  for (const event of batch.events) {
    // Resolve the tenant through the *anonymous* client: a business that is
    // suspended or out of subscription is invisible to it, so events for it
    // are silently dropped rather than accumulating against a dormant account.
    const { data: tenant } = await publicClient
      .from("tenants")
      .select("id")
      .eq("slug", event.businessSlug)
      .maybeSingle();

    if (!tenant) {
      rejected += 1;
      continue;
    }

    let branchId: string | null = null;
    if (event.branchSlug) {
      const { data: branch } = await publicClient
        .from("branches")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("slug", event.branchSlug)
        .maybeSingle();
      branchId = branch?.id ?? null;
    }

    // Client-supplied ids are public UUIDs; map them to internal rows and drop
    // anything that does not belong to this tenant.
    const [itemId, categoryId, offerId] = await Promise.all([
      resolveInternalId(publicClient, "items", tenant.id, event.itemId),
      resolveInternalId(
        publicClient,
        "categories",
        tenant.id,
        event.categoryId,
      ),
      resolveInternalId(publicClient, "offers", tenant.id, event.offerId),
    ]);

    rows.push({
      tenant_id: tenant.id,
      branch_id: branchId,
      event_type: event.type,
      item_id: itemId,
      category_id: categoryId,
      offer_id: offerId,
      session_hash: hashSession(event.sessionId, tenant.id),
      locale: event.locale ?? null,
      search_query: event.searchQuery?.slice(0, 200) ?? null,
      search_results_count: event.searchResultsCount ?? null,
      device_type: event.deviceType ?? deviceTypeFromUserAgent(userAgent),
      referrer_host: referrer,
      occurred_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await admin
      .from("analytics_events")
      .insert(rows as never);
    if (error) {
      console.error("[analytics] insert failed", error.message);
      return apiError("internal_error", "Could not record those events.", {
        origin,
      });
    }
  }

  return NextResponse.json(
    { data: { accepted: rows.length, rejected } },
    {
      status: 202,
      headers: {
        ...resolveCorsHeaders(origin),
        ...rateLimitHeaders(limit),
        "Cache-Control": "no-store",
      },
    },
  );
}

async function resolveInternalId(
  client: ReturnType<typeof createPublicSupabase>,
  table: "items" | "categories" | "offers",
  tenantId: string,
  publicId: string | undefined,
): Promise<string | null> {
  if (!publicId) return null;
  const { data } = await client
    .from(table)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("public_id", publicId)
    .maybeSingle();
  return data?.id ?? null;
}

export async function OPTIONS(request: Request) {
  return preflight(request.headers.get("origin"));
}
