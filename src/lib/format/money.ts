/**
 * Currency formatting.
 *
 * OMR, KWD and BHD are three-decimal currencies, which is why every price in
 * the schema is numeric(14,3) and why the decimal count is data rather than a
 * hard-coded 2.
 */
export type CurrencyInfo = {
  code: string;
  symbol: string;
  decimalDigits: number;
};

export type PriceDisplayFormat =
  "symbol_before" | "symbol_after" | "code_after" | "amount_only";

export const FALLBACK_CURRENCY: CurrencyInfo = {
  code: "OMR",
  symbol: "ر.ع.",
  decimalDigits: 3,
};

export function formatAmount(
  amount: number | string | null | undefined,
  currency: CurrencyInfo = FALLBACK_CURRENCY,
  locale = "en",
): string {
  // A missing price and a price of zero are different facts, and rendering the
  // first as "0.000" would quietly tell a customer something untrue.
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: currency.decimalDigits,
    maximumFractionDigits: currency.decimalDigits,
  }).format(value);
}

export function formatPrice(
  amount: number | string | null | undefined,
  currency: CurrencyInfo = FALLBACK_CURRENCY,
  format: PriceDisplayFormat = "symbol_before",
  locale = "en",
): string {
  const formatted = formatAmount(amount, currency, locale);
  if (formatted === "—") return formatted;

  switch (format) {
    case "symbol_after":
      return `${formatted} ${currency.symbol}`;
    case "code_after":
      return `${formatted} ${currency.code}`;
    case "amount_only":
      return formatted;
    case "symbol_before":
    default:
      return `${currency.symbol} ${formatted}`;
  }
}

/**
 * Parses user input into a value safe for numeric(14,3). Returns null for
 * anything that is not a clean, non-negative decimal.
 */
export function parsePriceInput(
  input: string | number,
  decimalDigits = 3,
): number | null {
  const raw =
    typeof input === "number" ? String(input) : input.trim().replace(/,/g, "");
  if (raw === "") return null;
  if (!/^\d+(\.\d+)?$/.test(raw)) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 99_999_999_999)
    return null;
  return Number(value.toFixed(decimalDigits));
}

export function applyDiscount(
  basePrice: number,
  discountType: "percentage" | "fixed_amount" | "promotional_price",
  discountValue: number,
  decimalDigits = 3,
): number {
  let result: number;
  switch (discountType) {
    case "percentage":
      result = basePrice * (1 - discountValue / 100);
      break;
    case "fixed_amount":
      result = basePrice - discountValue;
      break;
    case "promotional_price":
      result = discountValue;
      break;
  }
  return Number(Math.max(result, 0).toFixed(decimalDigits));
}
