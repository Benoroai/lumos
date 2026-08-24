import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";
import { deriveSubscriptionStatus } from "@/lib/subscriptions";
import type {
  AccountStatus,
  BusinessType,
  Paginated,
  SubscriptionStatus,
} from "@/lib/types/app";

export type BusinessListRow = {
  id: string;
  slug: string;
  name: string;
  businessType: BusinessType;
  accountStatus: AccountStatus;
  isDeleted: boolean;
  registeredAt: string;
  country: string;
  defaultCurrency: string;
  branchCount: number;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  expiresAt: string | null;
  daysRemaining: number | null;
};

export type BusinessFilters = {
  page: number;
  pageSize: number;
  search?: string | undefined;
  businessType?: string | undefined;
  accountStatus?: string | undefined;
  subscriptionStatus?: string | undefined;
  planCode?: string | undefined;
  includeDeleted?: boolean;
  sort?: string | undefined;
  direction?: "asc" | "desc";
};

const SORTABLE = new Set(["name", "created_at", "registered_at", "slug"]);

/**
 * Server-side pagination and filtering. The Super Admin table is expected to
 * hold hundreds of businesses, so it never loads the full set into memory.
 *
 * Subscription status is derived after the fetch rather than stored, because
 * "expiring soon" and "expired" are functions of the clock — persisting them
 * would mean a nightly job and a window where the database disagrees with
 * reality.
 */
export async function listBusinesses(
  filters: BusinessFilters,
): Promise<Paginated<BusinessListRow>> {
  const admin = createAdminSupabase();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1;

  let query = admin.from("tenants").select(
    `id, slug, name, business_type, account_status, registered_at, country, default_currency,
       deleted_at, created_at,
       subscriptions!left ( id, status, starts_at, expires_at, is_current, plans:plan_id ( code, name ) ),
       branches!left ( id, deleted_at )`,
    { count: "exact" },
  );

  if (!filters.includeDeleted) query = query.is("deleted_at", null);
  if (filters.businessType)
    query = query.eq("business_type", filters.businessType as BusinessType);
  if (filters.accountStatus)
    query = query.eq("account_status", filters.accountStatus as AccountStatus);
  if (filters.search) {
    const term = `%${filters.search.replace(/[%_]/g, "")}%`;
    query = query.or(
      `name.ilike.${term},slug.ilike.${term},legal_name.ilike.${term}`,
    );
  }

  const sortColumn =
    filters.sort && SORTABLE.has(filters.sort) ? filters.sort : "created_at";
  query = query.order(sortColumn, { ascending: filters.direction === "asc" });

  // Status and plan filters are applied after derivation, so paginate later.
  const needsPostFilter = !!filters.subscriptionStatus || !!filters.planCode;
  const { data, count, error } = await (needsPostFilter
    ? query
    : query.range(from, to));

  if (error) throw new Error(`Could not load businesses: ${error.message}`);

  const mapped: BusinessListRow[] = (data ?? []).map((row) => {
    const subscriptions = (row.subscriptions ?? []) as unknown as {
      id: string;
      status: SubscriptionStatus;
      expires_at: string;
      is_current: boolean;
      plans: { code: string; name: string } | null;
    }[];
    const current = subscriptions.find((s) => s.is_current) ?? null;
    const derived = current
      ? deriveSubscriptionStatus(current.status, current.expires_at)
      : null;
    const branches = (row.branches ?? []) as unknown as {
      id: string;
      deleted_at: string | null;
    }[];

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      businessType: row.business_type as BusinessType,
      accountStatus: row.account_status as AccountStatus,
      isDeleted: !!row.deleted_at,
      registeredAt: row.registered_at,
      country: row.country,
      defaultCurrency: row.default_currency,
      branchCount: branches.filter((b) => !b.deleted_at).length,
      planName: current?.plans?.name ?? null,
      subscriptionStatus: derived?.status ?? null,
      expiresAt: current?.expires_at ?? null,
      daysRemaining: derived?.daysRemaining ?? null,
      planCode: current?.plans?.code ?? null,
    } as BusinessListRow & { planCode: string | null };
  });

  if (!needsPostFilter) {
    const total = count ?? 0;
    return {
      rows: mapped,
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
    };
  }

  const filtered = mapped.filter((row) => {
    const withPlan = row as BusinessListRow & { planCode: string | null };
    if (
      filters.subscriptionStatus &&
      row.subscriptionStatus !== filters.subscriptionStatus
    )
      return false;
    if (filters.planCode && withPlan.planCode !== filters.planCode)
      return false;
    return true;
  });

  return {
    rows: filtered.slice(from, from + filters.pageSize),
    total: filtered.length,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.length / filters.pageSize)),
  };
}

export type BusinessDetail = Awaited<ReturnType<typeof getBusinessDetail>>;

export async function getBusinessDetail(tenantId: string) {
  const admin = createAdminSupabase();

  const [
    { data: tenant },
    { data: subscriptions },
    { data: members },
    { data: branches },
    { data: flags },
  ] = await Promise.all([
    admin
      .from("tenants")
      .select(
        "*, business_templates:template_id ( id, name, code, business_type )",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    admin
      .from("subscriptions")
      .select(
        "*, plans:plan_id ( id, code, name, price_amount, price_currency, max_branches, max_items, max_categories, max_users, max_languages )",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    admin
      .from("tenant_users")
      .select(
        "id, email, full_name, status, is_owner, last_login_at, must_change_password, created_at, roles:role_id ( code, name )",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    admin
      .from("branches")
      .select("id, name, slug, city, is_active, public_menu_code")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("display_order"),
    admin
      .from("tenant_feature_flags")
      .select(
        "flag_key, is_enabled, feature_flags:flag_key ( name, description )",
      )
      .eq("tenant_id", tenantId),
  ]);

  if (!tenant) return null;

  const [categories, items, offers, media] = await Promise.all([
    countRows("categories", tenantId),
    countRows("items", tenantId),
    countRows("offers", tenantId),
    countRows("media_assets", tenantId),
  ]);

  const current = (subscriptions ?? []).find((s) => s.is_current) ?? null;

  return {
    tenant,
    subscriptions: subscriptions ?? [],
    currentSubscription: current,
    derivedStatus: current
      ? deriveSubscriptionStatus(current.status, current.expires_at)
      : null,
    members: members ?? [],
    branches: branches ?? [],
    featureFlags: flags ?? [],
    counts: {
      categories,
      items,
      offers,
      media,
      branches: (branches ?? []).length,
    },
  };
}

async function countRows(
  table: "categories" | "items" | "offers" | "media_assets",
  tenantId: string,
): Promise<number> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  return count ?? 0;
}
