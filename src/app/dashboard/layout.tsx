import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell, type NavSection } from "@/components/layout/app-shell";
import {
  CommandPalette,
  type CommandEntry,
} from "@/components/layout/command-palette";
import { UserMenu } from "@/components/layout/user-menu";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SubscriptionAlert } from "@/components/business/subscription-alert";
import { getTenantSession, getPlatformSession } from "@/lib/auth/session";
import { getCatalogContext } from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";
import { getLocale } from "next-intl/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getTenantSession();

  if (!session) {
    const platform = await getPlatformSession();
    redirect(platform ? "/admin/businesses" : "/login");
  }
  if (session.mustChangePassword) redirect("/change-password");
  if (session.tenant.accountStatus === "suspended")
    redirect("/account/suspended");
  if (session.tenant.accountStatus === "archived")
    redirect("/account/archived");

  const locale = await getLocale();
  const context = await getCatalogContext(session.tenant.id);

  // The words in the navigation come from the business template, so a salon
  // reads "Services" where a restaurant reads "Menu" — same screens underneath.
  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  const can = (permission: string) => session.permissions.has(permission);

  const sections: NavSection[] = [
    {
      items: [
        { href: "/dashboard", label: "Overview", icon: "Gauge", exact: true },
      ],
    },
    {
      label: words.catalog,
      items: [
        ...(can(PERMISSIONS.categoriesView)
          ? [
              {
                href: "/dashboard/catalog/categories",
                label: words.categories,
                icon: "LayoutList",
              },
            ]
          : []),
        ...(can(PERMISSIONS.itemsView)
          ? [
              {
                href: "/dashboard/catalog/items",
                label: words.items,
                icon: "Tag",
              },
            ]
          : []),
        ...(can(PERMISSIONS.itemsAvailability)
          ? [
              {
                href: "/dashboard/catalog/availability",
                label: "Quick 86",
                icon: "Zap",
              },
            ]
          : []),
        ...(can(PERMISSIONS.modifiersView)
          ? [
              {
                href: "/dashboard/catalog/modifiers",
                label: "Modifiers",
                icon: "Boxes",
              },
            ]
          : []),
        ...(can(PERMISSIONS.offersView)
          ? [{ href: "/dashboard/offers", label: "Offers", icon: "Ticket" }]
          : []),
      ],
    },
    {
      label: "Business",
      items: [
        ...(can(PERMISSIONS.branchesView)
          ? [{ href: "/dashboard/branches", label: "Branches", icon: "Building" }]
          : []),
        ...(can(PERMISSIONS.mediaView)
          ? [{ href: "/dashboard/media", label: "Media", icon: "ImageIcon" }]
          : []),
        ...(can(PERMISSIONS.translationsView)
          ? [
              {
                href: "/dashboard/translations",
                label: "Translations",
                icon: "Languages",
              },
            ]
          : []),
        ...(can(PERMISSIONS.analyticsView)
          ? [
              {
                href: "/dashboard/analytics",
                label: "Analytics",
                icon: "BarChart3",
              },
            ]
          : []),
        ...(can(PERMISSIONS.staffView)
          ? [{ href: "/dashboard/staff", label: "Staff", icon: "UsersRound" }]
          : []),
      ],
    },
    {
      label: "Configuration",
      items: [
        ...(can(PERMISSIONS.brandingManage)
          ? [
              { href: "/dashboard/branding", label: "Branding", icon: "Palette" },
              {
                href: "/dashboard/localization",
                label: "Localization",
                icon: "Languages",
              },
            ]
          : []),
        ...(can(PERMISSIONS.integrationManage)
          ? [
              {
                href: "/dashboard/integration",
                label: "Integration / API",
                icon: "Plug",
              },
            ]
          : []),
        ...(can(PERMISSIONS.subscriptionView)
          ? [
              {
                href: "/dashboard/subscription",
                label: "Subscription",
                icon: "Sparkles",
              },
            ]
          : []),
        ...(can(PERMISSIONS.settingsView)
          ? [{ href: "/dashboard/settings", label: "Settings", icon: "Settings" }]
          : []),
      ],
    },
  ].filter((section) => section.items.length > 0);

  const commands: CommandEntry[] = sections.flatMap((section) =>
    section.items.map((item) => ({
      id: item.href,
      label: item.label,
      href: item.href,
      group: section.label ?? "Navigate",
    })),
  );

  return (
    <AppShell
      sections={sections}
      banner={
        session.impersonatedBy ? (
          <ImpersonationBanner
            tenantName={session.tenant.name}
            operatorEmail={session.impersonatedBy.email}
            startedAt={session.impersonatedBy.startedAt}
          />
        ) : null
      }
      brand={
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2 font-semibold"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">
            {session.tenant.name.charAt(0).toUpperCase()}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm">{session.tenant.name}</span>
            <span className="truncate text-[11px] font-normal text-[var(--foreground-subtle)]">
              {context.template?.name ?? "Catalog"}
            </span>
          </span>
        </Link>
      }
      headerRight={
        <>
          <CommandPalette entries={commands} />
          <ThemeToggle />
          <UserMenu
            name={session.user.email.split("@")[0] ?? session.user.email}
            email={session.user.email}
            roleLabel={session.roleName}
            portal="business"
          />
        </>
      }
    >
      {session.subscription ? (
        <SubscriptionAlert
          status={session.subscription.status}
          daysRemaining={session.subscription.daysRemaining}
          expiresAt={session.subscription.expiresAt}
        />
      ) : null}
      {children}
    </AppShell>
  );
}
