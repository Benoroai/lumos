import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import type { TenantSession } from "@/lib/auth/session";
import { actionError, type ActionResult } from "@/lib/types/app";

/**
 * Writes are refused while a subscription is not live. Reads stay open so a
 * business can always see — and later recover — everything it built.
 */
export function assertSubscriptionAllowsWrites(
  session: TenantSession,
): ActionResult<never> | null {
  if (!session.subscription) {
    return actionError(
      "This business has no active subscription. Contact the platform administrator.",
    );
  }
  if (!session.subscription.isLive) {
    return actionError(
      "Your subscription has expired, so the catalog is read-only. Your data is preserved — contact the platform administrator to renew.",
    );
  }
  return null;
}

type LimitedResource = "items" | "categories" | "branches" | "users";

const LIMIT_COLUMN: Record<LimitedResource, string> = {
  items: "max_items",
  categories: "max_categories",
  branches: "max_branches",
  users: "max_users",
};

const TABLE: Record<
  LimitedResource,
  "items" | "categories" | "branches" | "tenant_users"
> = {
  items: "items",
  categories: "categories",
  branches: "branches",
  users: "tenant_users",
};

/**
 * Plan limits are checked against live counts rather than a cached counter, so
 * they cannot drift after deletions or plan changes. Soft-deleted rows do not
 * count against a limit.
 */
export async function checkPlanLimit(
  tenantId: string,
  resource: LimitedResource,
  adding = 1,
): Promise<ActionResult<never> | null> {
  const admin = createAdminSupabase();

  const { data: subscription } = await admin
    .from("subscriptions")
    .select(
      "plans:plan_id ( name, max_items, max_categories, max_branches, max_users )",
    )
    .eq("tenant_id", tenantId)
    .eq("is_current", true)
    .maybeSingle();

  const plan = subscription?.plans as unknown as Record<
    string,
    number | string
  > | null;
  if (!plan) return null;

  const limit = Number(plan[LIMIT_COLUMN[resource]]);
  if (!Number.isFinite(limit)) return null;

  const { count } = await admin
    .from(TABLE[resource])
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if ((count ?? 0) + adding > limit) {
    return actionError(
      `Your ${plan.name} plan allows ${limit} ${resource}. Contact the platform administrator to upgrade.`,
    );
  }

  return null;
}

/** Audit fields common to every tenant-side mutation, including support mode. */
export function auditActor(session: TenantSession) {
  return {
    tenantId: session.tenant.id,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: (session.impersonatedBy ? "platform" : "tenant") as
      "platform" | "tenant",
    actorLabel: session.roleName,
    isImpersonated: !!session.impersonatedBy,
    impersonatedBy: session.impersonatedBy?.userId ?? null,
  };
}

/** Rewrites `{ locale: text }` maps into translation rows for upsert. */
export function translationRows<T extends string>(
  tenantId: string,
  foreignKey: T,
  entityId: string,
  names: Record<string, string>,
  descriptions: Record<string, string> = {},
  ingredients: Record<string, string> = {},
  includeIngredients = false,
): Record<string, unknown>[] {
  const locales = new Set([
    ...Object.keys(names),
    ...Object.keys(descriptions),
    ...Object.keys(ingredients),
  ]);

  return [...locales].map((locale) => ({
    tenant_id: tenantId,
    [foreignKey]: entityId,
    locale,
    name: names[locale] ?? "",
    description: descriptions[locale] ?? "",
    ...(includeIngredients ? { ingredients: ingredients[locale] ?? "" } : {}),
  }));
}
