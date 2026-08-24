import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { connectTestDb } from "../helpers/db";
import { createTenantFixture, resetDatabase } from "../helpers/fixtures";

/**
 * Subscription lifecycle, asserted against the database's own derivation.
 *
 * `app.subscription_status()` and the TypeScript `deriveSubscriptionStatus()`
 * implement the same rules for different audiences, so both are exercised —
 * the SQL here, the TypeScript in the unit suite.
 */
describe("subscription lifecycle", () => {
  let client: Client;

  beforeAll(async () => {
    client = await connectTestDb();
    await resetDatabase(client);
  });

  afterAll(async () => {
    await client.end();
  });

  async function derive(
    manual: string,
    expiresInDays: number,
  ): Promise<string> {
    const { rows } = await client.query<{ status: string }>(
      `select app.subscription_status($1::app.subscription_status, now() + ($2 || ' days')::interval) as status`,
      [manual, String(expiresInDays)],
    );
    return rows[0]!.status;
  }

  it("a one-year subscription reads as active", async () => {
    expect(await derive("active", 365)).toBe("active");
  });

  it("a trial keeps its trial status while comfortably in date", async () => {
    expect(await derive("trial", 60)).toBe("trial");
  });

  it("a trial approaching its end is flagged like any other subscription", async () => {
    // Deliberate: a trial ending in 20 days needs the same renewal prompt an
    // annual plan would get. The plan type does not change the urgency.
    expect(await derive("trial", 20)).toBe("expiring_soon");
  });

  it("crosses into expiring_soon inside the 30-day window", async () => {
    expect(await derive("active", 31)).toBe("active");
    expect(await derive("active", 30)).toBe("expiring_soon");
    expect(await derive("active", 7)).toBe("expiring_soon");
    expect(await derive("active", 1)).toBe("expiring_soon");
  });

  it("reads as expired once the date passes", async () => {
    expect(await derive("active", -1)).toBe("expired");
    expect(await derive("trial", -1)).toBe("expired");
  });

  it("suspension and cancellation outrank the calendar", async () => {
    expect(await derive("suspended", 365)).toBe("suspended");
    expect(await derive("cancelled", 365)).toBe("cancelled");
    expect(await derive("suspended", -10)).toBe("suspended");
  });

  it("is_live agrees with the derived status", async () => {
    const { rows } = await client.query<{
      live: boolean;
      manual: string;
      days: number;
    }>(`
      select
        app.subscription_is_live(t.manual::app.subscription_status, now() + (t.days || ' days')::interval) as live,
        t.manual, t.days
      from (values
        ('active', 365), ('active', 1), ('active', -1),
        ('trial', 10), ('suspended', 365), ('cancelled', 365)
      ) as t(manual, days)
    `);

    const byKey = new Map(rows.map((r) => [`${r.manual}:${r.days}`, r.live]));
    expect(byKey.get("active:365")).toBe(true);
    expect(byKey.get("active:1")).toBe(true);
    expect(byKey.get("active:-1")).toBe(false);
    expect(byKey.get("trial:10")).toBe(true);
    expect(byKey.get("suspended:365")).toBe(false);
    expect(byKey.get("cancelled:365")).toBe(false);
  });

  it("a business creation produces exactly one current subscription of one year", async () => {
    const fixture = await createTenantFixture(client, {
      slug: "oneyear-co",
      expiresInDays: 365,
    });

    const { rows } = await client.query<{
      count: string;
      days: string;
      status: string;
    }>(
      `select
         count(*)::text as count,
         round(extract(epoch from (max(expires_at) - now())) / 86400)::text as days,
         max(status::text) as status
       from public.subscriptions
       where tenant_id = $1 and is_current`,
      [fixture.tenantId],
    );

    expect(rows[0]!.count).toBe("1");
    expect(Number(rows[0]!.days)).toBe(365);
    expect(rows[0]!.status).toBe("active");
  });

  it("refuses a second current subscription for the same tenant", async () => {
    const fixture = await createTenantFixture(client, { slug: "dupe-co" });

    const { rows: plan } = await client.query<{ id: string }>(
      `select id from public.plans where code = 'starter'`,
    );

    await expect(
      client.query(
        `insert into public.subscriptions (tenant_id, plan_id, starts_at, expires_at, is_current)
         values ($1, $2, now(), now() + interval '365 days', true)`,
        [fixture.tenantId, plan[0]!.id],
      ),
    ).rejects.toThrow(/subscriptions_one_current_per_tenant|duplicate key/i);
  });

  it("allows a superseded period to remain in the history", async () => {
    const fixture = await createTenantFixture(client, { slug: "history-co" });

    await client.query(
      `update public.subscriptions set is_current = false where tenant_id = $1`,
      [fixture.tenantId],
    );

    const { rows: plan } = await client.query<{ id: string }>(
      `select id from public.plans where code = 'enterprise'`,
    );

    await client.query(
      `insert into public.subscriptions (tenant_id, plan_id, starts_at, expires_at, is_current)
       values ($1, $2, now(), now() + interval '365 days', true)`,
      [fixture.tenantId, plan[0]!.id],
    );

    const { rows } = await client.query<{ total: string; current: string }>(
      `select count(*)::text as total,
              count(*) filter (where is_current)::text as current
       from public.subscriptions where tenant_id = $1`,
      [fixture.tenantId],
    );

    expect(rows[0]!.total).toBe("2");
    expect(rows[0]!.current).toBe("1");
  });

  it("rejects a period that ends before it starts", async () => {
    const fixture = await createTenantFixture(client, { slug: "backwards-co" });

    await expect(
      client.query(
        `update public.subscriptions
           set starts_at = now(), expires_at = now() - interval '1 day'
         where tenant_id = $1`,
        [fixture.tenantId],
      ),
    ).rejects.toThrow(/subscriptions_period_valid/i);
  });

  it("preserves every catalog row when a subscription expires", async () => {
    const fixture = await createTenantFixture(client, { slug: "preserve-co" });

    const before = await counts(client, fixture.tenantId);

    await client.query(
      `update public.subscriptions
         set starts_at = now() - interval '400 days', expires_at = now() - interval '1 day'
       where tenant_id = $1`,
      [fixture.tenantId],
    );

    const after = await counts(client, fixture.tenantId);
    expect(after).toEqual(before);
  });
});

async function counts(client: Client, tenantId: string) {
  const { rows } = await client.query<{
    items: string;
    categories: string;
    branches: string;
    offers: string;
  }>(
    `select
       (select count(*) from public.items where tenant_id = $1)::text as items,
       (select count(*) from public.categories where tenant_id = $1)::text as categories,
       (select count(*) from public.branches where tenant_id = $1)::text as branches,
       (select count(*) from public.offers where tenant_id = $1)::text as offers`,
    [tenantId],
  );
  return rows[0]!;
}
