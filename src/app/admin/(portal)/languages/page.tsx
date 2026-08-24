import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

export const metadata: Metadata = { title: "Languages and currencies" };

export default async function LanguagesPage() {
  await requirePlatformSession();
  const admin = createAdminSupabase();

  const [{ data: languages }, { data: currencies }, { data: tenants }] =
    await Promise.all([
      admin.from("languages").select("*").order("sort_order"),
      admin.from("currencies").select("*").order("sort_order"),
      admin
        .from("tenants")
        .select("supported_locales, default_currency")
        .is("deleted_at", null),
    ]);

  const localeUsage = new Map<string, number>();
  const currencyUsage = new Map<string, number>();
  for (const tenant of tenants ?? []) {
    for (const locale of tenant.supported_locales ?? []) {
      localeUsage.set(locale, (localeUsage.get(locale) ?? 0) + 1);
    }
    currencyUsage.set(
      tenant.default_currency,
      (currencyUsage.get(tenant.default_currency) ?? 0) + 1,
    );
  }

  return (
    <>
      <PageHeader
        title="Languages and currencies"
        description="The catalogue every business chooses from."
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Languages and currencies" },
        ]}
      />

      <Alert tone="info" title="Three-decimal currencies are first class">
        Every price column is <code className="font-mono">numeric(14,3)</code>,
        so OMR, KWD and BHD are stored and displayed exactly — not rounded to
        two places and corrected in the UI.
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Languages</CardTitle>
              <CardDescription>
                Right-to-left languages switch the whole dashboard layout
                automatically.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap className="rounded-none border-x-0 border-b-0">
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Language</TH>
                    <TH>Native</TH>
                    <TH>Direction</TH>
                    <TH className="text-end">In use</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {(languages ?? []).map((language) => (
                    <TR key={language.code}>
                      <TD className="font-mono">{language.code}</TD>
                      <TD className="font-medium">{language.english_name}</TD>
                      <TD
                        dir={language.direction}
                        className="text-[var(--foreground-muted)]"
                      >
                        {language.native_name}
                      </TD>
                      <TD>
                        <Badge
                          tone={
                            language.direction === "rtl"
                              ? "secondary"
                              : "neutral"
                          }
                        >
                          {language.direction.toUpperCase()}
                        </Badge>
                      </TD>
                      <TD className="tabular text-end">
                        {localeUsage.get(language.code) ?? 0}
                      </TD>
                      <TD>
                        <Badge
                          tone={language.is_enabled ? "success" : "neutral"}
                        >
                          {language.is_enabled ? "Enabled" : "Disabled"}
                        </Badge>
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
              <CardTitle>Currencies</CardTitle>
              <CardDescription>
                Decimal precision drives every price input and formatter.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <TableWrap className="rounded-none border-x-0 border-b-0">
              <Table>
                <THead>
                  <tr>
                    <TH>Code</TH>
                    <TH>Currency</TH>
                    <TH>Symbol</TH>
                    <TH className="text-end">Decimals</TH>
                    <TH className="text-end">In use</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {(currencies ?? []).map((currency) => (
                    <TR key={currency.code}>
                      <TD className="font-mono">{currency.code}</TD>
                      <TD className="font-medium">{currency.name}</TD>
                      <TD>{currency.symbol}</TD>
                      <TD className="tabular text-end">
                        {currency.decimal_digits === 3 ? (
                          <Badge tone="accent">3</Badge>
                        ) : (
                          currency.decimal_digits
                        )}
                      </TD>
                      <TD className="tabular text-end">
                        {currencyUsage.get(currency.code) ?? 0}
                      </TD>
                      <TD>
                        <Badge
                          tone={currency.is_enabled ? "success" : "neutral"}
                        >
                          {currency.is_enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
