import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { deriveSubscriptionStatus } from "@/lib/subscriptions";
import type { BusinessType, SubscriptionStatus } from "@/lib/types/app";

export type PlatformOverview = {
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  archivedBusinesses: number;
  expiredSubscriptions: number;
  expiringSubscriptions: number;
  trialSubscriptions: number;
  totalBranches: number;
  totalCategories: number;
  totalItems: number;
  totalOffers: number;
  totalPlatformUsers: number;
  byType: { type: BusinessType; count: number }[];
  byPlan: { plan: string; count: number }[];
  byStatus: { status: SubscriptionStatus; count: number }[];
  recentBusinesses: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    type: BusinessType;
  }[];
  expiringSoon: {
    id: string;
    name: string;
    expiresAt: string;
    daysRemaining: number;
    status: SubscriptionStatus;
  }[];
};

/**
 * Platform-wide totals. This is the one place in the product that is
 * legitimately cross-tenant. The signed-in platform operator is authorized by
 * RLS, and this function only aggregates. No tenant's individual analytics are
 * exposed here.
 */
export async function getPlatformOverview(): Promise<PlatformOverview> {
  const supabase = await createServerSupabase();

  const [tenantsResult, subscriptionsResult, platformUsersResult] =
    await Promise.all([
      admin
        .from("tenants")
        .select("id, name, slug, business_type, account_status, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      admin
        .from("subscriptions")
        .select("tenant_id, status, expires_at, plans:plan_id ( code, name )")
        .eq("is_current", true),
      admin
        .from("platform_users")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);

  const tenants = tenantsResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const [branches, categories, items, offers] = await Promise.all([
    countAll("branches"),
    countAll("categories"),
    countAll("items"),
    countAll("offers"),
  ]);

  const byTypeMap = new Map<BusinessType, number>();
  for (const tenant of tenants) {
    const type = tenant.business_type as BusinessType;
    byTypeMap.set(type, (byTypeMap.get(type) ?? 0) + 1);
  }

  const byPlanMap = new Map<string, number>();
  const byStatusMap = new Map<SubscriptionStatus, number>();
  const expiringSoon: PlatformOverview["expiringSoon"] = [];

  let expired = 0;
  let expiring = 0;
  let trial = 0;

  for (const subscription of subscriptions) {
    // A subscription belonging to a soft-deleted tenant is not platform state.
    if (!tenantById.has(subscription.tenant_id)) continue;

    const plan = subscription.plans as unknown as {
      code: string;
      name: string;
    } | null;
    const planName = plan?.name ?? "Unknown";
    byPlanMap.set(planName, (byPlanMap.get(planName) ?? 0) + 1);

    const derived = deriveSubscriptionStatus(
      subscription.status,
      subscription.expires_at,
    );
    byStatusMap.set(derived.status, (byStatusMap.get(derived.status) ?? 0) + 1);

    if (derived.status === "expired") expired += 1;
    if (derived.status === "expiring_soon") {
      expiring += 1;
      const tenant = tenantById.get(subscription.tenant_id);
      if (tenant) {
        expiringSoon.push({
          id: tenant.id,
          name: tenant.name,
          expiresAt: subscription.expires_at,
          daysRemaining: derived.daysRemaining,
          status: derived.status,
        });
      }
    }
    if (derived.status === "trial") trial += 1;
  }

  expiringSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);

  return {
    totalBusinesses: tenants.length,
    activeBusinesses: tenants.filter((t) => t.account_status === "active")
      .length,
    suspendedBusinesses: tenants.filter((t) => t.account_status === "suspended")
      .length,
    archivedBusinesses: tenants.filter((t) => t.account_status === "archived")
      .length,
    expiredSubscriptions: expired,
    expiringSubscriptions: expiring,
    trialSubscriptions: trial,
    totalBranches: branches,
    totalCategories: categories,
    totalItems: items,
    totalOffers: offers,
    totalPlatformUsers: platformUsersResult.count ?? 0,
    byType: [...byTypeMap]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count),
    byPlan: [...byPlanMap]
      .map(([plan, count]) => ({ plan, count }))
      .sort((a, b) => b.count - a.count),
    byStatus: [...byStatusMap].map(([status, count]) => ({ status, count })),
    recentBusinesses: tenants.slice(0, 6).map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      createdAt: t.created_at,
      type: t.business_type as BusinessType,
    })),
    expiringSoon: expiringSoon.slice(0, 8),
  };
}

async function countAll(
  table: "branches" | "categories" | "items" | "offers",
): Promise<number> {
  const supabase = await createServerSupabase();
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  return count ?? 0;
}

export type AuditLogRow = {
  id: number;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorEmail: string | null;
  actorType: string;
  tenantId: string | null;
  tenantName: string | null;
  isImpersonated: boolean;
  previousValues: unknown;
  newValues: unknown;
  metadata: unknown;
  ipAddress: string | null;
};

export async function listAuditLogs(options: {
  page: number;
  pageSize: number;
  tenantId?: string | undefined;
  action?: string | undefined;
  actorEmail?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): Promise<{ rows: AuditLogRow[]; total: number; pageCount: number }> {
  const supabase = await createServerSupabase();
  const rangeFrom = (options.page - 1) * options.pageSize;

  let query = admin
    .from("audit_logs")
    .select("*, tenants:tenant_id ( name )", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeFrom + options.pageSize - 1);

  if (options.tenantId) query = query.eq("tenant_id", options.tenantId);
  if (options.action) query = query.eq("action", options.action);
  if (options.actorEmail)
    query = query.ilike("actor_email", `%${options.actorEmail}%`);
  if (options.from) query = query.gte("created_at", options.from);
  if (options.to) query = query.lte("created_at", options.to);

  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load audit logs: ${error.message}`);

  return {
    rows: (data ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      actorEmail: row.actor_email,
      actorType: row.actor_type,
      tenantId: row.tenant_id,
      tenantName:
        (row.tenants as unknown as { name: string } | null)?.name ?? null,
      isImpersonated: row.is_impersonated,
      previousValues: row.previous_values,
      newValues: row.new_values,
      metadata: row.metadata,
      ipAddress: row.ip_address,
    })),
    total: count ?? 0,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / options.pageSize)),
  };
}
