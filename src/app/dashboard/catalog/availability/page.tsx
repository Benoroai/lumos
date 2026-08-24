import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { AvailabilityBoard } from "@/components/business/availability-board";
import { requireTenantSession } from "@/lib/auth/session";
import { getCatalogContext, listItems } from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Quick 86" };

export default async function AvailabilityPage() {
  const session = await requireTenantSession();
  if (!session.permissions.has(PERMISSIONS.itemsAvailability))
    redirect("/dashboard");

  const locale = await getLocale();

  const [context, items] = await Promise.all([
    getCatalogContext(session.tenant.id),
    listItems(
      session.tenant.id,
      { page: 1, pageSize: 100, sort: "display_order" },
      locale,
    ),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  return (
    <>
      <PageHeader
        title="Quick 86"
        description={`Toggle availability fast during service. Nothing is deleted — an unavailable ${words.item.toLowerCase()} stays on the menu and the public API reports it as out of stock.`}
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/items" },
          { label: "Quick 86" },
        ]}
      />

      <AvailabilityBoard
        items={items.rows}
        branches={context.branches.map((b) => ({ id: b.id, name: b.name }))}
        locale={locale}
        defaultLocale={session.tenant.defaultLocale}
        labels={{ item: words.item, items: words.items }}
      />
    </>
  );
}
