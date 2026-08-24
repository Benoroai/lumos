"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  exact?: boolean;
};

export type NavSection = {
  label?: string;
  items: NavItem[];
};

/**
 * Responsive shell shared by both portals. The sidebar collapses to a sheet
 * below `lg`, and every position uses logical properties so the whole layout
 * mirrors correctly in Arabic and Persian without a second stylesheet.
 */
export function AppShell({
  sections,
  brand,
  headerRight,
  banner,
  children,
}: {
  sections: NavSection[];
  brand: React.ReactNode;
  headerRight?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[var(--background)]">
      {banner}

      <div className="flex">
        <aside
          className={cn(
            "fixed inset-y-0 z-40 flex w-72 shrink-0 flex-col border-e border-[var(--border)] bg-[var(--surface)] transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full rtl:translate-x-full",
            "start-0",
          )}
          aria-label="Main navigation"
        >
          <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] px-5">
            {brand}
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X />
            </Button>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
            {sections.map((section, index) => (
              <div key={section.label ?? index} className="space-y-1">
                {section.label ? (
                  <p className="px-3 pb-1 text-[11px] font-semibold tracking-widest text-[var(--foreground-subtle)] uppercase">
                    {section.label}
                  </p>
                ) : null}
                {section.items.map((item) => {
                  const active = item.exact
                    ? pathname === item.href
                    : pathname === item.href ||
                      pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                          : "text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">
                        {item.label}
                      </span>
                      {item.badge !== undefined && item.badge !== 0 ? (
                        <span className="tabular rounded-full bg-[var(--danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--danger)]">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {open ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/85 px-4 backdrop-blur-md sm:px-6">
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open navigation"
            >
              <Menu />
            </Button>
            <div className="ms-auto flex items-center gap-2">{headerRight}</div>
          </header>

          <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
