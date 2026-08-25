import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import type { PermissionKey, PlatformRoleCode } from "@/lib/permissions";
import type {
  AccountStatus,
  PlatformRoleRow,
  SubscriptionStatus,
} from "@/lib/types/app";
import { deriveSubscriptionStatus } from "@/lib/subscriptions";
import { readImpersonation } from "@/lib/auth/impersonation";

export type AuthUser = {
  id: string;
  email: string;
};

export type PlatformSession = {
  user: AuthUser;
  platformUserId: string;
  fullName: string;
  role: PlatformRoleCode;
  mustChangePassword: boolean;
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  templateId: string | null;
  logoUrl: string | null;
  defaultLocale: string;
  supportedLocales: string[];
  defaultCurrency: string;
  timezone: string;
  accountStatus: AccountStatus;
};

export type TenantSession = {
  user: AuthUser;
  tenant: TenantSummary;
  membershipId: string;
  roleCode: string;
  roleName: string;
  isOwner: boolean;
  mustChangePassword: boolean;
  branchIds: string[];
  permissions: ReadonlySet<string>;
  subscription: {
    id: string;
    planCode: string;
    planName: string;
    status: SubscriptionStatus;
    startsAt: string;
    expiresAt: string;
    daysRemaining: number;
    isLive: boolean;
  } | null;
  /** Set when a platform operator is acting inside this tenant via support mode. */
  impersonatedBy: { userId: string; email: string; startedAt: string } | null;
};

/** The authenticated Supabase user, or null. Deduped per request. */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return { id: user.id, email: user.email };
});

export const getPlatformSession = cache(
  async (): Promise<PlatformSession | null> => {
    const user = await getAuthUser();
    if (!user) return null;

    const supabase = await createServerSupabase();
    const { data } = await supabase
      .from("platform_users")
      .select(
        "id, full_name, role, is_active, must_change_password, deleted_at",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data || !data.is_active || data.deleted_at) return null;

    return {
      user,
      platformUserId: data.id,
      fullName: data.full_name,
      role: data.role as PlatformRoleCode,
      mustChangePassword: data.must_change_password,
    };
  },
);

export async function requirePlatformSession(): Promise<PlatformSession> {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  if (session.mustChangePassword) redirect("/admin/change-password");
  return session;
}

export async function requirePlatformSuperAdmin(): Promise<PlatformSession> {
  const session = await requirePlatformSession();
  if (session.role !== "super_admin")
    redirect("/admin?error=insufficient_role");
  return session;
}

/**
 * Resolves the business the current user is working in.
 *
 * Two paths lead here: an ordinary member of a tenant, or a platform operator
 * inside an explicit, audited support-impersonation session. Nothing else can
 * produce a tenant session.
 */
export const getTenantSession = cache(
  async (): Promise<TenantSession | null> => {
    const user = await getAuthUser();
    if (!user) return null;

    const impersonation = await readImpersonation();
    if (impersonation) {
      const platform = await getPlatformSession();
      if (!platform) return null;
      return buildImpersonatedSession(
        user,
        platform,
        impersonation.tenantId,
        impersonation.startedAt,
      );
    }

    const supabase = await createServerSupabase();
    const { data: membership } = await supabase
      .from("tenant_users")
      .select(
        `id, tenant_id, role_id, is_owner, status, must_change_password, branch_ids,
       roles:role_id ( code, name, is_owner_role ),
       tenants:tenant_id (
         id, slug, name, business_type, template_id, logo_url,
         default_locale, supported_locales, default_currency, timezone, account_status, deleted_at
       )`,
      )
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!membership) return null;

    const tenantRow = membership.tenants as unknown as TenantRecord | null;
    const roleRow = membership.roles as unknown as PlatformRoleRow | null;
    if (!tenantRow || tenantRow.deleted_at) return null;

    const permissions = await loadPermissions(
      membership.id,
      membership.role_id,
      membership.is_owner || !!roleRow?.is_owner_role,
    );
    const subscription = await loadSubscription(tenantRow.id);

    return {
      user,
      tenant: toSummary(tenantRow),
      membershipId: membership.id,
      roleCode: roleRow?.code ?? "viewer",
      roleName: roleRow?.name ?? "Viewer",
      isOwner: membership.is_owner || !!roleRow?.is_owner_role,
      mustChangePassword: membership.must_change_password,
      branchIds: membership.branch_ids ?? [],
      permissions,
      subscription,
      impersonatedBy: null,
    };
  },
);

