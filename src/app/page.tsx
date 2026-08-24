import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, ShieldCheck, Sparkles } from "lucide-react";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: `${publicEnv.NEXT_PUBLIC_APP_NAME} — sign in`,
};

/**
 * Portal chooser. The two audiences are deliberately separated: a business
 * owner should never land on an administration login, and platform staff sign
 * in through their own route.
 */
export default function HomePage() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center px-6 py-16"
    >
      <div className="w-full max-w-3xl space-y-10">
        <header className="space-y-4 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-xl bg-[var(--color-brand-ink)] text-[var(--color-brand-lime)]">
            <Sparkles className="size-6" />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-balance">
            {publicEnv.NEXT_PUBLIC_APP_NAME}
          </h1>
          <p className="mx-auto max-w-lg text-[var(--foreground-muted)]">
            Digital catalog and menu management for restaurants, cafés, salons
            and barbershops — each business fully isolated, in its own languages
            and currency.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/login"
            className="surface-card group flex flex-col gap-3 p-6 transition-colors hover:border-[var(--primary)]"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
              <Building2 className="size-5" />
            </span>
            <span className="text-lg font-semibold">Business sign in</span>
            <span className="text-sm text-[var(--foreground-muted)]">
              Manage your catalog, branches, offers, translations and analytics.
            </span>
            <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium text-[var(--primary)]">
              Continue
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </Link>

          <Link
            href="/admin/login"
            className="surface-card group flex flex-col gap-3 p-6 transition-colors hover:border-[var(--color-brand-ink)]"
          >
            <span className="flex size-10 items-center justify-center rounded-lg bg-[var(--surface-inset)] text-[var(--foreground)]">
              <ShieldCheck className="size-5" />
            </span>
            <span className="text-lg font-semibold">
              Platform administration
            </span>
            <span className="text-sm text-[var(--foreground-muted)]">
              Restricted to platform staff. Create businesses, manage
              subscriptions and review audit logs.
            </span>
            <span className="mt-auto flex items-center gap-1.5 pt-2 text-sm font-medium">
              Continue
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
            </span>
          </Link>
        </div>

        <footer className="text-center text-sm text-[var(--foreground-subtle)]">
          The customer-facing menu is a separate application that reads this
          platform through the{" "}
          <Link
            href="/api/v1/public/openapi.json"
            className="underline underline-offset-4"
          >
            public API
          </Link>
          .
        </footer>
      </div>
    </main>
  );
}
