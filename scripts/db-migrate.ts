import { connect, migrate, requireEnv } from "./lib/db";

async function main() {
  const url = requireEnv("DATABASE_URL");
  const bootstrap = process.argv.includes("--bootstrap");
  const client = await connect(url);
  try {
    console.log(`Applying migrations to ${redact(url)}`);
    const executed = await migrate(client, {
      bootstrap,
      log: (m) => console.log(m),
    });
    console.log(
      executed.length
        ? `Applied ${executed.length} migration(s).`
        : "Already up to date.",
    );
  } finally {
    await client.end();
  }
}

function redact(url: string) {
  return url.replace(/\/\/[^@]*@/, "//***@");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
