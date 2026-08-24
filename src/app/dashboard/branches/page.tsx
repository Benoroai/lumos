import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import {
  BranchManager,
  type BranchView,
} from "@/components/business/branch-manager";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Branches" };

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

export default async function BranchesPage() {
  const session = await requireTenantSession();
  const supabase = await createServerSupabase();

  const [{ data: branches }, { data: flags }] = await Promise.all([
    supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("tenant_feature_flags")
      .select("flag_key, is_enabled")
      .eq("tenant_id", session.tenant.id),
  ]);

  const branchPricesEnabled =
    (flags ?? []).find((f) => f.flag_key === "branch_prices")?.is_enabled ??
    false;

  const views: BranchView[] = (branches ?? []).map((branch) => ({
    id: branch.id,
    slug: branch.slug,
    name: branch.name,
    addressLine: branch.address_line,
    city: branch.city,
    country: branch.country,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    email: branch.email,
    latitude: branch.latitude === null ? null : Number(branch.latitude),
    longitude: branch.longitude === null ? null : Number(branch.longitude),
    timezone: branch.timezone,
    openingHours: Array.isArray(branch.opening_hours)
      ? (branch.opening_hours as unknown as BranchView["openingHours"])
      : [],
    publicMenuCode: branch.public_menu_code,
    qrTargetUrl: branch.qr_target_url,
    allowBranchPrices: branch.allow_branch_prices,
    isActive: branch.is_active,
    displayOrder: branch.display_order,
  }));

  return (
    <>
      <PageHeader
        title="Branches"
        description="Each outlet has its own address, hours, availability and public menu identifier."
        breadcrumbs={[{ label: "Branches" }]}
      />

      <BranchManager
        branches={views}
        timezones={TIMEZONES}
        publicApiBase={`${publicEnv.NEXT_PUBLIC_APP_URL}/api/v1/public/businesses/${session.tenant.slug}`}
        canManage={session.permissions.has(PERMISSIONS.branchesManage)}
        branchPricesEnabled={branchPricesEnabled}
      />
    </>
  );
}
