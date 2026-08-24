import { test, expect, SEED, requiresSeed } from "./fixtures";

test.describe("catalog management", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("an owner can create a category and see it in the list", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);
    await page.goto("/dashboard/catalog/categories");

    const name = `Test Category ${Date.now()}`;
    await page
      .getByRole("button", { name: /new category/i })
      .first()
      .click();
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: /create category/i }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test("an owner can create an item with a three-decimal price", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);
    await page.goto("/dashboard/catalog/items/new");

    const name = `Test Dish ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("tab", { name: "Pricing" }).click();
    await page.getByLabel(/base price/i).fill("12.750");

    // The preview must show all three decimals for OMR.
    await expect(page.getByText("12.750")).toBeVisible();

    await page
      .getByRole("button", { name: /create/i })
      .last()
      .click();
    await expect(page.getByText(/item created/i)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the quick 86 board toggles availability without removing the item", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantOwner);
    await page.goto("/dashboard/catalog/availability");

    const firstToggle = page.getByRole("switch").first();
    const before = await firstToggle.getAttribute("aria-checked");
    await firstToggle.click();

    await expect(
      page.getByText(/out of stock|back in stock/i).first(),
    ).toBeVisible({
      timeout: 15_000,
    });

    // The row is still on the board — availability is a flag, not a deletion.
    await expect(firstToggle).toBeVisible();
    await expect(firstToggle).not.toHaveAttribute("aria-checked", before ?? "");
  });

  test("a viewer sees the catalog but no editing controls", async ({
    page,
    signIn,
  }) => {
    await signIn(SEED.restaurantViewer);
    await page.goto("/dashboard/catalog/items");

    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("link", { name: /new dish/i })).toHaveCount(0);
  });

  test("a viewer cannot reach the staff page", async ({ page, signIn }) => {
    await signIn(SEED.restaurantViewer);
    await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  });

  test("terminology follows the business type", async ({ page, signIn }) => {
    await signIn(SEED.salonOwner);
    // A salon says "Services", not "Menu" — same screens, same tables.
    await expect(
      page.getByRole("link", { name: /services/i }).first(),
    ).toBeVisible();
  });
});
