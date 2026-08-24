import "server-only";

import { createPublicSupabase } from "@/lib/supabase/public";
import { pickLocale, toLocalizedMap } from "@/lib/i18n/localized";
import { applyDiscount } from "@/lib/format/money";
import { resolveLocale, requestedLocale } from "./locale";

export { resolveLocale, requestedLocale };

/**
 * Read model for the public catalog API.
 *
 * Every query here runs through the anonymous client, so the `anon` RLS
 * policies decide what is visible: unpublished rows, out-of-window content and
 * businesses without a live subscription simply do not come back. Nothing in
 * this file filters for visibility itself — that would be a second, weaker copy
 * of the rules, and the two would eventually disagree.
 *
 * What this file *does* own is the shape of the response: internal ids never
 * leave, only public identifiers do.
 */

export type PublicBusiness = {
  id: string; // internal, never serialized
  publicId: string;
  slug: string;
  name: string;
  businessType: string;
  logoUrl: string | null;
  contact: {
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    website: string | null;
  };
  address: { line: string; city: string; country: string };
  timezone: string;
  defaultLocale: string;
  supportedLocales: string[];
  currency: { code: string; symbol: string; decimalDigits: number };
  branding: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    backgroundColor: string;
    fontFamily: string;
    priceDisplayFormat: string;
    showPrices: boolean;
    taxDisplay: string;
    taxRate: number;
    taxLabel: string;
    socialLinks: Record<string, string>;
  } | null;
};

