"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "iconSm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "iconSm" | "icon";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy — select the text manually");
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={copy}
      className={cn(className)}
      aria-label={label}
    >
      {copied ? <Check className="text-[var(--success)]" /> : <Copy />}
      {size === "sm" ? label : null}
    </Button>
  );
}
