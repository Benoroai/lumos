import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  canAdministerPlatform,
  canImpersonate,
  hasAnyPermission,
  hasPermission,
} from "@/lib/permissions";
import { isValidCode, isValidSlug, slugify } from "@/lib/format/slug";

describe("permission checks", () => {
  const granted = new Set<string>([
    PERMISSIONS.itemsView,
    PERMISSIONS.itemsAvailability,
  ]);

  it("accepts a granted permission", () => {
    expect(hasPermission(granted, PERMISSIONS.itemsAvailability)).toBe(true);
  });

  it("rejects one that was not granted", () => {
    expect(hasPermission(granted, PERMISSIONS.itemsManage)).toBe(false);
    expect(hasPermission(granted, PERMISSIONS.staffManage)).toBe(false);
  });

  it("works with an array as well as a set", () => {
    expect(
      hasPermission([PERMISSIONS.offersManage], PERMISSIONS.offersManage),
    ).toBe(true);
    expect(hasPermission([], PERMISSIONS.offersManage)).toBe(false);
  });

  it("checks for any of several permissions", () => {
    expect(
      hasAnyPermission(granted, [
        PERMISSIONS.itemsManage,
        PERMISSIONS.itemsView,
      ]),
    ).toBe(true);
    expect(
      hasAnyPermission(granted, [
        PERMISSIONS.staffManage,
        PERMISSIONS.brandingManage,
      ]),
    ).toBe(false);
  });
});

describe("platform roles", () => {
  it("restricts platform administration to super admins", () => {
    expect(canAdministerPlatform("super_admin")).toBe(true);
    expect(canAdministerPlatform("support")).toBe(false);
    expect(canAdministerPlatform("analyst")).toBe(false);
    expect(canAdministerPlatform(undefined)).toBe(false);
  });

  it("allows support and super admins to enter support mode", () => {
    expect(canImpersonate("super_admin")).toBe(true);
    expect(canImpersonate("support")).toBe(true);
    expect(canImpersonate("analyst")).toBe(false);
    expect(canImpersonate(undefined)).toBe(false);
  });
});

describe("slugs", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Bait Al Mandi")).toBe("bait-al-mandi");
    expect(slugify("  Lamb   Mandi!  ")).toBe("lamb-mandi");
    expect(slugify("Café Noir")).toBe("cafe-noir");
  });

  it("falls back when a name transliterates to nothing", () => {
    // Arabic and Persian names leave no ASCII behind, so a deterministic empty
    // slug would collide for every such business.
    const slug = slugify("مندي لحم", "item");
    expect(slug.startsWith("item-")).toBe(true);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("validates slugs", () => {
    expect(isValidSlug("bait-al-mandi")).toBe(true);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("Bait")).toBe(false);
    expect(isValidSlug("bait--al")).toBe(false);
    expect(isValidSlug("-bait")).toBe(false);
  });

  it("validates internal codes, which may use underscores", () => {
    expect(isValidCode("menu_manager")).toBe(true);
    expect(isValidCode("portion-size")).toBe(true);
    expect(isValidCode("Menu")).toBe(false);
  });
});
