import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  Globe,
  Layers,
  MapPin,
  ShieldCheck,
  Tag,
  UsersRound,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { StatCard } from "@/components/ui/stat-card";
import { CopyButton } from "@/components/ui/copy-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import {
  BusinessLifecycleActions,
  ResetPasswordDialog,
} from "@/components/platform/business-actions";
import { SubscriptionPanel } from "@/components/platform/subscription-panel";
import { requirePlatformSession } from "@/lib/auth/session";
import { getBusinessDetail } from "@/lib/queries/platform/businesses";
import { listAuditLogs } from "@/lib/queries/platform/analytics";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { BUSINESS_TYPE_LABELS } from "@/lib/business-templates";
import { canAdministerPlatform, canImpersonate } from "@/lib/permissions";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { publicEnv } from "@/lib/env";
import type { AccountStatus, BusinessType } from "@/lib/types/app";

export const metadata: Metadata = { title: "Business details" };

export default async function BusinessDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  const session = await requirePlatformSession();

  const [detail, plansResult, auditResult] = await Promise.all([
    getBusinessDetail(tenantId),
    createAdminSupabase()
      .from("plans")
      .select("id, name, duration_days")
      .eq("is_active", true)
      .order("sort_order"),
    listAuditLogs({ page: 1, pageSize: 20, tenantId }),
  ]);

  if (!detail) notFound();

  const {
    tenant,
    counts,
    members,
    branches,
    featureFlags,
    currentSubscription,
    derivedStatus,
    subscriptions,
  } = detail;
  const isSuperAdmin = canAdministerPlatform(session.role);
  const publicApiBase = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/v1/public/businesses/${tenant.slug}`;

  return (
    <>
      <PageHeader
        title={tenant.name}
        description={tenant.legal_name || undefined}
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Businesses", href: "/admin/businesses" },
          { label: tenant.name },
        ]}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone="secondary">
              {BUSINESS_TYPE_LABELS[tenant.business_type as BusinessType] ??
                tenant.business_type}
            </Badge>
            <Badge
              tone={
                tenant.deleted_at
                  ? "neutral"
                  : tenant.account_status === "active"
                    ? "success"
                    : tenant.account_status === "suspended"
                      ? "danger"
                      : "neutral"
              }
            >
              {tenant.deleted_at ? "Deleted" : tenant.account_status}
            </Badge>
          </span>
        }
        actions={
          <BusinessLifecycleActions
            tenantId={tenant.id}
            tenantName={tenant.name}
            accountStatus={tenant.account_status as AccountStatus}
            isDeleted={!!tenant.deleted_at}
            canAdminister={isSuperAdmin}
            canImpersonate={canImpersonate(session.role)}
          />
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Branches" value={counts.branches} icon={MapPin} />
        <StatCard label="Categories" value={counts.categories} icon={Layers} />
        <StatCard label="Items" value={counts.items} icon={Tag} />
        <StatCard label="Offers" value={counts.offers} icon={Building2} />
      </section>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Registration</CardTitle>
                  <CardDescription>
                    Identity and locale configuration.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
                  <Detail label="Slug" value={`/${tenant.slug}`} mono />
                  <Detail
                    label="Registered"
                    value={formatDate(tenant.registered_at)}
                  />
                  <Detail label="Country" value={tenant.country} />
                  <Detail label="Timezone" value={tenant.timezone} />
                  <Detail
                    label="Default currency"
                    value={tenant.default_currency}
                  />
                  <Detail
                    label="Default language"
                    value={tenant.default_locale}
                  />
                  <Detail
                    label="Languages"
                    value={tenant.supported_locales.join(", ")}
                  />
                  <Detail label="Contact" value={tenant.contact_email ?? "—"} />
                  <Detail label="Phone" value={tenant.contact_phone ?? "—"} />
                  <Detail
                    label="WhatsApp"
                    value={tenant.contact_whatsapp ?? "—"}
                  />
                  <Detail label="Address" value={tenant.address_line || "—"} />
                  <Detail label="City" value={tenant.city || "—"} />
                </dl>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Integration</CardTitle>
                    <CardDescription>
                      What the separate customer frontend connects to.
                    </CardDescription>
                  </div>
                  <Globe className="size-5 text-[var(--foreground-subtle)]" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
                        Public API base
                      </p>
                      <p className="mt-0.5 truncate font-mono text-sm">
                        {publicApiBase}
                      </p>
                    </div>
                    <CopyButton value={publicApiBase} />
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
                        Public identifier
                      </p>
                      <p className="mt-0.5 truncate font-mono text-sm">
                        {tenant.public_id}
                      </p>
                    </div>
                    <CopyButton value={tenant.public_id} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Internal notes</CardTitle>
                    <CardDescription>
                      Platform staff only. Never returned by any API and hidden
                      from the business.
                    </CardDescription>
                  </div>
                  <ShieldCheck className="size-5 text-[var(--foreground-subtle)]" />
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap text-[var(--foreground-muted)]">
                    {tenant.internal_notes || "No notes recorded."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionPanel
            tenantId={tenant.id}
            plans={(plansResult.data ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              durationDays: p.duration_days,
            }))}
            current={
              currentSubscription
                ? {
                    id: currentSubscription.id,
                    planId: currentSubscription.plan_id,
                    planName:
                      (
                        currentSubscription.plans as unknown as {
                          name: string;
                        } | null
                      )?.name ?? "Unknown",
                    status: currentSubscription.status,
                    startsAt: currentSubscription.starts_at,
                    expiresAt: currentSubscription.expires_at,
                    autoRenew: currentSubscription.auto_renew,
                  }
                : null
            }
            derived={derivedStatus}
            history={subscriptions.map((s) => ({
              id: s.id,
              planName:
                (s.plans as unknown as { name: string } | null)?.name ??
                "Unknown",
              status: s.status,
              startsAt: s.starts_at,
              expiresAt: s.expires_at,
            }))}
            canAdminister={isSuperAdmin}
          />
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Business users</CardTitle>
                <CardDescription>
                  These accounts can only ever reach this business&apos;s data.
                </CardDescription>
              </div>
              <UsersRound className="size-5 text-[var(--foreground-subtle)]" />
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <TableWrap className="rounded-none border-x-0 border-b-0">
                <Table>
                  <THead>
                    <tr>
                      <TH>Name</TH>
                      <TH>Email</TH>
                      <TH>Role</TH>
                      <TH>Status</TH>
                      <TH>Last login</TH>
                      <TH>
                        <span className="sr-only">Actions</span>
                      </TH>
                    </tr>
                  </THead>
                  <TBody>
                    {members.map((member) => {
                      const role = member.roles as unknown as {
                        code: string;
                        name: string;
                      } | null;
                      return (
                        <TR key={member.id}>
                          <TD className="font-medium">
                            {member.full_name || "—"}
                            {member.is_owner ? (
                              <Badge tone="accent" className="ms-2">
                                Owner
                              </Badge>
                            ) : null}
                          </TD>
                          <TD className="text-[var(--foreground-muted)]">
                            {member.email}
                          </TD>
                          <TD>{role?.name ?? "—"}</TD>
                          <TD>
                            <Badge
                              tone={
                                member.status === "active"
                                  ? "success"
                                  : "neutral"
                              }
                            >
                              {member.status}
                            </Badge>
                            {member.must_change_password ? (
                              <Badge tone="warning" className="ms-2">
                                Must change password
                              </Badge>
                            ) : null}
                          </TD>
                          <TD className="text-[var(--foreground-muted)]">
                            {member.last_login_at
                              ? formatDateTime(member.last_login_at)
                              : "Never"}
                          </TD>
                          <TD className="text-end">
                            <ResetPasswordDialog
                              email={member.email}
                              tenantId={tenant.id}
                              canSetTemporary={isSuperAdmin}
                            />
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </TableWrap>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Branches</CardTitle>
                <CardDescription>
                  Each branch has its own public menu identifier.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {branches.length ? (
                <TableWrap className="rounded-none border-x-0 border-b-0">
                  <Table>
                    <THead>
                      <tr>
                        <TH>Name</TH>
                        <TH>Slug</TH>
                        <TH>City</TH>
                        <TH>Public menu code</TH>
                        <TH>Status</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {branches.map((branch) => (
                        <TR key={branch.id}>
                          <TD className="font-medium">{branch.name}</TD>
                          <TD className="font-mono text-[var(--foreground-muted)]">
                            {branch.slug}
                          </TD>
                          <TD>{branch.city || "—"}</TD>
                          <TD className="font-mono text-xs">
                            {branch.public_menu_code}
                          </TD>
                          <TD>
                            <Badge
                              tone={branch.is_active ? "success" : "neutral"}
                            >
                              {branch.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              ) : (
                <div className="p-5">
                  <EmptyState icon={MapPin} title="No branches" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Feature flags</CardTitle>
                <CardDescription>
                  Per-business overrides of the platform defaults.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-[var(--border)]">
                {featureFlags.map((flag) => {
                  const meta = flag.feature_flags as unknown as {
                    name: string;
                    description: string;
                  } | null;
                  return (
                    <li
                      key={flag.flag_key}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {meta?.name ?? flag.flag_key}
                        </p>
                        <p className="text-xs text-[var(--foreground-muted)]">
                          {meta?.description}
                        </p>
                      </div>
                      <Badge tone={flag.is_enabled ? "success" : "neutral"}>
                        {flag.is_enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>
                  The 20 most recent audited actions for this business.
                </CardDescription>
              </div>
              <Link
                href={`/admin/audit?tenantId=${tenant.id}`}
                className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
              >
                Full audit log
              </Link>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {auditResult.rows.length ? (
                <TableWrap className="rounded-none border-x-0 border-b-0">
                  <Table>
                    <THead>
                      <tr>
                        <TH>When</TH>
                        <TH>Action</TH>
                        <TH>Entity</TH>
                        <TH>Actor</TH>
                      </tr>
                    </THead>
                    <TBody>
                      {auditResult.rows.map((row) => (
                        <TR key={row.id}>
                          <TD className="whitespace-nowrap text-[var(--foreground-muted)]">
                            {formatDateTime(row.createdAt)}
                          </TD>
                          <TD className="font-mono text-xs">{row.action}</TD>
                          <TD className="text-[var(--foreground-muted)]">
                            {row.entityType}
                          </TD>
                          <TD>
                            {row.actorEmail ?? "system"}
                            {row.isImpersonated ? (
                              <Badge tone="warning" className="ms-2">
                                Support mode
                              </Badge>
                            ) : null}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </TableWrap>
              ) : (
                <div className="p-5">
                  <EmptyState
                    icon={ShieldCheck}
                    title="No recorded activity yet"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
        {label}
      </dt>
      <dd className={`mt-0.5 truncate text-sm${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
