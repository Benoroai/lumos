import { redirect } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AppShell, type NavSection } from "@/components/layout/app-shell";
import {
  CommandPalette,
  type CommandEntry,
} from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getPlatformSession } from "@/lib/auth/session";
import { getPlatformOverview } from "@/lib/queries/platform/analytics";

const NAV: NavSection[] = [
  {
    items: [
      { href: "/admin", label: "Overview", icon: "Gauge", exact: true },
      { href: "/admin/businesses", label: "Businesses", icon: "Building2" },
      {
        href: "/admin/subscriptions",
        label: "Subscriptions",
        icon: "CalendarClock",
      },
      {
        href: "/admin/analytics",
        label: "Platform analytics",
        icon: "ChartNoAxesCombined",
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        href: "/admin/templates",
        label: "Business types",
        icon: "LayoutTemplate",
      },
      { href: "/admin/plans", label: "Plans and limits", icon: "Sparkles" },
      {
        href: "/admin/languages",
        label: "Languages and currencies",
        icon: "Globe",
      },
      { href: "/admin/feature-flags", label: "Feature flags", icon: "Flag" },
    ],
  },
  {
    label: "Platform",
    items: [
      {
        href: "/admin/platform-users",
        label: "Platform users",
        icon: "UsersRound",
      },
      { href: "/admin/audit", label: "Audit logs", icon: "FileClock" },
      { href: "/admin/settings", label: "System settings", icon: "Settings" },
    ],
  },
];

const COMMANDS: CommandEntry[] = [
  { id: "overview", label: "Overview", href: "/admin", group: "Navigate" },
  {
    id: "businesses",
    label: "Businesses",
    href: "/admin/businesses",
    group: "Navigate",
  },
  {
    id: "new-business",
    label: "Add a business",
    href: "/admin/businesses/new",
    group: "Actions",
    hint: "Create",
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    href: "/admin/subscriptions",
    group: "Navigate",
  },
  {
    id: "analytics",
    label: "Platform analytics",
    href: "/admin/analytics",
    group: "Navigate",
  },
  {
    id: "templates",
    label: "Business types and templates",
    href: "/admin/templates",
    group: "Configure",
  },
  {
    id: "plans",
    label: "Plans and limits",
    href: "/admin/plans",
    group: "Configure",
  },
  {
    id: "languages",
    label: "Languages and currencies",
    href: "/admin/languages",
    group: "Configure",
  },
  {
    id: "flags",
    label: "Feature flags",
    href: "/admin/feature-flags",
    group: "Configure",
  },
  {
    id: "users",
    label: "Platform users",
    href: "/admin/platform-users",
    group: "Platform",
  },
  { id: "audit", label: "Audit logs", href: "/admin/audit", group: "Platform" },
  {
    id: "settings",
    label: "System settings",
    href: "/admin/settings",
    group: "Platform",
  },
];

const PLATFORM_ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform Super Admin",
  support: "Platform Support",
  analyst: "Platform Analyst",
};

/**
 * Guarded shell for the Super Admin portal.
 *
 * It lives in a `(portal)` route group so `/admin/login`,
 * `/admin/forgot-password` and `/admin/change-password` sit *outside* it. A
 * guard that also wraps the page it redirects to is an infinite redirect loop.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getPlatformSession();
  if (!session) redirect("/admin/login");
  if (session.mustChangePassword) redirect("/admin/change-password");

  // Surface the count of businesses needing attention right in the navigation.
  const overview = await getPlatformOverview();
  const attention =
    overview.expiredSubscriptions + overview.expiringSubscriptions;

  const sections = NAV.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      item.href === "/admin/subscriptions" && attention > 0
        ? { ...item, badge: attention }
        : item,
    ),
  }));

  return (
    <AppShell
      sections={sections}
      brand={
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--color-brand-ink)] text-[var(--color-brand-lime)]">
            <Sparkles className="size-4" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm">Lumos</span>
            <span className="text-[11px] font-normal text-[var(--foreground-subtle)]">
              Platform administration
            </span>
          </span>
        </Link>
      }
      headerRight={
        <>
          <CommandPalette entries={COMMANDS} />
          <ThemeToggle />
          <UserMenu
            name={session.fullName}
            email={session.user.email}
            roleLabel={PLATFORM_ROLE_LABELS[session.role] ?? session.role}
            portal="platform"
          />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
