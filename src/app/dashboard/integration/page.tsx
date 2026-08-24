import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { BookOpen, Code2, Globe } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { PERMISSIONS } from "@/lib/permissions";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Integration and API" };

export default async function IntegrationPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.integrationManage))
    redirect("/dashboard");

  const supabase = await createServerSupabase();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, slug, public_menu_code, qr_target_url, is_active")
    .eq("tenant_id", session.tenant.id)
    .is("deleted_at", null)
    .order("display_order");

  const base = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/v1/public`;
  const businessBase = `${base}/businesses/${session.tenant.slug}`;

  const endpoints = [
    {
      method: "GET",
      path: `${businessBase}`,
      description: "Business profile, branding and languages",
    },
    {
      method: "GET",
      path: `${businessBase}/branches`,
      description: "Active branches and opening hours",
    },
    {
      method: "GET",
      path: `${businessBase}/branches/{branchSlug}/menu`,
      description: "The full menu for one branch, localized",
    },
    {
      method: "GET",
      path: `${businessBase}/categories`,
      description: "Visible categories",
    },
    {
      method: "GET",
      path: `${businessBase}/items/{itemId}`,
      description: "One item with its modifiers",
    },
    {
      method: "GET",
      path: `${businessBase}/offers`,
      description: "Live offers only",
    },
    {
      method: "POST",
      path: `${base}/analytics/events`,
      description: "Report a menu view or search",
    },
  ];

  const isLive = session.subscription?.isLive ?? false;

  return (
    <>
      <PageHeader
        title="Integration and API"
        description="Everything your customer-facing menu needs to connect."
        breadcrumbs={[{ label: "Integration" }]}
      />

      {!isLive ? (
        <Alert tone="danger" title="Your public API is currently paused">
          The platform stops serving the public API while a subscription is not
          active. Your catalog data is untouched and returns as soon as the
          subscription is renewed.
        </Alert>
      ) : (
        <Alert tone="success" title="Your public API is live">
          Anyone with your slug can read your published catalog. Only active,
          in-window content is returned — drafts, internal notes and staff data
          never leave the platform.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Connection details</CardTitle>
              <CardDescription>
                Point your separate frontend at these values.
              </CardDescription>
            </div>
            <Globe className="size-5 text-[var(--foreground-subtle)]" />
          </CardHeader>
          <CardContent className="space-y-3">
            <ValueRow label="Business slug" value={session.tenant.slug} />
            <ValueRow label="API base" value={businessBase} />
            <ValueRow
              label="Default language"
              value={session.tenant.defaultLocale}
            />
            <ValueRow
              label="Languages"
              value={session.tenant.supportedLocales.join(", ")}
            />
            <ValueRow label="Currency" value={session.tenant.defaultCurrency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>How to call it</CardTitle>
              <CardDescription>
                No API key is required — the endpoints are read-only and return
                published data only.
              </CardDescription>
            </div>
            <Code2 className="size-5 text-[var(--foreground-subtle)]" />
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="overflow-x-auto rounded-lg bg-[var(--surface-inset)] p-3 text-xs leading-relaxed">
              {`fetch('${businessBase}/branches/main/menu?locale=ar', {
  headers: { 'Accept-Language': 'ar' }
})
  .then((res) => res.json())
  .then(({ data, meta }) => {
    // meta.locale, meta.fallbackLocale, meta.currency
    // data.categories[].items[].availability
  });`}
            </pre>
            <p className="text-xs text-[var(--foreground-muted)]">
              Pass the language as <code className="font-mono">?locale=</code>{" "}
              or through the <code className="font-mono">Accept-Language</code>{" "}
              header. Anything missing in that language falls back to{" "}
              {session.tenant.defaultLocale}.
            </p>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/api/v1/public/openapi.json" target="_blank">
                <BookOpen /> OpenAPI specification
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Endpoints</CardTitle>
            <CardDescription>
              Version 1 of the public catalog API.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {endpoints.map((endpoint) => (
            <div
              key={endpoint.path}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
            >
              <Badge tone={endpoint.method === "GET" ? "info" : "accent"}>
                {endpoint.method}
              </Badge>
              <code className="min-w-0 flex-1 truncate font-mono text-xs">
                {endpoint.path}
              </code>
              <span className="hidden text-xs text-[var(--foreground-muted)] sm:block">
                {endpoint.description}
              </span>
              <CopyButton value={endpoint.path} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Branch menu links</CardTitle>
            <CardDescription>
              One public menu identifier per branch — use these for QR codes.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(branches ?? []).map((branch) => (
            <div
              key={branch.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {branch.name}
              </span>
              <Badge tone={branch.is_active ? "success" : "neutral"}>
                {branch.is_active ? "Live" : "Hidden"}
              </Badge>
              <code className="font-mono text-xs text-[var(--foreground-muted)]">
                {branch.public_menu_code}
              </code>
              <CopyButton
                value={`${businessBase}/branches/${branch.slug}/menu`}
              />
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
          {label}
        </p>
        <p className="mt-0.5 truncate font-mono text-sm">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}
