import { handlePreflight, handlePublicRequest } from "@/lib/api/public/handler";
import { buildMenu } from "@/lib/api/public/catalog";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/public/businesses/:slug/offers
 *
 * Only offers that are live right now. Expired and scheduled offers are
 * excluded by the database itself, so this endpoint cannot accidentally
 * advertise a promotion that has ended.
 */
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
      return { offers: menu.offers };
    },
  );
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
