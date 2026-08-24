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
import { requirePlatformSession } from "@/lib/auth/session";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Feature flags" };

export default async function FeatureFlagsPage() {
  await requirePlatformSession();
  const admin = createAdminSupabase();

  const [{ data: flags }, { data: overrides }] = await Promise.all([
    admin.from("feature_flags").select("*").order("sort_order"),
    admin.from("tenant_feature_flags").select("flag_key, is_enabled"),
  ]);

  const stats = new Map<string, { on: number; off: number }>();
  for (const row of overrides ?? []) {
    const entry = stats.get(row.flag_key) ?? { on: 0, off: 0 };
    if (row.is_enabled) entry.on += 1;
    else entry.off += 1;
    stats.set(row.flag_key, entry);
  }

  return (
    <>
      <PageHeader
        title="Feature flags"
        description="Platform-wide defaults. Each business carries its own override, set during creation and adjustable afterwards."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Feature flags" },
        ]}
      />

      <TableWrap>
        <Table>
          <THead>
            <tr>
              <TH>Flag</TH>
              <TH>Key</TH>
              <TH>Default</TH>
              <TH className="text-end">Enabled for</TH>
              <TH className="text-end">Disabled for</TH>
              <TH>Overridable</TH>
            </tr>
          </THead>
          <TBody>
            {(flags ?? []).map((flag) => {
              const entry = stats.get(flag.key) ?? { on: 0, off: 0 };
              return (
                <TR key={flag.key}>
                  <TD>
                    <span className="font-medium">{flag.name}</span>
                    <p className="text-xs text-[var(--foreground-subtle)]">
                      {flag.description}
                    </p>
                  </TD>
                  <TD className="font-mono text-xs text-[var(--foreground-muted)]">
                    {flag.key}
                  </TD>
                  <TD>
                    <Badge tone={flag.default_enabled ? "success" : "neutral"}>
                      {flag.default_enabled ? "On" : "Off"}
                    </Badge>
                  </TD>
                  <TD className="tabular text-end">{entry.on}</TD>
                  <TD className="tabular text-end">{entry.off}</TD>
                  <TD>
                    <Badge
                      tone={flag.is_tenant_overridable ? "info" : "neutral"}
                    >
                      {flag.is_tenant_overridable
                        ? "Per business"
                        : "Platform only"}
                    </Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </TableWrap>
    </>
  );
}
