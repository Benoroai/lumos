import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  change,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  /** Fractional change vs. the comparison period; null when it cannot be computed. */
  change?: number | null;
  tone?: "default" | "accent" | "secondary" | "danger";
}) {
  const toneClass = {
    default: "bg-[var(--surface)]",
    accent: "bg-[var(--accent-soft)]",
    secondary: "bg-[var(--secondary-soft)]",
    danger: "bg-[var(--danger-soft)]",
  }[tone];

  const direction =
    change == null
      ? null
      : change > 0.0001
        ? "up"
        : change < -0.0001
          ? "down"
          : "flat";
  const ChangeIcon =
    direction === "up"
      ? ArrowUpRight
      : direction === "down"
        ? ArrowDownRight
        : Minus;

  return (
    <div className={cn("surface-card p-5", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-[var(--foreground-muted)]">
          {label}
        </p>
        {Icon ? (
          <Icon
            className="size-4 text-[var(--foreground-subtle)]"
            aria-hidden
          />
        ) : null}
      </div>
      <p className="tabular mt-2 text-3xl font-semibold tracking-tight">
        {value}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {direction ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-medium",
              direction === "up" && "text-[var(--success)]",
              direction === "down" && "text-[var(--danger)]",
              direction === "flat" && "text-[var(--foreground-muted)]",
            )}
          >
            <ChangeIcon className="size-3.5 rtl:-scale-x-100" aria-hidden />
            {new Intl.NumberFormat("en", {
              style: "percent",
              maximumFractionDigits: 1,
            }).format(Math.abs(change ?? 0))}
          </span>
        ) : null}
        {hint ? (
          <span className="text-[var(--foreground-subtle)]">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
