import { describe, expect, it } from "vitest";
import {
  addDays,
  defaultExpiryFrom,
  deriveSubscriptionStatus,
  EXPIRY_WARNING_THRESHOLDS,
} from "@/lib/subscriptions";

const NOW = new Date("2026-06-01T12:00:00.000Z");

describe("deriveSubscriptionStatus", () => {
  it("keeps an in-date subscription active", () => {
    const result = deriveSubscriptionStatus("active", addDays(NOW, 200), NOW);
    expect(result.status).toBe("active");
    expect(result.isLive).toBe(true);
    expect(result.warningThreshold).toBeNull();
  });

  it("reports expired once the date passes", () => {
    const result = deriveSubscriptionStatus("active", addDays(NOW, -1), NOW);
    expect(result.status).toBe("expired");
    expect(result.isLive).toBe(false);
  });

  it.each(EXPIRY_WARNING_THRESHOLDS)(
    "raises the %i-day warning",
    (threshold) => {
      const result = deriveSubscriptionStatus(
        "active",
        addDays(NOW, threshold),
        NOW,
      );
      expect(result.status).toBe("expiring_soon");
      expect(result.warningThreshold).toBe(threshold);
      expect(result.isLive).toBe(true);
    },
  );

  it("picks the tightest threshold that applies", () => {
    expect(
      deriveSubscriptionStatus("active", addDays(NOW, 5), NOW).warningThreshold,
    ).toBe(7);
    expect(
      deriveSubscriptionStatus("active", addDays(NOW, 25), NOW)
        .warningThreshold,
    ).toBe(30);
  });

  it("lets suspension and cancellation outrank the calendar", () => {
    expect(
      deriveSubscriptionStatus("suspended", addDays(NOW, 300), NOW).status,
    ).toBe("suspended");
    expect(
      deriveSubscriptionStatus("suspended", addDays(NOW, 300), NOW).isLive,
    ).toBe(false);
    expect(
      deriveSubscriptionStatus("cancelled", addDays(NOW, 300), NOW).status,
    ).toBe("cancelled");
  });

  it("treats the exact expiry moment as expired", () => {
    const result = deriveSubscriptionStatus("active", NOW, NOW);
    expect(result.status).toBe("expired");
    expect(result.isLive).toBe(false);
  });

  it("counts days remaining inclusively", () => {
    expect(
      deriveSubscriptionStatus("active", addDays(NOW, 30), NOW).daysRemaining,
    ).toBe(30);
    expect(
      deriveSubscriptionStatus("active", addDays(NOW, -5), NOW).daysRemaining,
    ).toBe(-5);
  });
});

describe("defaultExpiryFrom", () => {
  it("defaults a new subscription to exactly one year", () => {
    const expiry = defaultExpiryFrom(NOW);
    expect(expiry.toISOString()).toBe("2027-06-01T12:00:00.000Z");
  });

  it("honours a custom plan duration", () => {
    expect(defaultExpiryFrom(NOW, 30).toISOString()).toBe(
      "2026-07-01T12:00:00.000Z",
    );
  });
});
