import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

export const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
export const BOOTSTRAP_FILE = resolve(
  process.cwd(),
  "supabase/bootstrap/local.sql",
);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function listMigrations(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }));
}

export async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

/**
 * Applies every pending migration inside its own transaction and records it in
 * `public._migrations`, so re-running is always a no-op.
 */
export async function migrate(
  client: Client,
  options: { bootstrap?: boolean; log?: (message: string) => void } = {},
): Promise<string[]> {
  const log = options.log ?? (() => {});

  if (options.bootstrap) {
    log("- applying local Supabase bootstrap shim");
    await client.query(readFileSync(BOOTSTRAP_FILE, "utf8"));
  }

  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now(),
      checksum text not null
    );
  `);

  const { rows } = await client.query<{ name: string }>(
    "select name from public._migrations",
  );
  const applied = new Set(rows.map((r) => r.name));
  const executed: string[] = [];

  for (const migration of listMigrations()) {
    if (applied.has(migration.name)) continue;
    log(`- ${migration.name}`);
    const checksum = createHash("sha256").update(migration.sql).digest("hex");
    try {
      await client.query("begin");
      await client.query(migration.sql);
      await client.query(
        "insert into public._migrations (name, checksum) values ($1, $2)",
        [migration.name, checksum],
      );
      await client.query("commit");
      executed.push(migration.name);
    } catch (error) {
      await client.query("rollback");
      throw new Error(
        `Migration ${migration.name} failed: ${(error as Error).message}`,
        {
          cause: error,
        },
      );
    }
  }

  return executed;
}
