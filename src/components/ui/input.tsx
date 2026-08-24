import * as React from "react";
import { cn } from "@/lib/utils";

const baseField =
  "flex w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)] shadow-[var(--shadow-subtle)] transition-colors placeholder:text-[var(--foreground-subtle)] focus-visible:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-[var(--danger)]";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(baseField, "h-9.5", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(baseField, "min-h-24 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(baseField, "h-9.5 appearance-none pe-8", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export { baseField };
