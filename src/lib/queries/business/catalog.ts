import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { toLocalizedMap } from "@/lib/i18n/localized";
import type { LocalizedText, Paginated } from "@/lib/types/app";

export type CategoryNode = {
  id: string;
  publicId: string;
  slug: string;
  parentId: string | null;
  name: LocalizedText;
  description: LocalizedText;
  imageUrl: string | null;
  icon: string | null;
  color: string | null;
  isActive: boolean;
  displayOrder: number;
  visibleFrom: string | null;
  visibleUntil: string | null;
  visibilitySchedule: unknown;
  branchIds: string[];
  itemCount: number;
  children: CategoryNode[];
};

/**
 * Loads the category tree with item counts in a bounded number of round-trips
 * (three, regardless of depth) rather than recursing per node.
 */
export async function getCategoryTree(
  tenantId: string,
): Promise<CategoryNode[]> {
  const supabase = await createServerSupabase();

  const [
    { data: categories },
    { data: translations },
    { data: branchLinks },
    { data: items },
  ] = await Promise.all([
    supabase
      .from("categories")
      .select(
        "id, public_id, slug, parent_id, image_url, icon, color, is_active, display_order, visible_from, visible_until, visibility_schedule",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("display_order")
      .order("created_at"),
    supabase
      .from("category_translations")
      .select("category_id, locale, name, description")
      .eq("tenant_id", tenantId),
    supabase
      .from("category_branches")
      .select("category_id, branch_id")
      .eq("tenant_id", tenantId),
    supabase
      .from("items")
      .select("id, category_id")
      .eq("tenant_id", tenantId)
      .is("deleted_at", null),
  ]);

  const translationsByCategory = new Map<
    string,
    { locale: string; name: string; description: string }[]
  >();
  for (const row of translations ?? []) {
    const list = translationsByCategory.get(row.category_id) ?? [];
    list.push({
      locale: row.locale,
      name: row.name,
      description: row.description,
    });
    translationsByCategory.set(row.category_id, list);
  }

  const branchesByCategory = new Map<string, string[]>();
  for (const row of branchLinks ?? []) {
    const list = branchesByCategory.get(row.category_id) ?? [];
    list.push(row.branch_id);
    branchesByCategory.set(row.category_id, list);
  }

  const itemCounts = new Map<string, number>();
  for (const item of items ?? []) {
    if (!item.category_id) continue;
    itemCounts.set(
      item.category_id,
      (itemCounts.get(item.category_id) ?? 0) + 1,
    );
  }

  const nodes = new Map<string, CategoryNode>();
  for (const row of categories ?? []) {
    const rows = translationsByCategory.get(row.id) ?? [];
    nodes.set(row.id, {
      id: row.id,
      publicId: row.public_id,
      slug: row.slug,
      parentId: row.parent_id,
      name: toLocalizedMap(rows, "name"),
      description: toLocalizedMap(rows, "description"),
      imageUrl: row.image_url,
      icon: row.icon,
      color: row.color,
      isActive: row.is_active,
      displayOrder: row.display_order,
      visibleFrom: row.visible_from,
      visibleUntil: row.visible_until,
      visibilitySchedule: row.visibility_schedule,
      branchIds: branchesByCategory.get(row.id) ?? [],
      itemCount: itemCounts.get(row.id) ?? 0,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

export type ItemRow = {
  id: string;
  publicId: string;
  slug: string | null;
  categoryId: string | null;
  categoryName: LocalizedText;
  sku: string | null;
  name: LocalizedText;
  description: LocalizedText;
  basePrice: number;
  salePrice: number | null;
  currency: string | null;
  imageUrl: string | null;
  isActive: boolean;
  inStock: boolean;
  outOfStockUntil: string | null;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
  displayOrder: number;
  dietaryTags: string[];
  allergens: string[];
  calories: number | null;
  preparationTimeMinutes: number | null;
  serviceDurationMinutes: number | null;
  spiceLevel: number | null;
  updatedAt: string;
};

export type ItemFilters = {
  page: number;
  pageSize: number;
  search?: string | undefined;
  categoryId?: string | undefined;
  status?: "active" | "inactive" | undefined;
  stock?: "in" | "out" | undefined;
  sort?: string | undefined;
  direction?: "asc" | "desc";
};

const ITEM_SORTS = new Set([
  "display_order",
  "base_price",
  "created_at",
  "updated_at",
  "sku",
]);

export async function listItems(
  tenantId: string,
  filters: ItemFilters,
  locale: string,
): Promise<Paginated<ItemRow>> {
  const supabase = await createServerSupabase();
  const from = (filters.page - 1) * filters.pageSize;

  let query = supabase
    .from("items")
    .select(
      `id, public_id, category_id, sku, base_price, sale_price, currency, image_url, is_active,
       in_stock, out_of_stock_until, is_featured, is_new, is_popular, display_order,
       dietary_tags, allergens, calories, preparation_time_minutes, service_duration_minutes,
       spice_level, updated_at,
       item_translations!left ( locale, name, description ),
       categories:category_id ( id, category_translations!left ( locale, name ) )`,
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .is("deleted_at", null);

  if (filters.categoryId === "uncategorized")
    query = query.is("category_id", null);
  else if (filters.categoryId)
    query = query.eq("category_id", filters.categoryId);

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "inactive") query = query.eq("is_active", false);
  if (filters.stock === "in") query = query.eq("in_stock", true);
  if (filters.stock === "out") query = query.eq("in_stock", false);

  // Search matches the SKU directly, or any translation of the name via a
  // sub-select so a business can find an item by its Arabic name too.
  if (filters.search) {
    const term = filters.search.replace(/[%_,()]/g, "").trim();
    if (term) {
      const { data: matches } = await supabase
        .from("item_translations")
        .select("item_id")
        .eq("tenant_id", tenantId)
        .ilike("name", `%${term}%`)
        .limit(500);

      const ids = (matches ?? []).map((m) => m.item_id);
      query = ids.length
        ? query.or(`sku.ilike.%${term}%,id.in.(${ids.join(",")})`)
        : query.ilike("sku", `%${term}%`);
    }
  }

  const sortColumn =
    filters.sort && ITEM_SORTS.has(filters.sort)
      ? filters.sort
      : "display_order";
  query = query
    .order(sortColumn, { ascending: filters.direction !== "desc" })
    .range(from, from + filters.pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Could not load items: ${error.message}`);

  const rows: ItemRow[] = (data ?? []).map((row) => {
    const translations = (row.item_translations ?? []) as unknown as {
      locale: string;
      name: string;
      description: string;
    }[];
    const category = row.categories as unknown as {
      id: string;
      category_translations: { locale: string; name: string }[];
    } | null;

    return {
      id: row.id,
      publicId: row.public_id,
      slug: null,
      categoryId: row.category_id,
      categoryName: toLocalizedMap(
        category?.category_translations ?? [],
        "name",
      ),
      sku: row.sku,
      name: toLocalizedMap(translations, "name"),
      description: toLocalizedMap(translations, "description"),
      basePrice: Number(row.base_price),
      salePrice: row.sale_price === null ? null : Number(row.sale_price),
      currency: row.currency,
      imageUrl: row.image_url,
      isActive: row.is_active,
      inStock: row.in_stock,
      outOfStockUntil: row.out_of_stock_until,
      isFeatured: row.is_featured,
      isNew: row.is_new,
      isPopular: row.is_popular,
      displayOrder: row.display_order,
      dietaryTags: row.dietary_tags ?? [],
      allergens: row.allergens ?? [],
      calories: row.calories,
      preparationTimeMinutes: row.preparation_time_minutes,
      serviceDurationMinutes: row.service_duration_minutes,
      spiceLevel: row.spice_level,
      updatedAt: row.updated_at,
    };
  });

  void locale;
  const total = count ?? 0;

  return {
    rows,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    pageCount: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

export async function getItemForEdit(tenantId: string, itemId: string) {
  const supabase = await createServerSupabase();

  const [
    { data: item },
    { data: translations },
    { data: modifierLinks },
    { data: branchSettings },
  ] = await Promise.all([
    supabase
      .from("items")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", itemId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("item_translations")
      .select("locale, name, description, ingredients, status")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId),
    supabase
      .from("item_modifier_groups")
      .select("modifier_group_id, display_order")
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId)
      .order("display_order"),
    supabase
      .from("item_branch_settings")
      .select(
        "branch_id, is_available, in_stock, price_override, sale_price_override",
      )
      .eq("tenant_id", tenantId)
      .eq("item_id", itemId),
  ]);

  if (!item) return null;

  return {
    item,
    translations: translations ?? [],
    modifierGroupIds: (modifierLinks ?? []).map((m) => m.modifier_group_id),
    branchSettings: branchSettings ?? [],
  };
}

export async function getCatalogContext(tenantId: string) {
  const supabase = await createServerSupabase();

  const [
    { data: branches },
    { data: settings },
    { data: template },
    { data: currencies },
    { data: languages },
  ] = await Promise.all([
    supabase
      .from("branches")
      .select(
        "id, name, slug, is_active, allow_branch_prices, public_menu_code",
      )
      .eq("tenant_id", tenantId)
      .is("deleted_at", null)
      .order("display_order"),
    supabase
      .from("business_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("tenants")
      .select(
        "template_id, business_templates:template_id ( code, name, terminology, enabled_item_fields, business_type )",
      )
      .eq("id", tenantId)
      .maybeSingle(),
    supabase
      .from("currencies")
      .select("code, name, symbol, decimal_digits")
      .eq("is_enabled", true),
    supabase
      .from("languages")
      .select("code, english_name, native_name, direction")
      .eq("is_enabled", true),
  ]);

  return {
    branches: branches ?? [],
    settings,
    template: (template?.business_templates ?? null) as unknown as {
      code: string;
      name: string;
      terminology: unknown;
      enabled_item_fields: unknown;
      business_type: string;
    } | null,
    currencies: currencies ?? [],
    languages: languages ?? [],
  };
}
