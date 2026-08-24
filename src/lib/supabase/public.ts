import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database.generated";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Anonymous client used by the public catalog API.
 *
 * It deliberately holds no session: every row it can reach is one the `anon`
 * RLS policies deem publishable. If a policy is wrong, the API returns nothing
 * rather than leaking — the opposite of filtering in application code.
 */
export function createPublicSupabase() {
  cached ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "lumos-public-api" } },
    },
  );
  return cached;
}
