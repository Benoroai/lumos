import { z } from "zod";

/**
 * Environment is validated once, at module load, and split in two:
 *
 *  - `publicEnv` is the only object that may be read from client components.
 *  - `serverEnv` is lazily validated and throws if touched in a browser bundle,
 *    which keeps service-role credentials out of client JavaScript by
 *    construction rather than by discipline.
 */

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) =>
    typeof v === "boolean"
      ? v
      : ["1", "true", "yes", "on"].includes(v.toLowerCase()),
  );

const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Lumos"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: z
    .string()
    .min(1)
    .default("tenant-media"),
});

// Next.js inlines NEXT_PUBLIC_* only for literal `process.env.X` references,
// so they must be listed explicitly rather than read dynamically.
const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET,
});

if (!parsedPublic.success && process.env.NODE_ENV !== "test") {
  const issues = parsedPublic.error.issues.map(
    (i) => `  - ${i.path.join(".")}: ${i.message}`,
  );
  throw new Error(
    `Invalid public environment configuration.\n${issues.join("\n")}\n` +
      "Copy .env.example to .env.local and fill in the Supabase values.",
  );
}

export const publicEnv = parsedPublic.success
  ? parsedPublic.data
  : ({
      NEXT_PUBLIC_APP_NAME: "Lumos",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET: "tenant-media",
    } satisfies z.infer<typeof publicSchema>);

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("tenant-media"),
  MEDIA_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5_242_880),
  PUBLIC_API_CORS_ORIGINS: z.string().default(""),
  PUBLIC_API_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  PUBLIC_API_ANALYTICS_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(240),
  PUBLIC_API_CACHE_SECONDS: z.coerce.number().int().nonnegative().default(60),
  PUBLIC_API_BLOCK_EXPIRED_SUBSCRIPTIONS: booleanish.default(true),
  AUTH_LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  SESSION_IDLE_TIMEOUT_MINUTES: z.coerce.number().int().positive().default(720),
  AI_TRANSLATION_PROVIDER: z
    .enum(["anthropic", "openai", "echo"])
    .default("echo"),
  AI_TRANSLATION_MODEL: z.string().default("claude-sonnet-5"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  PLATFORM_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
  PLATFORM_SUPER_ADMIN_NAME: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Server secrets must never be bundled.",
    );
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(
      (i) => `  - ${i.path.join(".")}: ${i.message}`,
    );
    throw new Error(
      `Invalid server environment configuration.\n${issues.join("\n")}`,
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function corsAllowlist(): string[] {
  return serverEnv()
    .PUBLIC_API_CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}
