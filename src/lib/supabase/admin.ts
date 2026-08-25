import "server-only";

import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database.generated";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Service-role client. BYPASSES ROW-LEVEL SECURITY.
 *
 * Legitimate uses, and only these:
 *   - Platform Super Admin operations that are cross-tenant by definition.
 *   - Creating auth users and issuing password resets.
 *   - Writing audit and analytics rows, which no principal may forge or
 *     suppress on their own behalf.
 *
 * Every caller must have already established authorization. Never reach for
 * this client to work around a policy that blocked a tenant user.
 */
export function createAdminSupabase() {
  const env = serverEnv();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is required for this privileged operation.",
    );
  }

  cached ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { "X-Client-Info": "lumos-admin" } },
    },
  );
  return cached;
}
