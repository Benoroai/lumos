"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { NativeSelect } from "./input";

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Server-side pagination control. It only manipulates the URL — the page
 * itself reads `page` / `pageSize` from searchParams and queries a single
 * range, so a large table never ships more rows than are on screen.
 */
export function Pagination({
  page,
  pageSize,
  total,
  pageCount,
}: {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function go(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-sm">
      <p className="tabular text-[var(--foreground-muted)]">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[var(--foreground-muted)]">
          <span className="hidden sm:inline">Rows</span>
          <NativeSelect
            className="h-8 w-20"
            value={String(pageSize)}
            onChange={(e) => go({ pageSize: e.target.value, page: "1" })}
            aria-label="Rows per page"
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="iconSm"
            disabled={page <= 1}
            onClick={() => go({ page: String(page - 1) })}
            aria-label="Previous page"
          >
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="tabular px-2 text-[var(--foreground-muted)]">
            {page} / {Math.max(pageCount, 1)}
          </span>
          <Button
            variant="secondary"
            size="iconSm"
            disabled={page >= pageCount}
            onClick={() => go({ page: String(page + 1) })}
            aria-label="Next page"
          >
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
