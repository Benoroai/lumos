import type { Metadata } from "next";
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
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format/date";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "System settings" };

export default async function SystemSettingsPage() {
  await requirePlatformSession();
  const admin = createAdminSupabase();
  const env = serverEnv();

  const { data: settings } = await admin
    .from("platform_settings")
    .select("*")
    .order("key");

  const runtime = [
    { label: "AI translation provider", value: env.AI_TRANSLATION_PROVIDER },
    { label: "AI translation model", value: env.AI_TRANSLATION_MODEL },
    {
      label: "Public API CORS allowlist",
      value: env.PUBLIC_API_CORS_ORIGINS || "(none configured)",
    },
    {
      label: "Public API rate limit",
      value: `${env.PUBLIC_API_RATE_LIMIT_PER_MINUTE} req/min`,
    },
    {
      label: "Analytics ingest rate limit",
      value: `${env.PUBLIC_API_ANALYTICS_RATE_LIMIT_PER_MINUTE} req/min`,
    },
    { label: "Public API cache", value: `${env.PUBLIC_API_CACHE_SECONDS}s` },
    {
      label: "Login rate limit",
      value: `${env.AUTH_LOGIN_RATE_LIMIT_PER_MINUTE} attempts/min per email`,
    },
    {
      label: "Max media upload",
      value: `${Math.round(env.MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
    },
    { label: "Storage bucket", value: env.SUPABASE_STORAGE_BUCKET },
  ];

  return (
    <>
      <PageHeader
        title="System settings"
        description="Platform-wide policy stored in the database, plus the runtime configuration supplied by environment variables."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "System settings" },
        ]}
      />

      <Alert tone="info" title="Secrets are never displayed">
        API keys and the service-role credential are read on the server only.
        This page shows which provider is configured, never the key itself.
      </Alert>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Platform policy</CardTitle>
            <CardDescription>
              These values are read by the database itself — for example,
              whether an expired subscription stops serving the public API.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <TableWrap className="rounded-none border-x-0 border-b-0">
            <Table>
              <THead>
                <tr>
                  <TH>Key</TH>
                  <TH>Value</TH>
                  <TH>Description</TH>
                  <TH>Updated</TH>
                </tr>
              </THead>
              <TBody>
                {(settings ?? []).map((setting) => (
                  <TR key={setting.key}>
                    <TD className="font-mono text-xs">{setting.key}</TD>
                    <TD>
                      <code className="rounded bg-[var(--surface-inset)] px-1.5 py-0.5 text-xs">
                        {JSON.stringify(setting.value)}
                      </code>
                    </TD>
                    <TD className="text-[var(--foreground-muted)]">
                      {setting.description}
                    </TD>
                    <TD className="whitespace-nowrap text-[var(--foreground-subtle)]">
                      {formatDateTime(setting.updated_at)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Runtime configuration</CardTitle>
            <CardDescription>
              Set through environment variables at deploy time.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 sm:grid-cols-2">
            {runtime.map((row) => (
              <div
                key={row.label}
                className="rounded-lg border border-[var(--border)] px-4 py-3"
              >
                <dt className="text-xs tracking-wide text-[var(--foreground-subtle)] uppercase">
                  {row.label}
                </dt>
                <dd className="mt-1 font-mono text-sm break-all">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={env.ANTHROPIC_API_KEY ? "success" : "neutral"}>
              Anthropic key {env.ANTHROPIC_API_KEY ? "configured" : "not set"}
            </Badge>
            <Badge tone={env.OPENAI_API_KEY ? "success" : "neutral"}>
              OpenAI key {env.OPENAI_API_KEY ? "configured" : "not set"}
            </Badge>
            <Badge
              tone={
                env.PUBLIC_API_BLOCK_EXPIRED_SUBSCRIPTIONS
                  ? "warning"
                  : "neutral"
              }
            >
              Expired subscriptions{" "}
              {env.PUBLIC_API_BLOCK_EXPIRED_SUBSCRIPTIONS
                ? "block the public API"
                : "still serve"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