type TenantRecord = {
  id: string;
  slug: string;
  name: string;
  business_type: string;
  template_id: string | null;
  logo_url: string | null;
  default_locale: string;
  supported_locales: string[];
  default_currency: string;
  timezone: string;
  account_status: AccountStatus;
  deleted_at: string | null;
};

function toSummary(row: TenantRecord): TenantSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    businessType: row.business_type,
    templateId: row.template_id,
    logoUrl: row.logo_url,
    defaultLocale: row.default_locale,
    supportedLocales: row.supported_locales,
    defaultCurrency: row.default_currency,
    timezone: row.timezone,
    accountStatus: row.account_status,
  };
}

async function buildImpersonatedSession(
  user: AuthUser,
  platform: PlatformSession,
  tenantId: string,
  startedAt: string,
): Promise<TenantSession | null> {
  const supabase = await createServerSupabase();
  const { data: tenantRow } = await supabase
    .from("tenants")
    .select(
      "id, slug, name, business_type, template_id, logo_url, default_locale, supported_locales, default_currency, timezone, account_status, deleted_at",
    )
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenantRow || tenantRow.deleted_at) return null;

  const { data: permissionRows } = await supabase
    .from("permissions")
    .select("key");

  return {
    user,
    tenant: toSummary(tenantRow as TenantRecord),
    membershipId: `impersonation:${platform.platformUserId}`,
    roleCode: "owner",
    roleName: "Support session",
    isOwner: true,
    mustChangePassword: false,
    branchIds: [],
    permissions: new Set((permissionRows ?? []).map((p) => p.key)),
    subscription: await loadSubscription(tenantId),
    impersonatedBy: {
      userId: platform.user.id,
      email: platform.user.email,
      startedAt,
    },
  };
}

async function loadPermissions(
  membershipId: string,
  roleId: string,
  isOwner: boolean,
): Promise<ReadonlySet<string>> {
  const supabase = await createServerSupabase();

  if (isOwner) {
    const { data } = await supabase.from("permissions").select("key");
    return new Set((data ?? []).map((p) => p.key));
  }

  const [{ data: rolePerms }, { data: overrides }] = await Promise.all([
    supabase
      .from("role_permissions")
      .select("permission_key")
      .eq("role_id", roleId),
    supabase
      .from("tenant_user_permissions")
      .select("permission_key, effect")
      .eq("tenant_user_id", membershipId),
  ]);

  const granted = new Set((rolePerms ?? []).map((p) => p.permission_key));
  for (const override of overrides ?? []) {
    if (override.effect === "grant") granted.add(override.permission_key);
    else granted.delete(override.permission_key);
  }
  return granted;
}

async function loadSubscription(
  tenantId: string,
): Promise<TenantSession["subscription"]> {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("subscriptions")
    .select("id, status, starts_at, expires_at, plans:plan_id ( code, name )")
    .eq("tenant_id", tenantId)
    .eq("is_current", true)
    .maybeSingle();

  if (!data) return null;

  const plan = data.plans as unknown as { code: string; name: string } | null;
  const derived = deriveSubscriptionStatus(data.status, data.expires_at);

  return {
    id: data.id,
    planCode: plan?.code ?? "unknown",
    planName: plan?.name ?? "Unknown plan",
    status: derived.status,
    startsAt: data.starts_at,
    expiresAt: data.expires_at,
    daysRemaining: derived.daysRemaining,
    isLive: derived.isLive,
  };
}

export async function requireTenantSession(): Promise<TenantSession> {
  const session = await getTenantSession();
  if (!session) {
    const platform = await getPlatformSession();
    redirect(platform ? "/admin/businesses" : "/login");
  }
  if (session.mustChangePassword) redirect("/change-password");
  if (session.tenant.accountStatus === "suspended")
    redirect("/account/suspended");
  if (session.tenant.accountStatus === "archived")
    redirect("/account/archived");
  return session;
}

/**
 * Server-side authorization gate. Every mutation calls this before touching
 * data — client-side checks only decide what to render.
 */
export async function requirePermission(
  permission: PermissionKey,
): Promise<TenantSession> {
  const session = await requireTenantSession();
  if (!session.permissions.has(permission)) {
    throw new PermissionDeniedError(permission);
  }
  return session;
}

export class PermissionDeniedError extends Error {
  constructor(public readonly permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

/** Best-effort client metadata for audit records. Never throws. */
export async function requestMetadata(): Promise<{
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent") };
  } catch {
    return { ip: null, userAgent: null };
  }
}
