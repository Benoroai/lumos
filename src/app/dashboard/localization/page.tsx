import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { LocalizationEditor } from "@/components/business/localization-editor";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Localization" };

const TIMEZONES = [
  "Asia/Muscat",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Tehran",
  "Europe/London",
  "UTC",
];

export default async function LocalizationPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.brandingManage))
    redirect("/dashboard");

  const supabase = await createServerSupabase();

  const [{ data: languages }, { data: currencies }, { data: subscription }] =
    await Promise.all([
      supabase
        .from("languages")
        .select("code, english_name, native_name, direction")
        .eq("is_enabled", true)
        .order("sort_order"),
      supabase
        .from("currencies")
        .select("code, name, symbol, decimal_digits")
        .eq("is_enabled", true)
        .order("sort_order"),
      supabase
        .from("subscriptions")
        .select("plans:plan_id ( name, max_languages )")
        .eq("tenant_id", session.tenant.id)
        .eq("is_current", true)
        .maybeSingle(),
    ]);

  const plan = subscription?.plans as unknown as {
    name: string;
    max_languages: number;
  } | null;

  return (
    <>
      <PageHeader
        title="Localization"
        description="Languages, currency and timezone for this business."
        breadcrumbs={[{ label: "Localization" }]}
      />

      <LocalizationEditor
        languages={(languages ?? []).map((l) => ({
          code: l.code,
          englishName: l.english_name,
          nativeName: l.native_name,
          direction: l.direction,
        }))}
        currencies={(currencies ?? []).map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          decimalDigits: c.decimal_digits,
        }))}
        timezones={TIMEZONES}
        initial={{
          defaultLocale: session.tenant.defaultLocale,
          supportedLocales: session.tenant.supportedLocales,
          defaultCurrency: session.tenant.defaultCurrency,
          timezone: session.tenant.timezone,
        }}
        maxLanguages={plan?.max_languages ?? 3}
        planName={plan?.name ?? "current"}
        canManage={session.permissions.has(PERMISSIONS.brandingManage)}
      />
    </>
  );
}
