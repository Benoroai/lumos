import { describe, expect, it } from "vitest";
import { pickLocale, toLocalizedMap } from "@/lib/i18n/localized";
import {
  textDirection,
  isDashboardLocale,
  RTL_LOCALES,
} from "@/lib/i18n/config";
import {
  resolveTerminology,
  isFieldEnabled,
  parseDefaultCategories,
} from "@/lib/business-templates";

describe("locale fallback", () => {
  const translations = { en: "Lamb Mandi", ar: "مندي لحم" };

  it("returns the requested locale when it exists", () => {
    expect(pickLocale(translations, "ar", "en")).toBe("مندي لحم");
  });

  it("falls back to the tenant default", () => {
    expect(pickLocale(translations, "fa", "en")).toBe("Lamb Mandi");
  });

  it("falls back to any available translation as a last resort", () => {
    expect(pickLocale({ fa: "مندی" }, "en", "ar")).toBe("مندی");
  });

  it("strips a region subtag before giving up", () => {
    expect(pickLocale(translations, "ar-OM", "en")).toBe("مندي لحم");
  });

  it("returns an empty string when there is nothing at all", () => {
    expect(pickLocale({}, "en", "ar")).toBe("");
    expect(pickLocale(null, "en", "ar")).toBe("");
  });

  it("ignores empty translations when falling back", () => {
    expect(pickLocale({ en: "", ar: "مندي" }, "en", "en")).toBe("مندي");
  });
});

describe("toLocalizedMap", () => {
  it("collapses translation rows into a locale map", () => {
    const rows = [
      { locale: "en", name: "Starters", description: "Small plates" },
      { locale: "ar", name: "المقبلات", description: "" },
    ];

    expect(toLocalizedMap(rows, "name")).toEqual({
      en: "Starters",
      ar: "المقبلات",
    });
    expect(toLocalizedMap(rows, "description")).toEqual({ en: "Small plates" });
  });
});

describe("text direction", () => {
  it.each(["ar", "fa", "ur", "he"])("treats %s as right-to-left", (locale) => {
    expect(textDirection(locale)).toBe("rtl");
    expect(RTL_LOCALES.has(locale)).toBe(true);
  });

  it.each(["en", "fr", "tr", "hi"])("treats %s as left-to-right", (locale) => {
    expect(textDirection(locale)).toBe("ltr");
  });

  it("handles region subtags", () => {
    expect(textDirection("ar-OM")).toBe("rtl");
    expect(textDirection("en-GB")).toBe("ltr");
  });

  it("recognises the dashboard locales", () => {
    expect(isDashboardLocale("ar")).toBe(true);
    expect(isDashboardLocale("fa")).toBe(true);
    expect(isDashboardLocale("de")).toBe(false);
    expect(isDashboardLocale(undefined)).toBe(false);
  });
});

describe("business templates", () => {
  const terminology = {
    en: {
      catalog: "Menu",
      category: "Category",
      item: "Dish",
      items: "Dishes",
    },
    ar: {
      catalog: "القائمة",
      category: "التصنيف",
      item: "طبق",
      items: "الأطباق",
    },
  };

  it("uses the requested locale", () => {
    expect(resolveTerminology(terminology, {}, "ar").item).toBe("طبق");
  });

  it("falls back to English for an unlisted locale", () => {
    expect(resolveTerminology(terminology, {}, "fa").item).toBe("Dish");
  });

  it("lets a tenant override the template wording", () => {
    const overrides = { en: { item: "Plate" } };
    const words = resolveTerminology(terminology, overrides, "en");
    expect(words.item).toBe("Plate");
    // Unoverridden words still come from the template.
    expect(words.catalog).toBe("Menu");
  });

  it("falls back to neutral wording when nothing matches", () => {
    expect(resolveTerminology(null, null, "en")).toMatchObject({
      catalog: "Catalog",
      item: "Item",
    });
  });

  it("ignores unknown keys in an override", () => {
    const words = resolveTerminology(
      terminology,
      { en: { nonsense: "x" } },
      "en",
    );
    expect(words).not.toHaveProperty("nonsense");
  });

  it("reads the enabled optional fields", () => {
    expect(isFieldEnabled(["description", "calories"], "calories")).toBe(true);
    expect(isFieldEnabled(["description"], "calories")).toBe(false);
    expect(isFieldEnabled(null, "calories")).toBe(false);
  });

  it("parses default categories and skips malformed entries", () => {
    const parsed = parseDefaultCategories([
      { slug: "starters", en: "Starters", ar: "المقبلات" },
      { slug: "broken" },
      "nonsense",
    ]);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual({
      slug: "starters",
      en: "Starters",
      ar: "المقبلات",
    });
  });
});
