import { handlePreflight, handlePublicRequest } from "@/lib/api/public/handler";
import { buildMenu } from "@/lib/api/public/catalog";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/businesses/:slug/categories — categories without their items. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return handlePublicRequest(
    request,
    slug,
    async ({ business, locale, fallbackLocale }) => {
      const menu = await buildMenu(business, { locale, fallbackLocale });

      return {
        categories: menu.categories.map(
          ({ items: _items, ...category }) => category,
        ),
      };
    },
  );
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
