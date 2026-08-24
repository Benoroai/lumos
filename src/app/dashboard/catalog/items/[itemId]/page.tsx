import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { ItemForm, type ItemFormValues } from "@/components/business/item-form";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getCatalogContext,
  getCategoryTree,
  getItemForEdit,
} from "@/lib/queries/business/catalog";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale, toLocalizedMap } from "@/lib/i18n/localized";
import { toDateTimeLocalValue } from "@/lib/format/date";
import type { CurrencyInfo } from "@/lib/format/money";
import type { CategoryNode } from "@/lib/queries/business/catalog";

export const metadata: Metadata = { title: "Edit item" };

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

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const session = await requireTenantSession();
  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const [record, context, categories, { data: groups }] = await Promise.all([
    getItemForEdit(session.tenant.id, itemId),
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

  if (!record) notFound();

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

  const { item, translations } = record;

  const initial: ItemFormValues = {
    id: item.id,
    categoryId: item.category_id ?? "",
    sku: item.sku ?? "",
    name: toLocalizedMap(translations, "name"),
    description: toLocalizedMap(translations, "description"),
    ingredients: toLocalizedMap(translations, "ingredients"),
    basePrice: String(item.base_price ?? ""),
    salePrice: item.sale_price === null ? "" : String(item.sale_price),
    imagePath: item.image_path,
    imageUrl: item.image_url,
    gallery: Array.isArray(item.gallery)
      ? (item.gallery as unknown as {
          path: string;
          url: string;
          alt: string;
        }[])
      : [],
    isActive: item.is_active,
    inStock: item.in_stock,
    isFeatured: item.is_featured,
    isNew: item.is_new,
    isPopular: item.is_popular,
    displayOrder: item.display_order,
    dietaryTags: item.dietary_tags ?? [],
    allergens: item.allergens ?? [],
    spiceLevel: item.spice_level === null ? "" : String(item.spice_level),
    calories: item.calories === null ? "" : String(item.calories),
    preparationTimeMinutes:
      item.preparation_time_minutes === null
        ? ""
        : String(item.preparation_time_minutes),
    serviceDurationMinutes:
      item.service_duration_minutes === null
        ? ""
        : String(item.service_duration_minutes),
    visibleFrom: toDateTimeLocalValue(item.visible_from),
    visibleUntil: toDateTimeLocalValue(item.visible_until),
    modifierGroupIds: record.modifierGroupIds,
    branchSettings: record.branchSettings.map((setting) => ({
      branchId: setting.branch_id,
      isAvailable: setting.is_available,
      inStock: setting.in_stock,
      priceOverride:
        setting.price_override === null ? "" : String(setting.price_override),
    })),
  };

  const displayName =
    pickLocale(initial.name, locale, session.tenant.defaultLocale) ||
    "Untitled";

  return (
    <>
      <PageHeader
        title={displayName}
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/items" },
          { label: words.items, href: "/dashboard/catalog/items" },
          { label: displayName },
        ]}
        badge={
          <span className="flex flex-wrap gap-2">
            <Badge tone={item.is_active ? "success" : "neutral"}>
              {item.is_active ? "Live" : "Hidden"}
            </Badge>
            <Badge tone={item.in_stock ? "accent" : "danger"}>
              {item.in_stock ? "In stock" : "Out of stock"}
            </Badge>
          </span>
        }
      />

      <ItemForm
        initial={initial}
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
        canManage={session.permissions.has(PERMISSIONS.itemsManage)}
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
