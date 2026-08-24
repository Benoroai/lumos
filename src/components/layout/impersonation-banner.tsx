"use client";

import { useTransition } from "react";
import { ShieldAlert, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stopImpersonationAction } from "@/lib/actions/platform/impersonation";

/**
 * Support mode is never subtle. This banner is fixed to the top of every page
 * for the duration of the session so an operator can never forget they are
 * acting inside someone else's business.
 */
export function ImpersonationBanner({
  tenantName,
  operatorEmail,
  startedAt,
}: {
  tenantName: string;
  operatorEmail: string;
  startedAt: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex flex-wrap items-center gap-3 bg-[var(--color-brand-coral)] px-4 py-2.5 text-sm font-medium text-white"
    >
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        Support session active — you are viewing <strong>{tenantName}</strong>{" "}
        as {operatorEmail}. Every action is recorded in the audit log.
      </p>
      <time
        dateTime={startedAt}
        className="hidden text-xs text-white/80 sm:block"
      >
        Started {new Date(startedAt).toLocaleTimeString()}
      </time>
      <Button
        size="sm"
        variant="secondary"
        loading={pending}
        onClick={() => startTransition(() => void stopImpersonationAction())}
        className="border-white/40 bg-white/15 text-white hover:bg-white/25"
      >
        <LogOut className="size-3.5" /> Exit support mode
      </Button>
    </div>
  );
}
