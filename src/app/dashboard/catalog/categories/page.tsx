import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { CategoryManager } from "@/components/business/category-manager";
import { requireTenantSession } from "@/lib/auth/session";
import {
  getCatalogContext,
  getCategoryTree,
} from "@/lib/queries/business/catalog";
import { resolveTerminology } from "@/lib/business-templates";
import { PERMISSIONS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const session = await requireTenantSession();
  const locale = await getLocale();

  const [categories, context] = await Promise.all([
    getCategoryTree(session.tenant.id),
    getCatalogContext(session.tenant.id),
  ]);

  const words = resolveTerminology(
    context.template?.terminology,
    context.settings?.terminology_overrides,
    locale,
  );

  return (
    <>
      <PageHeader
        title={words.categories}
        description={`Group your ${words.items.toLowerCase()} and control the order they appear in.`}
        breadcrumbs={[
          { label: words.catalog, href: "/dashboard/catalog/categories" },
          { label: words.categories },
        ]}
      />

      <CategoryManager
        categories={categories}
        branches={context.branches.map((b) => ({ id: b.id, name: b.name }))}
        locales={session.tenant.supportedLocales}
        defaultLocale={session.tenant.defaultLocale}
        currentLocale={locale}
        canManage={session.permissions.has(PERMISSIONS.categoriesManage)}
        labels={{
          category: words.category,
          categories: words.categories,
          item: words.item,
        }}
      />
    </>
  );
}
