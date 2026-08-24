import { test, expect, SEED, requiresSeed } from "./fixtures";

test.describe("authentication", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("the landing page offers both portals", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /business sign in/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: /platform administration/i }),
    ).toBeVisible();
  });

  test("a Platform Super Admin can sign in", async ({ page, signIn }) => {
    await signIn(SEED.platformAdmin, "platform");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Businesses" })).toBeVisible();
  });

  test("a Business Owner can sign in and lands in their own business", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);
    await expect(
      page.getByRole("heading", { name: /Bait Al Mandi/i }),
    ).toBeVisible();
  });

  test("wrong credentials are rejected without revealing which part was wrong", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(SEED.restaurantOwner);
    await page.getByLabel("Password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();

    const alert = page.getByRole("alert").first();
    await expect(alert).toContainText(/email or password is incorrect/i);
  });

  test("an unknown account gets the identical message", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("whatever-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByRole("alert").first()).toContainText(
      /email or password is incorrect/i,
    );
  });

  test("a business user cannot reach the platform portal", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the dashboard requires a session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("the platform portal requires a session", async ({ page }) => {
    await page.goto("/admin/businesses");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
