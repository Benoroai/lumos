import "server-only";

import { createServerSupabase } from "@/lib/supabase/server";
import { toLocalizedMap, pickLocale } from "@/lib/i18n/localized";

export type DateRange = { from: Date; to: Date };

export type AnalyticsSummary = {
  range: { from: string; to: string };
  totals: {
    menuViews: number;
    itemViews: number;
    categoryViews: number;
    offerViews: number;
    searches: number;
    uniqueSessions: number;
  };
  previousTotals: {
    menuViews: number;
    itemViews: number;
    categoryViews: number;
    offerViews: number;
    searches: number;
    uniqueSessions: number;
  };
  timeSeries: { date: string; menuViews: number; itemViews: number }[];
  topItems: { id: string; name: string; views: number }[];
  topCategories: { id: string; name: string; views: number }[];
  popularSearches: { term: string; count: number; zeroResults: number }[];
  zeroResultSearches: { term: string; count: number }[];
  languageMix: { locale: string; count: number; share: number }[];
  branchPerformance: { id: string; name: string; views: number }[];
};

const EMPTY_TOTALS = {
  menuViews: 0,
  itemViews: 0,
  categoryViews: 0,
  offerViews: 0,
  searches: 0,
  uniqueSessions: 0,
};

/**
 * Builds the business analytics dashboard for a date range, plus the equal-length
 * preceding range so every figure can be shown as a comparison rather than a
 * bare number.
 *
 * All reads go through the RLS-enforced client: a tenant physically cannot
 * select another tenant's events, so there is no `tenant_id` filter to forget.
 */
