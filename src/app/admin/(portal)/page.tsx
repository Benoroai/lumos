import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CircleCheck,
  LayoutGrid,
  MapPin,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DonutChart,
  HorizontalBarChart,
} from "@/components/charts/chart-primitives";
import { requirePlatformSession } from "@/lib/auth/session";
import { getPlatformOverview } from "@/lib/queries/platform/analytics";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-templates";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
} from "@/lib/subscriptions";
import { formatDate } from "@/lib/format/date";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Platform overview" };

export default async function AdminOverviewPage() {
  const session = await requirePlatformSession();
  const overview = await getPlatformOverview();

  const needsAttention =
    overview.expiredSubscriptions + overview.expiringSubscriptions;

  return (
    <>
      <PageHeader
        title={`Good to see you, ${session.fullName.split(" ")[0] || "there"}`}
        description="Everything running on the platform, at a glance."
        actions={
          session.role === "super_admin" ? (
            <Button asChild>
              <Link href="/admin/businesses/new">
                <Plus /> Add business
              </Link>
            </Button>
          ) : null
        }
      />

      {needsAttention > 0 ? (
        <Card className="border-[var(--warning)] bg-[var(--warning-soft)]">
          <CardContent className="flex flex-wrap items-center gap-4 pt-5">
            <AlertTriangle
              className="size-5 shrink-0 text-[var(--warning)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[var(--warning)]">
                {needsAttention} subscription{needsAttention === 1 ? "" : "s"}{" "}
                need attention
              </p>
              <p className="text-sm text-[var(--foreground-muted)]">
                {overview.expiredSubscriptions} expired ·{" "}
                {overview.expiringSubscriptions} expiring within 30 days.
                Business data stays preserved either way.
              </p>
            </div>
            <Button variant="secondary" asChild>
              <Link href="/admin/subscriptions">Review</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total businesses"
          value={formatNumber(overview.totalBusinesses)}
          icon={Building2}
          hint={`${overview.activeBusinesses} active`}
        />
        <StatCard
          label="Active subscriptions"
          value={formatNumber(
            overview.totalBusinesses - overview.expiredSubscriptions,
          )}
          icon={CircleCheck}
          tone="accent"
          hint={`${overview.trialSubscriptions} on trial`}
        />
        <StatCard
          label="Expiring soon"
          value={formatNumber(overview.expiringSubscriptions)}
          icon={CalendarClock}
          tone={overview.expiringSubscriptions > 0 ? "danger" : "default"}
          hint="Within 30 days"
        />
        <StatCard
          label="Branches"
          value={formatNumber(overview.totalBranches)}
          icon={MapPin}
          hint={`${formatNumber(overview.totalItems)} catalog items`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Businesses by type</CardTitle>
              <CardDescription>
                One flexible catalog model serves every business type on the
                platform.
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
              <EmptyState
                icon={UtensilsCrossed}
                title="No businesses yet"
                description="Create the first business to see the distribution here."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>By plan</CardTitle>
              <CardDescription>
                Distribution across commercial plans.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {overview.byPlan.length ? (
              <DonutChart
                data={overview.byPlan.map((row) => ({
                  name: row.plan,
                  value: row.count,
                }))}
              />
            ) : (
              <EmptyState icon={LayoutGrid} title="No plans in use yet" />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Renewals due</CardTitle>
              <CardDescription>Closest expiry first.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/subscriptions">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {overview.expiringSoon.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {overview.expiringSoon.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/businesses/${row.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        Expires {formatDate(row.expiresAt)}
                      </p>
                    </div>
                    <Badge tone={SUBSCRIPTION_STATUS_TONE[row.status]}>
                      {row.daysRemaining} day
                      {row.daysRemaining === 1 ? "" : "s"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={CircleCheck}
                title="Nothing expiring soon"
                description="Every subscription is comfortably in date."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recently added</CardTitle>
              <CardDescription>
                The newest businesses on the platform.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/businesses">View all</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {overview.recentBusinesses.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {overview.recentBusinesses.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/admin/businesses/${row.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="truncate text-xs text-[var(--foreground-muted)]">
                        /{row.slug}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="secondary">
                        {BUSINESS_TYPE_LABELS[row.type] ?? row.type}
                      </Badge>
                      <span className="hidden text-xs text-[var(--foreground-subtle)] sm:block">
                        {formatDate(row.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Building2}
                title="No businesses yet"
                description="Add the first business to get started."
                action={
                  <Button asChild>
                    <Link href="/admin/businesses/new">
                      <Plus /> Add business
                    </Link>
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {overview.byStatus.map((row) => (
          <div
            key={row.status}
            className="surface-card flex items-center justify-between gap-3 p-4"
          >
            <span className="text-sm text-[var(--foreground-muted)]">
              {SUBSCRIPTION_STATUS_LABELS[row.status]}
            </span>
            <Badge tone={SUBSCRIPTION_STATUS_TONE[row.status]}>
              {row.count}
            </Badge>
          </div>
        ))}
      </section>
    </>
  );
}
