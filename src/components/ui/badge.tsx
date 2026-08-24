import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "border-[var(--border-strong)] bg-[var(--surface-muted)] text-[var(--foreground-muted)]",
        success:
          "border-transparent bg-[var(--success-soft)] text-[var(--success)]",
        warning:
          "border-transparent bg-[var(--warning-soft)] text-[var(--warning)]",
        danger:
          "border-transparent bg-[var(--danger-soft)] text-[var(--danger)]",
        info: "border-transparent bg-[var(--info-soft)] text-[var(--info)]",
        accent:
          "border-transparent bg-[var(--accent)] text-[var(--accent-foreground)]",
        secondary:
          "border-transparent bg-[var(--secondary-soft)] text-[var(--secondary-foreground)]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A small filled dot — used for availability, where colour alone must not carry meaning. */
export function StatusDot({
  tone = "neutral",
}: {
  tone?: "success" | "danger" | "warning" | "neutral";
}) {
  const colors: Record<string, string> = {
    success: "bg-[var(--success)]",
    danger: "bg-[var(--danger)]",
    warning: "bg-[var(--warning)]",
    neutral: "bg-[var(--foreground-subtle)]",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 rounded-full", colors[tone])}
    />
  );
}

export { badgeVariants };
