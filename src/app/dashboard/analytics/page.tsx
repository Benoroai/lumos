import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { AnalyticsDashboard } from "@/components/business/analytics-dashboard";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getAnalyticsSummary,
  parseDateRange,
} from "@/lib/queries/business/analytics";
import { getCatalogContext } from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Analytics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.analyticsView))
    redirect("/dashboard");

  const locale = await getLocale();
  const params = await searchParams;

  const range = parseDateRange({
    from: first(params.from),
    to: first(params.to),
    preset: first(params.preset),
  });

  const [context, summary] = await Promise.all([
    getCatalogContext(session.tenant.id),
    getAnalyticsSummary(
      session.tenant.id,
      range,
      locale,
      session.tenant.defaultLocale,
    ),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  return (
    <>
      <PageHeader
        title="Analytics"
        description="How customers use your public menu."
        breadcrumbs={[{ label: "Analytics" }]}
      />

      <Alert tone="info" title="Privacy by design">
        No cookies, no IP addresses and no personal data are stored. Unique
        sessions are counted with a salted hash that rotates daily and cannot be
        linked across days or businesses.
      </Alert>

      <AnalyticsDashboard
        summary={summary}
        labels={{
          item: words.item,
          items: words.items,
          category: words.category,
          categories: words.categories,
        }}
      />
    </>
  );
}
