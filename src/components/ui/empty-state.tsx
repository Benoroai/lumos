import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  tone = "neutral",
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-6 py-14 text-center",
        className,
      )}
    >
      {Icon ? (
        <span
          className={cn(
            "flex size-11 items-center justify-center rounded-full",
            tone === "danger"
              ? "bg-[var(--danger-soft)] text-[var(--danger)]"
              : "bg-[var(--secondary-soft)] text-[var(--secondary-foreground)]",
          )}
        >
          <Icon className="size-5" aria-hidden />
        </span>
      ) : null}
      <p className="text-base font-semibold">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-[var(--foreground-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
