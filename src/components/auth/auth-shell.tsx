import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Shared frame for every unauthenticated screen. The accent panel is the one
 * place the full brand palette appears at once — inside the product itself the
 * accents are used sparingly.
 */
export function AuthShell({
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  tone = "primary",
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  tone?: "primary" | "ink";
}) {
  return (
    <main
      id="main"
      className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,520px)]"
    >
      <section
        className={
          tone === "ink"
            ? "relative hidden flex-col justify-between overflow-hidden bg-[var(--color-brand-ink)] p-12 text-white lg:flex"
            : "relative hidden flex-col justify-between overflow-hidden bg-[var(--color-brand-blue)] p-12 text-white lg:flex"
        }
      >
        <div
          aria-hidden
          className="absolute -end-24 -top-24 size-96 rounded-full bg-[var(--color-brand-lime)] opacity-20 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -start-16 -bottom-32 size-96 rounded-full bg-[var(--color-brand-lilac)] opacity-25 blur-3xl"
        />

        <Link
          href="/"
          className="relative flex items-center gap-2 text-lg font-semibold"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-brand-lime)] text-[var(--color-brand-ink)]">
            <Sparkles className="size-4" />
          </span>
          Lumos
        </Link>

        <div className="relative max-w-md space-y-5">
          <h2 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance">
            One platform. Every kind of catalog.
          </h2>
          <p className="text-white/75">
            Restaurants, cafés, salons and barbershops — each with its own
            branches, languages, prices and analytics, completely isolated from
            every other business.
          </p>
        </div>

        <p className="relative text-sm text-white/50">
          © {new Date().getFullYear()} Lumos. All rights reserved.
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2 text-start">
            {eyebrow ? (
              <p className="text-xs font-semibold tracking-widest text-[var(--primary)] uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="text-sm text-[var(--foreground-muted)]">
                {subtitle}
              </p>
            ) : null}
          </div>
          {children}
          {footer}
        </div>
      </section>
    </main>
  );
}
