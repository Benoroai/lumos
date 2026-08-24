"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Search, Tag } from "lucide-react";
import {
  Table,
  TableWrap,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useDebouncedSearchParam } from "@/lib/hooks/use-debounced-search-param";
import {
  bulkItemAction,
  setItemStockAction,
} from "@/lib/actions/business/items";
import { pickLocale } from "@/lib/i18n/localized";
import { formatPrice, type CurrencyInfo } from "@/lib/format/money";
import type { ItemRow } from "@/lib/queries/business/catalog";
import type { Paginated } from "@/lib/types/app";

export function ItemTable({
  data,
  categories,
  currency,
  locale,
  defaultLocale,
  currencyFormat,
  canManage,
  canToggleStock,
  labels,
}: {
  data: Paginated<ItemRow>;
  categories: { id: string; name: string }[];
  currency: CurrencyInfo;
  locale: string;
  defaultLocale: string;
  currencyFormat:
    "symbol_before" | "symbol_after" | "code_after" | "amount_only";
  canManage: boolean;
  canToggleStock: boolean;
  labels: { item: string; items: string; category: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useDebouncedSearchParam("search");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(data.rows.map((r) => r.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  function runBulk(action: string, targetCategoryId?: string | null) {
    startTransition(async () => {
      const result = await bulkItemAction({
        itemIds: [...selected],
        action,
        ...(targetCategoryId !== undefined ? { targetCategoryId } : {}),
      });

      if (result.ok) {
        toast.success(result.message ?? "Updated");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleStock(item: ItemRow, inStock: boolean) {
    startTransition(async () => {
      const result = await setItemStockAction({
        itemId: item.id,
        inStock,
        until: null,
        reason: null,
      });
      if (result.ok) {
        toast.success(result.message ?? "Updated");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const allSelected =
    data.rows.length > 0 && selected.size === data.rows.length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${labels.items.toLowerCase()} or SKU…`}
            className="ps-9"
            aria-label={`Search ${labels.items}`}
          />
        </div>

        <NativeSelect
          className="w-auto min-w-40"
          value={searchParams.get("categoryId") ?? ""}
          onChange={(e) => setParam("categoryId", e.target.value)}
          aria-label={`Filter by ${labels.category.toLowerCase()}`}
        >
          <option value="">All {labels.category.toLowerCase()}s</option>
          <option value="uncategorized">Uncategorised</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-32"
          value={searchParams.get("status") ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">Any status</option>
          <option value="active">Live</option>
          <option value="inactive">Hidden</option>
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-32"
          value={searchParams.get("stock") ?? ""}
          onChange={(e) => setParam("stock", e.target.value)}
          aria-label="Filter by stock"
        >
          <option value="">Any stock</option>
          <option value="in">In stock</option>
          <option value="out">Out of stock</option>
        </NativeSelect>

        <NativeSelect
          className="w-auto min-w-36"
          value={searchParams.get("sort") ?? "display_order"}
          onChange={(e) => setParam("sort", e.target.value)}
          aria-label="Sort"
        >
          <option value="display_order">Menu order</option>
          <option value="updated_at">Recently updated</option>
          <option value="base_price">Price</option>
          <option value="sku">SKU</option>
        </NativeSelect>
      </div>

      {selected.size > 0 && canManage ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--primary)] bg-[var(--primary-soft)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--primary)]">
            {selected.size} selected
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => runBulk("activate")}
            >
              Show
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => runBulk("deactivate")}
            >
              Hide
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => runBulk("mark_in_stock")}
            >
              In stock
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => runBulk("mark_out_of_stock")}
            >
              Out of stock
            </Button>
            <NativeSelect
              className="h-8 w-auto min-w-40"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                runBulk(
                  "move_category",
                  e.target.value === "none" ? null : e.target.value,
                );
              }}
              aria-label="Move to category"
            >
              <option value="">Move to…</option>
              <option value="none">Uncategorised</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
            <ConfirmDialog
              trigger={
                <Button size="sm" variant="outlineDanger" disabled={pending}>
                  Delete
                </Button>
              }
              title={`Delete ${selected.size} ${labels.item.toLowerCase()}(s)?`}
              description="They are removed from your menu but kept in the database, so the platform administrator can restore them if this was a mistake."
              confirmLabel="Delete"
              onConfirm={() => runBulk("delete")}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {data.rows.length === 0 ? (
        <EmptyState
          icon={Tag}
          title={`No ${labels.items.toLowerCase()} found`}
          description="Try clearing the filters, or add something new."
          action={
            canManage ? (
              <Button asChild>
                <Link href="/dashboard/catalog/items/new">
                  New {labels.item.toLowerCase()}
                </Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  {canManage ? (
                    <TH className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={(v) => toggleAll(v === true)}
                        aria-label="Select all"
                      />
                    </TH>
                  ) : null}
                  <TH>{labels.item}</TH>
                  <TH>{labels.category}</TH>
                  <TH className="text-end">Price</TH>
                  <TH>Badges</TH>
                  <TH className="text-center">In stock</TH>
                  <TH>Status</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {data.rows.map((item) => {
                  const name =
                    pickLocale(item.name, locale, defaultLocale) || "Untitled";
                  const categoryName = pickLocale(
                    item.categoryName,
                    locale,
                    defaultLocale,
                  );

                  return (
                    <TR key={item.id} data-selected={selected.has(item.id)}>
                      {canManage ? (
                        <TD>
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={(v) =>
                              toggleOne(item.id, v === true)
                            }
                            aria-label={`Select ${name}`}
                          />
                        </TD>
                      ) : null}

                      <TD>
                        <div className="flex items-center gap-3">
                          {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="size-9 shrink-0 rounded-lg object-cover"
                            />
                          ) : (
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--foreground-subtle)]">
                              <Tag className="size-4" />
                            </span>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/dashboard/catalog/items/${item.id}`}
                              className="block truncate font-medium hover:text-[var(--primary)] hover:underline"
                            >
                              {name}
                            </Link>
                            {item.sku ? (
                              <p className="truncate font-mono text-xs text-[var(--foreground-subtle)]">
                                {item.sku}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TD>

                      <TD className="text-[var(--foreground-muted)]">
                        {categoryName || (
                          <span className="text-[var(--foreground-subtle)]">
                            Uncategorised
                          </span>
                        )}
                      </TD>

                      <TD className="tabular text-end whitespace-nowrap">
                        {item.salePrice !== null ? (
                          <span>
                            <span className="text-[var(--foreground-subtle)] line-through">
                              {formatPrice(
                                item.basePrice,
                                currency,
                                currencyFormat,
                                locale,
                              )}
                            </span>
                            <span className="ms-2 font-semibold text-[var(--danger)]">
                              {formatPrice(
                                item.salePrice,
                                currency,
                                currencyFormat,
                                locale,
                              )}
                            </span>
                          </span>
                        ) : (
                          formatPrice(
                            item.basePrice,
                            currency,
                            currencyFormat,
                            locale,
                          )
                        )}
                      </TD>

                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {item.isFeatured ? (
                            <Badge tone="accent">Featured</Badge>
                          ) : null}
                          {item.isNew ? <Badge tone="info">New</Badge> : null}
                          {item.isPopular ? (
                            <Badge tone="secondary">Popular</Badge>
                          ) : null}
                          {item.dietaryTags.slice(0, 2).map((tag) => (
                            <Badge key={tag} tone="neutral">
                              {tag.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </TD>

                      <TD className="text-center">
                        {canToggleStock ? (
                          <Switch
                            checked={item.inStock}
                            disabled={pending}
                            tone="accent"
                            onCheckedChange={(value) =>
                              toggleStock(item, value)
                            }
                            aria-label={`${item.inStock ? "Mark out of stock" : "Mark in stock"}: ${name}`}
                          />
                        ) : (
                          <StatusDot
                            tone={item.inStock ? "success" : "danger"}
                          />
                        )}
                      </TD>

                      <TD>
                        <Badge tone={item.isActive ? "success" : "neutral"}>
                          {item.isActive ? "Live" : "Hidden"}
                        </Badge>
                      </TD>

                      <TD className="text-end">
                        <Button variant="ghost" size="iconSm" asChild>
                          <Link
                            href={`/dashboard/catalog/items/${item.id}`}
                            aria-label={`Edit ${name}`}
                          >
                            <Pencil />
                          </Link>
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>

          <Pagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            pageCount={data.pageCount}
          />
        </>
      )}
    </div>
  );
}
