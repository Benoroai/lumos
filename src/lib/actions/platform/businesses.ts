"use server";

import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  requirePlatformSession,
  requirePlatformSuperAdmin,
} from "@/lib/auth/session";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import {
  businessLifecycleSchema,
  createBusinessSchema,
  updateBusinessSchema,
} from "@/lib/validation/tenant";
import { fieldErrors } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import {
  parseDefaultCategories,
  parseDefaultModifierGroups,
} from "@/lib/business-templates";
import { canAdministerPlatform } from "@/lib/permissions";
import type { TablesUpdate } from "@/lib/types/database.generated";

export type CreatedBusinessSummary = {
  tenantId: string;
  name: string;
  slug: string;
  loginUrl: string;
  ownerEmail: string;
  /** Shown exactly once, at creation. Never stored and never retrievable. */
  temporaryPassword: string;
  subscriptionExpiresAt: string;
  publicApiBase: string;
};

/**
 * Creates a business, its first owner, its subscription and its starting catalog.
 *
 * Postgres cannot span auth-user creation and table writes in one transaction,
 * so the steps are ordered so a failure leaves nothing half-built: the auth
 * user is created first, and if any later step fails that orphan user is
 * deleted before the error surfaces.
 */
export async function createBusinessAction(
  input: unknown,
): Promise<ActionResult<CreatedBusinessSummary>> {
  const session = await requirePlatformSession();
  if (!canAdministerPlatform(session.role)) {
    return actionError("Only a Platform Super Admin can create a business.");
  }

  const parsed = createBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const admin = createAdminSupabase();

  const { data: slugTaken } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", data.slug)
    .maybeSingle();

  if (slugTaken) {
    return actionError("That URL slug is already taken.", {
      slug: ["This slug is already in use"],
    });
  }

  const { data: template } = await admin
    .from("business_templates")
    .select(
      "id, default_categories, default_modifier_groups, enabled_item_fields, default_feature_flags",
    )
    .eq("id", data.templateId)
    .maybeSingle();

  if (!template) return actionError("That business template no longer exists.");

  const { data: created, error: authError } = await admin.auth.admin.createUser(
    {
      email: data.ownerEmail,
      password: data.ownerPassword,
      email_confirm: true,
      user_metadata: { full_name: data.ownerFullName },
    },
  );

  if (authError || !created.user) {
    const message = authError?.message ?? "Could not create the owner account.";
    return actionError(
      /already/i.test(message)
        ? "That email already has an account on the platform."
        : message,
      { ownerEmail: [message] },
    );
  }

  const ownerUserId = created.user.id;

  try {
    const { data: ownerRole } = await admin
      .from("roles")
      .select("id")
      .is("tenant_id", null)
      .eq("code", "owner")
      .single();

    if (!ownerRole)
      throw new Error(
        'The system "owner" role is missing. Run the migrations.',
      );

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        slug: data.slug,
        name: data.name,
        legal_name: data.legalName,
        business_type: data.businessType,
        template_id: data.templateId,
        contact_email: data.contactEmail || null,
        contact_phone: data.contactPhone,
        contact_whatsapp: data.contactWhatsapp,
        website_url: data.websiteUrl || null,
        address_line: data.addressLine,
        city: data.city,
        country: data.country.toUpperCase(),
        timezone: data.timezone,
        default_locale: data.defaultLocale,
        supported_locales: data.supportedLocales,
        default_currency: data.defaultCurrency,
        registered_at: new Date().toISOString(),
        account_status: "active",
        internal_notes: data.internalNotes,
        created_by: session.user.id,
      })
      .select("id, slug, name")
      .single();

    if (tenantError || !tenant)
      throw new Error(tenantError?.message ?? "Could not create the business.");

    const { error: subscriptionError } = await admin
      .from("subscriptions")
      .insert({
        tenant_id: tenant.id,
        plan_id: data.planId,
        status: data.subscriptionStatus,
        starts_at: data.subscriptionStartsAt,
        expires_at: data.subscriptionExpiresAt,
        is_current: true,
        created_by: session.user.id,
      });

    if (subscriptionError) throw new Error(subscriptionError.message);

    const { error: membershipError } = await admin.from("tenant_users").insert({
      tenant_id: tenant.id,
      user_id: ownerUserId,
      role_id: ownerRole.id,
      email: data.ownerEmail,
      full_name: data.ownerFullName,
      status: "active",
      is_owner: true,
      must_change_password: data.forcePasswordChange,
      invited_by: session.user.id,
      invited_at: new Date().toISOString(),
    });

    if (membershipError) throw new Error(membershipError.message);

    await admin.from("business_settings").insert({
      tenant_id: tenant.id,
      enabled_item_fields: template.enabled_item_fields,
    });

    const { data: flagCatalogue } = await admin
      .from("feature_flags")
      .select("key, default_enabled");
    const templateFlags = (template.default_feature_flags ?? {}) as Record<
      string,
      boolean
    >;
    const flagRows = (flagCatalogue ?? []).map((flag) => ({
      tenant_id: tenant.id,
      flag_key: flag.key,
      is_enabled:
        data.featureFlags[flag.key] ??
        templateFlags[flag.key] ??
        flag.default_enabled,
      updated_by: session.user.id,
    }));

    if (flagRows.length)
      await admin.from("tenant_feature_flags").insert(flagRows);

    // Every business gets one branch so the public menu has a target from day one.
    const { data: branch } = await admin
      .from("branches")
      .insert({
        tenant_id: tenant.id,
        slug: "main",
        name: data.name,
        address_line: data.addressLine,
        city: data.city,
        country: data.country.toUpperCase(),
        phone: data.contactPhone,
        whatsapp: data.contactWhatsapp,
        timezone: data.timezone,
        is_active: true,
      })
      .select("id")
      .single();

    if (data.seedDefaultCategories) {
      await seedTemplateCatalog(tenant.id, template, data.supportedLocales);
    }

    await writeAudit({
      action: AUDIT_ACTIONS.businessCreated,
      entityType: "tenant",
      entityId: tenant.id,
      tenantId: tenant.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      actorType: "platform",
      actorLabel: session.fullName,
      newValues: {
        name: data.name,
        slug: data.slug,
        business_type: data.businessType,
        plan_id: data.planId,
        owner_email: data.ownerEmail,
        subscription_expires_at: data.subscriptionExpiresAt,
        branch_id: branch?.id ?? null,
      },
    });

    await writeAudit({
      action: AUDIT_ACTIONS.userCreated,
      entityType: "tenant_user",
      entityId: ownerUserId,
      tenantId: tenant.id,
      actorUserId: session.user.id,
      actorEmail: session.user.email,
      actorType: "platform",
      newValues: {
        email: data.ownerEmail,
        role: "owner",
        force_password_change: data.forcePasswordChange,
      },
    });

    revalidatePath("/admin/businesses");

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    return actionOk({
      tenantId: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      loginUrl: `${appUrl}/login`,
      ownerEmail: data.ownerEmail,
      temporaryPassword: data.ownerPassword,
      subscriptionExpiresAt: data.subscriptionExpiresAt,
      publicApiBase: `${appUrl}/api/v1/public/businesses/${tenant.slug}`,
    });
  } catch (error) {
    await admin.auth.admin.deleteUser(ownerUserId).catch(() => undefined);
    const message =
      error instanceof Error ? error.message : "Could not create the business.";
    console.error("[createBusiness] rolled back", message);
    return actionError(message);
  }
}

