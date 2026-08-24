import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building,
  LayoutList,
  PackageX,
  Plus,
  Tag,
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
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getCatalogContext,
  getCategoryTree,
  listItems,
} from "@/lib/queries/business/catalog";
import {
  getAnalyticsSummary,
  parseDateRange,
} from "@/lib/queries/business/analytics";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale } from "@/lib/i18n/localized";
import { formatNumber, percentChange } from "@/lib/utils";
import { formatPrice, type CurrencyInfo } from "@/lib/format/money";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardOverviewPage() {
  const session = await requireTenantSession();
  const locale = await getLocale();

  const context = await getCatalogContext(session.tenant.id);
  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  const currency: CurrencyInfo = (() => {
    const match = context.currencies.find(
      (c) => c.code === session.tenant.defaultCurrency,
    );
    return match
      ? {
          code: match.code,
          symbol: match.symbol,
          decimalDigits: match.decimal_digits,
        }
      : {
          code: session.tenant.defaultCurrency,
          symbol: session.tenant.defaultCurrency,
          decimalDigits: 3,
        };
  })();

  const [categories, items, outOfStock] = await Promise.all([
    getCategoryTree(session.tenant.id),
    listItems(
      session.tenant.id,
      { page: 1, pageSize: 5, sort: "updated_at", direction: "desc" },
      locale,
    ),
    listItems(
      session.tenant.id,
      { page: 1, pageSize: 8, stock: "out" },
      locale,
    ),
  ]);

  const canSeeAnalytics = session.permissions.has(PERMISSIONS.analyticsView);
  const analytics = canSeeAnalytics
    ? await getAnalyticsSummary(
        session.tenant.id,
        parseDateRange({ preset: "30d" }),
        locale,
        session.tenant.defaultLocale,
      )
    : null;

  const activeBranches = context.branches.filter((b) => b.is_active).length;

  return (
    <>
      <PageHeader
        title={`${session.tenant.name}`}
        description={`Your ${words.catalog.toLowerCase()} at a glance.`}
        actions={
          session.permissions.has(PERMISSIONS.itemsManage) ? (
            <Button asChild>
              <Link href="/dashboard/catalog/items/new">
                <Plus /> New {words.item.toLowerCase()}
              </Link>
            </Button>
          ) : null
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={words.categories}
          value={formatNumber(countTree(categories))}
          icon={LayoutList}
        />
        <StatCard
          label={words.items}
          value={formatNumber(items.total)}
          icon={Tag}
        />
        <StatCard
          label="Out of stock"
          value={formatNumber(outOfStock.total)}
          icon={PackageX}
          tone={outOfStock.total > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Branches"
          value={formatNumber(activeBranches)}
          icon={Building}
        />
      </section>

      {canSeeAnalytics && analytics ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Menu views (30 days)"
            value={formatNumber(analytics.totals.menuViews)}
            icon={BarChart3}
            change={percentChange(
              analytics.totals.menuViews,
              analytics.previousTotals.menuViews,
            )}
            hint="vs previous 30 days"
          />
          <StatCard
            label="Unique sessions"
            value={formatNumber(analytics.totals.uniqueSessions)}
            change={percentChange(
              analytics.totals.uniqueSessions,
              analytics.previousTotals.uniqueSessions,
            )}
            hint="vs previous 30 days"
          />
          <StatCard
            label={`${words.item} views`}
            value={formatNumber(analytics.totals.itemViews)}
            change={percentChange(
              analytics.totals.itemViews,
              analytics.previousTotals.itemViews,
            )}
            tone="secondary"
          />
          <StatCard
            label="Searches"
            value={formatNumber(analytics.totals.searches)}
            change={percentChange(
              analytics.totals.searches,
              analytics.previousTotals.searches,
            )}
            hint={`${analytics.zeroResultSearches.length} with no results`}
          />
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Currently out of stock</CardTitle>
              <CardDescription>
                These stay in your {words.catalog.toLowerCase()} and are shown
                as unavailable — nothing is hidden or deleted.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/catalog/availability">
                Quick 86 <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {outOfStock.rows.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {outOfStock.rows.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot tone="danger" />
                      <Link
                        href={`/dashboard/catalog/items/${item.id}`}
                        className="truncate text-sm hover:underline"
                      >
                        {pickLocale(
                          item.name,
                          locale,
                          session.tenant.defaultLocale,
                        ) || "Untitled"}
                      </Link>
                    </span>
                    <span className="tabular shrink-0 text-sm text-[var(--foreground-muted)]">
                      {formatPrice(
                        item.basePrice,
                        currency,
                        "symbol_before",
                        locale,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Boxes}
                title="Everything is available"
                description={`Nothing in your ${words.catalog.toLowerCase()} is currently marked out of stock.`}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recently updated</CardTitle>
              <CardDescription>The last things you changed.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/catalog/items">
                All {words.items.toLowerCase()}{" "}
                <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {items.rows.length ? (
              <ul className="divide-y divide-[var(--border)]">
                {items.rows.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="min-w-0">
                      <Link
                        href={`/dashboard/catalog/items/${item.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {pickLocale(
                          item.name,
                          locale,
                          session.tenant.defaultLocale,
                        ) || "Untitled"}
                      </Link>
                      <span className="block truncate text-xs text-[var(--foreground-subtle)]">
                        {pickLocale(
                          item.categoryName,
                          locale,
                          session.tenant.defaultLocale,
                        ) || "Uncategorised"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {item.isFeatured ? (
                        <Badge tone="accent">Featured</Badge>
                      ) : null}
                      <Badge tone={item.isActive ? "success" : "neutral"}>
                        {item.isActive ? "Live" : "Hidden"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={Tag}
                title={`No ${words.items.toLowerCase()} yet`}
                description={`Add your first ${words.item.toLowerCase()} to start building the ${words.catalog.toLowerCase()}.`}
                action={
                  session.permissions.has(PERMISSIONS.itemsManage) ? (
                    <Button asChild>
                      <Link href="/dashboard/catalog/items/new">
                        <Plus /> New {words.item.toLowerCase()}
                      </Link>
                    </Button>
                  ) : null
                }
              />
            )}
          </CardContent>
        </Card>
      </section>

      {canSeeAnalytics && analytics && analytics.topItems.length ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Most viewed in the last 30 days</CardTitle>
              <CardDescription>From your public menu traffic.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/analytics">
                Full analytics <ArrowRight className="rtl:rotate-180" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {analytics.topItems.slice(0, 6).map((item, index) => (
                <li key={item.id} className="flex items-center gap-3">
                  <span className="tabular w-5 text-sm text-[var(--foreground-subtle)]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {item.name}
                  </span>
                  <div className="hidden h-1.5 w-40 overflow-hidden rounded-full bg-[var(--surface-inset)] sm:block">
                    <div
                      className="h-full rounded-full bg-[var(--primary)]"
                      style={{
                        width: `${Math.round((item.views / (analytics.topItems[0]?.views || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="tabular w-12 text-end text-sm text-[var(--foreground-muted)]">
                    {formatNumber(item.views)}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {context.branches.length === 0 || countTree(categories) === 0 ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Finish setting up</CardTitle>
              <CardDescription>
                A few steps left before your menu is ready to publish.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <SetupStep
              done={context.branches.length > 0}
              label="Add a branch"
              href="/dashboard/branches"
            />
            <SetupStep
              done={countTree(categories) > 0}
              label={`Create your first ${words.category.toLowerCase()}`}
              href="/dashboard/catalog/categories"
            />
            <SetupStep
              done={items.total > 0}
              label={`Add your first ${words.item.toLowerCase()}`}
              href="/dashboard/catalog/items/new"
            />
            <SetupStep
              done={false}
              label="Connect your public menu"
              href="/dashboard/integration"
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function SetupStep({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3 transition-colors hover:bg-[var(--surface-muted)]"
    >
      <span className="flex items-center gap-3">
        <StatusDot tone={done ? "success" : "neutral"} />
        <span
          className={
            done
              ? "text-sm text-[var(--foreground-muted)] line-through"
              : "text-sm"
          }
        >
          {label}
        </span>
      </span>
      <ArrowRight className="size-4 text-[var(--foreground-subtle)] rtl:rotate-180" />
    </Link>
  );
}

function countTree(nodes: { children: unknown[] }[]): number {
  return nodes.reduce(
    (total, node) =>
      total + 1 + countTree(node.children as { children: unknown[] }[]),
    0,
  );
}
