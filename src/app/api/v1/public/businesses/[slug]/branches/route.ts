import { handlePreflight, handlePublicRequest } from "@/lib/api/public/handler";
import { listBranches, serializeBranch } from "@/lib/api/public/catalog";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/businesses/:slug/branches */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  return handlePublicRequest(request, slug, async ({ business }) => {
    const branches = await listBranches(business.id);
    return { branches: branches.map(serializeBranch) };
  });
}

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}
