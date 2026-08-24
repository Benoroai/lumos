import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set.");
  return url;
}

export async function connectTestDb(): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  return client;
}

export type Principal =
  | { kind: "service" }
  | { kind: "anon" }
  | { kind: "authenticated"; userId: string };

/**
 * Runs a callback with the session bound to a principal, exactly the way
 * PostgREST binds one: `SET LOCAL ROLE` plus the verified JWT claims in
 * `request.jwt.claims`. Everything happens inside a transaction that is always
 * rolled back, so tests cannot leak state into one another.
 */
export async function asPrincipal<T>(
  client: Client,
  principal: Principal,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    if (principal.kind === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ role: "anon" }),
      ]);
    } else if (principal.kind === "authenticated") {
      await client.query("set local role authenticated");
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: principal.userId, role: "authenticated" }),
      ]);
    }
    return await run(client);
  } finally {
    await client.query("rollback");
  }
}

/** Asserts a statement is rejected — by RLS, by a grant, or by a constraint. */
export async function expectRejected(
  client: Client,
  principal: Principal,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
  try {
    await asPrincipal(client, principal, async (c) => {
      await c.query(sql, params);
    });
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error(
    `Expected the statement to be rejected, but it succeeded:\n${sql}`,
  );
}
