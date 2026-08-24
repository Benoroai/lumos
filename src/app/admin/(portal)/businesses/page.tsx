import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { TableSkeleton } from "@/components/ui/skeleton";
import { BusinessTable } from "@/components/platform/business-table";
import { requirePlatformSession } from "@/lib/auth/session";
import { listBusinesses } from "@/lib/queries/platform/businesses";
import { createAdminSupabase } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Businesses" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requirePlatformSession();
  const params = await searchParams;

  const page = Math.max(1, Number(first(params.page) ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(5, Number(first(params.pageSize) ?? 25) || 25),
  );

  const [data, { data: plans }] = await Promise.all([
    listBusinesses({
      page,
      pageSize,
      search: first(params.search),
      businessType: first(params.businessType),
      accountStatus: first(params.accountStatus),
      subscriptionStatus: first(params.subscriptionStatus),
      planCode: first(params.planCode),
      includeDeleted: first(params.includeDeleted) === "true",
      sort: first(params.sort),
      direction: first(params.direction) === "asc" ? "asc" : "desc",
    }),
    createAdminSupabase()
      .from("plans")
      .select("code, name")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  return (
    <>
      <PageHeader
        title="Businesses"
        description={`${data.total} business${data.total === 1 ? "" : "es"} on the platform. Every one is fully isolated from the others.`}
        breadcrumbs={[
          { label: "Platform", href: "/admin" },
          { label: "Businesses" },
        ]}
        actions={
          session.role === "super_admin" ? (
            <Button asChild>
              <Link href="/admin/businesses/new">
                <Plus /> Add business
              </Link>
            </Button>
          ) : null
        }
      />

      <Suspense fallback={<TableSkeleton rows={8} columns={7} />}>
        <BusinessTable data={data} plans={plans ?? []} />
      </Suspense>
    </>
  );
}
