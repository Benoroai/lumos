"use client";

import { useEffect } from "react";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Area-level boundary: keeps the shell and navigation intact so a failure on
 * one screen does not eject the operator from the whole portal.
 */
export default function AreaError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard] unhandled error", error);
  }, [error]);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
        <span className="inline-flex size-11 items-center justify-center rounded-full bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertOctagon className="size-5" />
        </span>
        <div className="space-y-1.5">
          <p className="text-base font-semibold">
            This page could not be loaded
          </p>
          <p className="max-w-md text-sm text-[var(--foreground-muted)]">
            Your data is unaffected. Try again — if it keeps happening, quote
            the reference below.
          </p>
        </div>
        {error.digest ? (
          <p className="text-xs text-[var(--foreground-subtle)]">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
      </CardContent>
    </Card>
  );
}
