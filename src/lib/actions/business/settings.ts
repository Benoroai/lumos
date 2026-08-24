"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth/session";
import { PERMISSIONS } from "@/lib/permissions";
import { AUDIT_ACTIONS, writeAudit } from "@/lib/audit/log";
import { brandingSchema, catalogSettingsSchema } from "@/lib/validation/tenant";
import { fieldErrors, localeSchema } from "@/lib/validation/common";
import { actionError, actionOk, type ActionResult } from "@/lib/types/app";
import { assertSubscriptionAllowsWrites, auditActor } from "./shared";

export async function saveBrandingAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.brandingManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();

  const { data: before } = await supabase
    .from("business_settings")
    .select(
      "primary_color, secondary_color, accent_color, background_color, tax_rate, tax_display",
    )
    .eq("tenant_id", session.tenant.id)
    .maybeSingle();

  const { error } = await supabase.from("business_settings").upsert(
    {
      tenant_id: session.tenant.id,
      primary_color: data.primaryColor,
      secondary_color: data.secondaryColor,
      accent_color: data.accentColor,
      background_color: data.backgroundColor,
      font_family: data.fontFamily,
      price_display_format: data.priceDisplayFormat,
      show_prices: data.showPrices,
      tax_display: data.taxDisplay,
      tax_rate: data.taxRate,
      tax_label: data.taxLabel,
      social_links: data.socialLinks as never,
    },
    { onConflict: "tenant_id" },
  );

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.brandingChanged,
    entityType: "business_settings",
    entityId: session.tenant.id,
    previousValues: before,
    newValues: {
      primary_color: data.primaryColor,
      accent_color: data.accentColor,
      tax_display: data.taxDisplay,
      tax_rate: data.taxRate,
    },
  });

  revalidatePath("/dashboard/branding");
  return actionOk(null, "Branding saved.");
}

export async function saveCatalogSettingsAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.settingsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = catalogSettingsSchema.safeParse(input);
  if (!parsed.success)
    return actionError("Invalid request.", fieldErrors(parsed.error));

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("business_settings").upsert(
    {
      tenant_id: session.tenant.id,
      enabled_item_fields: parsed.data.enabledItemFields as never,
      terminology_overrides: parsed.data.terminologyOverrides as never,
      ai_translation_enabled: parsed.data.aiTranslationEnabled,
      require_translation_approval: parsed.data.requireTranslationApproval,
    },
    { onConflict: "tenant_id" },
  );

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.settingsChanged,
    entityType: "business_settings",
    entityId: session.tenant.id,
    newValues: { enabled_item_fields: parsed.data.enabledItemFields },
  });

  revalidatePath("/dashboard/settings");
  return actionOk(null, "Settings saved.");
}

const localizationSchema = z
  .object({
    defaultLocale: localeSchema,
    supportedLocales: z
      .array(localeSchema)
      .min(1, "Select at least one language"),
    defaultCurrency: z.string().length(3),
    timezone: z.string().min(1),
  })
  .refine((v) => v.supportedLocales.includes(v.defaultLocale), {
    message: "The default language must be one of the supported languages",
    path: ["defaultLocale"],
  });

export async function saveLocalizationAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.brandingManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = localizationSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();

  // The plan caps how many languages a business may publish in.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plans:plan_id ( name, max_languages )")
    .eq("tenant_id", session.tenant.id)
    .eq("is_current", true)
    .maybeSingle();

  const plan = subscription?.plans as unknown as {
    name: string;
    max_languages: number;
  } | null;
  if (plan && data.supportedLocales.length > plan.max_languages) {
    return actionError(
      `Your ${plan.name} plan supports up to ${plan.max_languages} languages.`,
      {
        supportedLocales: [`Maximum ${plan.max_languages} languages`],
      },
    );
  }

  const { error } = await supabase
    .from("tenants")
    .update({
      default_locale: data.defaultLocale,
      supported_locales: data.supportedLocales,
      default_currency: data.defaultCurrency,
      timezone: data.timezone,
    })
    .eq("id", session.tenant.id);

  if (error) return actionError(error.message);

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.settingsChanged,
    entityType: "tenant",
    entityId: session.tenant.id,
    newValues: {
      default_locale: data.defaultLocale,
      supported_locales: data.supportedLocales,
      default_currency: data.defaultCurrency,
    },
  });

  revalidatePath("/dashboard/localization");
  return actionOk(null, "Localization saved.");
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).default(""),
  contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
  contactPhone: z.string().trim().max(40).optional(),
  contactWhatsapp: z.string().trim().max(40).optional(),
  websiteUrl: z.union([z.string().url(), z.literal("")]).optional(),
  addressLine: z.string().trim().max(300).default(""),
  city: z.string().trim().max(120).default(""),
  logoPath: z.string().trim().max(400).nullable().optional(),
  logoUrl: z.string().trim().max(800).nullable().optional(),
});

export async function saveBusinessProfileAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const session = await requirePermission(PERMISSIONS.settingsManage);
  const blocked = assertSubscriptionAllowsWrites(session);
  if (blocked) return blocked;

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      "Please correct the highlighted fields.",
      fieldErrors(parsed.error),
    );
  }

  const data = parsed.data;
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from("tenants")
    .update({
      name: data.name,
      legal_name: data.legalName,
      contact_email: data.contactEmail || null,
      contact_phone: data.contactPhone || null,
      contact_whatsapp: data.contactWhatsapp || null,
      website_url: data.websiteUrl || null,
      address_line: data.addressLine,
      city: data.city,
      ...(data.logoPath !== undefined ? { logo_path: data.logoPath } : {}),
      ...(data.logoUrl !== undefined ? { logo_url: data.logoUrl } : {}),
    })
    .eq("id", session.tenant.id);

  if (error) {
    return actionError(
      /row-level security/i.test(error.message)
        ? "You do not have permission to change the business profile."
        : error.message,
    );
  }

  await writeAudit({
    ...auditActor(session),
    action: AUDIT_ACTIONS.settingsChanged,
    entityType: "tenant",
    entityId: session.tenant.id,
    newValues: { name: data.name, contact_email: data.contactEmail },
  });

  revalidatePath("/dashboard/settings");
  return actionOk(null, "Business profile saved.");
}
