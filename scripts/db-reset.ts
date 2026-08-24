import { connect, migrate, requireEnv } from "./lib/db";

/**
 * Drops and rebuilds the application schema. Refuses to touch anything unless
 * ALLOW_DB_RESET=true, because this destroys data.
 */
async function main() {
  if (process.env.ALLOW_DB_RESET !== "true") {
    console.error("Refusing to reset: set ALLOW_DB_RESET=true to confirm.");
    process.exit(1);
  }
  const url = requireEnv("DATABASE_URL");
  const client = await connect(url);
  try {
    await client.query("drop schema if exists app cascade");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
    await migrate(client, {
      bootstrap: process.argv.includes("--bootstrap"),
      log: (m) => console.log(m),
    });
    console.log("Database reset complete.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
