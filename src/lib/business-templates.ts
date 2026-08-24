import type { BusinessType } from "@/lib/types/app";

/**
 * Business types are a *configuration* layer, never a schema fork. A salon and
 * a restaurant share the same `items` table; only the words, the icons and the
 * set of surfaced optional fields differ.
 */

export type Terminology = {
  catalog: string;
  category: string;
  categories: string;
  item: string;
  items: string;
  price: string;
};

export type TemplateConfig = {
  code: string;
  businessType: BusinessType;
  name: string;
  icon: string;
  terminology: Record<string, Partial<Terminology>>;
  enabledItemFields: string[];
};

export const OPTIONAL_ITEM_FIELDS = [
  "description",
  "image",
  "gallery",
  "ingredients",
  "allergens",
  "dietary_tags",
  "calories",
  "preparation_time",
  "service_duration",
  "spice_level",
  "sku",
  "custom_attributes",
] as const;

export type OptionalItemField = (typeof OPTIONAL_ITEM_FIELDS)[number];

export const OPTIONAL_FIELD_LABELS: Record<OptionalItemField, string> = {
  description: "Description",
  image: "Main image",
  gallery: "Image gallery",
  ingredients: "Ingredients",
  allergens: "Allergen information",
  dietary_tags: "Dietary tags",
  calories: "Calories",
  preparation_time: "Preparation time",
  service_duration: "Service duration",
  spice_level: "Spice level",
  sku: "SKU / internal code",
  custom_attributes: "Custom attributes",
};

const FALLBACK_TERMINOLOGY: Terminology = {
  catalog: "Catalog",
  category: "Category",
  categories: "Categories",
  item: "Item",
  items: "Items",
  price: "Price",
};

/**
 * Resolves the words a given business uses, layering:
 *   template defaults → tenant overrides, each with locale fallback to English.
 */
export function resolveTerminology(
  templateTerminology: unknown,
  overrides: unknown,
  locale: string,
): Terminology {
  const fromTemplate = pickLocaleObject(templateTerminology, locale);
  const fromOverrides = pickLocaleObject(overrides, locale);
  return { ...FALLBACK_TERMINOLOGY, ...fromTemplate, ...fromOverrides };
}

function pickLocaleObject(
  source: unknown,
  locale: string,
): Partial<Terminology> {
  if (!source || typeof source !== "object") return {};
  const record = source as Record<string, unknown>;
  const candidate =
    record[locale] ?? record[locale.split("-")[0] ?? locale] ?? record.en;
  if (!candidate || typeof candidate !== "object") return {};
  const result: Partial<Terminology> = {};
  for (const [key, value] of Object.entries(
    candidate as Record<string, unknown>,
  )) {
    if (
      typeof value === "string" &&
      value.length > 0 &&
      key in FALLBACK_TERMINOLOGY
    ) {
      result[key as keyof Terminology] = value;
    }
  }
  return result;
}

export function isFieldEnabled(
  enabledFields: unknown,
  field: OptionalItemField,
): boolean {
  if (!Array.isArray(enabledFields)) return false;
  return enabledFields.includes(field);
}

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  salon: "Salon",
  barbershop: "Barbershop",
  custom: "Custom",
};

export const BUSINESS_TYPE_ICONS: Record<BusinessType, string> = {
  restaurant: "utensils-crossed",
  cafe: "coffee",
  salon: "sparkles",
  barbershop: "scissors",
  custom: "store",
};

export type DefaultCategorySeed = {
  slug: string;
  en: string;
  ar?: string;
  fa?: string;
};

export function parseDefaultCategories(value: unknown): DefaultCategorySeed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.slug !== "string" || typeof row.en !== "string") return [];
    return [
      {
        slug: row.slug,
        en: row.en,
        ...(typeof row.ar === "string" ? { ar: row.ar } : {}),
        ...(typeof row.fa === "string" ? { fa: row.fa } : {}),
      },
    ];
  });
}

export type DefaultModifierGroupSeed = {
  code: string;
  en: string;
  selection_type: "single" | "multiple";
  is_required: boolean;
};

export function parseDefaultModifierGroups(
  value: unknown,
): DefaultModifierGroupSeed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Record<string, unknown>;
    if (typeof row.code !== "string" || typeof row.en !== "string") return [];
    return [
      {
        code: row.code,
        en: row.en,
        selection_type:
          row.selection_type === "multiple" ? "multiple" : "single",
        is_required: row.is_required === true,
      },
    ];
  });
}
