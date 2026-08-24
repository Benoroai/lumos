import { z } from "zod";

/**
 * Request validation for the public API. Everything the separate customer
 * frontend can influence is parsed here before it reaches a query.
 */

export const localeParamSchema = z
  .string()
  .trim()
  .max(20)
  .regex(/^[A-Za-z]{2}(-[A-Za-z0-9]{2,8})?$/, "Invalid locale")
  .transform((v) => v.toLowerCase());

export const slugParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Invalid slug");

export const publicIdParamSchema = z.string().trim().uuid("Invalid identifier");

export const menuQuerySchema = z.object({
  locale: localeParamSchema.optional(),
  categorySlug: slugParamSchema.optional(),
  includeInactive: z.literal("false").optional(),
  search: z.string().trim().max(120).optional(),
});

export const listQuerySchema = z.object({
  locale: localeParamSchema.optional(),
  branch: slugParamSchema.optional(),
});

export const ANALYTICS_EVENT_TYPES = [
  "menu_view",
  "category_view",
  "item_view",
  "search",
  "language_change",
  "offer_view",
  "branch_view",
] as const;

export const analyticsEventSchema = z
  .object({
    businessSlug: slugParamSchema,
    type: z.enum(ANALYTICS_EVENT_TYPES),
    branchSlug: slugParamSchema.optional(),
    categoryId: publicIdParamSchema.optional(),
    itemId: publicIdParamSchema.optional(),
    offerId: publicIdParamSchema.optional(),
    locale: localeParamSchema.optional(),
    searchQuery: z.string().trim().max(200).optional(),
    searchResultsCount: z.coerce.number().int().min(0).max(100_000).optional(),
    deviceType: z.enum(["mobile", "tablet", "desktop", "unknown"]).optional(),
    /**
     * Opaque, client-generated identifier used only to count unique sessions.
     * It is re-hashed server-side with a daily salt, so it cannot be correlated
     * across days or across businesses.
     */
    sessionId: z.string().trim().max(64).optional(),
  })
  .refine((v) => v.type !== "search" || (v.searchQuery ?? "").length > 0, {
    message: "A search event must include the query",
    path: ["searchQuery"],
  });

export const analyticsBatchSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50),
});

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;
