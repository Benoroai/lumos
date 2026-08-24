import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import {
  ModifierManager,
  type ModifierGroupView,
} from "@/components/business/modifier-manager";
import { requireTenantSession } from "@/lib/auth/session";
import { createServerSupabase } from "@/lib/supabase/server";
import { getCatalogContext } from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { toLocalizedMap } from "@/lib/i18n/localized";
import type { CurrencyInfo } from "@/lib/format/money";

export const metadata: Metadata = { title: "Modifiers and add-ons" };

export default async function ModifiersPage() {
  const session = await requireTenantSession();
  const locale = await getLocale();
  const supabase = await createServerSupabase();

  const [context, { data: groups }, { data: links }] = await Promise.all([
    getCatalogContext(session.tenant.id),
    supabase
      .from("modifier_groups")
      .select(
        `id, code, selection_type, is_required, min_selections, max_selections, is_active, display_order,
         modifier_group_translations!left ( locale, name, description ),
         modifiers!left ( id, code, price_adjustment, is_default, is_active, in_stock, display_order, deleted_at,
           modifier_translations!left ( locale, name ) )`,
      )
      .eq("tenant_id", session.tenant.id)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("item_modifier_groups")
      .select("modifier_group_id")
      .eq("tenant_id", session.tenant.id),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  const usage = new Map<string, number>();
  for (const link of links ?? []) {
    usage.set(
      link.modifier_group_id,
      (usage.get(link.modifier_group_id) ?? 0) + 1,
    );
  }

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

  const views: ModifierGroupView[] = (groups ?? []).map((group) => {
    const groupTranslations = (group.modifier_group_translations ??
      []) as unknown as {
      locale: string;
      name: string;
      description: string;
    }[];

    const modifiers = (
      (group.modifiers ?? []) as unknown as {
        id: string;
        code: string;
        price_adjustment: number;
        is_default: boolean;
        is_active: boolean;
        in_stock: boolean;
        display_order: number;
        deleted_at: string | null;
        modifier_translations: { locale: string; name: string }[];
      }[]
    )
      .filter((modifier) => !modifier.deleted_at)
      .sort((a, b) => a.display_order - b.display_order);

    return {
      id: group.id,
      code: group.code,
      name: toLocalizedMap(groupTranslations, "name"),
      description: toLocalizedMap(groupTranslations, "description"),
      selectionType: group.selection_type as "single" | "multiple",
      isRequired: group.is_required,
      minSelections: group.min_selections,
      maxSelections: group.max_selections,
      isActive: group.is_active,
      displayOrder: group.display_order,
      usageCount: usage.get(group.id) ?? 0,
      modifiers: modifiers.map((modifier) => ({
        id: modifier.id,
        code: modifier.code,
        name: toLocalizedMap(modifier.modifier_translations ?? [], "name"),
        priceAdjustment: String(modifier.price_adjustment),
        isDefault: modifier.is_default,
        isActive: modifier.is_active,
        inStock: modifier.in_stock,
      })),
    };
  });

  return (
    <>
      <PageHeader
        title="Modifiers and add-ons"
        description="Reusable option groups — sizes, extras, sides, service add-ons — that attach to any item."
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/items" },
          { label: "Modifiers" },
        ]}
      />

      <ModifierManager
        groups={views}
        locales={session.tenant.supportedLocales}
        defaultLocale={session.tenant.defaultLocale}
        currentLocale={locale}
        currency={currency}
        canManage={session.permissions.has(PERMISSIONS.modifiersManage)}
      />
    </>
  );
}
