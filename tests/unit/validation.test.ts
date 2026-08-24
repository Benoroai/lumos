import { describe, expect, it } from "vitest";
import { createBusinessSchema } from "@/lib/validation/tenant";
import {
  bulkItemActionSchema,
  itemSchema,
  offerSchema,
} from "@/lib/validation/catalog";
import { priceSchema } from "@/lib/validation/common";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

function baseBusiness(overrides: Record<string, unknown> = {}) {
  return {
    name: "Bait Al Mandi",
    slug: "bait-al-mandi",
    businessType: "restaurant",
    templateId: VALID_UUID,
    planId: VALID_UUID,
    subscriptionStartsAt: "2026-06-01T00:00:00.000Z",
    subscriptionExpiresAt: "2027-06-01T00:00:00.000Z",
    defaultCurrency: "OMR",
    defaultLocale: "en",
    supportedLocales: ["en", "ar"],
    ownerEmail: "owner@example.com",
    ownerFullName: "Salim Al Harthy",
    ownerPassword: "StrongPass123",
    ...overrides,
  };
}

describe("createBusinessSchema", () => {
  it("accepts a complete, well-formed business", () => {
    expect(createBusinessSchema.safeParse(baseBusiness()).success).toBe(true);
  });

  it("rejects an expiry that precedes the start date", () => {
    const result = createBusinessSchema.safeParse(
      baseBusiness({ subscriptionExpiresAt: "2026-01-01T00:00:00.000Z" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.path.includes("subscriptionExpiresAt"),
        ),
      ).toBe(true);
    }
  });

  it("rejects a default language that is not in the supported set", () => {
    const result = createBusinessSchema.safeParse(
      baseBusiness({ defaultLocale: "fa", supportedLocales: ["en", "ar"] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a slug that is not URL-safe", () => {
    expect(
      createBusinessSchema.safeParse(baseBusiness({ slug: "Bait Al Mandi" }))
        .success,
    ).toBe(false);
  });

  it("rejects a weak owner password", () => {
    expect(
      createBusinessSchema.safeParse(baseBusiness({ ownerPassword: "short" }))
        .success,
    ).toBe(false);
    expect(
      createBusinessSchema.safeParse(
        baseBusiness({ ownerPassword: "alllowercase123" }),
      ).success,
    ).toBe(false);
  });

  it("requires at least one supported language", () => {
    expect(
      createBusinessSchema.safeParse(baseBusiness({ supportedLocales: [] }))
        .success,
    ).toBe(false);
  });
});

describe("priceSchema", () => {
  it("rounds to three decimal places", () => {
    expect(priceSchema.parse("6.5006")).toBe(6.501);
    expect(priceSchema.parse(6.5)).toBe(6.5);
  });

  it("rejects negatives", () => {
    expect(priceSchema.safeParse(-1).success).toBe(false);
  });
});

describe("itemSchema", () => {
  const baseItem = {
    name: { en: "Lamb Mandi" },
    basePrice: "6.500",
  };

  it("accepts a minimal item", () => {
    expect(itemSchema.safeParse(baseItem).success).toBe(true);
  });

  it("requires a name in at least one language", () => {
    expect(itemSchema.safeParse({ ...baseItem, name: {} }).success).toBe(false);
    expect(
      itemSchema.safeParse({ ...baseItem, name: { en: "" } }).success,
    ).toBe(false);
  });

  it("rejects a sale price above the base price", () => {
    const result = itemSchema.safeParse({ ...baseItem, salePrice: "9.000" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path.includes("salePrice")),
      ).toBe(true);
    }
  });

  it("accepts a sale price equal to the base price", () => {
    expect(
      itemSchema.safeParse({ ...baseItem, salePrice: "6.500" }).success,
    ).toBe(true);
  });

  it("treats an empty optional numeric field as absent, not zero", () => {
    const result = itemSchema.safeParse({
      ...baseItem,
      calories: "",
      spiceLevel: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.calories).toBeNull();
      expect(result.data.spiceLevel).toBeNull();
    }
  });
});

describe("offerSchema", () => {
  const baseOffer = {
    code: "family-friday",
    name: { en: "Family Friday" },
    discountType: "percentage",
    discountValue: "15",
    startsAt: "2026-06-01T00:00:00.000Z",
  };

  it("accepts a percentage offer", () => {
    expect(offerSchema.safeParse(baseOffer).success).toBe(true);
  });

  it("rejects a percentage above 100", () => {
    expect(
      offerSchema.safeParse({ ...baseOffer, discountValue: "150" }).success,
    ).toBe(false);
  });

  it("allows a fixed amount above 100", () => {
    expect(
      offerSchema.safeParse({
        ...baseOffer,
        discountType: "fixed_amount",
        discountValue: "150",
      }).success,
    ).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    expect(
      offerSchema.safeParse({
        ...baseOffer,
        endsAt: "2026-05-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("requires targets when the offer is scoped", () => {
    expect(
      offerSchema.safeParse({ ...baseOffer, targetType: "items", itemIds: [] })
        .success,
    ).toBe(false);
    expect(
      offerSchema.safeParse({
        ...baseOffer,
        targetType: "items",
        itemIds: [VALID_UUID],
      }).success,
    ).toBe(true);
  });
});

describe("bulkItemActionSchema", () => {
  it("requires at least one item", () => {
    expect(
      bulkItemActionSchema.safeParse({ itemIds: [], action: "activate" })
        .success,
    ).toBe(false);
  });

  it("requires a destination for a move", () => {
    expect(
      bulkItemActionSchema.safeParse({
        itemIds: [VALID_UUID],
        action: "move_category",
      }).success,
    ).toBe(false);
    expect(
      bulkItemActionSchema.safeParse({
        itemIds: [VALID_UUID],
        action: "move_category",
        targetCategoryId: null,
      }).success,
    ).toBe(true);
  });
});
