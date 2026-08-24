import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { CreateBusinessWizard } from "@/components/platform/create-business-wizard";
import { requirePlatformSuperAdmin } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { parseDefaultCategories } from "@/lib/business-templates";
import type { BusinessType } from "@/lib/types/app";

export const metadata: Metadata = { title: "Add a business" };

const TIMEZONES = [
  "Asia/Muscat",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Tehran",
  "Asia/Baghdad",
  "Europe/London",
  "Europe/Paris",
  "Europe/Istanbul",
  "America/New_York",
  "UTC",
];

export default async function NewBusinessPage() {
  await requirePlatformSuperAdmin();
  const admin = createAdminSupabase();

  const [
    { data: templates },
    { data: plans },
    { data: currencies },
    { data: languages },
    { data: flags },
  ] = await Promise.all([
    admin
      .from("business_templates")
      .select("id, code, name, description, business_type, default_categories")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
    admin
      .from("plans")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order"),
    admin
      .from("currencies")
      .select("code, name, symbol, decimal_digits")
      .eq("is_enabled", true)
      .order("sort_order"),
    admin
      .from("languages")
      .select("code, english_name, native_name, direction")
      .eq("is_enabled", true)
      .order("sort_order"),
    admin
      .from("feature_flags")
      .select("key, name, description, default_enabled")
      .order("sort_order"),
  ]);

  return (
    <>
      <PageHeader
        title="Add a business"
        description="Creates the business, its subscription, its first branch and the owner login in one pass."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Businesses", href: "/admin/businesses" },
          { label: "Add business" },
        ]}
      />

      <CreateBusinessWizard
        templates={(templates ?? []).map((t) => ({
          id: t.id,
          code: t.code,
          name: t.name,
          description: t.description,
          businessType: t.business_type as BusinessType,
          defaultCategories: parseDefaultCategories(t.default_categories),
        }))}
        plans={(plans ?? []).map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          durationDays: p.duration_days,
          maxBranches: p.max_branches,
          maxItems: p.max_items,
          maxCategories: p.max_categories,
          maxUsers: p.max_users,
          maxLanguages: p.max_languages,
          priceAmount: Number(p.price_amount),
          priceCurrency: p.price_currency,
          isDefault: p.is_default,
        }))}
        currencies={(currencies ?? []).map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          decimalDigits: c.decimal_digits,
        }))}
        languages={(languages ?? []).map((l) => ({
          code: l.code,
          englishName: l.english_name,
          nativeName: l.native_name,
          direction: l.direction,
        }))}
        featureFlags={(flags ?? []).map((f) => ({
          key: f.key,
          name: f.name,
          description: f.description,
          defaultEnabled: f.default_enabled,
        }))}
        timezones={TIMEZONES}
      />
    </>
  );
}
