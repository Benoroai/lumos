import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      "src/lib/types/database.generated.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      eqeqeq: ["error", "smart"],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  {
    /*
     * Client components must never reach the service-role client. The
     * `import 'server-only'` directive inside that module is the real guard —
     * it fails the build — but flagging it here surfaces the mistake in the
     * editor instead of at build time. Server components under src/app use it
     * legitimately for cross-tenant platform queries, so the rule is scoped to
     * the directory where every 'use client' component lives.
     */
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/supabase/admin",
              message:
                "The service-role client bypasses Row-Level Security and must never be imported into a client component.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "scripts/**/*.ts",
      "tests/**/*.ts",
      "src/lib/supabase/admin.ts",
      "*.config.*",
    ],
    rules: { "no-console": "off" },
  },
  prettier,
);
