import { handlePreflight, handlePublicRequest } from "@/lib/api/public/handler";
import {
  buildMenu,
  listBranches,
  serializeBranch,
  serializeBusiness,
} from "@/lib/api/public/catalog";
import { apiError } from "@/lib/api/response";
import { menuQuerySchema, slugParamSchema } from "@/lib/api/public-schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/businesses/:slug/branches/:branchSlug/menu
 *
 * The primary endpoint: one call returns everything a menu screen needs —
 * localized categories and items, per-branch availability and pricing, live
 * offers already applied, and the currency formatting rules.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; branchSlug: string }> },
) {
  const { slug, branchSlug } = await params;
  const parsedBranch = slugParamSchema.safeParse(branchSlug);

  if (!parsedBranch.success) {
    return apiError("bad_request", "Invalid branch identifier.", {
      origin: request.headers.get("origin"),
    });
  }

  return handlePublicRequest(
    request,
    slug,
    async ({ business, locale, fallbackLocale, searchParams }) => {
      const query = menuQuerySchema.safeParse({
        locale: searchParams.get("locale") ?? undefined,
        categorySlug: searchParams.get("categorySlug") ?? undefined,
        search: searchParams.get("search") ?? undefined,
      });

      const branches = await listBranches(business.id);
      const branch = branches.find((b) => b.slug === parsedBranch.data);

      if (!branch) {
        throw Object.assign(new Error("branch_not_found"), {
          code: "not_found",
        });
      }

      const menu = await buildMenu(business, {
        locale,
        fallbackLocale,
        branchId: branch.id,
        categorySlug: query.success ? query.data.categorySlug : undefined,
        search: query.success ? query.data.search : undefined,
      });

      return {
        business: serializeBusiness(business),
        branch: serializeBranch(branch),
        categories: menu.categories,
        offers: menu.offers,
        itemCount: menu.itemCount,
      };
    },
  );
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
