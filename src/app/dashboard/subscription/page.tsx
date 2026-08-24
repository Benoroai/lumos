import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { StatCard } from "@/components/ui/stat-card";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";
import {
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_TONE,
} from "@/lib/subscriptions";
import { formatDate } from "@/lib/format/date";
import { formatNumber } from "@/lib/utils";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.subscriptionView))
    redirect("/dashboard");

  const supabase = await createServerSupabase();

  const [{ data: subscription }, counts] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "*, plans:plan_id ( name, description, max_branches, max_categories, max_items, max_users, max_languages, max_storage_mb )",
      )
      .eq("tenant_id", session.tenant.id)
      .eq("is_current", true)
      .maybeSingle(),
    Promise.all([
      countRows(supabase, "branches", session.tenant.id),
      countRows(supabase, "categories", session.tenant.id),
      countRows(supabase, "items", session.tenant.id),
      countRows(supabase, "tenant_users", session.tenant.id),
    ]),
  ]);

  const plan = subscription?.plans as unknown as {
    name: string;
    description: string;
    max_branches: number;
    max_categories: number;
    max_items: number;
    max_users: number;
    max_languages: number;
    max_storage_mb: number;
  } | null;

  const [branches, categories, items, users] = counts;
  const derived = session.subscription;

  const usage = [
    { label: "Branches", used: branches, limit: plan?.max_branches ?? 0 },
    { label: "Categories", used: categories, limit: plan?.max_categories ?? 0 },
    { label: "Items", used: items, limit: plan?.max_items ?? 0 },
    { label: "Users", used: users, limit: plan?.max_users ?? 0 },
    {
      label: "Languages",
      used: session.tenant.supportedLocales.length,
      limit: plan?.max_languages ?? 0,
    },
  ];

  return (
    <>
      <PageHeader
        title="Subscription"
        description="Your plan, its limits and how much of them you are using."
        breadcrumbs={[{ label: "Subscription" }]}
        badge={
          derived ? (
            <Badge tone={SUBSCRIPTION_STATUS_TONE[derived.status]}>
              {SUBSCRIPTION_STATUS_LABELS[derived.status]}
            </Badge>
          ) : null
        }
      />

      {derived?.status === "expired" ? (
        <Alert tone="danger" title="This subscription has expired">
          Everything you have built is preserved exactly as it was. Editing is
          paused and your public menu may be offline until the platform
          administrator renews the subscription.
        </Alert>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Plan"
          value={plan?.name ?? "—"}
          hint={plan?.description}
        />
        <StatCard
          label="Expires"
          value={subscription ? formatDate(subscription.expires_at) : "—"}
          tone={derived && derived.daysRemaining <= 30 ? "danger" : "default"}
        />
        <StatCard
          label="Days remaining"
          value={derived ? Math.max(derived.daysRemaining, 0) : "—"}
        />
        <StatCard
          label="Started"
          value={subscription ? formatDate(subscription.starts_at) : "—"}
        />
      </section>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Plan usage</CardTitle>
            <CardDescription>
              Limits are checked whenever you add something new. Nothing is ever
              removed for being over a limit.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {usage.map((row) => {
            const share = row.limit > 0 ? Math.min(row.used / row.limit, 1) : 0;
            const near = share >= 0.85;
            return (
              <div key={row.label} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="tabular text-[var(--foreground-muted)]">
                    {formatNumber(row.used)} / {formatNumber(row.limit)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-inset)]">
                  <div
                    className={
                      near
                        ? "h-full rounded-full bg-[var(--danger)]"
                        : "h-full rounded-full bg-[var(--primary)]"
                    }
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Alert tone="info" title="Need a different plan?">
        Plans and subscription dates are managed by the platform administrator.
        Get in touch and they can upgrade or extend your subscription
        immediately.
      </Alert>
    </>
  );
}

async function countRows(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  table: "branches" | "categories" | "items" | "tenant_users",
  tenantId: string,
): Promise<number> {
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);
  return count ?? 0;
}
