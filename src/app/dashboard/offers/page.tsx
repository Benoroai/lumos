import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import {
  OfferManager,
  type OfferView,
} from "@/components/business/offer-manager";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCatalogContext,
  getCategoryTree,
  listItems,
} from "@/lib/queries/business/catalog";
import { PERMISSIONS } from "@/lib/permissions";
import { pickLocale, toLocalizedMap } from "@/lib/i18n/localized";
import type { CurrencyInfo } from "@/lib/format/money";
import type { CategoryNode } from "@/lib/queries/business/catalog";

export const metadata: Metadata = { title: "Offers" };

function flatten(
  nodes: CategoryNode[],
  locale: string,
  fallback: string,
): { id: string; name: string }[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: pickLocale(node.name, locale, fallback) || node.slug },
    ...flatten(node.children, locale, fallback),
  ]);
}

export default async function OffersPage() {
  const session = await requireTenantSession();
  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const [context, categories, items, { data: offers }] = await Promise.all([
    getCatalogContext(session.tenant.id),
    getCategoryTree(session.tenant.id),
    listItems(
      session.tenant.id,
      { page: 1, pageSize: 100, sort: "display_order" },
      locale,
    ),
    supabase
      .from("offers")
      .select(
        `id, code, discount_type, discount_value, starts_at, ends_at, is_active, display_order,
         offer_translations!left ( locale, name, description ),
         offer_targets!left ( target_type, item_id, category_id, branch_id )`,
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
  ]);

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

  const views: OfferView[] = (offers ?? []).map((offer) => {
    const translations = (offer.offer_translations ?? []) as unknown as {
      locale: string;
      name: string;
      description: string;
    }[];
    const targets = (offer.offer_targets ?? []) as unknown as {
      target_type: string;
      item_id: string | null;
      category_id: string | null;
      branch_id: string | null;
    }[];

    const itemIds = targets.filter((t) => t.item_id).map((t) => t.item_id!);
    const categoryIds = targets
      .filter((t) => t.category_id)
      .map((t) => t.category_id!);
    const branchIds = targets
      .filter((t) => t.branch_id)
      .map((t) => t.branch_id!);

    return {
      id: offer.id,
      code: offer.code,
      name: toLocalizedMap(translations, "name"),
      description: toLocalizedMap(translations, "description"),
      discountType: offer.discount_type as OfferView["discountType"],
      discountValue: Number(offer.discount_value),
      startsAt: offer.starts_at,
      endsAt: offer.ends_at,
      isActive: offer.is_active,
      displayOrder: offer.display_order,
      targetType: itemIds.length
        ? "items"
        : categoryIds.length
          ? "categories"
          : "all_items",
      itemIds,
      categoryIds,
      branchIds,
    };
  });

  return (
    <>
      <PageHeader
        title="Offers and promotions"
        description="Percentage discounts, fixed reductions and promotional prices — scoped to items, categories or branches and scheduled in advance."
        breadcrumbs={[{ label: "Offers" }]}
      />

      <OfferManager
        offers={views}
        items={items.rows.map((item) => ({
          id: item.id,
          name:
            pickLocale(item.name, locale, session.tenant.defaultLocale) ||
            "Untitled",
        }))}
        categories={flatten(categories, locale, session.tenant.defaultLocale)}
        branches={context.branches.map((b) => ({ id: b.id, name: b.name }))}
        locales={session.tenant.supportedLocales}
        defaultLocale={session.tenant.defaultLocale}
        currentLocale={locale}
        currency={currency}
        canManage={session.permissions.has(PERMISSIONS.offersManage)}
      />
    </>
  );
}
