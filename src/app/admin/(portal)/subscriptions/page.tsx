import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { requirePlatformSession } from "@/lib/auth/session";
import { listBusinesses } from "@/lib/queries/platform/businesses";
import { getPlatformOverview } from "@/lib/queries/platform/analytics";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
} from "@/lib/subscriptions";
import { formatDate } from "@/lib/format/date";

export const metadata: Metadata = { title: "Subscriptions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePlatformSession();
  const params = await searchParams;

  const page = Math.max(1, Number(first(params.page) ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(first(params.pageSize) ?? 25) || 25),
  );
  const status = first(params.status);

  const [overview, data] = await Promise.all([
    getPlatformOverview(),
    listBusinesses({
      page,
      pageSize,
      subscriptionStatus: status,
      sort: "created_at",
      direction: "desc",
    }),
  ]);

  // Closest expiry first — this page exists to answer "what needs renewing".
  const rows = [...data.rows].sort(
    (a, b) => (a.daysRemaining ?? 1e9) - (b.daysRemaining ?? 1e9),
  );

  const FILTERS = [
    { label: "All", value: "" },
    { label: "Expiring soon", value: "expiring_soon" },
    { label: "Expired", value: "expired" },
    { label: "Trial", value: "trial" },
    { label: "Active", value: "active" },
    { label: "Suspended", value: "suspended" },
    { label: "Cancelled", value: "cancelled" },
  ];

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Alerts are raised at 30, 14, 7 and 1 day before expiry. Business data is never removed when a subscription lapses."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Subscriptions" },
        ]}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Expired"
          value={overview.expiredSubscriptions}
          tone="danger"
          icon={CalendarClock}
        />
        <StatCard
          label="Expiring within 30 days"
          value={overview.expiringSubscriptions}
          tone="accent"
        />
        <StatCard label="On trial" value={overview.trialSubscriptions} />
        <StatCard
          label="Total businesses"
          value={overview.totalBusinesses}
          icon={CircleCheck}
        />
      </section>

      <nav
        className="flex flex-wrap gap-1.5"
        aria-label="Filter by subscription status"
      >
        {FILTERS.map((filter) => {
          const active = (status ?? "") === filter.value;
          return (
            <Button
              key={filter.value || "all"}
              size="sm"
              variant={active ? "primary" : "secondary"}
              asChild
            >
              <Link
                href={
                  filter.value
                    ? `/admin/subscriptions?status=${filter.value}`
                    : "/admin/subscriptions"
                }
              >
                {filter.label}
              </Link>
            </Button>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing matches that filter"
          description="No subscription is currently in that state."
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Business</TH>
                  <TH>Plan</TH>
                  <TH>Status</TH>
                  <TH>Expires</TH>
                  <TH className="text-end">Days left</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/admin/businesses/${row.id}`}
                        className="font-medium hover:text-[var(--primary)] hover:underline"
                      >
                        {row.name}
                      </Link>
                      <p className="text-xs text-[var(--foreground-subtle)]">
                        /{row.slug}
                      </p>
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">
                      {row.planName ?? "—"}
                    </TD>
                    <TD>
                      {row.subscriptionStatus ? (
                        <Badge
                          tone={
                            SUBSCRIPTION_STATUS_TONE[row.subscriptionStatus]
                          }
                        >
                          {SUBSCRIPTION_STATUS_LABELS[row.subscriptionStatus]}
                        </Badge>
                      ) : (
                        <Badge tone="danger">None</Badge>
                      )}
                    </TD>
                    <TD className="tabular">
                      {row.expiresAt ? formatDate(row.expiresAt) : "—"}
                    </TD>
                    <TD className="tabular text-end">
                      {row.daysRemaining === null ? (
                        "—"
                      ) : (
                        <span
                          className={
                            row.daysRemaining <= 0
                              ? "font-semibold text-[var(--danger)]"
                              : row.daysRemaining <= 30
                                ? "font-semibold text-[var(--warning)]"
                                : ""
                          }
                        >
                          {row.daysRemaining}
                        </span>
                      )}
                    </TD>
                    <TD className="text-end">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/businesses/${row.id}`}>Manage</Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            pageCount={data.pageCount}
          />
        </>
      )}
    </>
  );
}