export async function getAnalyticsSummary(
  tenantId: string,
  range: DateRange,
  locale: string,
  fallbackLocale: string,
): Promise<AnalyticsSummary> {
  const supabase = await createServerSupabase();

  const spanMs = range.to.getTime() - range.from.getTime();
  const previousFrom = new Date(range.from.getTime() - spanMs);

  const [{ data: events }, { data: previousEvents }] = await Promise.all([
    supabase
      .from("analytics_events")
      .select(
        "event_type, item_id, category_id, offer_id, branch_id, locale, search_query, search_results_count, session_hash, occurred_at",
      )
      .eq("tenant_id", tenantId)
      .gte("occurred_at", range.from.toISOString())
      .lte("occurred_at", range.to.toISOString())
      .limit(50_000),
    supabase
      .from("analytics_events")
      .select("event_type, session_hash")
      .eq("tenant_id", tenantId)
      .gte("occurred_at", previousFrom.toISOString())
      .lt("occurred_at", range.from.toISOString())
      .limit(50_000),
  ]);

  const rows = events ?? [];

  const totals = { ...EMPTY_TOTALS };
  const sessions = new Set<string>();
  const perDay = new Map<string, { menuViews: number; itemViews: number }>();
  const itemViews = new Map<string, number>();
  const categoryViews = new Map<string, number>();
  const branchViews = new Map<string, number>();
  const localeCounts = new Map<string, number>();
  const searchCounts = new Map<
    string,
    { count: number; zeroResults: number }
  >();

  for (const row of rows) {
    if (row.session_hash) sessions.add(row.session_hash);
    const day = row.occurred_at.slice(0, 10);
    const bucket = perDay.get(day) ?? { menuViews: 0, itemViews: 0 };

    switch (row.event_type) {
      case "menu_view":
        totals.menuViews += 1;
        bucket.menuViews += 1;
        break;
      case "item_view":
        totals.itemViews += 1;
        bucket.itemViews += 1;
        if (row.item_id)
          itemViews.set(row.item_id, (itemViews.get(row.item_id) ?? 0) + 1);
        break;
      case "category_view":
        totals.categoryViews += 1;
        if (row.category_id)
          categoryViews.set(
            row.category_id,
            (categoryViews.get(row.category_id) ?? 0) + 1,
          );
        break;
      case "offer_view":
        totals.offerViews += 1;
        break;
      case "search": {
        totals.searches += 1;
        const term = (row.search_query ?? "").trim().toLowerCase();
        if (term) {
          const entry = searchCounts.get(term) ?? { count: 0, zeroResults: 0 };
          entry.count += 1;
          if ((row.search_results_count ?? 0) === 0) entry.zeroResults += 1;
          searchCounts.set(term, entry);
        }
        break;
      }
      case "branch_view":
        if (row.branch_id)
          branchViews.set(
            row.branch_id,
            (branchViews.get(row.branch_id) ?? 0) + 1,
          );
        break;
      case "language_change":
        break;
    }

    if (row.locale)
      localeCounts.set(row.locale, (localeCounts.get(row.locale) ?? 0) + 1);
    perDay.set(day, bucket);
  }

  totals.uniqueSessions = sessions.size;

  const previousTotals = { ...EMPTY_TOTALS };
  const previousSessions = new Set<string>();
  for (const row of previousEvents ?? []) {
    if (row.session_hash) previousSessions.add(row.session_hash);
    if (row.event_type === "menu_view") previousTotals.menuViews += 1;
    if (row.event_type === "item_view") previousTotals.itemViews += 1;
    if (row.event_type === "category_view") previousTotals.categoryViews += 1;
    if (row.event_type === "offer_view") previousTotals.offerViews += 1;
    if (row.event_type === "search") previousTotals.searches += 1;
  }
  previousTotals.uniqueSessions = previousSessions.size;

  const topItemIds = [...itemViews.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topCategoryIds = [...categoryViews.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const topBranchIds = [...branchViews.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const [itemNames, categoryNames, branchNames] = await Promise.all([
    resolveItemNames(
      tenantId,
      topItemIds.map(([id]) => id),
      locale,
      fallbackLocale,
    ),
    resolveCategoryNames(
      tenantId,
      topCategoryIds.map(([id]) => id),
      locale,
      fallbackLocale,
    ),
    resolveBranchNames(
      tenantId,
      topBranchIds.map(([id]) => id),
    ),
  ]);

  const totalLocaleEvents =
    [...localeCounts.values()].reduce((sum, n) => sum + n, 0) || 1;

  const searchEntries = [...searchCounts.entries()].sort(
    (a, b) => b[1].count - a[1].count,
  );

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals,
    previousTotals,
    timeSeries: fillDays(range, perDay),
    topItems: topItemIds.map(([id, views]) => ({
      id,
      name: itemNames.get(id) ?? "Unknown item",
      views,
    })),
    topCategories: topCategoryIds.map(([id, views]) => ({
      id,
      name: categoryNames.get(id) ?? "Unknown category",
      views,
    })),
    popularSearches: searchEntries.slice(0, 10).map(([term, entry]) => ({
      term,
      count: entry.count,
      zeroResults: entry.zeroResults,
    })),
    zeroResultSearches: searchEntries
      .filter(([, entry]) => entry.zeroResults > 0)
      .slice(0, 10)
      .map(([term, entry]) => ({ term, count: entry.zeroResults })),
    languageMix: [...localeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({
        locale: code,
        count,
        share: count / totalLocaleEvents,
      })),
    branchPerformance: topBranchIds.map(([id, views]) => ({
      id,
      name: branchNames.get(id) ?? "Unknown branch",
      views,
    })),
  };
}

/** Days with no traffic must still appear, or the chart lies about the trend. */
function fillDays(
  range: DateRange,
  perDay: Map<string, { menuViews: number; itemViews: number }>,
): { date: string; menuViews: number; itemViews: number }[] {
  const out: { date: string; menuViews: number; itemViews: number }[] = [];
  const cursor = new Date(range.from);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= range.to && out.length < 400) {
    const key = cursor.toISOString().slice(0, 10);
    const bucket = perDay.get(key) ?? { menuViews: 0, itemViews: 0 };
    out.push({ date: key, ...bucket });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return out;
}

async function resolveItemNames(
  tenantId: string,
  ids: string[],
  locale: string,
  fallback: string,
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("item_translations")
    .select("item_id, locale, name")
    .eq("tenant_id", tenantId)
    .in("item_id", ids);

  return groupNames(data ?? [], "item_id", locale, fallback);
}

async function resolveCategoryNames(
  tenantId: string,
  ids: string[],
  locale: string,
  fallback: string,
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("category_translations")
    .select("category_id, locale, name")
    .eq("tenant_id", tenantId)
    .in("category_id", ids);

  return groupNames(data ?? [], "category_id", locale, fallback);
}

async function resolveBranchNames(
  tenantId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in("id", ids);

  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

function groupNames(
  rows: Record<string, unknown>[],
  key: string,
  locale: string,
  fallback: string,
): Map<string, string> {
  const grouped = new Map<string, { locale: string; name: string }[]>();
  for (const row of rows) {
    const id = row[key] as string;
    const list = grouped.get(id) ?? [];
    list.push({ locale: row.locale as string, name: row.name as string });
    grouped.set(id, list);
  }

  const out = new Map<string, string>();
  for (const [id, list] of grouped) {
    out.set(id, pickLocale(toLocalizedMap(list, "name"), locale, fallback));
  }
  return out;
}

export function parseDateRange(searchParams: {
  from?: string | undefined;
  to?: string | undefined;
  preset?: string | undefined;
}): DateRange {
  const to = searchParams.to ? new Date(searchParams.to) : new Date();
  let from: Date;

  if (searchParams.from) {
    from = new Date(searchParams.from);
  } else {
    const days =
      { "7d": 7, "30d": 30, "90d": 90, "12m": 365 }[
        searchParams.preset ?? "30d"
      ] ?? 30;
    from = new Date(to.getTime() - days * 86_400_000);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const fallbackTo = new Date();
    return {
      from: new Date(fallbackTo.getTime() - 30 * 86_400_000),
      to: fallbackTo,
    };
  }

  return { from, to };
}
