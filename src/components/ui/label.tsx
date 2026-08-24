"use client";

import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export function Label({
  className,
  required,
  children,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & { required?: boolean }) {
  return (
    <LabelPrimitive.Root
      className={cn(
        "flex items-center gap-1 text-sm font-medium text-[var(--foreground)] select-none",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span className="text-[var(--danger)]" aria-hidden>
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  );
}
