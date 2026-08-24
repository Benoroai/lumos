import { test, expect, SEED, requiresSeed } from "./fixtures";

/**
 * RTL is not a cosmetic detail here: Arabic and Persian are first-class
 * catalog languages, so the dashboard has to mirror completely rather than
 * merely translate.
 */
test.describe("right-to-left layout", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("switching to Arabic flips the document direction", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);

    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "العربية" }).click();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  });

  test("navigation and content read right-to-left in Arabic", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 15_000,
    });

    // The sidebar must sit on the right of the viewport once mirrored.
    const sidebar = page.getByRole("navigation", { name: /main navigation/i });
    const sidebarBox = await sidebar.boundingBox();
    const viewport = page.viewportSize();

    expect(sidebarBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(sidebarBox!.x + sidebarBox!.width).toBeGreaterThan(
      viewport!.width * 0.6,
    );
  });

  test("Persian also switches to RTL", async ({ page, signIn }) => {
    await signIn(SEED.salonOwner);

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "فارسی" }).click();

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 15_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  });

  test("forms stay usable when mirrored", async ({ page, signIn }) => {
    await signIn(SEED.restaurantOwner);

    await page.getByRole("button", { name: /account menu/i }).click();
    await page.getByRole("menuitem", { name: "العربية" }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl", {
      timeout: 15_000,
    });

    await page.goto("/dashboard/catalog/items/new");
    const nameField = page.getByLabel("Name");
    await expect(nameField).toBeVisible();
    await nameField.fill("اختبار");
    await expect(nameField).toHaveValue("اختبار");
  });
});