export async function findBusinessBySlug(
  slug: string,
): Promise<PublicBusiness | null> {
  const supabase = createPublicSupabase();

  const { data: tenant } = await supabase
    .from("tenants")
    .select(
      "id, public_id, slug, name, business_type, logo_url, contact_email, contact_phone, contact_whatsapp, website_url, address_line, city, country, timezone, default_locale, supported_locales, default_currency",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!tenant) return null;

  const [{ data: currency }, { data: settings }] = await Promise.all([
    supabase
      .from("currencies")
      .select("code, symbol, decimal_digits")
      .eq("code", tenant.default_currency)
      .maybeSingle(),
    supabase
      .from("business_settings")
      .select(
        "primary_color, secondary_color, accent_color, background_color, font_family, price_display_format, show_prices, tax_display, tax_rate, tax_label, social_links",
      )
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);

  return {
    id: tenant.id,
    publicId: tenant.public_id,
    slug: tenant.slug,
    name: tenant.name,
    businessType: tenant.business_type,
    logoUrl: tenant.logo_url,
    contact: {
      email: tenant.contact_email,
      phone: tenant.contact_phone,
      whatsapp: tenant.contact_whatsapp,
      website: tenant.website_url,
    },
    address: {
      line: tenant.address_line,
      city: tenant.city,
      country: tenant.country,
    },
    timezone: tenant.timezone,
    defaultLocale: tenant.default_locale,
    supportedLocales: tenant.supported_locales,
    currency: {
      code: currency?.code ?? tenant.default_currency,
      symbol: currency?.symbol ?? tenant.default_currency,
      decimalDigits: currency?.decimal_digits ?? 3,
    },
    branding: settings
      ? {
          primaryColor: settings.primary_color,
          secondaryColor: settings.secondary_color,
          accentColor: settings.accent_color,
          backgroundColor: settings.background_color,
          fontFamily: settings.font_family,
          priceDisplayFormat: settings.price_display_format,
          showPrices: settings.show_prices,
          taxDisplay: settings.tax_display,
          taxRate: Number(settings.tax_rate),
          taxLabel: settings.tax_label,
          socialLinks:
            (settings.social_links as Record<string, string> | null) ?? {},
        }
      : null,
  };
}

/** The business object as it is serialized — note the absent internal `id`. */
export function serializeBusiness(business: PublicBusiness) {
  return {
    id: business.publicId,
    slug: business.slug,
    name: business.name,
    businessType: business.businessType,
    logoUrl: business.logoUrl,
    contact: business.contact,
    address: business.address,
    timezone: business.timezone,
    defaultLocale: business.defaultLocale,
    supportedLocales: business.supportedLocales,
    currency: business.currency,
    branding: business.branding,
  };
}

export type PublicBranch = {
  id: string;
  publicId: string;
  slug: string;
  name: string;
  address: { line: string; city: string; country: string };
  phone: string | null;
  whatsapp: string | null;
  location: { latitude: number; longitude: number } | null;
  timezone: string;
  openingHours: unknown;
  menuCode: string;
  qrTargetUrl: string | null;
};

export async function listBranches(tenantId: string): Promise<PublicBranch[]> {
  const supabase = createPublicSupabase();

  const { data } = await supabase
    .from("branches")
    .select(
      "id, public_id, slug, name, address_line, city, country, phone, whatsapp, latitude, longitude, timezone, opening_hours, public_menu_code, qr_target_url",
    )
    .eq("tenant_id", tenantId)
    .order("display_order");

  return (data ?? []).map((branch) => ({
    id: branch.id,
    publicId: branch.public_id,
    slug: branch.slug,
    name: branch.name,
    address: {
      line: branch.address_line,
      city: branch.city,
      country: branch.country,
    },
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    location:
      branch.latitude !== null && branch.longitude !== null
        ? {
            latitude: Number(branch.latitude),
            longitude: Number(branch.longitude),
          }
        : null,
    timezone: branch.timezone,
    openingHours: branch.opening_hours,
    menuCode: branch.public_menu_code,
    qrTargetUrl: branch.qr_target_url,
  }));
}

export function serializeBranch(branch: PublicBranch) {
  return {
    id: branch.publicId,
    slug: branch.slug,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    location: branch.location,
    timezone: branch.timezone,
    openingHours: branch.openingHours,
    menuCode: branch.menuCode,
    qrTargetUrl: branch.qrTargetUrl,
  };
}

type OfferRecord = {
  id: string;
  public_id: string;
  discount_type: "percentage" | "fixed_amount" | "promotional_price";
  discount_value: number;
  starts_at: string;
  ends_at: string | null;
  image_url: string | null;
  name: string;
  description: string;
  targets: {
    targetType: string;
    itemId: string | null;
    categoryId: string | null;
    branchId: string | null;
  }[];
};

export type MenuOptions = {
  locale: string;
  fallbackLocale: string;
  branchId?: string | undefined;
  categorySlug?: string | undefined;
  search?: string | undefined;
};

/**
 * Builds the full localized menu in a fixed number of queries, regardless of
 * how large the catalog is — the customer frontend calls this on every page
 * load, so an N+1 here would be felt immediately.
 */
export async function buildMenu(
  business: PublicBusiness,
  options: MenuOptions,
) {
  const supabase = createPublicSupabase();
  const { locale, fallbackLocale, branchId } = options;

  const [
    { data: categories },
    { data: categoryTranslations },
    { data: categoryBranches },
    { data: items },
    { data: itemTranslations },
    { data: branchSettings },
    { data: itemModifierLinks },
    { data: modifierGroups },
    { data: modifierGroupTranslations },
    { data: modifiers },
    { data: modifierTranslations },
    { data: offers },
    { data: offerTranslations },
    { data: offerTargets },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, public_id, slug, parent_id, image_url, icon, color, display_order",
      )
      .eq("tenant_id", business.id)
      .order("display_order"),
    supabase
      .from("category_translations")
      .select("category_id, locale, name, description")
      .eq("tenant_id", business.id),
    supabase
      .from("category_branches")
      .select("category_id, branch_id")
      .eq("tenant_id", business.id),
    supabase
      .from("items")
      .select(
        "id, public_id, category_id, sku, base_price, sale_price, currency, image_url, gallery, in_stock, out_of_stock_until, is_featured, is_new, is_popular, display_order, dietary_tags, allergens, spice_level, calories, preparation_time_minutes, service_duration_minutes, custom_attributes",
      )
      .eq("tenant_id", business.id)
      .order("display_order"),
    supabase
      .from("item_translations")
      .select("item_id, locale, name, description, ingredients")
      .eq("tenant_id", business.id),
    supabase
      .from("item_branch_settings")
      .select(
        "item_id, branch_id, is_available, in_stock, price_override, sale_price_override",
      )
      .eq("tenant_id", business.id),
    supabase
      .from("item_modifier_groups")
      .select("item_id, modifier_group_id, display_order")
      .eq("tenant_id", business.id),
    supabase
      .from("modifier_groups")
      .select(
        "id, public_id, code, selection_type, is_required, min_selections, max_selections, display_order",
      )
      .eq("tenant_id", business.id),
    supabase
      .from("modifier_group_translations")
      .select("modifier_group_id, locale, name, description")
      .eq("tenant_id", business.id),
    supabase
      .from("modifiers")
      .select(
        "id, public_id, modifier_group_id, price_adjustment, is_default, in_stock, display_order",
      )
      .eq("tenant_id", business.id),
    supabase
      .from("modifier_translations")
      .select("modifier_id, locale, name")
      .eq("tenant_id", business.id),
    supabase
      .from("offers")
      .select(
        "id, public_id, discount_type, discount_value, starts_at, ends_at, image_url, display_order",
      )
      .eq("tenant_id", business.id)
      .order("display_order"),
    supabase
      .from("offer_translations")
      .select("offer_id, locale, name, description")
      .eq("tenant_id", business.id),
    supabase
      .from("offer_targets")
      .select("offer_id, target_type, item_id, category_id, branch_id")
      .eq("tenant_id", business.id),
  ]);

  const localize = <T extends { locale: string }>(
    rows: T[],
    field: "name" | "description" | "ingredients",
  ) => pickLocale(toLocalizedMap(rows, field), locale, fallbackLocale);

  const groupBy = <T>(rows: T[] | null, key: (row: T) => string) => {
    const map = new Map<string, T[]>();
    for (const row of rows ?? []) {
      const id = key(row);
      const list = map.get(id) ?? [];
      list.push(row);
      map.set(id, list);
    }
    return map;
  };

  const categoryTranslationsById = groupBy(
    categoryTranslations,
    (r) => r.category_id,
  );
  const itemTranslationsById = groupBy(itemTranslations, (r) => r.item_id);
  const modifierGroupTranslationsById = groupBy(
    modifierGroupTranslations,
    (r) => r.modifier_group_id,
  );
  const modifierTranslationsById = groupBy(
    modifierTranslations,
    (r) => r.modifier_id,
  );
  const offerTranslationsById = groupBy(offerTranslations, (r) => r.offer_id);
  const modifiersByGroup = groupBy(modifiers, (r) => r.modifier_group_id);
  const modifierLinksByItem = groupBy(itemModifierLinks, (r) => r.item_id);

  // Branch-specific settings only matter when a branch was requested.
  const branchSettingByItem = new Map<
    string,
    typeof branchSettings extends (infer U)[] | null ? U : never
  >();
  for (const setting of branchSettings ?? []) {
    if (branchId && setting.branch_id === branchId)
      branchSettingByItem.set(setting.item_id, setting);
  }

  const categoryBranchIds = groupBy(categoryBranches, (r) => r.category_id);

  const liveOffers: OfferRecord[] = (offers ?? []).map((offer) => ({
    id: offer.id,
    public_id: offer.public_id,
    discount_type: offer.discount_type as OfferRecord["discount_type"],
    discount_value: Number(offer.discount_value),
    starts_at: offer.starts_at,
    ends_at: offer.ends_at,
    image_url: offer.image_url,
    name: localize(offerTranslationsById.get(offer.id) ?? [], "name"),
    description: localize(
      offerTranslationsById.get(offer.id) ?? [],
      "description",
    ),
    targets: (offerTargets ?? [])
      .filter((target) => target.offer_id === offer.id)
      .map((target) => ({
        targetType: target.target_type,
        itemId: target.item_id,
        categoryId: target.category_id,
        branchId: target.branch_id,
      })),
  }));

  const modifierGroupById = new Map(
    (modifierGroups ?? []).map((group) => [
      group.id,
      {
        id: group.public_id,
        code: group.code,
        name: localize(
          modifierGroupTranslationsById.get(group.id) ?? [],
          "name",
        ),
        description: localize(
          modifierGroupTranslationsById.get(group.id) ?? [],
          "description",
        ),
        selectionType: group.selection_type,
        required: group.is_required,
        minSelections: group.min_selections,
        maxSelections: group.max_selections,
        options: (modifiersByGroup.get(group.id) ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((modifier) => ({
            id: modifier.public_id,
            name: localize(
              modifierTranslationsById.get(modifier.id) ?? [],
              "name",
            ),
            priceAdjustment: Number(modifier.price_adjustment),
            isDefault: modifier.is_default,
            available: modifier.in_stock,
          })),
      },
    ]),
  );

  const decimals = business.currency.decimalDigits;
  const searchTerm = options.search?.trim().toLowerCase();

  const serializedItems = (items ?? []).map((item) => {
    const translations = itemTranslationsById.get(item.id) ?? [];
    const setting = branchId ? branchSettingByItem.get(item.id) : undefined;

    const basePrice = Number(setting?.price_override ?? item.base_price);
    const salePriceRaw = setting?.sale_price_override ?? item.sale_price;
    const salePrice =
      salePriceRaw === null || salePriceRaw === undefined
        ? null
        : Number(salePriceRaw);

    const applicable = liveOffers.filter((offer) =>
      offer.targets.some((target) => {
        if (target.branchId && branchId && target.branchId !== branchId)
          return false;
        if (target.targetType === "all_items") return true;
        if (target.targetType === "item") return target.itemId === item.id;
        if (target.targetType === "category")
          return target.categoryId === item.category_id;
        return false;
      }),
    );

    // Best offer wins — a customer should never be shown the worse of two
    // promotions that both apply.
    let effectivePrice = salePrice ?? basePrice;
    let appliedOffer: OfferRecord | null = null;
    for (const offer of applicable) {
      const candidate = applyDiscount(
        basePrice,
        offer.discount_type,
        offer.discount_value,
        decimals,
      );
      if (candidate < effectivePrice) {
        effectivePrice = candidate;
        appliedOffer = offer;
      }
    }

    const inStock = setting ? setting.in_stock && item.in_stock : item.in_stock;
    const availableAtBranch = setting ? setting.is_available : true;

    return {
      internalId: item.id,
      internalCategoryId: item.category_id,
      availableAtBranch,
      matchesSearch: searchTerm
        ? localize(translations, "name").toLowerCase().includes(searchTerm) ||
          localize(translations, "description")
            .toLowerCase()
            .includes(searchTerm)
        : true,
      payload: {
        id: item.public_id,
        sku: item.sku,
        name: localize(translations, "name"),
        description: localize(translations, "description"),
        ingredients: localize(translations, "ingredients"),
        price: {
          base: basePrice,
          sale: salePrice,
          effective: effectivePrice,
          currency: business.currency.code,
          decimalDigits: decimals,
        },
        offer: appliedOffer
          ? {
              id: appliedOffer.public_id,
              name: appliedOffer.name,
              type: appliedOffer.discount_type,
              value: appliedOffer.discount_value,
              endsAt: appliedOffer.ends_at,
            }
          : null,
        imageUrl: item.image_url,
        gallery: item.gallery,
        // Availability is data, not a reason to hide the row: the frontend
        // renders an out-of-stock item greyed out rather than losing it.
        availability: {
          inStock,
          availableUntil: item.out_of_stock_until,
        },
        badges: {
          featured: item.is_featured,
          new: item.is_new,
          popular: item.is_popular,
        },
        dietaryTags: item.dietary_tags ?? [],
        allergens: item.allergens ?? [],
        attributes: {
          spiceLevel: item.spice_level,
          calories: item.calories,
          preparationTimeMinutes: item.preparation_time_minutes,
          serviceDurationMinutes: item.service_duration_minutes,
          ...(item.custom_attributes as Record<string, unknown> | null),
        },
        modifierGroups: (modifierLinksByItem.get(item.id) ?? [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((link) => modifierGroupById.get(link.modifier_group_id))
          .filter((group): group is NonNullable<typeof group> => !!group),
      },
    };
  });

  const serializedCategories = (categories ?? [])
    .filter((category) => {
      if (!branchId) return true;
      const restricted = categoryBranchIds.get(category.id);
      // No explicit branch rows means "every branch".
      return (
        !restricted?.length ||
        restricted.some((row) => row.branch_id === branchId)
      );
    })
    .filter(
      (category) =>
        !options.categorySlug || category.slug === options.categorySlug,
    )
    .map((category) => {
      const translations = categoryTranslationsById.get(category.id) ?? [];
      const categoryItems = serializedItems.filter(
        (item) =>
          item.internalCategoryId === category.id &&
          item.availableAtBranch &&
          item.matchesSearch,
      );

      return {
        id: category.public_id,
        slug: category.slug,
        name: localize(translations, "name"),
        description: localize(translations, "description"),
        imageUrl: category.image_url,
        icon: category.icon,
        color: category.color,
        itemCount: categoryItems.length,
        items: categoryItems.map((item) => item.payload),
      };
    });

  const uncategorised = serializedItems.filter(
    (item) =>
      !item.internalCategoryId && item.availableAtBranch && item.matchesSearch,
  );

  if (uncategorised.length && !options.categorySlug) {
    serializedCategories.push({
      id: "uncategorised",
      slug: "uncategorised",
      name: "",
      description: "",
      imageUrl: null,
      icon: null,
      color: null,
      itemCount: uncategorised.length,
      items: uncategorised.map((item) => item.payload),
    });
  }

  return {
    categories: serializedCategories,
    offers: liveOffers
      .filter(
        (offer) =>
          !branchId ||
          offer.targets.every((t) => !t.branchId || t.branchId === branchId),
      )
      .map((offer) => ({
        id: offer.public_id,
        name: offer.name,
        description: offer.description,
        type: offer.discount_type,
        value: offer.discount_value,
        startsAt: offer.starts_at,
        endsAt: offer.ends_at,
        imageUrl: offer.image_url,
      })),
    itemCount: serializedCategories.reduce(
      (total, category) => total + category.itemCount,
      0,
    ),
  };
}
