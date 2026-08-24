"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

export function Switch({
  className,
  tone = "primary",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  tone?: "primary" | "accent";
}) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5.5 w-9.5 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=unchecked]:bg-[var(--border-strong)]",
        tone === "accent"
          ? "data-[state=checked]:bg-[var(--accent)]"
          : "data-[state=checked]:bg-[var(--primary)]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4.5 rounded-full bg-white shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0 rtl:data-[state=checked]:-translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
