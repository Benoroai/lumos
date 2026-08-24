import { test as base, expect, type Page } from "@playwright/test";

/**
 * These specs drive the real application against the seeded development data.
 *
 * They skip rather than fail when the environment is not seeded, so a
 * checkout without Supabase configured still gets a green `npm test` from the
 * unit and database suites — which are the ones that guard the security
 * properties. Set E2E=1 once `npm run db:seed` has run to enforce them.
 */
export const SEED = {
  password: "DevPassword!2026",
  platformAdmin: "admin@lumos.local",
  platformSupport: "support@lumos.local",
  restaurantOwner: "owner@baitalmandi.dev",
  restaurantMenuManager: "menu@baitalmandi.dev",
  restaurantViewer: "viewer@baitalmandi.dev",
  cafeOwner: "owner@noorcafe.dev",
  salonOwner: "owner@glowsalon.dev",
  expiredOwner: "owner@crownbarbers.dev",
  restaurantSlug: "bait-al-mandi",
  cafeSlug: "noor-cafe",
  expiredSlug: "crown-barbers",
} as const;

export const requiresSeed = process.env.E2E !== "1";

export const test = base.extend<{
  signIn: (email: string, portal?: "business" | "platform") => Promise<void>;
}>({
  signIn: async ({ page }, use) => {
    await use(async (email, portal = "business") => {
      await page.goto(portal === "platform" ? "/admin/login" : "/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(SEED.password);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(
        portal === "platform" ? /\/admin(?!\/login)/ : /\/dashboard/,
        {
          timeout: 20_000,
        },
      );
    });
  },
});

export { expect, type Page };
