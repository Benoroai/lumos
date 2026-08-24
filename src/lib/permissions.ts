/**
 * Permission keys mirror `public.permissions` exactly. RLS enforces the
 * `.manage` keys at the database level; the remainder gate navigation and
 * field-level affordances in the dashboards.
 */
export const PERMISSIONS = {
  categoriesView: "catalog.categories.view",
  categoriesManage: "catalog.categories.manage",
  itemsView: "catalog.items.view",
  itemsManage: "catalog.items.manage",
  itemsPricing: "catalog.items.pricing",
  itemsAvailability: "catalog.items.availability",
  modifiersView: "catalog.modifiers.view",
  modifiersManage: "catalog.modifiers.manage",
  offersView: "offers.view",
  offersManage: "offers.manage",
  branchesView: "branches.view",
  branchesManage: "branches.manage",
  mediaView: "media.view",
  mediaManage: "media.manage",
  translationsView: "translations.view",
  translationsManage: "translations.manage",
  translationsApprove: "translations.approve",
  analyticsView: "analytics.view",
  staffView: "staff.view",
  staffManage: "staff.manage",
  settingsView: "settings.view",
  settingsManage: "settings.manage",
  brandingManage: "branding.manage",
  subscriptionView: "subscription.view",
  integrationManage: "integration.manage",
  auditView: "audit.view",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SYSTEM_ROLE_CODES = [
  "owner",
  "menu_manager",
  "content_editor",
  "branch_manager",
  "viewer",
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLE_CODES)[number];

export const PLATFORM_ROLES = ["super_admin", "support", "analyst"] as const;
export type PlatformRoleCode = (typeof PLATFORM_ROLES)[number];

/** Only a super admin may mutate the platform itself. */
export function canAdministerPlatform(
  role: PlatformRoleCode | undefined,
): boolean {
  return role === "super_admin";
}

/** Support and super admins may enter the audited impersonation mode. */
export function canImpersonate(role: PlatformRoleCode | undefined): boolean {
  return role === "super_admin" || role === "support";
}

export function hasPermission(
  granted: ReadonlySet<string> | readonly string[],
  permission: PermissionKey,
): boolean {
  return granted instanceof Set
    ? granted.has(permission)
    : (granted as readonly string[]).includes(permission);
}

export function hasAnyPermission(
  granted: ReadonlySet<string>,
  permissions: readonly PermissionKey[],
): boolean {
  return permissions.some((p) => granted.has(p));
}