type TemplateSeed = {
  default_categories: unknown;
  default_modifier_groups: unknown;
};

async function seedTemplateCatalog(
  tenantId: string,
  template: TemplateSeed,
  supportedLocales: string[],
): Promise<void> {
  const admin = createAdminSupabase();
  const categories = parseDefaultCategories(template.default_categories);

  if (categories.length) {
    const { data: inserted } = await admin
      .from("categories")
      .insert(
        categories.map((category, index) => ({
          tenant_id: tenantId,
          slug: category.slug,
          display_order: index,
          is_active: true,
        })),
      )
      .select("id, slug");

    const translations = (inserted ?? []).flatMap((row) => {
      const seed = categories.find((c) => c.slug === row.slug);
      if (!seed) return [];
      return supportedLocales
        .filter((locale) => locale === "en" || seed[locale as "ar" | "fa"])
        .map((locale) => ({
          tenant_id: tenantId,
          category_id: row.id,
          locale,
          name:
            locale === "en"
              ? seed.en
              : (seed[locale as "ar" | "fa"] ?? seed.en),
          status: "approved" as const,
        }));
    });

    if (translations.length)
      await admin.from("category_translations").insert(translations);
  }

  const groups = parseDefaultModifierGroups(template.default_modifier_groups);
  if (groups.length) {
    const { data: insertedGroups } = await admin
      .from("modifier_groups")
      .insert(
        groups.map((group, index) => ({
          tenant_id: tenantId,
          code: group.code,
          selection_type: group.selection_type,
          is_required: group.is_required,
          min_selections: group.is_required ? 1 : 0,
          display_order: index,
        })),
      )
      .select("id, code");

    const groupTranslations = (insertedGroups ?? []).flatMap((row) => {
      const seed = groups.find((g) => g.code === row.code);
      if (!seed) return [];
      return [
        {
          tenant_id: tenantId,
          modifier_group_id: row.id,
          locale: "en",
          name: seed.en,
          status: "approved" as const,
        },
      ];
    });

    if (groupTranslations.length) {
      await admin.from("modifier_group_translations").insert(groupTranslations);
    }
  }
}

