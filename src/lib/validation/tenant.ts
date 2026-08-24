import { z } from "zod";
import {
  codeSchema,
  currencySchema,
  emailSchema,
  hexColorSchema,
  localeSchema,
  optionalTextSchema,
  passwordSchema,
  slugSchema,
  timestampSchema,
  uuidSchema,
} from "./common";

export const businessTypeSchema = z.enum([
  "restaurant",
  "cafe",
  "salon",
  "barbershop",
  "custom",
]);

export const createBusinessSchema = z
  .object({
    // Step 1 — business information
    name: z.string().trim().min(2, "Enter the business name").max(120),
    legalName: z.string().trim().max(160).default(""),
    slug: slugSchema,
    contactEmail: z.union([emailSchema, z.literal("")]).optional(),
    contactPhone: optionalTextSchema(40),
    contactWhatsapp: optionalTextSchema(40),
    websiteUrl: z
      .union([z.string().trim().url("Enter a valid URL"), z.literal("")])
      .optional(),
    addressLine: z.string().trim().max(300).default(""),
    city: z.string().trim().max(120).default(""),
    country: z
      .string()
      .trim()
      .length(2, "Use a 2-letter country code")
      .default("OM"),
    timezone: z.string().trim().min(1).default("Asia/Muscat"),

    // Step 2 — business type
    businessType: businessTypeSchema,
    templateId: uuidSchema,

    // Step 3 — plan and subscription
    planId: uuidSchema,
    subscriptionStartsAt: timestampSchema,
    subscriptionExpiresAt: timestampSchema,
    subscriptionStatus: z.enum(["trial", "active"]).default("active"),

    // Step 4 — currency and languages
    defaultCurrency: currencySchema.default("OMR"),
    defaultLocale: localeSchema.default("en"),
    supportedLocales: z
      .array(localeSchema)
      .min(1, "Select at least one language"),

    // Step 5 — first owner account
    ownerEmail: emailSchema,
    ownerFullName: z.string().trim().min(2, "Enter the owner name").max(120),
    ownerPassword: passwordSchema,
    forcePasswordChange: z.boolean().default(true),

    // Step 6 — features and limits
    featureFlags: z.record(z.string(), z.boolean()).default({}),
    internalNotes: z.string().trim().max(4000).default(""),
    seedDefaultCategories: z.boolean().default(true),
  })
  .refine(
    (v) =>
      new Date(v.subscriptionExpiresAt).getTime() >
      new Date(v.subscriptionStartsAt).getTime(),
    {
      message: "Expiry must be after the start date",
      path: ["subscriptionExpiresAt"],
    },
  )
  .refine((v) => v.supportedLocales.includes(v.defaultLocale), {
    message: "The default language must be one of the supported languages",
    path: ["defaultLocale"],
  });

export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = z.object({
  tenantId: uuidSchema,
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(160).default(""),
  contactEmail: z.union([emailSchema, z.literal("")]).optional(),
  contactPhone: optionalTextSchema(40),
  contactWhatsapp: optionalTextSchema(40),
  websiteUrl: z.union([z.string().trim().url(), z.literal("")]).optional(),
  addressLine: z.string().trim().max(300).default(""),
  city: z.string().trim().max(120).default(""),
  country: z.string().trim().length(2).default("OM"),
  timezone: z.string().trim().min(1),
  defaultLocale: localeSchema,
  supportedLocales: z.array(localeSchema).min(1),
  defaultCurrency: currencySchema,
  internalNotes: z.string().trim().max(4000).optional(),
});

export const businessLifecycleSchema = z.object({
  tenantId: uuidSchema,
  action: z.enum([
    "suspend",
    "reactivate",
    "archive",
    "soft_delete",
    "restore",
  ]),
  reason: z.string().trim().max(500).default(""),
});

export const subscriptionSchema = z
  .object({
    tenantId: uuidSchema,
    planId: uuidSchema,
    startsAt: timestampSchema,
    expiresAt: timestampSchema,
    status: z
      .enum(["trial", "active", "suspended", "cancelled"])
      .default("active"),
    autoRenew: z.boolean().default(false),
    notes: z.string().trim().max(1000).default(""),
  })
  .refine(
    (v) => new Date(v.expiresAt).getTime() > new Date(v.startsAt).getTime(),
    {
      message: "Expiry must be after the start date",
      path: ["expiresAt"],
    },
  );

export const renewSubscriptionSchema = z.object({
  tenantId: uuidSchema,
  /** Extension length. One year is the platform default. */
  durationDays: z.coerce.number().int().min(1).max(3650).default(365),
  planId: uuidSchema.optional(),
  /** Extend from today rather than from the current expiry date. */
  fromToday: z.boolean().default(false),
  notes: z.string().trim().max(1000).default(""),
});

export const brandingSchema = z.object({
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  backgroundColor: hexColorSchema,
  fontFamily: z.string().trim().min(1).max(80).default("Inter"),
  priceDisplayFormat: z
    .enum(["symbol_before", "symbol_after", "code_after", "amount_only"])
    .default("symbol_before"),
  showPrices: z.boolean().default(true),
  taxDisplay: z.enum(["inclusive", "exclusive", "hidden"]).default("inclusive"),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  taxLabel: z.string().trim().max(40).default("VAT"),
  socialLinks: z
    .object({
      instagram: z.string().trim().max(200).optional(),
      facebook: z.string().trim().max(200).optional(),
      x: z.string().trim().max(200).optional(),
      tiktok: z.string().trim().max(200).optional(),
      snapchat: z.string().trim().max(200).optional(),
      youtube: z.string().trim().max(200).optional(),
    })
    .default({}),
});

export const catalogSettingsSchema = z.object({
  enabledItemFields: z.array(z.string().trim().max(40)).max(40),
  terminologyOverrides: z
    .record(z.string(), z.record(z.string(), z.string()))
    .default({}),
  aiTranslationEnabled: z.boolean().default(true),
  requireTranslationApproval: z.boolean().default(true),
});

export const staffInviteSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  roleId: uuidSchema,
  branchIds: z.array(uuidSchema).default([]),
  temporaryPassword: passwordSchema,
  grantedPermissions: z.array(z.string()).default([]),
  revokedPermissions: z.array(z.string()).default([]),
});

export const staffUpdateSchema = z.object({
  membershipId: uuidSchema,
  roleId: uuidSchema,
  status: z.enum(["active", "disabled"]),
  branchIds: z.array(uuidSchema).default([]),
  grantedPermissions: z.array(z.string()).default([]),
  revokedPermissions: z.array(z.string()).default([]),
});

export const planSchema = z.object({
  id: uuidSchema.optional(),
  code: codeSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(""),
  priceAmount: z.coerce.number().min(0),
  priceCurrency: currencySchema.default("OMR"),
  billingPeriod: z.enum(["monthly", "yearly", "custom"]).default("yearly"),
  durationDays: z.coerce.number().int().min(1).max(3650).default(365),
  maxBranches: z.coerce.number().int().min(1).max(10_000),
  maxCategories: z.coerce.number().int().min(1).max(100_000),
  maxItems: z.coerce.number().int().min(1).max(1_000_000),
  maxUsers: z.coerce.number().int().min(1).max(10_000),
  maxLanguages: z.coerce.number().int().min(1).max(50),
  maxStorageMb: z.coerce.number().int().min(1).max(1_000_000),
  isActive: z.boolean().default(true),
});

export const platformUserSchema = z.object({
  email: emailSchema,
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["super_admin", "support", "analyst"]),
  temporaryPassword: passwordSchema,
});
