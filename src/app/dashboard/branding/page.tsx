import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import {
  BrandingEditor,
  type BrandingValues,
} from "@/components/business/branding-editor";
import { requireTenantSession } from "@/lib/auth/session";
import { getCatalogContext, listItems } from "@/lib/queries/business/catalog";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale } from "@/lib/i18n/localized";
import type { CurrencyInfo, PriceDisplayFormat } from "@/lib/format/money";

export const metadata: Metadata = { title: "Branding" };

export default async function BrandingPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.brandingManage))
    redirect("/dashboard");

  const locale = await getLocale();
  const [context, items] = await Promise.all([
    getCatalogContext(session.tenant.id),
    listItems(
      session.tenant.id,
      { page: 1, pageSize: 3, sort: "display_order" },
      locale,
    ),
  ]);

  const settings = context.settings;
  const currencyRow = context.currencies.find(
    (c) => c.code === session.tenant.defaultCurrency,
  );
  const currency: CurrencyInfo = currencyRow
    ? {
        code: currencyRow.code,
        symbol: currencyRow.symbol,
        decimalDigits: currencyRow.decimal_digits,
      }
    : {
        code: session.tenant.defaultCurrency,
        symbol: session.tenant.defaultCurrency,
        decimalDigits: 3,
      };

  const initial: BrandingValues = {
    primaryColor: settings?.primary_color ?? "#1F45FF",
    secondaryColor: settings?.secondary_color ?? "#111111",
    accentColor: settings?.accent_color ?? "#D7FF2F",
    backgroundColor: settings?.background_color ?? "#F5F0E7",
    fontFamily: settings?.font_family ?? "Inter",
    priceDisplayFormat:
      (settings?.price_display_format as PriceDisplayFormat) ?? "symbol_before",
    showPrices: settings?.show_prices ?? true,
    taxDisplay:
      (settings?.tax_display as BrandingValues["taxDisplay"]) ?? "inclusive",
    taxRate: String(settings?.tax_rate ?? 0),
    taxLabel: settings?.tax_label ?? "VAT",
    socialLinks:
      (settings?.social_links as Record<string, string> | undefined) ?? {},
  };

  const sampleItems = items.rows.length
    ? items.rows.map((item) => ({
        name:
          pickLocale(item.name, locale, session.tenant.defaultLocale) ||
          "Untitled",
        description: pickLocale(
          item.description,
          locale,
          session.tenant.defaultLocale,
        ),
        price: item.basePrice,
        salePrice: item.salePrice,
      }))
    : [
        {
          name: "Sample item",
          description: "A short description of the item.",
          price: 3.5,
          salePrice: null,
        },
        { name: "Another item", description: "", price: 5.25, salePrice: 4.0 },
      ];

  return (
    <>
      <PageHeader
        title="Branding"
        description="Colours, price formatting and social links for your public menu."
        breadcrumbs={[{ label: "Branding" }]}
      />

      <BrandingEditor
        initial={initial}
        businessName={session.tenant.name}
        logoUrl={session.tenant.logoUrl}
        currency={currency}
        locale={locale}
        sampleItems={sampleItems}
        canManage={session.permissions.has(PERMISSIONS.brandingManage)}
      />
    </>
  );
}
