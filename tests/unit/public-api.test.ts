import { describe, expect, it } from "vitest";
import { requestedLocale, resolveLocale } from "@/lib/api/public/locale";
import {
  analyticsEventSchema,
  localeParamSchema,
  slugParamSchema,
} from "@/lib/api/public-schemas";

const business = { defaultLocale: "en", supportedLocales: ["en", "ar"] };

describe("public API locale negotiation", () => {
  it("honours a supported locale", () => {
    expect(resolveLocale("ar", business).locale).toBe("ar");
  });

  it("falls back to the default for an unsupported locale", () => {
    const result = resolveLocale("fa", business);
    expect(result.locale).toBe("en");
    expect(result.fallbackLocale).toBe("en");
  });

  it("strips a region subtag before falling back", () => {
    expect(resolveLocale("ar-OM", business).locale).toBe("ar");
    expect(resolveLocale("en-GB", business).locale).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(resolveLocale("AR", business).locale).toBe("ar");
  });

  it("uses the default when nothing is requested", () => {
    expect(resolveLocale(null, business).locale).toBe("en");
    expect(resolveLocale(undefined, business).locale).toBe("en");
  });

  it("respects a non-English default language", () => {
    const salon = { defaultLocale: "ar", supportedLocales: ["ar", "en", "fa"] };
    expect(resolveLocale(null, salon).locale).toBe("ar");
    expect(resolveLocale("de", salon).locale).toBe("ar");
    expect(resolveLocale("fa", salon).locale).toBe("fa");
  });
});

describe("requestedLocale", () => {
  function req(headers: Record<string, string> = {}): Request {
    return new Request("https://example.test/api", { headers });
  }

  it("prefers the query parameter", () => {
    const params = new URLSearchParams({ locale: "ar" });
    expect(requestedLocale(req({ "accept-language": "fa" }), params)).toBe(
      "ar",
    );
  });

  it("falls back to Accept-Language", () => {
    expect(
      requestedLocale(
        req({ "accept-language": "ar-OM,ar;q=0.9,en;q=0.8" }),
        new URLSearchParams(),
      ),
    ).toBe("ar-OM");
  });

  it("returns null when neither is present", () => {
    expect(requestedLocale(req(), new URLSearchParams())).toBeNull();
  });
});

describe("public API request validation", () => {
  it("accepts well-formed slugs", () => {
    expect(slugParamSchema.safeParse("bait-al-mandi").success).toBe(true);
  });

  it("normalises case rather than rejecting it", () => {
    // A URL typed with capitals should still resolve; slugs are stored lowercase.
    const result = slugParamSchema.safeParse("Bait-Al-Mandi");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("bait-al-mandi");
  });

  it("rejects slugs that could be path traversal or injection", () => {
    for (const value of [
      "../etc",
      "a b",
      "x';drop table",
      "-lead",
      "trail-",
      "a",
      "a--b",
    ]) {
      expect(slugParamSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects malformed locales", () => {
    expect(localeParamSchema.safeParse("en").success).toBe(true);
    expect(localeParamSchema.safeParse("ar-OM").success).toBe(true);
    expect(localeParamSchema.safeParse("english").success).toBe(false);
    expect(localeParamSchema.safeParse("<script>").success).toBe(false);
  });

  it("accepts a valid analytics event", () => {
    const result = analyticsEventSchema.safeParse({
      businessSlug: "bait-al-mandi",
      type: "item_view",
      sessionId: "abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    expect(
      analyticsEventSchema.safeParse({
        businessSlug: "bait-al-mandi",
        type: "exfiltrate",
      }).success,
    ).toBe(false);
  });

  it("requires the query on a search event", () => {
    expect(
      analyticsEventSchema.safeParse({
        businessSlug: "bait-al-mandi",
        type: "search",
      }).success,
    ).toBe(false);
    expect(
      analyticsEventSchema.safeParse({
        businessSlug: "bait-al-mandi",
        type: "search",
        searchQuery: "mandi",
      }).success,
    ).toBe(true);
  });

  it("rejects an over-long session identifier", () => {
    expect(
      analyticsEventSchema.safeParse({
        businessSlug: "bait-al-mandi",
        type: "menu_view",
        sessionId: "x".repeat(200),
      }).success,
    ).toBe(false);
  });

  it("rejects an item id that is not a UUID", () => {
    expect(
      analyticsEventSchema.safeParse({
        businessSlug: "bait-al-mandi",
        type: "item_view",
        itemId: "1 OR 1=1",
      }).success,
    ).toBe(false);
  });
});
