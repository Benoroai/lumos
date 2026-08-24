import { z } from "zod";

export const uuidSchema = z.string().uuid("Must be a valid identifier");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "At least 2 characters")
  .max(63, "At most 63 characters")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Use lowercase letters, numbers and single hyphens",
  );

export const codeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(63)
  .regex(
    /^[a-z0-9]+([_-][a-z0-9]+)*$/,
    "Use lowercase letters, numbers, hyphens or underscores",
  );

export const localeSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z]{2}(-[A-Za-z0-9]{2,8})?$/,
    'Must be a language code such as "en" or "ar"',
  );

export const currencySchema = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/);

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Use a 6-digit hex colour such as #1F45FF");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "At most 128 characters")
  .refine(
    (v) => /[a-z]/.test(v) && /[A-Z]/.test(v),
    "Mix upper and lower case letters",
  )
  .refine((v) => /\d/.test(v), "Include at least one number");

/** numeric(14,3) — the schema-wide money type, sized for 3-decimal currencies. */
export const priceSchema = z.coerce
  .number()
  .min(0, "Price cannot be negative")
  .max(99_999_999_999, "Price is too large")
  .refine((v) => Number.isFinite(v), "Enter a valid amount")
  .transform((v) => Number(v.toFixed(3)));

/**
 * Optional inputs arrive three ways — absent, empty string (an untouched form
 * field), or explicit null — and all three mean "no value". `.nullish()` makes
 * the key genuinely optional; a bare union containing `z.undefined()` does not,
 * which silently made every optional field required.
 */
const emptyToNull = <T>(v: T | "" | null | undefined): T | null =>
  v === "" || v === null || v === undefined ? null : v;

export const optionalPriceSchema = z
  // `z.literal('')` must come first: coercion would otherwise read '' as 0.
  .union([z.literal(""), priceSchema])
  .nullish()
  .transform(emptyToNull);

export const optionalIntSchema = (max = 100_000) =>
  z
    .union([z.literal(""), z.coerce.number().int().min(0).max(max)])
    .nullish()
    .transform(emptyToNull);

export const optionalTextSchema = (max = 2000) =>
  z
    .union([z.string().trim().max(max), z.literal("")])
    .nullish()
    .transform(emptyToNull);

export const timestampSchema = z
  .union([z.string().datetime({ offset: true }), z.string().min(1), z.date()])
  .transform((v) =>
    v instanceof Date ? v.toISOString() : new Date(v).toISOString(),
  )
  .refine(
    (v) => !Number.isNaN(new Date(v).getTime()),
    "Enter a valid date and time",
  );

export const optionalTimestampSchema = z
  .union([z.literal(""), timestampSchema])
  .nullish()
  .transform(emptyToNull);

/** Multilingual text: `{ en: "Latte", ar: "لاتيه" }`. */
export const localizedTextSchema = z
  .record(localeSchema, z.string().trim().max(2000))
  .refine((value) => Object.values(value).some((v) => v.length > 0), {
    message: "Provide the text in at least one language",
  });

export const optionalLocalizedTextSchema = z
  .record(localeSchema, z.string().trim().max(4000))
  .default({});

export const visibilityScheduleSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    start: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
    end: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .optional(),
  })
  .nullable()
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).default(25),
  search: z.string().trim().max(200).optional(),
  sort: z.string().trim().max(50).optional(),
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

/** Flattens Zod issues into the `{ field: [messages] }` shape forms expect. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
