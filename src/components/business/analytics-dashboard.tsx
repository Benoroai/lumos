"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  DonutChart,
  HorizontalBarChart,
  TrendChart,
} from "@/components/charts/chart-primitives";
import type { AnalyticsSummary } from "@/lib/queries/business/analytics";
import { LOCALE_LABELS } from "@/lib/i18n/config";
import { formatNumber, formatPercent, percentChange } from "@/lib/utils";

const PRESETS = [
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
  { label: "90 days", value: "90d" },
  { label: "12 months", value: "12m" },
];

export function AnalyticsDashboard({
  summary,
  labels,
}: {
  summary: AnalyticsSummary;
  labels: { item: string; items: string; category: string; categories: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const preset = searchParams.get("preset") ?? "30d";

  function setParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasData =
    summary.totals.menuViews +
      summary.totals.itemViews +
      summary.totals.searches >
    0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={
                preset === option.value && !searchParams.get("from")
                  ? "primary"
                  : "secondary"
              }
              onClick={() =>
                setParams({ preset: option.value, from: null, to: null })
              }
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="ms-auto flex flex-wrap items-end gap-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--foreground-muted)]">
              From
            </span>
            <Input
              type="date"
              className="h-8"
              value={summary.range.from.slice(0, 10)}
              onChange={(e) => setParams({ from: e.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-[var(--foreground-muted)]">
              To
            </span>
            <Input
              type="date"
              className="h-8"
              value={summary.range.to.slice(0, 10)}
              onChange={(e) => setParams({ to: e.target.value })}
            />
          </label>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Menu views"
          value={formatNumber(summary.totals.menuViews)}
          icon={BarChart3}
          change={percentChange(
            summary.totals.menuViews,
            summary.previousTotals.menuViews,
          )}
          hint="vs previous period"
        />
        <StatCard
          label="Unique sessions"
          value={formatNumber(summary.totals.uniqueSessions)}
          icon={Users}
          change={percentChange(
            summary.totals.uniqueSessions,
            summary.previousTotals.uniqueSessions,
          )}
          hint="vs previous period"
        />
        <StatCard
          label={`${labels.item} views`}
          value={formatNumber(summary.totals.itemViews)}
          change={percentChange(
            summary.totals.itemViews,
            summary.previousTotals.itemViews,
          )}
          tone="secondary"
        />
        <StatCard
          label="Searches"
          value={formatNumber(summary.totals.searches)}
          icon={Search}
          change={percentChange(
            summary.totals.searches,
            summary.previousTotals.searches,
          )}
          hint={`${summary.zeroResultSearches.length} with no results`}
        />
      </section>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="No activity in this period yet"
          description="Analytics arrive from your public menu through the API. Once your customer-facing frontend is connected, traffic appears here."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Traffic over time</CardTitle>
                <CardDescription>
                  Menu views and {labels.item.toLowerCase()} views per day.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <TrendChart
                data={summary.timeSeries}
                series={[
                  { key: "menuViews", label: "Menu views" },
                  { key: "itemViews", label: `${labels.item} views` },
                ]}
              />
            </CardContent>
          </Card>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    Most viewed {labels.items.toLowerCase()}
                  </CardTitle>
                  <CardDescription>
                    What your customers look at most.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {summary.topItems.length ? (
                  <HorizontalBarChart
                    data={summary.topItems.map((row) => ({
                      name: row.name,
                      value: row.views,
                    }))}
                  />
                ) : (
                  <EmptyState icon={BarChart3} title="No views recorded yet" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>
                    Most viewed {labels.categories.toLowerCase()}
                  </CardTitle>
                  <CardDescription>Where attention goes first.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {summary.topCategories.length ? (
                  <HorizontalBarChart
                    data={summary.topCategories.map((row) => ({
                      name: row.name,
                      value: row.views,
                    }))}
                  />
                ) : (
                  <EmptyState icon={BarChart3} title="No views recorded yet" />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Popular searches</CardTitle>
                  <CardDescription>
                    What people type into your menu.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {summary.popularSearches.length ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {summary.popularSearches.map((row) => (
                      <li
                        key={row.term}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {row.term}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {row.zeroResults > 0 ? (
                            <Badge tone="warning">
                              {row.zeroResults} empty
                            </Badge>
                          ) : null}
                          <span className="tabular text-sm text-[var(--foreground-muted)]">
                            {row.count}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState icon={Search} title="No searches yet" />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Searches with no results</CardTitle>
                  <CardDescription>
                    Demand you are not meeting — each one is a menu gap.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {summary.zeroResultSearches.length ? (
                  <ul className="divide-y divide-[var(--border)]">
                    {summary.zeroResultSearches.map((row) => (
                      <li
                        key={row.term}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="min-w-0 truncate text-sm">
                          {row.term}
                        </span>
                        <span className="tabular text-sm text-[var(--danger)]">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    icon={Search}
                    title="Every search found something"
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Language distribution</CardTitle>
                  <CardDescription>
                    Which languages your customers read in.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                {summary.languageMix.length ? (
                  <>
                    <DonutChart
                      data={summary.languageMix.map((row) => ({
                        name: LOCALE_LABELS[row.locale]?.english ?? row.locale,
                        value: row.count,
                      }))}
                      height={200}
                    />
                    <ul className="mt-3 space-y-1 text-sm">
                      {summary.languageMix.map((row) => (
                        <li
                          key={row.locale}
                          className="flex justify-between gap-3"
                        >
                          <span className="text-[var(--foreground-muted)]">
                            {LOCALE_LABELS[row.locale]?.native ?? row.locale}
                          </span>
                          <span className="tabular">
                            {formatPercent(row.share)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <EmptyState icon={BarChart3} title="No language data yet" />
                )}
              </CardContent>
            </Card>
          </section>

          {summary.branchPerformance.length ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Branch performance</CardTitle>
                  <CardDescription>Menu traffic per outlet.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart
                  data={summary.branchPerformance.map((row) => ({
                    name: row.name,
                    value: row.views,
                  }))}
                />
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
