"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  ExternalLink,
  Search,
  SlidersHorizontal,
} from "lucide-react";
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
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-templates";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
} from "@/lib/subscriptions";
import { formatDate } from "@/lib/format/date";
import type { BusinessListRow } from "@/lib/queries/platform/businesses";
import type { Paginated } from "@/lib/types/app";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";

const ACCOUNT_TONE = {
  active: "success",
  suspended: "danger",
  archived: "neutral",
} as const;

export function BusinessTable({
  data,
  plans,
}: {
  data: Paginated<BusinessListRow>;
  plans: { code: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useDebouncedSearchParam("search");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="ps-9"
            aria-label="Search businesses"
          />
        </div>

        <NativeSelect
          className="w-auto min-w-36"
          value={searchParams.get("businessType") ?? ""}
          onChange={(e) => setParam("businessType", e.target.value)}
          aria-label="Filter by business type"
        >
          <option value="">All types</option>
          {Object.entries(BUSINESS_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-36"
          value={searchParams.get("accountStatus") ?? ""}
          onChange={(e) => setParam("accountStatus", e.target.value)}
          aria-label="Filter by account status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-40"
          value={searchParams.get("subscriptionStatus") ?? ""}
          onChange={(e) => setParam("subscriptionStatus", e.target.value)}
          aria-label="Filter by subscription"
        >
          <option value="">All subscriptions</option>
          {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-28"
          value={searchParams.get("planCode") ?? ""}
          onChange={(e) => setParam("planCode", e.target.value)}
          aria-label="Filter by plan"
        >
          <option value="">All plans</option>
          {plans.map((plan) => (
            <option key={plan.code} value={plan.code}>
              {plan.name}
            </option>
          ))}
        </NativeSelect>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(pathname)}
          title="Clear all filters"
        >
          <SlidersHorizontal /> Reset
        </Button>
      </div>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No businesses match those filters"
          description="Try widening the search, or add the first business to the platform."
          action={
            <Button asChild>
              <Link href="/admin/businesses/new">Add business</Link>
            </Button>
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Business</TH>
                  <TH>Type</TH>
                  <TH>Plan</TH>
                  <TH>Subscription</TH>
                  <TH>Expires</TH>
                  <TH className="text-center">Branches</TH>
                  <TH>Account</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {data.rows.map((row) => (
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
                    <TD>
                      <Badge tone="secondary">
                        {BUSINESS_TYPE_LABELS[row.businessType] ??
                          row.businessType}
                      </Badge>
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
                        <span className="text-[var(--foreground-subtle)]">
                          None
                        </span>
                      )}
                    </TD>
                    <TD className="tabular text-[var(--foreground-muted)]">
                      {row.expiresAt ? (
                        <span title={row.expiresAt}>
                          {formatDate(row.expiresAt)}
                          {row.daysRemaining !== null &&
                          row.daysRemaining <= 30 ? (
                            <span className="ms-1.5 text-xs text-[var(--danger)]">
                              ({row.daysRemaining}d)
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="tabular text-center">{row.branchCount}</TD>
                    <TD>
                      <Badge tone={ACCOUNT_TONE[row.accountStatus]}>
                        {row.isDeleted ? "Deleted" : row.accountStatus}
                      </Badge>
                    </TD>
                    <TD className="text-end">
                      <Button variant="ghost" size="iconSm" asChild>
                        <Link
                          href={`/admin/businesses/${row.id}`}
                          aria-label={`Open ${row.name}`}
                        >
                          <ExternalLink />
                        </Link>
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
    </div>
  );
}
