import type { Metadata } from "next";
import { Building2, Layers, MapPin, Tag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  DonutChart,
  HorizontalBarChart,
} from "@/components/charts/chart-primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPlatformOverview } from "@/lib/queries/platform/analytics";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-templates";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/subscriptions";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Platform analytics" };

export default async function PlatformAnalyticsPage() {
  await requirePlatformSession();
  const overview = await getPlatformOverview();

  return (
    <>
      <PageHeader
        title="Platform analytics"
        description="Aggregate usage across every business."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Analytics" },
        ]}
      />

      <Alert tone="info" title="Aggregates only">
        This page never exposes an individual business&apos;s private analytics.
        Menu traffic, searches and item performance stay inside the business
        that produced them.
      </Alert>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Businesses"
          value={formatNumber(overview.totalBusinesses)}
          icon={Building2}
        />
        <StatCard
          label="Branches"
          value={formatNumber(overview.totalBranches)}
          icon={MapPin}
        />
        <StatCard
          label="Categories"
          value={formatNumber(overview.totalCategories)}
          icon={Layers}
        />
        <StatCard
          label="Catalog items"
          value={formatNumber(overview.totalItems)}
          icon={Tag}
          tone="accent"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Businesses by type</CardTitle>
              <CardDescription>
                Same schema, different vocabulary.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.byType.length ? (
              <HorizontalBarChart
                data={overview.byType.map((row) => ({
                  name: BUSINESS_TYPE_LABELS[row.type] ?? row.type,
                  value: row.count,
                }))}
              />
            ) : (
              <EmptyState icon={Building2} title="No businesses yet" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Subscription status</CardTitle>
              <CardDescription>
                Derived from expiry dates in real time.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.byStatus.length ? (
              <DonutChart
                data={overview.byStatus.map((row) => ({
                  name: SUBSCRIPTION_STATUS_LABELS[row.status],
                  value: row.count,
                }))}
              />
            ) : (
              <EmptyState icon={Building2} title="No subscriptions yet" />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Plan distribution</CardTitle>
              <CardDescription>
                Current subscriptions by commercial plan.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.byPlan.length ? (
              <HorizontalBarChart
                data={overview.byPlan.map((row) => ({
                  name: row.plan,
                  value: row.count,
                }))}
              />
            ) : (
              <EmptyState icon={Tag} title="No plans in use" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Account health</CardTitle>
              <CardDescription>
                Lifecycle state across the platform.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Metric label="Active" value={overview.activeBusinesses} />
              <Metric label="Suspended" value={overview.suspendedBusinesses} />
              <Metric label="Archived" value={overview.archivedBusinesses} />
              <Metric
                label="Expired subscriptions"
                value={overview.expiredSubscriptions}
              />
              <Metric
                label="Expiring within 30 days"
                value={overview.expiringSubscriptions}
              />
              <Metric
                label="Platform users"
                value={overview.totalPlatformUsers}
              />
              <Metric label="Offers" value={overview.totalOffers} />
              <Metric label="Trials" value={overview.trialSubscriptions} />
            </dl>
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-4 py-3">
      <dt className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
        {label}
      </dt>
      <dd className="tabular mt-1 text-xl font-semibold">
        {formatNumber(value)}
      </dd>
    </div>
  );
}
