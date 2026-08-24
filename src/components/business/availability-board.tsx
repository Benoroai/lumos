"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Zap } from "lucide-react";
import { Input, NativeSelect } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, StatusDot } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { setItemStockAction } from "@/lib/actions/business/items";
import { pickLocale } from "@/lib/i18n/localized";
import type { ItemRow } from "@/lib/queries/business/catalog";
import { cn } from "@/lib/utils";

const QUICK_DURATIONS = [
  { label: "Rest of today", hours: null },
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "Until tomorrow", hours: 24 },
];

/**
 * The "86 board" — built for a phone held one-handed during service.
 *
 * Every row is a single large tap target, changes apply optimistically, and
 * nothing here can delete anything: the worst outcome of a mis-tap is an item
 * showing as unavailable for a few seconds.
 */
export function AvailabilityBoard({
  items,
  branches,
  locale,
  defaultLocale,
  labels,
}: {
  items: ItemRow[];
  branches: { id: string; name: string }[];
  locale: string;
  defaultLocale: string;
  labels: { item: string; items: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [branchId, setBranchId] = useState("");
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [duration, setDuration] = useState<number | null>(null);

  const visible = items.filter((item) => {
    if (!search.trim()) return true;
    const name = pickLocale(item.name, locale, defaultLocale).toLowerCase();
    return (
      name.includes(search.toLowerCase()) ||
      (item.sku ?? "").toLowerCase().includes(search.toLowerCase())
    );
  });

  function toggle(item: ItemRow, inStock: boolean) {
    setOptimistic((prev) => ({ ...prev, [item.id]: inStock }));

    const until =
      inStock || duration === null
        ? null
        : new Date(Date.now() + duration * 3_600_000).toISOString();

    startTransition(async () => {
      const result = await setItemStockAction({
        itemId: item.id,
        inStock,
        until,
        reason: null,
        branchId: branchId || null,
      });

      if (result.ok) {
        toast.success(
          inStock
            ? "Back in stock"
            : until
              ? `Marked out of stock until ${new Date(until).toLocaleTimeString()}`
              : "Marked out of stock",
        );
        router.refresh();
      } else {
        setOptimistic((prev) => ({ ...prev, [item.id]: !inStock }));
        toast.error(result.error);
      }
    });
  }

  const outCount = visible.filter(
    (item) => (optimistic[item.id] ?? item.inStock) === false,
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Find a ${labels.item.toLowerCase()}…`}
            className="h-11 ps-9 text-base"
            aria-label={`Search ${labels.items}`}
          />
        </div>

        {branches.length > 1 ? (
          <NativeSelect
            className="h-11 w-auto min-w-40"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            aria-label="Branch"
          >
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--foreground-muted)]">
          When marking out of stock:
        </span>
        {QUICK_DURATIONS.map((option) => (
          <Button
            key={option.label}
            size="sm"
            variant={duration === option.hours ? "primary" : "secondary"}
            onClick={() => setDuration(option.hours)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {outCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg bg-[var(--danger-soft)] px-4 py-2.5 text-sm text-[var(--danger)]">
          <Zap className="size-4" />
          {outCount} {labels.item.toLowerCase()}
          {outCount === 1 ? " is" : "s are"} currently unavailable. They stay on
          the menu, marked as out of stock.
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={Zap}
          title={`No ${labels.items.toLowerCase()} match that search`}
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {visible.map((item) => {
            const inStock = optimistic[item.id] ?? item.inStock;
            const name =
              pickLocale(item.name, locale, defaultLocale) || "Untitled";

            return (
              <li key={item.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors",
                    inStock
                      ? "border-[var(--border)] bg-[var(--surface)]"
                      : "border-[var(--danger)] bg-[var(--danger-soft)]",
                  )}
                >
                  <StatusDot tone={inStock ? "success" : "danger"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{name}</span>
                    <span className="block truncate text-xs text-[var(--foreground-muted)]">
                      {pickLocale(item.categoryName, locale, defaultLocale) ||
                        "Uncategorised"}
                      {item.outOfStockUntil && !inStock
                        ? ` · back at ${new Date(item.outOfStockUntil).toLocaleTimeString()}`
                        : ""}
                    </span>
                  </span>
                  {!item.isActive ? <Badge tone="neutral">Hidden</Badge> : null}
                  <Switch
                    checked={inStock}
                    disabled={pending}
                    tone="accent"
                    onCheckedChange={(value) => toggle(item, value)}
                    aria-label={`${inStock ? "Mark out of stock" : "Mark in stock"}: ${name}`}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
