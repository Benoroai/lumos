import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-md space-y-6 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-[var(--secondary-soft)] text-[var(--secondary-foreground)]">
          <FileQuestion className="size-6" />
        </span>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Page not found
          </h1>
          <p className="text-sm text-[var(--foreground-muted)]">
            This page does not exist, or it belongs to a business you do not
            have access to.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/">Back to sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