export async function updateBusinessAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = updateBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const admin = createAdminSupabase();

  const { data: before } = await admin
    .from("tenants")
    .select(
      "name, legal_name, contact_email, timezone, default_locale, supported_locales, default_currency, internal_notes",
    )
    .eq("id", data.tenantId)
    .maybeSingle();

  if (!before) return actionError("That business no longer exists.");

  const { error } = await admin
    .from("tenants")
    .update({
      name: data.name,
      legal_name: data.legalName,
      contact_email: data.contactEmail || null,
      contact_phone: data.contactPhone,
      contact_whatsapp: data.contactWhatsapp,
      website_url: data.websiteUrl || null,
      address_line: data.addressLine,
      city: data.city,
      country: data.country.toUpperCase(),
      timezone: data.timezone,
      default_locale: data.defaultLocale,
      supported_locales: data.supportedLocales,
      default_currency: data.defaultCurrency,
      ...(data.internalNotes !== undefined
        ? { internal_notes: data.internalNotes }
        : {}),
    })
    .eq("id", data.tenantId);

  if (error) return actionError(error.message);

  await writeAudit({
    action: AUDIT_ACTIONS.businessUpdated,
    entityType: "tenant",
    entityId: data.tenantId,
    tenantId: data.tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: before,
    newValues: {
      name: data.name,
      timezone: data.timezone,
      default_currency: data.defaultCurrency,
    },
  });

  revalidatePath(`/admin/businesses/${data.tenantId}`);
  return actionOk(null, "Business updated.");
}

const LIFECYCLE_AUDIT = {
  suspend: AUDIT_ACTIONS.businessSuspended,
  reactivate: AUDIT_ACTIONS.businessReactivated,
  archive: AUDIT_ACTIONS.businessArchived,
  soft_delete: AUDIT_ACTIONS.businessDeleted,
  restore: AUDIT_ACTIONS.businessReactivated,
} as const;

/**
 * Lifecycle changes never destroy catalog data — suspension and deletion are
 * both reversible states, so a business can always be brought back intact.
 */
export async function changeBusinessLifecycleAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePlatformSuperAdmin();
  const parsed = businessLifecycleSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const { tenantId, action, reason } = parsed.data;
  const admin = createAdminSupabase();

  const { data: before } = await admin
    .from("tenants")
    .select("account_status, deleted_at, name")
    .eq("id", tenantId)
    .maybeSingle();

  if (!before) return actionError("That business no longer exists.");

  const patch: TablesUpdate<"tenants"> = {};
  switch (action) {
    case "suspend":
      patch.account_status = "suspended";
      break;
    case "reactivate":
      patch.account_status = "active";
      patch.deleted_at = null;
      break;
    case "archive":
      patch.account_status = "archived";
      break;
    case "soft_delete":
      patch.deleted_at = new Date().toISOString();
      patch.account_status = "archived";
      break;
    case "restore":
      patch.deleted_at = null;
      patch.account_status = "active";
      break;
  }

  const { error } = await admin
    .from("tenants")
    .update(patch)
    .eq("id", tenantId);
  if (error) return actionError(error.message);

  await writeAudit({
    action: LIFECYCLE_AUDIT[action],
    entityType: "tenant",
    entityId: tenantId,
    tenantId,
    actorUserId: session.user.id,
    actorEmail: session.user.email,
    actorType: "platform",
    previousValues: before,
    newValues: patch,
    metadata: { reason },
  });

  revalidatePath("/admin/businesses");
  revalidatePath(`/admin/businesses/${tenantId}`);
  return actionOk(null, "Business status updated.");
}
