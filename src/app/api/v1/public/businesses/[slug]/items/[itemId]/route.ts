import { handlePreflight, handlePublicRequest } from "@/lib/api/public/handler";
import { buildMenu } from "@/lib/api/public/catalog";
import { apiError } from "@/lib/api/response";
import { publicIdParamSchema } from "@/lib/api/public-schemas";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/businesses/:slug/items/:itemId
 *
 * `itemId` is the item's stable public UUID — internal sequential identifiers
 * are never exposed, so a caller cannot enumerate a catalog by counting up.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; itemId: string }> },
) {
  const { slug, itemId } = await params;
  const parsedId = publicIdParamSchema.safeParse(itemId);

  if (!parsedId.success) {
    return apiError("bad_request", "Invalid item identifier.", {
      origin: request.headers.get("origin"),
    });
  }

  return handlePublicRequest(
    request,
    slug,
    async ({ business, locale, fallbackLocale, searchParams }) => {
      const branchSlug = searchParams.get("branch");
      const menu = await buildMenu(business, { locale, fallbackLocale });

      for (const category of menu.categories) {
        const item = category.items.find(
          (candidate) => candidate.id === parsedId.data,
        );
        if (item) {
          return {
            item,
            category: {
              id: category.id,
              slug: category.slug,
              name: category.name,
            },
            branch: branchSlug,
          };
        }
      }

      throw Object.assign(new Error("item_not_found"), { code: "not_found" });
    },
  );
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
