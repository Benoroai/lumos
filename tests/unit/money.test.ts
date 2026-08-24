import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  formatAmount,
  formatPrice,
  parsePriceInput,
  type CurrencyInfo,
} from "@/lib/format/money";

const OMR: CurrencyInfo = { code: "OMR", symbol: "ر.ع.", decimalDigits: 3 };
const USD: CurrencyInfo = { code: "USD", symbol: "$", decimalDigits: 2 };

describe("three-decimal currencies", () => {
  it("renders OMR with three decimals", () => {
    expect(formatAmount(6.5, OMR)).toBe("6.500");
    expect(formatAmount(0.125, OMR)).toBe("0.125");
  });

  it("renders two-decimal currencies with two", () => {
    expect(formatAmount(6.5, USD)).toBe("6.50");
  });

  it("does not lose the third decimal to rounding", () => {
    expect(formatAmount(1.005, OMR)).toBe("1.005");
    expect(formatAmount(12.345, OMR)).toBe("12.345");
  });
});

describe("formatPrice", () => {
  it.each([
    ["symbol_before", "ر.ع. 6.500"],
    ["symbol_after", "6.500 ر.ع."],
    ["code_after", "6.500 OMR"],
    ["amount_only", "6.500"],
  ] as const)("renders the %s format", (format, expected) => {
    expect(formatPrice(6.5, OMR, format)).toBe(expected);
  });

  it("renders a dash for a missing amount", () => {
    expect(formatPrice(null, OMR)).toBe("—");
    expect(formatPrice(undefined, OMR)).toBe("—");
  });
});

describe("parsePriceInput", () => {
  it("accepts clean decimals", () => {
    expect(parsePriceInput("6.500")).toBe(6.5);
    expect(parsePriceInput("0")).toBe(0);
    expect(parsePriceInput("1,250.750")).toBe(1250.75);
  });

  it("rejects anything that is not a plain non-negative number", () => {
    expect(parsePriceInput("-1")).toBeNull();
    expect(parsePriceInput("abc")).toBeNull();
    expect(parsePriceInput("1.2.3")).toBeNull();
    expect(parsePriceInput("")).toBeNull();
    expect(parsePriceInput("1e5")).toBeNull();
  });

  it("clamps to the currency precision", () => {
    expect(parsePriceInput("6.5006", 3)).toBe(6.501);
    expect(parsePriceInput("6.5004", 3)).toBe(6.5);
  });
});

describe("applyDiscount", () => {
  it("applies a percentage", () => {
    expect(applyDiscount(10, "percentage", 15)).toBe(8.5);
    expect(applyDiscount(6.5, "percentage", 20)).toBe(5.2);
  });

  it("applies a fixed reduction", () => {
    expect(applyDiscount(6.5, "fixed_amount", 1)).toBe(5.5);
  });

  it("replaces the price for a promotional price", () => {
    expect(applyDiscount(6.5, "promotional_price", 4.25)).toBe(4.25);
  });

  it("never produces a negative price", () => {
    expect(applyDiscount(2, "fixed_amount", 10)).toBe(0);
    expect(applyDiscount(2, "percentage", 100)).toBe(0);
  });

  it("respects the currency precision", () => {
    expect(applyDiscount(9.999, "percentage", 33, 3)).toBe(6.699);
    expect(applyDiscount(9.99, "percentage", 33, 2)).toBe(6.69);
  });
});
