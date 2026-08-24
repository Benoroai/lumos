import { Client } from "pg";
import { config as loadEnv } from "dotenv";
import { migrate } from "../../scripts/lib/db";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

/**
 * Creates a throwaway database, applies the real migrations to it (including
 * the local Supabase shim that provides `auth.uid()` and the `anon` /
 * `authenticated` roles), and drops it afterwards.
 *
 * The isolation tests must run against the actual policies, not a mock — a
 * hand-written double would pass while the deployed policy was wrong.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TEST_DATABASE_URL is not set. Point it at a throwaway database, e.g. " +
        "postgresql://127.0.0.1:5432/lumos_test",
    );
  }

  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  if (!database) throw new Error("TEST_DATABASE_URL must name a database.");

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const maintenance = new Client({ connectionString: adminUrl.toString() });
  await maintenance.connect();

  await maintenance.query(
    `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
    [database],
  );
  await maintenance.query(`drop database if exists ${quote(database)}`);
  await maintenance.query(`create database ${quote(database)}`);
  await maintenance.end();

  const client = new Client({ connectionString: url });
  await client.connect();
  await migrate(client, { bootstrap: true });
  await client.end();

  return async () => {
    const cleanup = new Client({ connectionString: adminUrl.toString() });
    await cleanup.connect();
    await cleanup.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [database],
    );
    await cleanup.query(`drop database if exists ${quote(database)}`);
    await cleanup.end();
  };
}

function quote(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
