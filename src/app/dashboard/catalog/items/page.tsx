import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ItemTable } from "@/components/business/item-table";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getCatalogContext,
  getCategoryTree,
  listItems,
} from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale } from "@/lib/i18n/localized";
import type { CurrencyInfo, PriceDisplayFormat } from "@/lib/format/money";
import type { CategoryNode } from "@/lib/queries/business/catalog";

export const metadata: Metadata = { title: "Items" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function flatten(
  nodes: CategoryNode[],
  locale: string,
  fallback: string,
  depth = 0,
): { id: string; name: string }[] {
  return nodes.flatMap((node) => [
    {
      id: node.id,
      name: `${"— ".repeat(depth)}${pickLocale(node.name, locale, fallback) || node.slug}`,
    },
    ...flatten(node.children, locale, fallback, depth + 1),
  ]);
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireTenantSession();
  const locale = await getLocale();
  const params = await searchParams;

  const page = Math.max(1, Number(first(params.page) ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(first(params.pageSize) ?? 25) || 25),
  );
  const statusParam = first(params.status);
  const stockParam = first(params.stock);

  const [context, categories, data] = await Promise.all([
    getCatalogContext(session.tenant.id),
    getCategoryTree(session.tenant.id),
    listItems(
      session.tenant.id,
      {
        page,
        pageSize,
        search: first(params.search),
        categoryId: first(params.categoryId),
        status:
          statusParam === "active" || statusParam === "inactive"
            ? statusParam
            : undefined,
        stock:
          stockParam === "in" || stockParam === "out" ? stockParam : undefined,
        sort: first(params.sort),
        direction: first(params.direction) === "desc" ? "desc" : "asc",
      },
      locale,
    ),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

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

  return (
    <>
      <PageHeader
        title={words.items}
        description={`${data.total} ${words.items.toLowerCase()} in your ${words.catalog.toLowerCase()}.`}
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/items" },
          { label: words.items },
        ]}
        actions={
          session.permissions.has(PERMISSIONS.itemsManage) ? (
            <Button asChild>
              <Link href="/dashboard/catalog/items/new">
                <Plus /> New {words.item.toLowerCase()}
              </Link>
            </Button>
          ) : null
        }
      />

      <ItemTable
        data={data}
        categories={flatten(categories, locale, session.tenant.defaultLocale)}
        currency={currency}
        locale={locale}
        defaultLocale={session.tenant.defaultLocale}
        currencyFormat={
          (context.settings?.price_display_format as
            PriceDisplayFormat | undefined) ?? "symbol_before"
        }
        canManage={session.permissions.has(PERMISSIONS.itemsManage)}
        canToggleStock={session.permissions.has(PERMISSIONS.itemsAvailability)}
        labels={{
          item: words.item,
          items: words.items,
          category: words.category,
        }}
      />
    </>
  );
}
