import { z } from "zod";
import {
  codeSchema,
  localizedTextSchema,
  optionalIntSchema,
  optionalLocalizedTextSchema,
  optionalPriceSchema,
  optionalTextSchema,
  optionalTimestampSchema,
  priceSchema,
  slugSchema,
  timestampSchema,
  uuidSchema,
  visibilityScheduleSchema,
} from "./common";

// -----------------------------------------------------------------------------
// Branches
// -----------------------------------------------------------------------------
export const openingHoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      closed: z.boolean().default(false),
      open: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default("09:00"),
      close: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .default("22:00"),
    }),
  )
  .max(7)
  .default([]);

export const branchSchema = z.object({
  id: uuidSchema.optional(),
  name: z.string().trim().min(2, "Enter the branch name").max(120),
  slug: slugSchema,
  addressLine: z.string().trim().max(300).default(""),
  city: z.string().trim().max(120).default(""),
  country: z.string().trim().length(2).default("OM"),
  phone: optionalTextSchema(40),
  whatsapp: optionalTextSchema(40),
  email: optionalTextSchema(160),
  latitude: z
    .union([z.literal(""), z.coerce.number().min(-90).max(90)])
    .nullish()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  longitude: z
    .union([z.literal(""), z.coerce.number().min(-180).max(180)])
    .nullish()
    .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
  timezone: z.string().trim().min(1).default("Asia/Muscat"),
  openingHours: openingHoursSchema,
  qrTargetUrl: z.union([z.string().trim().url(), z.literal("")]).nullish(),
  allowBranchPrices: z.boolean().default(false),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type BranchInput = z.infer<typeof branchSchema>;

// -----------------------------------------------------------------------------
// Categories
// -----------------------------------------------------------------------------
export const categorySchema = z.object({
  id: uuidSchema.optional(),
  slug: slugSchema,
  parentId: z
    .union([uuidSchema, z.literal("")])
    .nullish()
    .transform((v) => v || null),
  name: localizedTextSchema,
  description: optionalLocalizedTextSchema,
  imagePath: optionalTextSchema(400),
  imageUrl: optionalTextSchema(800),
  icon: optionalTextSchema(60),
  color: optionalTextSchema(20),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(100_000).default(0),
  /** Empty = visible at every branch. */
  branchIds: z.array(uuidSchema).default([]),
  visibleFrom: optionalTimestampSchema,
  visibleUntil: optionalTimestampSchema,
  visibilitySchedule: visibilityScheduleSchema,
});

export type CategoryInput = z.infer<typeof categorySchema>;

export const reorderSchema = z.object({
  /** Full ordered list of ids; positions are rewritten from the array index. */
  orderedIds: z.array(uuidSchema).min(1).max(2000),
  parentId: z.union([uuidSchema, z.null()]).optional(),
});

// -----------------------------------------------------------------------------
// Items
// -----------------------------------------------------------------------------
export const DIETARY_TAGS = [
  "vegetarian",
  "vegan",
  "gluten_free",
  "dairy_free",
  "nut_free",
  "halal",
  "organic",
  "keto",
  "low_calorie",
  "spicy",
  "chef_special",
] as const;

export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;

export const itemSchema = z
  .object({
    id: uuidSchema.optional(),
    categoryId: z
      .union([uuidSchema, z.literal("")])
      .nullish()
      .transform((v) => v || null),
    sku: optionalTextSchema(60),
    name: localizedTextSchema,
    description: optionalLocalizedTextSchema,
    ingredients: optionalLocalizedTextSchema,

    basePrice: priceSchema,
    salePrice: optionalPriceSchema,
    currency: z
      .union([z.string().trim().length(3), z.literal("")])
      .nullish()
      .transform((v) => v || null),

    imagePath: optionalTextSchema(400),
    imageUrl: optionalTextSchema(800),
    gallery: z
      .array(
        z.object({
          path: z.string().trim().max(400),
          url: z.string().trim().max(800),
          alt: z.string().trim().max(200).default(""),
        }),
      )
      .max(12)
      .default([]),

    isActive: z.boolean().default(true),
    inStock: z.boolean().default(true),
    outOfStockUntil: optionalTimestampSchema,
    outOfStockReason: optionalTextSchema(200),
    isFeatured: z.boolean().default(false),
    isNew: z.boolean().default(false),
    isPopular: z.boolean().default(false),
    displayOrder: z.coerce.number().int().min(0).max(100_000).default(0),

    dietaryTags: z.array(z.string().trim().max(40)).max(20).default([]),
    allergens: z.array(z.string().trim().max(40)).max(20).default([]),
    spiceLevel: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(5)])
      .nullish()
      .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
    calories: optionalIntSchema(20_000),
    preparationTimeMinutes: optionalIntSchema(1440),
    serviceDurationMinutes: optionalIntSchema(1440),
    customAttributes: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .default({}),

    visibleFrom: optionalTimestampSchema,
    visibleUntil: optionalTimestampSchema,
    visibilitySchedule: visibilityScheduleSchema,

    modifierGroupIds: z.array(uuidSchema).default([]),
    branchSettings: z
      .array(
        z.object({
          branchId: uuidSchema,
          isAvailable: z.boolean().default(true),
          inStock: z.boolean().default(true),
          priceOverride: optionalPriceSchema,
          salePriceOverride: optionalPriceSchema,
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((v) => v.salePrice === null || v.salePrice <= v.basePrice, {
    message: "Sale price must not exceed the base price",
    path: ["salePrice"],
  });

export type ItemInput = z.infer<typeof itemSchema>;

export const bulkItemActionSchema = z
  .object({
    itemIds: z.array(uuidSchema).min(1, "Select at least one item").max(500),
    action: z.enum([
      "activate",
      "deactivate",
      "mark_in_stock",
      "mark_out_of_stock",
      "move_category",
      "delete",
    ]),
    targetCategoryId: z.union([uuidSchema, z.null()]).optional(),
  })
  .refine(
    (v) => v.action !== "move_category" || v.targetCategoryId !== undefined,
    {
      message: "Choose the destination category",
      path: ["targetCategoryId"],
    },
  );

export const stockToggleSchema = z.object({
  itemId: uuidSchema,
  inStock: z.boolean(),
  /** "86 until" — a temporary stock-out that clears itself. */
  until: optionalTimestampSchema,
  reason: optionalTextSchema(200),
  branchId: uuidSchema.nullish(),
});

// -----------------------------------------------------------------------------
// Modifiers
// -----------------------------------------------------------------------------
export const modifierGroupSchema = z
  .object({
    id: uuidSchema.optional(),
    code: codeSchema,
    name: localizedTextSchema,
    description: optionalLocalizedTextSchema,
    selectionType: z.enum(["single", "multiple"]).default("single"),
    isRequired: z.boolean().default(false),
    minSelections: z.coerce.number().int().min(0).max(50).default(0),
    maxSelections: z
      .union([z.literal(""), z.coerce.number().int().min(1).max(50)])
      .nullish()
      .transform((v) => (v === "" || v === null || v === undefined ? null : v)),
    displayOrder: z.coerce.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    modifiers: z
      .array(
        z.object({
          id: uuidSchema.optional(),
          code: codeSchema,
          name: localizedTextSchema,
          priceAdjustment: z.coerce
            .number()
            .min(-99_999)
            .max(99_999)
            .transform((v) => Number(v.toFixed(3))),
          isDefault: z.boolean().default(false),
          isActive: z.boolean().default(true),
          inStock: z.boolean().default(true),
          displayOrder: z.coerce.number().int().min(0).default(0),
        }),
      )
      .max(100)
      .default([]),
  })
  .refine(
    (v) => v.maxSelections === null || v.maxSelections >= v.minSelections,
    {
      message: "Maximum must be at least the minimum",
      path: ["maxSelections"],
    },
  )
  .refine((v) => !v.isRequired || v.minSelections >= 1, {
    message: "A required group needs a minimum of at least 1",
    path: ["minSelections"],
  });

export type ModifierGroupInput = z.infer<typeof modifierGroupSchema>;

// -----------------------------------------------------------------------------
// Offers
// -----------------------------------------------------------------------------
export const offerSchema = z
  .object({
    id: uuidSchema.optional(),
    code: codeSchema,
    name: localizedTextSchema,
    description: optionalLocalizedTextSchema,
    discountType: z.enum(["percentage", "fixed_amount", "promotional_price"]),
    discountValue: z.coerce
      .number()
      .min(0)
      .max(99_999)
      .transform((v) => Number(v.toFixed(3))),
    imagePath: optionalTextSchema(400),
    imageUrl: optionalTextSchema(800),
    startsAt: timestampSchema,
    endsAt: optionalTimestampSchema,
    isActive: z.boolean().default(true),
    displayOrder: z.coerce.number().int().min(0).default(0),
    targetType: z
      .enum(["all_items", "items", "categories"])
      .default("all_items"),
    itemIds: z.array(uuidSchema).max(500).default([]),
    categoryIds: z.array(uuidSchema).max(200).default([]),
    /** Empty = every branch. */
    branchIds: z.array(uuidSchema).max(200).default([]),
  })
  .refine((v) => v.discountType !== "percentage" || v.discountValue <= 100, {
    message: "A percentage discount cannot exceed 100",
    path: ["discountValue"],
  })
  .refine(
    (v) =>
      !v.endsAt ||
      new Date(v.endsAt).getTime() > new Date(v.startsAt).getTime(),
    {
      message: "The end date must be after the start date",
      path: ["endsAt"],
    },
  )
  .refine((v) => v.targetType !== "items" || v.itemIds.length > 0, {
    message: "Select at least one item",
    path: ["itemIds"],
  })
  .refine((v) => v.targetType !== "categories" || v.categoryIds.length > 0, {
    message: "Select at least one category",
    path: ["categoryIds"],
  });

export type OfferInput = z.infer<typeof offerSchema>;

// -----------------------------------------------------------------------------
// Translations
// -----------------------------------------------------------------------------
export const translationEntitySchema = z.enum([
  "item",
  "category",
  "modifier_group",
  "modifier",
  "offer",
]);

export const saveTranslationSchema = z.object({
  entityType: translationEntitySchema,
  entityId: uuidSchema,
  locale: z.string().trim().min(2).max(10),
  name: z.string().trim().max(300).default(""),
  description: z.string().trim().max(4000).default(""),
  ingredients: z.string().trim().max(4000).default(""),
  status: z
    .enum(["draft", "ai_generated", "reviewed", "approved"])
    .default("draft"),
});

export const aiTranslateSchema = z.object({
  entityType: translationEntitySchema,
  entityIds: z.array(uuidSchema).min(1).max(100),
  sourceLocale: z.string().trim().min(2).max(10),
  targetLocales: z.array(z.string().trim().min(2).max(10)).min(1).max(10),
  /** Approved translations are never replaced unless this is explicitly set. */
  overwriteApproved: z.boolean().default(false),
});

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/svg+xml",
] as const;

export const mediaUploadSchema = z.object({
  kind: z
    .enum(["image", "logo", "icon", "gallery", "document"])
    .default("image"),
  altText: z.string().trim().max(300).default(""),
});

export const mediaUpdateSchema = z.object({
  mediaId: uuidSchema,
  altText: z.string().trim().max(300).default(""),
});
