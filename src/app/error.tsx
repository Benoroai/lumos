"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertOctagon, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Root error boundary. It deliberately shows the digest rather than the raw
 * message: production error messages can carry query fragments or identifiers,
 * and the digest is enough to find the entry in the server logs.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error", error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-md space-y-6 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertOctagon className="size-6" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Something went wrong
          </h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            The page could not be loaded. Nothing you were working on has been
            lost — try again, or head back and start over.
          </p>
        </div>

        {error.digest ? (
          <p className="text-xs text-[var(--foreground-subtle)]">
            Reference <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw /> Try again
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
