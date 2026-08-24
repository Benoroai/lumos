import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asPrincipal, connectTestDb, expectRejected } from "../helpers/db";
import {
  createTenantFixture,
  resetDatabase,
  type TenantFixture,
} from "../helpers/fixtures";

/**
 * PUBLIC (anon) SURFACE.
 *
 * The anon key ships to the customer-facing frontend, so whatever `anon` can
 * reach is effectively public. These tests pin that surface down: what it may
 * read, what it must not, and how subscription and account state gate it.
 */
describe("public read surface", () => {
  let client: Client;
  let live: TenantFixture;
  let expired: TenantFixture;
  let suspended: TenantFixture;

  beforeAll(async () => {
    client = await connectTestDb();
    await resetDatabase(client);

    live = await createTenantFixture(client, {
      slug: "live-co",
      expiresInDays: 200,
    });
    expired = await createTenantFixture(client, {
      slug: "expired-co",
      expiresInDays: -3,
    });
    suspended = await createTenantFixture(client, {
      slug: "suspended-co",
      accountStatus: "suspended",
    });
  });

  afterAll(async () => {
    await client.end();
  });

  it("publishes an active business with a live subscription", async () => {
    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain("live-co");
  });

  it("withholds a business whose subscription has expired", async () => {
    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    expect(rows.map((r) => r.slug)).not.toContain("expired-co");
  });

  it("withholds a suspended business", async () => {
    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    expect(rows.map((r) => r.slug)).not.toContain("suspended-co");
  });

  it("withholds the catalog of an expired business too, not just its profile", async () => {
    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query<{ tenant_id: string }>(
            "select tenant_id from public.items",
          )
        ).rows,
    );

    const tenantIds = rows.map((r) => r.tenant_id);
    expect(tenantIds).toContain(live.tenantId);
    expect(tenantIds).not.toContain(expired.tenantId);
    expect(tenantIds).not.toContain(suspended.tenantId);
  });

  it("restores public access the moment a subscription is renewed", async () => {
    await client.query(
      `update public.subscriptions
         set expires_at = now() + interval '365 days'
       where tenant_id = $1 and is_current`,
      [expired.tenantId],
    );

    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    expect(rows.map((r) => r.slug)).toContain("expired-co");

    await client.query(
      `update public.subscriptions
         set expires_at = now() - interval '3 days'
       where tenant_id = $1 and is_current`,
      [expired.tenantId],
    );
  });

  it("never exposes internal notes", async () => {
    const message = await expectRejected(
      client,
      { kind: "anon" },
      "select internal_notes from public.tenants",
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("never exposes staff records", async () => {
    const message = await expectRejected(
      client,
      { kind: "anon" },
      "select email from public.tenant_users",
    );
    expect(message).toMatch(/permission denied/i);
  });

  it("never exposes audit or login history", async () => {
    for (const table of [
      "audit_logs",
      "login_audit",
      "platform_users",
      "platform_settings",
    ]) {
      const message = await expectRejected(
        client,
        { kind: "anon" },
        `select * from public.${table}`,
      );
      expect(message).toMatch(/permission denied/i);
    }
  });

  it("cannot write anything at all", async () => {
    const statements: [string, unknown[]][] = [
      [
        `insert into public.items (tenant_id, base_price) values ($1, 1.000)`,
        [live.tenantId],
      ],
      [
        `update public.items set base_price = 0 where tenant_id = $1`,
        [live.tenantId],
      ],
      [`delete from public.categories where tenant_id = $1`, [live.tenantId]],
      [
        `insert into public.analytics_events (tenant_id, event_type) values ($1, 'menu_view')`,
        [live.tenantId],
      ],
    ];

    for (const [sql, params] of statements) {
      const message = await expectRejected(
        client,
        { kind: "anon" },
        sql,
        params,
      );
      expect(message).toMatch(/permission denied|row-level security/i);
    }
  });

  it("hides an inactive item but keeps an out-of-stock one visible", async () => {
    await client.query(
      `update public.items set is_active = false where id = $1`,
      [live.itemId],
    );

    const hidden = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query("select id from public.items where id = $1", [
            live.itemId,
          ])
        ).rowCount,
    );
    expect(hidden).toBe(0);

    // Out of stock is an availability flag, not a reason to disappear: the
    // customer frontend needs the row so it can render it as unavailable.
    await client.query(
      `update public.items set is_active = true, in_stock = false where id = $1`,
      [live.itemId],
    );

    const visible = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query<{ in_stock: boolean }>(
            "select in_stock from public.items where id = $1",
            [live.itemId],
          )
        ).rows,
    );

    expect(visible).toHaveLength(1);
    expect(visible[0]!.in_stock).toBe(false);

    await client.query(
      `update public.items set in_stock = true where id = $1`,
      [live.itemId],
    );
  });

  it("respects a scheduled visibility window", async () => {
    await client.query(
      `update public.items set visible_from = now() + interval '2 days' where id = $1`,
      [live.itemId],
    );

    const future = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query("select id from public.items where id = $1", [
            live.itemId,
          ])
        ).rowCount,
    );
    expect(future).toBe(0);

    await client.query(
      `update public.items set visible_from = now() - interval '1 day',
                               visible_until = now() - interval '1 hour'
       where id = $1`,
      [live.itemId],
    );

    const past = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query("select id from public.items where id = $1", [
            live.itemId,
          ])
        ).rowCount,
    );
    expect(past).toBe(0);

    await client.query(
      `update public.items set visible_from = null, visible_until = null where id = $1`,
      [live.itemId],
    );

    const now = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query("select id from public.items where id = $1", [
            live.itemId,
          ])
        ).rowCount,
    );
    expect(now).toBe(1);
  });

  it("serves only live offers", async () => {
    await client.query(
      `insert into public.offers (tenant_id, code, discount_type, discount_value, starts_at, ends_at, is_active)
       values
         ($1, 'past-offer', 'percentage', 10, now() - interval '30 days', now() - interval '1 day', true),
         ($1, 'future-offer', 'percentage', 10, now() + interval '5 days', now() + interval '30 days', true),
         ($1, 'paused-offer', 'percentage', 10, now() - interval '1 day', now() + interval '5 days', false)`,
      [live.tenantId],
    );

    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query<{ code: string }>(
            "select code from public.offers where tenant_id = $1",
            [live.tenantId],
          )
        ).rows,
    );

    const codes = rows.map((r) => r.code);
    expect(codes).toContain("live-offer");
    expect(codes).not.toContain("past-offer");
    expect(codes).not.toContain("future-offer");
    expect(codes).not.toContain("paused-offer");
  });

  it("serves translations for every language the business publishes", async () => {
    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (
          await c.query<{ locale: string; name: string }>(
            "select locale, name from public.item_translations where item_id = $1 order by locale",
            [live.itemId],
          )
        ).rows,
    );

    expect(rows.map((r) => r.locale)).toEqual(["ar", "en"]);
    expect(rows.find((r) => r.locale === "ar")?.name).toBe("مندي لحم");
  });

  it("honours the platform switch that lets expired businesses keep serving", async () => {
    await client.query(
      `update public.platform_settings set value = 'false'::jsonb
       where key = 'public_api.block_expired_subscriptions'`,
    );

    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    expect(rows.map((r) => r.slug)).toContain("expired-co");
    // A suspended account is still withheld — that switch is about billing,
    // not about overriding a deliberate suspension.
    expect(rows.map((r) => r.slug)).not.toContain("suspended-co");

    await client.query(
      `update public.platform_settings set value = 'true'::jsonb
       where key = 'public_api.block_expired_subscriptions'`,
    );
  });

  it("withholds a soft-deleted business", async () => {
    await client.query(
      `update public.tenants set deleted_at = now() where id = $1`,
      [live.tenantId],
    );

    const rows = await asPrincipal(
      client,
      { kind: "anon" },
      async (c) =>
        (await c.query<{ slug: string }>("select slug from public.tenants"))
          .rows,
    );

    expect(rows.map((r) => r.slug)).not.toContain("live-co");

    await client.query(
      `update public.tenants set deleted_at = null where id = $1`,
      [live.tenantId],
    );
  });
});
