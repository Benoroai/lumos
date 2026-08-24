import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { SettingsEditor } from "@/components/business/settings-editor";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCatalogContext } from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireTenantSession();
  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const [context, { data: tenant }] = await Promise.all([
    getCatalogContext(session.tenant.id),
    supabase
      .from("tenants")
      .select(
        "name, legal_name, contact_email, contact_phone, contact_whatsapp, website_url, address_line, city, logo_path, logo_url",
      )
      .eq("id", session.tenant.id)
      .maybeSingle(),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  const enabledFields = Array.isArray(context.settings?.enabled_item_fields)
    ? (context.settings.enabled_item_fields as string[])
    : Array.isArray(context.template?.enabled_item_fields)
      ? (context.template.enabled_item_fields as string[])
      : [];

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your business profile and which catalog fields you want to use."
        breadcrumbs={[{ label: "Settings" }]}
      />

      <SettingsEditor
        profile={{
          name: tenant?.name ?? session.tenant.name,
          legalName: tenant?.legal_name ?? "",
          contactEmail: tenant?.contact_email ?? "",
          contactPhone: tenant?.contact_phone ?? "",
          contactWhatsapp: tenant?.contact_whatsapp ?? "",
          websiteUrl: tenant?.website_url ?? "",
          addressLine: tenant?.address_line ?? "",
          city: tenant?.city ?? "",
          logoPath: tenant?.logo_path ?? null,
          logoUrl: tenant?.logo_url ?? null,
        }}
        catalog={{
          enabledItemFields: enabledFields,
          aiTranslationEnabled:
            context.settings?.ai_translation_enabled ?? true,
          requireTranslationApproval:
            context.settings?.require_translation_approval ?? true,
        }}
        canManage={session.permissions.has(PERMISSIONS.settingsManage)}
        terminology={{ item: words.item, items: words.items }}
      />
    </>
  );
}
