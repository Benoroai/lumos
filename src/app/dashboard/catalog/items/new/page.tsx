import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { ItemForm, emptyItemForm } from "@/components/business/item-form";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getCatalogContext,
  getCategoryTree,
} from "@/lib/queries/business/catalog";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale, toLocalizedMap } from "@/lib/i18n/localized";
import type { CurrencyInfo } from "@/lib/format/money";
import type { CategoryNode } from "@/lib/queries/business/catalog";

export const metadata: Metadata = { title: "New item" };

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

export default async function NewItemPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.itemsManage))
    redirect("/dashboard/catalog/items");

  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const [context, categories, { data: groups }] = await Promise.all([
    getCatalogContext(session.tenant.id),
    getCategoryTree(session.tenant.id),
    supabase
      .from("modifier_groups")
      .select(
        "id, code, selection_type, is_required, modifier_group_translations!left ( locale, name )",
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("display_order"),
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
        title={`New ${words.item.toLowerCase()}`}
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/items" },
          { label: words.items, href: "/dashboard/catalog/items" },
          { label: `New ${words.item.toLowerCase()}` },
        ]}
      />

      <ItemForm
        initial={emptyItemForm()}
        categories={flatten(categories, locale, session.tenant.defaultLocale)}
        branches={context.branches.map((b) => ({
          id: b.id,
          name: b.name,
          allowBranchPrices: b.allow_branch_prices,
        }))}
        modifierGroups={(groups ?? []).map((g) => ({
          id: g.id,
          name:
            pickLocale(
              toLocalizedMap(
                (g.modifier_group_translations ?? []) as unknown as {
                  locale: string;
                  name: string;
                }[],
                "name",
              ),
              locale,
              session.tenant.defaultLocale,
            ) || g.code,
          selectionType: g.selection_type,
          isRequired: g.is_required,
        }))}
        locales={session.tenant.supportedLocales}
        defaultLocale={session.tenant.defaultLocale}
        currency={currency}
        enabledFields={
          context.settings?.enabled_item_fields ??
          context.template?.enabled_item_fields
        }
        allowBranchPrices={context.branches.some((b) => b.allow_branch_prices)}
        canManage
        canPrice={session.permissions.has(PERMISSIONS.itemsPricing)}
        labels={{
          item: words.item,
          items: words.items,
          category: words.category,
        }}
      />
    </>
  );
}
