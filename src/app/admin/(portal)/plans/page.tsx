import type { Metadata } from "next";
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
import { Alert } from "@/components/ui/alert";
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format/money";

export const metadata: Metadata = { title: "Plans and limits" };

export default async function PlansPage() {
  await requirePlatformSession();
  const admin = createAdminSupabase();

  const [{ data: plans }, { data: subscriptions }, { data: currencies }] =
    await Promise.all([
      admin
        .from("plans")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order"),
      admin.from("subscriptions").select("plan_id").eq("is_current", true),
      admin.from("currencies").select("code, symbol, decimal_digits"),
    ]);

  const usage = new Map<string, number>();
  for (const row of subscriptions ?? []) {
    usage.set(row.plan_id, (usage.get(row.plan_id) ?? 0) + 1);
  }

  const currencyByCode = new Map(
    (currencies ?? []).map((c) => [
      c.code,
      { code: c.code, symbol: c.symbol, decimalDigits: c.decimal_digits },
    ]),
  );

  return (
    <>
      <PageHeader
        title="Plans and limits"
        description="Limits are enforced server-side against live counts every time a business adds a branch, category, item or user."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Plans" },
        ]}
      />

      <Alert tone="info">
        Reducing a limit never deletes existing content. A business over the new
        limit simply cannot add more until it is back under the cap.
      </Alert>

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Plan</TH>
              <TH>Price</TH>
              <TH>Term</TH>
              <TH className="text-end">Branches</TH>
              <TH className="text-end">Categories</TH>
              <TH className="text-end">Items</TH>
              <TH className="text-end">Users</TH>
              <TH className="text-end">Languages</TH>
              <TH className="text-end">Storage</TH>
              <TH className="text-end">In use</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {(plans ?? []).map((plan) => (
              <TR key={plan.id}>
                <TD>
                  <span className="font-medium">{plan.name}</span>
                  {plan.is_default ? (
                    <Badge tone="accent" className="ms-2">
                      Default
                    </Badge>
                  ) : null}
                  <p className="text-xs text-[var(--foreground-subtle)]">
                    {plan.description}
                  </p>
                </TD>
                <TD className="tabular whitespace-nowrap">
                  {formatPrice(
                    Number(plan.price_amount),
                    currencyByCode.get(plan.price_currency) ?? {
                      code: plan.price_currency,
                      symbol: plan.price_currency,
                      decimalDigits: 3,
                    },
                    "code_after",
                  )}
                </TD>
                <TD className="whitespace-nowrap text-[var(--foreground-muted)]">
                  {plan.duration_days} days
                </TD>
                <TD className="tabular text-end">{plan.max_branches}</TD>
                <TD className="tabular text-end">{plan.max_categories}</TD>
                <TD className="tabular text-end">{plan.max_items}</TD>
                <TD className="tabular text-end">{plan.max_users}</TD>
                <TD className="tabular text-end">{plan.max_languages}</TD>
                <TD className="tabular text-end whitespace-nowrap">
                  {plan.max_storage_mb} MB
                </TD>
                <TD className="tabular text-end">{usage.get(plan.id) ?? 0}</TD>
                <TD>
                  <Badge tone={plan.is_active ? "success" : "neutral"}>
                    {plan.is_active ? "Active" : "Retired"}
                  </Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </>
  );
}
