import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { asPrincipal, connectTestDb, expectRejected } from "../helpers/db";
import {
  createOrphanUser,
  createPlatformAdmin,
  createTenantFixture,
  resetDatabase,
  type TenantFixture,
} from "../helpers/fixtures";

/**
 * TENANT ISOLATION — the load-bearing guarantee of the whole platform.
 *
 * These run against the real migrations and the real Row-Level Security
 * policies. If a policy is ever weakened, these fail; a mock could not tell.
 */
describe("tenant isolation", () => {
  let client: Client;
  let alpha: TenantFixture;
  let beta: TenantFixture;

  beforeAll(async () => {
    client = await connectTestDb();
    await resetDatabase(client);
    alpha = await createTenantFixture(client, { slug: "alpha-co" });
    beta = await createTenantFixture(client, { slug: "beta-co" });
  });

  afterAll(async () => {
    await client.end();
  });

  describe("reads", () => {
    it("a member sees only their own tenant", async () => {
      const rows = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (await c.query<{ id: string }>("select id from public.tenants")).rows,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(alpha.tenantId);
    });

    const tables = [
      "categories",
      "items",
      "branches",
      "offers",
      "modifier_groups",
      "category_translations",
      "item_translations",
      "business_settings",
    ] as const;

    it.each(tables)("%s never leaks across tenants", async (table) => {
      const rows = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (
            await c.query<{ tenant_id: string }>(
              `select tenant_id from public.${table}`,
            )
          ).rows,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.tenant_id).toBe(alpha.tenantId);
      }
    });

    it("a targeted lookup of another tenant's item returns nothing", async () => {
      const rows = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (
            await c.query("select id from public.items where id = $1", [
              beta.itemId,
            ])
          ).rows,
      );

      expect(rows).toHaveLength(0);
    });

    it("a user with no membership sees nothing at all", async () => {
      const orphanId = await createOrphanUser(client);

      const counts = await asPrincipal(
        client,
        { kind: "authenticated", userId: orphanId },
        async (c) => ({
          tenants: (await c.query("select id from public.tenants")).rowCount,
          items: (await c.query("select id from public.items")).rowCount,
          analytics: (await c.query("select id from public.analytics_events"))
            .rowCount,
        }),
      );

      expect(counts.tenants).toBe(0);
      expect(counts.items).toBe(0);
      expect(counts.analytics).toBe(0);
    });

    it("platform internal notes are unreadable by business users", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        "select internal_notes from public.tenants",
      );
      expect(message).toMatch(/permission denied/i);
    });

    it("analytics are scoped to the tenant that produced them", async () => {
      const rows = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (
            await c.query<{ tenant_id: string }>(
              "select tenant_id from public.analytics_events",
            )
          ).rows,
      );

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.tenant_id === alpha.tenantId)).toBe(true);
    });
  });

  describe("writes", () => {
    it("a member cannot insert a row into another tenant", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        `insert into public.items (tenant_id, base_price) values ($1, 1.000)`,
        [beta.tenantId],
      );
      expect(message).toMatch(/row-level security/i);
    });

    it("a member cannot update another tenant's item", async () => {
      const updated = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (
            await c.query(
              "update public.items set base_price = 0 where id = $1",
              [beta.itemId],
            )
          ).rowCount,
      );

      // RLS makes the row invisible, so the update matches nothing rather than
      // raising — the outcome that matters is that nothing changed.
      expect(updated).toBe(0);

      const { rows } = await client.query<{ base_price: string }>(
        "select base_price from public.items where id = $1",
        [beta.itemId],
      );
      expect(Number(rows[0]!.base_price)).toBe(6.5);
    });

    it("a member cannot delete another tenant's category", async () => {
      const deleted = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        async (c) =>
          (
            await c.query("delete from public.categories where id = $1", [
              beta.categoryId,
            ])
          ).rowCount,
      );

      expect(deleted).toBe(0);
    });

    it("a member cannot grant themselves membership of another tenant", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        `insert into public.tenant_users (tenant_id, user_id, role_id, email)
         values ($1, $2, (select id from public.roles where code = 'owner' and tenant_id is null), 'attacker@test')`,
        [beta.tenantId, alpha.ownerUserId],
      );
      expect(message).toMatch(/row-level security/i);
    });

    it("a member cannot change their own account status or slug", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        `update public.tenants set account_status = 'active', slug = 'hijacked' where id = $1`,
        [alpha.tenantId],
      );
      expect(message).toMatch(/permission denied/i);
    });

    it("a member cannot write their own subscription", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        `update public.subscriptions set expires_at = now() + interval '10 years' where tenant_id = $1`,
        [alpha.tenantId],
      );
      expect(message).toMatch(/row-level security|permission denied/i);
    });

    it("a member cannot forge an audit entry", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.ownerUserId },
        `insert into public.audit_logs (tenant_id, action, entity_type) values ($1, 'fake', 'tenant')`,
        [alpha.tenantId],
      );
      expect(message).toMatch(/permission denied|row-level security/i);
    });

    it("audit entries cannot be edited or deleted by anyone", async () => {
      await client.query(
        `insert into public.audit_logs (tenant_id, action, entity_type) values ($1, 'business.created', 'tenant')`,
        [alpha.tenantId],
      );

      await expect(
        client.query(`update public.audit_logs set action = 'tampered'`),
      ).rejects.toThrow(/append-only/i);

      await expect(
        client.query(`delete from public.audit_logs`),
      ).rejects.toThrow(/append-only/i);
    });
  });

  describe("role permissions", () => {
    it("a viewer can read but not write within their own tenant", async () => {
      const readable = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.viewerUserId },
        async (c) => (await c.query("select id from public.items")).rowCount,
      );
      expect(readable).toBeGreaterThan(0);

      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.viewerUserId },
        `insert into public.items (tenant_id, base_price) values ($1, 1.000)`,
        [alpha.tenantId],
      );
      expect(message).toMatch(/row-level security/i);
    });

    it("a menu manager can write catalog content in their own tenant", async () => {
      const inserted = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.menuManagerUserId },
        async (c) =>
          (
            await c.query<{ id: string }>(
              `insert into public.items (tenant_id, base_price, sku) values ($1, 2.500, 'MM-1') returning id`,
              [alpha.tenantId],
            )
          ).rows,
      );

      expect(inserted).toHaveLength(1);
    });

    it("a menu manager still cannot touch another tenant", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.menuManagerUserId },
        `insert into public.items (tenant_id, base_price) values ($1, 2.500)`,
        [beta.tenantId],
      );
      expect(message).toMatch(/row-level security/i);
    });

    it("a viewer cannot manage staff", async () => {
      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.viewerUserId },
        `insert into public.tenant_users (tenant_id, user_id, role_id, email)
         values ($1, $2, (select id from public.roles where code = 'viewer' and tenant_id is null), 'x@test')`,
        [alpha.tenantId, alpha.viewerUserId],
      );
      expect(message).toMatch(/row-level security/i);
    });

    it("a per-user revoke overrides the role grant", async () => {
      const { rows: membership } = await client.query<{ id: string }>(
        `select id from public.tenant_users where tenant_id = $1 and user_id = $2`,
        [alpha.tenantId, alpha.menuManagerUserId],
      );

      await client.query(
        `insert into public.tenant_user_permissions (tenant_id, tenant_user_id, permission_key, effect)
         values ($1, $2, 'catalog.items.manage', 'revoke')
         on conflict (tenant_user_id, permission_key) do update set effect = 'revoke'`,
        [alpha.tenantId, membership[0]!.id],
      );

      const message = await expectRejected(
        client,
        { kind: "authenticated", userId: alpha.menuManagerUserId },
        `insert into public.items (tenant_id, base_price) values ($1, 9.000)`,
        [alpha.tenantId],
      );
      expect(message).toMatch(/row-level security/i);

      await client.query(
        `delete from public.tenant_user_permissions where tenant_user_id = $1`,
        [membership[0]!.id],
      );
    });

    it("a per-user grant adds a permission the role lacks", async () => {
      const { rows: membership } = await client.query<{ id: string }>(
        `select id from public.tenant_users where tenant_id = $1 and user_id = $2`,
        [alpha.tenantId, alpha.viewerUserId],
      );

      await client.query(
        `insert into public.tenant_user_permissions (tenant_id, tenant_user_id, permission_key, effect)
         values ($1, $2, 'catalog.items.manage', 'grant')`,
        [alpha.tenantId, membership[0]!.id],
      );

      const inserted = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.viewerUserId },
        async (c) =>
          (
            await c.query(
              `insert into public.items (tenant_id, base_price, sku) values ($1, 3.000, 'VG-1') returning id`,
              [alpha.tenantId],
            )
          ).rowCount,
      );

      expect(inserted).toBe(1);

      await client.query(
        `delete from public.tenant_user_permissions where tenant_user_id = $1`,
        [membership[0]!.id],
      );
    });

    it("a disabled membership loses all access immediately", async () => {
      await client.query(
        `update public.tenant_users set status = 'disabled' where tenant_id = $1 and user_id = $2`,
        [alpha.tenantId, alpha.viewerUserId],
      );

      const visible = await asPrincipal(
        client,
        { kind: "authenticated", userId: alpha.viewerUserId },
        async (c) => (await c.query("select id from public.items")).rowCount,
      );

      expect(visible).toBe(0);

      await client.query(
        `update public.tenant_users set status = 'active' where tenant_id = $1 and user_id = $2`,
        [alpha.tenantId, alpha.viewerUserId],
      );
    });
  });

  describe("platform staff", () => {
    it("can read across tenants", async () => {
      const adminId = await createPlatformAdmin(client, "super_admin");

      const rows = await asPrincipal(
        client,
        { kind: "authenticated", userId: adminId },
        async (c) =>
          (await c.query<{ id: string }>("select id from public.tenants")).rows,
      );

      const ids = rows.map((r) => r.id);
      expect(ids).toContain(alpha.tenantId);
      expect(ids).toContain(beta.tenantId);
    });

    it("a deactivated platform user loses cross-tenant access", async () => {
      const adminId = await createPlatformAdmin(client, "support");
      await client.query(
        `update public.platform_users set is_active = false where user_id = $1`,
        [adminId],
      );

      const visible = await asPrincipal(
        client,
        { kind: "authenticated", userId: adminId },
        async (c) => (await c.query("select id from public.tenants")).rowCount,
      );

      expect(visible).toBe(0);
    });

    it("only a super admin may write platform settings", async () => {
      const supportId = await createPlatformAdmin(client, "support");

      // RLS makes the row invisible to the UPDATE rather than raising, so the
      // meaningful assertions are "nothing matched" and "nothing changed".
      const updated = await asPrincipal(
        client,
        { kind: "authenticated", userId: supportId },
        async (c) =>
          (
            await c.query(
              `update public.platform_settings set value = 'false'::jsonb
               where key = 'public_api.block_expired_subscriptions'`,
            )
          ).rowCount,
      );

      expect(updated).toBe(0);

      const { rows } = await client.query<{ value: unknown }>(
        `select value from public.platform_settings where key = 'public_api.block_expired_subscriptions'`,
      );
      expect(rows[0]!.value).toBe(true);
    });

    it("a super admin can write platform settings", async () => {
      const superId = await createPlatformAdmin(client, "super_admin");

      const updated = await asPrincipal(
        client,
        { kind: "authenticated", userId: superId },
        async (c) =>
          (
            await c.query(
              `update public.platform_settings set value = 'false'::jsonb
               where key = 'public_api.block_expired_subscriptions'`,
            )
          ).rowCount,
      );

      expect(updated).toBe(1);
    });
  });
});
