import type { Metadata } from "next";
import Link from "next/link";
import { FileClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Alert } from "@/components/ui/alert";
import { AuditFilters } from "@/components/platform/audit-filters";
import { requirePlatformSession } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/queries/platform/analytics";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format/date";

export const metadata: Metadata = { title: "Audit logs" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePlatformSession();
  const params = await searchParams;

  const page = Math.max(1, Number(first(params.page) ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(10, Number(first(params.pageSize) ?? 50) || 50),
  );

  const [result, { data: tenants }] = await Promise.all([
    listAuditLogs({
      page,
      pageSize,
      tenantId: first(params.tenantId),
      action: first(params.action),
      actorEmail: first(params.actorEmail),
      from: first(params.from),
      to: first(params.to),
    }),
    createAdminSupabase()
      .from("tenants")
      .select("id, name")
      .is("deleted_at", null)
      .order("name"),
  ]);

  return (
    <>
      <PageHeader
        title="Audit logs"
        description="Every business creation, subscription change, permission change, price change and support session."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Audit logs" },
        ]}
      />

      <Alert tone="info" title="Append-only">
        The audit table rejects updates and deletes at the database level, and
        entries are written through a privileged path so no actor can edit or
        suppress their own trail.
      </Alert>

      <AuditFilters tenants={tenants ?? []} />

      {result.rows.length === 0 ? (
        <EmptyState
          icon={FileClock}
          title="No matching audit entries"
          description="Try widening the date range or clearing the filters."
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>Action</TH>
                  <TH>Business</TH>
                  <TH>Entity</TH>
                  <TH>Actor</TH>
                  <TH>Details</TH>
                </tr>
              </THead>
              <TBody>
                {result.rows.map((row) => (
                  <TR key={row.id}>
                    <TD className="whitespace-nowrap text-[var(--foreground-muted)]">
                      {formatDateTime(row.createdAt)}
                    </TD>
                    <TD className="font-mono text-xs">{row.action}</TD>
                    <TD>
                      {row.tenantId ? (
                        <Link
                          href={`/admin/businesses/${row.tenantId}`}
                          className="hover:text-[var(--primary)] hover:underline"
                        >
                          {row.tenantName ?? row.tenantId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="text-[var(--foreground-subtle)]">
                          Platform
                        </span>
                      )}
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">
                      {row.entityType}
                      {row.entityId ? (
                        <span className="ms-1 font-mono text-xs text-[var(--foreground-subtle)]">
                          {String(row.entityId).slice(0, 8)}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      <span className="text-sm">
                        {row.actorEmail ?? "system"}
                      </span>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        <Badge
                          tone={
                            row.actorType === "platform" ? "info" : "neutral"
                          }
                        >
                          {row.actorType}
                        </Badge>
                        {row.isImpersonated ? (
                          <Badge tone="warning">Support mode</Badge>
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      {row.newValues || row.previousValues ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-[var(--primary)]">
                            View
                          </summary>
                          <pre className="mt-2 max-w-md overflow-x-auto rounded-md bg-[var(--surface-inset)] p-2 text-[11px] leading-relaxed">
                            {JSON.stringify(
                              {
                                before: row.previousValues,
                                after: row.newValues,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-[var(--foreground-subtle)]">
                          —
                        </span>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={result.total}
            pageCount={result.pageCount}
          />
        </>
      )}
    </>
  );
}
