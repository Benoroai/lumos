import { test, expect, requiresSeed, SEED } from "./fixtures";

/**
 * The public API is the contract the separate customer frontend depends on, so
 * these assertions are about shape and about what must never appear.
 */
test.describe("public catalog API", () => {
  test.skip(
    requiresSeed,
    "Set E2E=1 and run `npm run db:seed` to enable end-to-end tests.",
  );

  test("serves a business profile", async ({ request }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}`,
    );
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.business.slug).toBe(SEED.restaurantSlug);
    expect(body.data.business.currency.decimalDigits).toBe(3);
    expect(body.meta.locale).toBeTruthy();
    expect(Array.isArray(body.data.branches)).toBe(true);
  });

  test("never exposes internal fields", async ({ request }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}`,
    );
    const raw = await response.text();

    expect(raw).not.toContain("internal_notes");
    expect(raw).not.toContain("Development seed data");
    expect(raw).not.toContain("tenant_id");
    expect(raw).not.toContain("service_role");
  });

  test("serves a localized menu and falls back for missing translations", async ({
    request,
  }) => {
    const english = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}/branches/main/menu?locale=en`,
    );
    const arabic = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}/branches/main/menu?locale=ar`,
    );

    expect(english.status()).toBe(200);
    expect(arabic.status()).toBe(200);

    const en = await english.json();
    const ar = await arabic.json();

    expect(en.meta.locale).toBe("en");
    expect(ar.meta.locale).toBe("ar");

    const enItem = en.data.categories[0]?.items[0];
    const arItem = ar.data.categories[0]?.items[0];
    expect(enItem?.name).toBeTruthy();
    expect(arItem?.name).toBeTruthy();
    // Same item, different language — matched by its stable public id.
    expect(arItem?.id).toBe(enItem?.id);
  });

  test("falls back to the default language for an unsupported locale", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.cafeSlug}/branches/main/menu?locale=de`,
    );
    const body = await response.json();

    // Noor Café publishes en and ar only.
    expect(body.meta.locale).toBe("en");
    expect(body.meta.fallbackLocale).toBe("en");
  });

  test("honours the Accept-Language header", async ({ request }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}/branches/main/menu`,
      { headers: { "Accept-Language": "ar" } },
    );
    const body = await response.json();
    expect(body.meta.locale).toBe("ar");
  });

  test("keeps out-of-stock items in the response, flagged as unavailable", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}/branches/main/menu`,
    );
    const body = await response.json();

    const items = body.data.categories.flatMap(
      (c: { items: unknown[] }) => c.items,
    );
    const unavailable = items.filter(
      (item: { availability: { inStock: boolean } }) =>
        !item.availability.inStock,
    );

    // The seed marks one dish unavailable — it must still be listed.
    expect(unavailable.length).toBeGreaterThan(0);
  });

  test("refuses a business whose subscription has expired", async ({
    request,
  }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.expiredSlug}`,
    );
    expect(response.status()).toBe(404);

    const body = await response.json();
    expect(body.error.code).toBe("not_found");
  });

  test("returns only live offers", async ({ request }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}/offers`,
    );
    const body = await response.json();

    const now = Date.now();
    for (const offer of body.data.offers) {
      expect(new Date(offer.startsAt).getTime()).toBeLessThanOrEqual(now);
      if (offer.endsAt)
        expect(new Date(offer.endsAt).getTime()).toBeGreaterThan(now);
    }
    // The seeded 'launch-week' offer ended months ago and must be absent.
    expect(body.data.offers.map((o: { name: string }) => o.name)).not.toContain(
      "Launch Week",
    );
  });

  test("rejects a malformed slug", async ({ request }) => {
    const response = await request.get("/api/v1/public/businesses/NOT A SLUG");
    expect([400, 404]).toContain(response.status());
  });

  test("accepts an analytics event", async ({ request }) => {
    const response = await request.post("/api/v1/public/analytics/events", {
      data: {
        businessSlug: SEED.restaurantSlug,
        type: "menu_view",
        branchSlug: "main",
        locale: "ar",
        sessionId: "e2e-session",
      },
    });

    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.data.accepted).toBe(1);
  });

  test("silently discards analytics for an unpublished business", async ({
    request,
  }) => {
    const response = await request.post("/api/v1/public/analytics/events", {
      data: { businessSlug: SEED.expiredSlug, type: "menu_view" },
    });

    expect(response.status()).toBe(202);
    const body = await response.json();
    expect(body.data.accepted).toBe(0);
    expect(body.data.rejected).toBe(1);
  });

  test("rejects a malformed analytics payload", async ({ request }) => {
    const response = await request.post("/api/v1/public/analytics/events", {
      data: { businessSlug: SEED.restaurantSlug, type: "not_a_real_event" },
    });
    expect(response.status()).toBe(400);
  });

  test("publishes an OpenAPI specification", async ({ request }) => {
    const response = await request.get("/api/v1/public/openapi.json");
    expect(response.status()).toBe(200);

    const spec = await response.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(
      spec.paths["/businesses/{slug}/branches/{branchSlug}/menu"],
    ).toBeTruthy();
    expect(spec.paths["/analytics/events"]).toBeTruthy();
  });

  test("sets rate limit headers", async ({ request }) => {
    const response = await request.get(
      `/api/v1/public/businesses/${SEED.restaurantSlug}`,
    );
    expect(response.headers()["x-ratelimit-limit"]).toBeTruthy();
    expect(response.headers()["x-ratelimit-remaining"]).toBeTruthy();
  });
});
