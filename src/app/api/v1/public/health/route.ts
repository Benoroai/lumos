import { NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/api/cors";
import { API_VERSION } from "@/lib/api/response";

export const dynamic = "force-dynamic";

/** Liveness probe. Deliberately reveals nothing about the platform's state. */
export async function GET(request: Request) {
  return NextResponse.json(
    { data: { status: "ok", version: API_VERSION } },
    {
      headers: {
        ...resolveCorsHeaders(request.headers.get("origin")),
        "Cache-Control": "no-store",
      },
    },
  );
}
