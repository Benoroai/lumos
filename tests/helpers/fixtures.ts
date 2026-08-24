import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type TenantFixture = {
  tenantId: string;
  slug: string;
  ownerUserId: string;
  menuManagerUserId: string;
  viewerUserId: string;
  branchId: string;
  categoryId: string;
  itemId: string;
  itemPublicId: string;
  offerId: string;
  modifierGroupId: string;
};

/**
 * Builds a complete tenant with three differently-privileged users, using the
 * service role (which bypasses RLS) so fixtures never depend on the policies
 * they are meant to test.
 */
export async function createTenantFixture(
  client: Client,
  options: {
    slug: string;
    /** Days until the subscription expires. Negative = already expired. */
    expiresInDays?: number;
    accountStatus?: "active" | "suspended" | "archived";
    subscriptionStatus?: "active" | "trial" | "suspended" | "cancelled";
    defaultLocale?: string;
    locales?: string[];
    planCode?: string;
  },
): Promise<TenantFixture> {
  const expiresInDays = options.expiresInDays ?? 365;
  const locales = options.locales ?? ["en", "ar"];
  const defaultLocale = options.defaultLocale ?? "en";

  const { rows: templateRows } = await client.query<{ id: string }>(
    `select id from public.business_templates where code = 'restaurant'`,
  );
  const { rows: planRows } = await client.query<{ id: string }>(
    `select id from public.plans where code = $1`,
    [options.planCode ?? "growth"],
  );
  const { rows: roleRows } = await client.query<{ id: string; code: string }>(
    `select id, code from public.roles where tenant_id is null`,
  );
  const roleId = (code: string) => roleRows.find((r) => r.code === code)!.id;

  const { rows: tenantRows } = await client.query<{ id: string }>(
    `insert into public.tenants
       (slug, name, business_type, template_id, default_locale, supported_locales,
        default_currency, account_status, internal_notes)
     values ($1, $2, 'restaurant', $3, $4, $5, 'OMR', $6, 'private platform note')
     returning id`,
    [
      options.slug,
      `Fixture ${options.slug}`,
      templateRows[0]!.id,
      defaultLocale,
      locales,
      options.accountStatus ?? "active",
    ],
  );
  const tenantId = tenantRows[0]!.id;

  await client.query(
    `insert into public.subscriptions (tenant_id, plan_id, status, starts_at, expires_at, is_current)
     values ($1, $2, $3, now() - interval '400 days', now() + ($4 || ' days')::interval, true)`,
    [
      tenantId,
      planRows[0]!.id,
      options.subscriptionStatus ?? "active",
      String(expiresInDays),
    ],
  );

  const users: Record<string, string> = {};
  for (const [label, code] of [
    ["owner", "owner"],
    ["menuManager", "menu_manager"],
    ["viewer", "viewer"],
  ] as const) {
    const userId = randomUUID();
    const email = `${label}.${options.slug}@fixture.test`;
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userId,
      email,
    ]);
    await client.query(
      `insert into public.tenant_users (tenant_id, user_id, role_id, email, full_name, status, is_owner)
       values ($1, $2, $3, $4, $5, 'active', $6)`,
      [tenantId, userId, roleId(code), email, label, code === "owner"],
    );
    users[label] = userId;
  }

  await client.query(
    `insert into public.business_settings (tenant_id) values ($1)`,
    [tenantId],
  );

  const { rows: branchRows } = await client.query<{ id: string }>(
    `insert into public.branches (tenant_id, slug, name, is_active)
     values ($1, 'main', 'Main branch', true) returning id`,
    [tenantId],
  );

  const { rows: categoryRows } = await client.query<{ id: string }>(
    `insert into public.categories (tenant_id, slug, is_active, display_order)
     values ($1, 'starters', true, 0) returning id`,
    [tenantId],
  );

  for (const locale of locales) {
    await client.query(
      `insert into public.category_translations (tenant_id, category_id, locale, name, status)
       values ($1, $2, $3, $4, 'approved')`,
      [
        tenantId,
        categoryRows[0]!.id,
        locale,
        locale === "ar" ? "المقبلات" : "Starters",
      ],
    );
  }

  const { rows: itemRows } = await client.query<{
    id: string;
    public_id: string;
  }>(
    `insert into public.items
       (tenant_id, category_id, sku, base_price, is_active, in_stock, display_order)
     values ($1, $2, 'FIX-1', 6.500, true, true, 0)
     returning id, public_id`,
    [tenantId, categoryRows[0]!.id],
  );

  for (const locale of locales) {
    await client.query(
      `insert into public.item_translations (tenant_id, item_id, locale, name, description, status)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        itemRows[0]!.id,
        locale,
        locale === "ar" ? "مندي لحم" : "Lamb Mandi",
        locale === "ar" ? "وصف عربي" : "English description",
        locale === defaultLocale ? "approved" : "ai_generated",
      ],
    );
  }

  const { rows: groupRows } = await client.query<{ id: string }>(
    `insert into public.modifier_groups (tenant_id, code, selection_type, is_required, min_selections)
     values ($1, 'size', 'single', true, 1) returning id`,
    [tenantId],
  );

  await client.query(
    `insert into public.modifier_group_translations (tenant_id, modifier_group_id, locale, name, status)
     values ($1, $2, 'en', 'Size', 'approved')`,
    [tenantId, groupRows[0]!.id],
  );

  await client.query(
    `insert into public.item_modifier_groups (tenant_id, item_id, modifier_group_id)
     values ($1, $2, $3)`,
    [tenantId, itemRows[0]!.id, groupRows[0]!.id],
  );

  const { rows: offerRows } = await client.query<{ id: string }>(
    `insert into public.offers
       (tenant_id, code, discount_type, discount_value, starts_at, ends_at, is_active)
     values ($1, 'live-offer', 'percentage', 20, now() - interval '1 day', now() + interval '10 days', true)
     returning id`,
    [tenantId],
  );

  await client.query(
    `insert into public.offer_translations (tenant_id, offer_id, locale, name, status)
     values ($1, $2, 'en', 'Live offer', 'approved')`,
    [tenantId, offerRows[0]!.id],
  );

  await client.query(
    `insert into public.offer_targets (tenant_id, offer_id, target_type)
     values ($1, $2, 'all_items')`,
    [tenantId, offerRows[0]!.id],
  );

  await client.query(
    `insert into public.analytics_events (tenant_id, branch_id, event_type, session_hash, locale)
     values ($1, $2, 'menu_view', 'fixture-session', 'en')`,
    [tenantId, branchRows[0]!.id],
  );

  return {
    tenantId,
    slug: options.slug,
    ownerUserId: users.owner!,
    menuManagerUserId: users.menuManager!,
    viewerUserId: users.viewer!,
    branchId: branchRows[0]!.id,
    categoryId: categoryRows[0]!.id,
    itemId: itemRows[0]!.id,
    itemPublicId: itemRows[0]!.public_id,
    offerId: offerRows[0]!.id,
    modifierGroupId: groupRows[0]!.id,
  };
}

export async function createPlatformAdmin(
  client: Client,
  role: "super_admin" | "support" | "analyst" = "super_admin",
): Promise<string> {
  const userId = randomUUID();
  const email = `${role}.${userId.slice(0, 8)}@platform.test`;
  await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
    userId,
    email,
  ]);
  await client.query(
    `insert into public.platform_users (user_id, email, full_name, role, is_active)
     values ($1, $2, $3, $4, true)`,
    [userId, email, "Platform staff", role],
  );
  return userId;
}

/** A user with an auth record but no membership anywhere. */
export async function createOrphanUser(client: Client): Promise<string> {
  const userId = randomUUID();
  await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
    userId,
    `orphan.${userId.slice(0, 8)}@fixture.test`,
  ]);
  return userId;
}

/**
 * Truncating `tenants` cascades into `roles` (tenant-scoped custom roles hold
 * an FK to it), which takes the system roles with it. Re-applying the
 * reference-data migration puts them back; it is written to be idempotent
 * precisely so it can be re-run like this.
 */
const REFERENCE_DATA_SQL = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0008_reference_data.sql"),
  "utf8",
);

export async function resetDatabase(client: Client): Promise<void> {
  await client.query(`
    truncate
      public.analytics_events,
      public.audit_logs,
      public.login_audit,
      public.translation_jobs,
      public.media_assets,
      public.tenant_user_permissions,
      public.tenant_users,
      public.tenant_feature_flags,
      public.business_settings,
      public.offer_targets,
      public.offer_translations,
      public.offers,
      public.item_modifier_groups,
      public.modifier_translations,
      public.modifiers,
      public.modifier_group_translations,
      public.modifier_groups,
      public.item_branch_settings,
      public.item_translations,
      public.items,
      public.category_translations,
      public.category_branches,
      public.categories,
      public.branches,
      public.subscriptions,
      public.tenants,
      public.platform_users,
      public.rate_limits
    restart identity cascade;
  `);
  await client.query(`delete from auth.users`);
  await client.query(REFERENCE_DATA_SQL);
}
