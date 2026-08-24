import { test, expect, SEED, requiresSeed } from "./fixtures";

test.describe("platform administration", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("the Super Admin can create a business with a one-year subscription", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.platformAdmin, "platform");
    await page.goto("/admin/businesses/new");

    const stamp = Date.now();
    const name = `E2E Test Café ${stamp}`;
    const slug = `e2e-test-cafe-${stamp}`;

    // Step 1 — business information
    await page.getByLabel("Business name").fill(name);
    await page.getByLabel("URL slug").fill(slug);
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 2 — business type
    await page.getByRole("button", { name: /^Café/ }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 3 — plan and subscription. The expiry defaults to one year out.
    const expiry = await page.getByLabel("Subscription expiry").inputValue();
    const start = await page.getByLabel("Subscription start").inputValue();
    const days = Math.round(
      (new Date(expiry).getTime() - new Date(start).getTime()) / 86_400_000,
    );
    expect(days).toBeGreaterThanOrEqual(364);
    expect(days).toBeLessThanOrEqual(366);
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 4 — currency and languages
    await expect(page.getByLabel("Default currency")).toHaveValue("OMR");
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 5 — owner account
    await page.getByLabel("Owner name").fill("E2E Owner");
    await page.getByLabel("Owner email").fill(`owner.${stamp}@e2e.test`);
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 6 — features
    await page.getByRole("button", { name: /continue/i }).click();

    // Step 7 — review and create
    await expect(page.getByText(name)).toBeVisible();
    await page.getByRole("button", { name: /create business/i }).click();

    // The temporary password is shown exactly once, at creation.
    await expect(page.getByText(/is ready/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Temporary password")).toBeVisible();
    await expect(page.getByText(`owner.${stamp}@e2e.test`)).toBeVisible();
  });

  test("the businesses table filters by subscription status", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.platformAdmin, "platform");
    await page.goto("/admin/subscriptions?status=expired");

    // Crown Barbers is seeded with a lapsed subscription.
    await expect(
      page.getByRole("link", { name: /crown barbers/i }),
    ).toBeVisible();
  });

  test("an expired business is flagged in the businesses list", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.platformAdmin, "platform");
    await page.goto("/admin/businesses?search=crown");

    await expect(page.getByText("Expired").first()).toBeVisible();
  });

  test("audit entries are recorded and visible", async ({ page, signIn }) => {
    await signIn(SEED.platformAdmin, "platform");
    await page.goto("/admin/audit");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByText("business.created").first()).toBeVisible();
  });

  test("support mode shows a permanent banner", async ({ page, signIn }) => {
    await signIn(SEED.platformSupport, "platform");
    await page.goto("/admin/businesses?search=bait");
    await page
      .getByRole("link", { name: /bait al mandi/i })
      .first()
      .click();

    await page.getByRole("button", { name: /support mode/i }).click();
    await page.getByRole("button", { name: /enter support mode/i }).click();

    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
    await expect(page.getByText(/support session active/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /exit support mode/i }),
    ).toBeVisible();
  });
});

test.describe("expired subscription behaviour", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("the owner of an expired business sees a clear notice, not an empty app", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.expiredOwner);

    await expect(page.getByText(/subscription has expired/i)).toBeVisible();
    // Their data is still there — the point of the screen is that nothing was lost.
    await expect(
      page.getByText(/preserved|nothing has been deleted/i).first(),
    ).toBeVisible();
  });
});
