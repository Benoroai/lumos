/**
 * Development seed.
 *
 * Creates one Platform Super Admin and four fully-populated businesses that
 * exercise every axis of the model: different business types, different
 * languages, multiple branches, branch-specific prices, live and scheduled
 * offers, and subscriptions in several states (active, expiring, expired).
 *
 * Every credential printed here is DEVELOPMENT ONLY.
 *
 *   npm run db:seed
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ path: ".env", quiet: true });

const SUPABASE_URL = required("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = required("SUPABASE_SERVICE_ROLE_KEY");

const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEV_PASSWORD = "DevPassword!2026";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Copy .env.example to .env.local and fill it in.`,
    );
    process.exit(1);
  }
  return value;
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function ensureUser(
  email: string,
  fullName: string,
  password = DEV_PASSWORD,
): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = list?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user)
    throw new Error(`Could not create ${email}: ${error?.message}`);
  return data.user.id;
}

type TenantSpec = {
  slug: string;
  name: string;
  legalName: string;
  templateCode: string;
  planCode: string;
  locales: string[];
  defaultLocale: string;
  currency: string;
  /** Days until the subscription expires; negative means already expired. */
  expiresInDays: number;
  subscriptionStatus: "active" | "trial";
  city: string;
  branches: {
    slug: string;
    name: string;
    city: string;
    allowBranchPrices?: boolean;
  }[];
  owner: { email: string; name: string };
  staff: { email: string; name: string; roleCode: string }[];
  categories: {
    slug: string;
    names: Record<string, string>;
    items: {
      sku: string;
      names: Record<string, string>;
      descriptions?: Record<string, string>;
      price: number;
      salePrice?: number;
      inStock?: boolean;
      featured?: boolean;
      isNew?: boolean;
      popular?: boolean;
      dietaryTags?: string[];
      allergens?: string[];
      calories?: number;
      prepMinutes?: number;
      serviceMinutes?: number;
      spiceLevel?: number;
    }[];
  }[];
  modifierGroups: {
    code: string;
    names: Record<string, string>;
    selectionType: "single" | "multiple";
    required: boolean;
    options: {
      code: string;
      names: Record<string, string>;
      price: number;
      isDefault?: boolean;
    }[];
  }[];
  offers: {
    code: string;
    names: Record<string, string>;
    type: "percentage" | "fixed_amount" | "promotional_price";
    value: number;
    startsInDays: number;
    endsInDays: number | null;
  }[];
};

const TENANTS: TenantSpec[] = [
  {
    slug: "bait-al-mandi",
    name: "Bait Al Mandi",
    legalName: "Bait Al Mandi Restaurants LLC",
    templateCode: "restaurant",
    planCode: "growth",
    locales: ["en", "ar", "fa"],
    defaultLocale: "en",
    currency: "OMR",
    expiresInDays: 300,
    subscriptionStatus: "active",
    city: "Muscat",
    branches: [
      {
        slug: "main",
        name: "Bait Al Mandi — Qurum",
        city: "Muscat",
        allowBranchPrices: true,
      },
      { slug: "seeb", name: "Bait Al Mandi — Seeb", city: "Seeb" },
      { slug: "sohar", name: "Bait Al Mandi — Sohar", city: "Sohar" },
    ],
    owner: { email: "owner@baitalmandi.dev", name: "Salim Al Harthy" },
    staff: [
      {
        email: "menu@baitalmandi.dev",
        name: "Aisha Al Balushi",
        roleCode: "menu_manager",
      },
      {
        email: "floor@baitalmandi.dev",
        name: "Yusuf Al Rashdi",
        roleCode: "branch_manager",
      },
      {
        email: "viewer@baitalmandi.dev",
        name: "Nasser Al Kindi",
        roleCode: "viewer",
      },
    ],
    categories: [
      {
        slug: "starters",
        names: { en: "Starters", ar: "المقبلات", fa: "پیش‌غذا" },
        items: [
          {
            sku: "ST-001",
            names: { en: "Hummus", ar: "حمص", fa: "حمص" },
            descriptions: {
              en: "Chickpeas whipped with tahini, lemon and olive oil.",
              ar: "حمص مخفوق مع الطحينة والليمون وزيت الزيتون.",
            },
            price: 1.8,
            dietaryTags: ["vegetarian", "vegan"],
            allergens: ["sesame"],
            calories: 220,
            prepMinutes: 5,
          },
          {
            sku: "ST-002",
            names: { en: "Fattoush", ar: "فتوش", fa: "فتوش" },
            price: 2.1,
            dietaryTags: ["vegetarian"],
            allergens: ["gluten"],
            calories: 180,
            isNew: true,
          },
        ],
      },
      {
        slug: "main-courses",
        names: { en: "Main Courses", ar: "الأطباق الرئيسية", fa: "غذای اصلی" },
        items: [
          {
            sku: "MC-001",
            names: { en: "Lamb Mandi", ar: "مندي لحم", fa: "مندی گوشت" },
            descriptions: {
              en: "Slow-cooked lamb over smoked basmati rice.",
              ar: "لحم مطهو ببطء فوق أرز بسمتي مدخن.",
              fa: "گوشت بره با برنج باسماتی دودی.",
            },
            price: 6.5,
            salePrice: 5.75,
            featured: true,
            popular: true,
            calories: 890,
            prepMinutes: 35,
            allergens: ["nuts"],
          },
          {
            sku: "MC-002",
            names: { en: "Chicken Mandi", ar: "مندي دجاج", fa: "مندی مرغ" },
            price: 4.25,
            popular: true,
            calories: 720,
            prepMinutes: 30,
          },
          {
            sku: "MC-003",
            names: {
              en: "Grilled Hammour",
              ar: "هامور مشوي",
              fa: "ماهی هامور کبابی",
            },
            price: 7.9,
            inStock: false,
            allergens: ["fish"],
            prepMinutes: 25,
          },
        ],
      },
      {
        slug: "desserts",
        names: { en: "Desserts", ar: "الحلويات", fa: "دسر" },
        items: [
          {
            sku: "DS-001",
            names: { en: "Omani Halwa", ar: "حلوى عمانية", fa: "حلوای عمانی" },
            price: 1.5,
            dietaryTags: ["vegetarian"],
            allergens: ["nuts"],
            calories: 310,
          },
        ],
      },
      {
        slug: "beverages",
        names: { en: "Beverages", ar: "المشروبات", fa: "نوشیدنی‌ها" },
        items: [
          {
            sku: "BV-001",
            names: { en: "Karak Tea", ar: "شاي كرك", fa: "چای کرک" },
            price: 0.4,
            popular: true,
          },
          {
            sku: "BV-002",
            names: {
              en: "Fresh Lemon Mint",
              ar: "ليمون بالنعناع",
              fa: "لیموناد نعنا",
            },
            price: 1.2,
            dietaryTags: ["vegan"],
          },
        ],
      },
    ],
    modifierGroups: [
      {
        code: "portion-size",
        names: { en: "Portion size", ar: "حجم الوجبة", fa: "اندازه پرس" },
        selectionType: "single",
        required: true,
        options: [
          {
            code: "half",
            names: { en: "Half", ar: "نصف", fa: "نیم" },
            price: -1.5,
          },
          {
            code: "full",
            names: { en: "Full", ar: "كامل", fa: "کامل" },
            price: 0,
            isDefault: true,
          },
          {
            code: "family",
            names: { en: "Family", ar: "عائلي", fa: "خانوادگی" },
            price: 4.0,
          },
        ],
      },
      {
        code: "extras",
        names: { en: "Extras", ar: "إضافات", fa: "اضافات" },
        selectionType: "multiple",
        required: false,
        options: [
          {
            code: "extra-rice",
            names: { en: "Extra rice", ar: "أرز إضافي", fa: "برنج اضافه" },
            price: 0.75,
          },
          {
            code: "salad",
            names: { en: "Side salad", ar: "سلطة جانبية", fa: "سالاد" },
            price: 0.9,
          },
          {
            code: "sauce",
            names: { en: "Chilli sauce", ar: "صلصة حارة", fa: "سس تند" },
            price: 0.25,
          },
        ],
      },
    ],
    offers: [
      {
        code: "family-friday",
        names: { en: "Family Friday", ar: "جمعة العائلة", fa: "جمعه خانوادگی" },
        type: "percentage",
        value: 15,
        startsInDays: -7,
        endsInDays: 30,
      },
      {
        code: "ramadan-special",
        names: { en: "Ramadan Special", ar: "عرض رمضان", fa: "ویژه رمضان" },
        type: "fixed_amount",
        value: 1.0,
        startsInDays: 20,
        endsInDays: 50,
      },
      {
        code: "launch-week",
        names: { en: "Launch Week", ar: "أسبوع الافتتاح" },
        type: "percentage",
        value: 25,
        startsInDays: -90,
        endsInDays: -60,
      },
    ],
  },
  {
    slug: "noor-cafe",
    name: "Noor Café",
    legalName: "Noor Coffee Roasters",
    templateCode: "cafe",
    planCode: "starter",
    locales: ["en", "ar"],
    defaultLocale: "en",
    currency: "OMR",
    expiresInDays: 12,
    subscriptionStatus: "active",
    city: "Muscat",
    branches: [{ slug: "main", name: "Noor Café — Al Mouj", city: "Muscat" }],
    owner: { email: "owner@noorcafe.dev", name: "Layla Al Zadjali" },
    staff: [
      {
        email: "content@noorcafe.dev",
        name: "Omar Said",
        roleCode: "content_editor",
      },
    ],
    categories: [
      {
        slug: "hot-coffee",
        names: { en: "Hot Coffee", ar: "قهوة ساخنة" },
        items: [
          {
            sku: "HC-01",
            names: { en: "Flat White", ar: "فلات وايت" },
            descriptions: { en: "Double ristretto with silky steamed milk." },
            price: 1.7,
            popular: true,
            allergens: ["milk"],
            calories: 120,
            prepMinutes: 3,
          },
          {
            sku: "HC-02",
            names: { en: "Arabic Coffee", ar: "قهوة عربية" },
            price: 1.2,
            featured: true,
            calories: 15,
          },
        ],
      },
      {
        slug: "iced-coffee",
        names: { en: "Iced Coffee", ar: "قهوة مثلجة" },
        items: [
          {
            sku: "IC-01",
            names: { en: "Iced Spanish Latte", ar: "سبانيش لاتيه مثلج" },
            price: 2.0,
            salePrice: 1.6,
            popular: true,
            allergens: ["milk"],
          },
        ],
      },
      {
        slug: "bakery",
        names: { en: "Bakery", ar: "المخبوزات" },
        items: [
          {
            sku: "BK-01",
            names: { en: "Butter Croissant", ar: "كرواسون بالزبدة" },
            price: 1.1,
            allergens: ["gluten", "milk", "eggs"],
            calories: 340,
          },
          {
            sku: "BK-02",
            names: { en: "Date Cake", ar: "كيك التمر" },
            price: 1.4,
            inStock: false,
            dietaryTags: ["vegetarian"],
          },
        ],
      },
    ],
    modifierGroups: [
      {
        code: "size",
        names: { en: "Size", ar: "الحجم" },
        selectionType: "single",
        required: true,
        options: [
          {
            code: "small",
            names: { en: "Small", ar: "صغير" },
            price: 0,
            isDefault: true,
          },
          { code: "medium", names: { en: "Medium", ar: "وسط" }, price: 0.3 },
          { code: "large", names: { en: "Large", ar: "كبير" }, price: 0.6 },
        ],
      },
      {
        code: "milk",
        names: { en: "Milk choice", ar: "نوع الحليب" },
        selectionType: "single",
        required: false,
        options: [
          {
            code: "whole",
            names: { en: "Whole", ar: "كامل الدسم" },
            price: 0,
            isDefault: true,
          },
          { code: "oat", names: { en: "Oat", ar: "شوفان" }, price: 0.25 },
          { code: "almond", names: { en: "Almond", ar: "لوز" }, price: 0.25 },
        ],
      },
    ],
    offers: [
      {
        code: "morning-rush",
        names: { en: "Morning Rush", ar: "عرض الصباح" },
        type: "percentage",
        value: 10,
        startsInDays: -3,
        endsInDays: 14,
      },
    ],
  },
  {
    slug: "glow-salon",
    name: "Glow Beauty Salon",
    legalName: "Glow Beauty Salon SPC",
    templateCode: "salon",
    planCode: "starter",
    locales: ["en", "ar", "fa"],
    defaultLocale: "ar",
    currency: "OMR",
    expiresInDays: 180,
    subscriptionStatus: "active",
    city: "Muscat",
    branches: [
      { slug: "main", name: "Glow — Shatti Al Qurum", city: "Muscat" },
      { slug: "azaiba", name: "Glow — Azaiba", city: "Muscat" },
    ],
    owner: { email: "owner@glowsalon.dev", name: "Mariam Al Lawati" },
    staff: [
      {
        email: "reception@glowsalon.dev",
        name: "Huda Nasser",
        roleCode: "branch_manager",
      },
    ],
    categories: [
      {
        slug: "hair",
        names: { en: "Hair", ar: "الشعر", fa: "مو" },
        items: [
          {
            sku: "HR-01",
            names: {
              en: "Cut and Blow Dry",
              ar: "قص وتصفيف",
              fa: "کوتاهی و سشوار",
            },
            descriptions: {
              ar: "قص احترافي مع غسيل وتصفيف كامل.",
              en: "Professional cut with a wash and full blow dry.",
            },
            price: 12.0,
            serviceMinutes: 60,
            featured: true,
          },
          {
            sku: "HR-02",
            names: { en: "Full Colour", ar: "صبغة كاملة", fa: "رنگ کامل" },
            price: 35.0,
            salePrice: 29.5,
            serviceMinutes: 150,
          },
          {
            sku: "HR-03",
            names: {
              en: "Keratin Treatment",
              ar: "علاج الكيراتين",
              fa: "کراتینه",
            },
            price: 60.0,
            serviceMinutes: 180,
            inStock: false,
          },
        ],
      },
      {
        slug: "nails",
        names: { en: "Nails", ar: "الأظافر", fa: "ناخن" },
        items: [
          {
            sku: "NL-01",
            names: {
              en: "Classic Manicure",
              ar: "مانيكير كلاسيكي",
              fa: "مانیکور کلاسیک",
            },
            price: 6.5,
            serviceMinutes: 45,
            popular: true,
          },
          {
            sku: "NL-02",
            names: {
              en: "Gel Extensions",
              ar: "تركيب أظافر جل",
              fa: "کاشت ناخن ژل",
            },
            price: 18.0,
            serviceMinutes: 90,
            isNew: true,
          },
        ],
      },
      {
        slug: "skincare",
        names: { en: "Skincare", ar: "العناية بالبشرة", fa: "مراقبت پوست" },
        items: [
          {
            sku: "SK-01",
            names: {
              en: "Hydrating Facial",
              ar: "تنظيف بشرة مرطب",
              fa: "فیشیال آبرسان",
            },
            price: 22.0,
            serviceMinutes: 60,
          },
        ],
      },
    ],
    modifierGroups: [
      {
        code: "hair-length",
        names: { en: "Hair length", ar: "طول الشعر", fa: "طول مو" },
        selectionType: "single",
        required: false,
        options: [
          {
            code: "short",
            names: { en: "Short", ar: "قصير", fa: "کوتاه" },
            price: 0,
            isDefault: true,
          },
          {
            code: "medium",
            names: { en: "Medium", ar: "متوسط", fa: "متوسط" },
            price: 3.0,
          },
          {
            code: "long",
            names: { en: "Long", ar: "طويل", fa: "بلند" },
            price: 6.0,
          },
        ],
      },
    ],
    offers: [
      {
        code: "midweek-glow",
        names: {
          en: "Midweek Glow",
          ar: "عرض منتصف الأسبوع",
          fa: "تخفیف وسط هفته",
        },
        type: "percentage",
        value: 20,
        startsInDays: -1,
        endsInDays: 60,
      },
    ],
  },
  {
    slug: "crown-barbers",
    name: "Crown Barbers",
    legalName: "Crown Barbershop",
    templateCode: "barbershop",
    planCode: "trial",
    locales: ["en", "ar"],
    defaultLocale: "en",
    currency: "OMR",
    // Deliberately expired so the expired-subscription behaviour is visible.
    expiresInDays: -5,
    subscriptionStatus: "active",
    city: "Salalah",
    branches: [
      { slug: "main", name: "Crown Barbers — Salalah", city: "Salalah" },
    ],
    owner: { email: "owner@crownbarbers.dev", name: "Khalid Al Mashani" },
    staff: [],
    categories: [
      {
        slug: "haircuts",
        names: { en: "Haircuts", ar: "قص الشعر" },
        items: [
          {
            sku: "CB-01",
            names: { en: "Classic Cut", ar: "قصة كلاسيكية" },
            price: 3.5,
            serviceMinutes: 30,
            popular: true,
          },
          {
            sku: "CB-02",
            names: { en: "Skin Fade", ar: "تدرج ناعم" },
            price: 5.0,
            serviceMinutes: 45,
            featured: true,
          },
        ],
      },
      {
        slug: "beard",
        names: { en: "Beard", ar: "اللحية" },
        items: [
          {
            sku: "CB-03",
            names: { en: "Beard Trim", ar: "تهذيب اللحية" },
            price: 2.0,
            serviceMinutes: 20,
          },
          {
            sku: "CB-04",
            names: { en: "Hot Towel Shave", ar: "حلاقة بالمنشفة الساخنة" },
            price: 4.0,
            serviceMinutes: 30,
            isNew: true,
          },
        ],
      },
    ],
    modifierGroups: [],
    offers: [],
  },
];

async function main() {
  console.log("Seeding development data…\n");

  const [
    { data: templates },
    { data: plans },
    { data: roles },
    { data: flags },
  ] = await Promise.all([
    admin
      .from("business_templates")
      .select("id, code, enabled_item_fields, default_feature_flags"),
    admin.from("plans").select("id, code"),
    admin.from("roles").select("id, code").is("tenant_id", null),
    admin.from("feature_flags").select("key, default_enabled"),
  ]);

  if (!templates?.length || !plans?.length || !roles?.length) {
    throw new Error(
      "Reference data is missing. Run `npm run db:migrate` first.",
    );
  }

  const templateByCode = new Map(templates.map((t) => [t.code, t]));
  const planByCode = new Map(plans.map((p) => [p.code, p.id]));
  const roleByCode = new Map(roles.map((r) => [r.code, r.id]));

  // ---- Platform Super Admin -------------------------------------------------
  const adminEmail =
    process.env.PLATFORM_SUPER_ADMIN_EMAIL ?? "admin@lumos.local";
  const adminName =
    process.env.PLATFORM_SUPER_ADMIN_NAME ?? "Platform Super Admin";

  // The bootstrap password is honoured when supplied. Without this the
  // documented production bootstrap would silently create the first Super Admin
  // with the shared development password.
  const adminPassword =
    process.env.PLATFORM_SUPER_ADMIN_PASSWORD?.trim() || DEV_PASSWORD;
  if (adminPassword === DEV_PASSWORD) {
    console.warn(
      "  ! PLATFORM_SUPER_ADMIN_PASSWORD is not set — the Super Admin will use the shared\n" +
        "    development password. Set it before seeding anything but a local database.\n",
    );
  }

  const adminUserId = await ensureUser(adminEmail, adminName, adminPassword);

  await admin.from("platform_users").upsert(
    {
      user_id: adminUserId,
      email: adminEmail.toLowerCase(),
      full_name: adminName,
      role: "super_admin",
      is_active: true,
      must_change_password: false,
    },
    { onConflict: "user_id" },
  );
  console.log(`  platform super admin: ${adminEmail}`);

  const supportEmail = "support@lumos.local";
  const supportUserId = await ensureUser(supportEmail, "Platform Support");
  await admin.from("platform_users").upsert(
    {
      user_id: supportUserId,
      email: supportEmail,
      full_name: "Platform Support",
      role: "support",
      is_active: true,
      must_change_password: false,
    },
    { onConflict: "user_id" },
  );
  console.log(`  platform support:     ${supportEmail}\n`);

  // ---- Businesses -----------------------------------------------------------
  for (const spec of TENANTS) {
    const template = templateByCode.get(spec.templateCode);
    const planId = planByCode.get(spec.planCode);
    if (!template || !planId)
      throw new Error(`Missing template or plan for ${spec.slug}`);

    await admin.from("tenants").delete().eq("slug", spec.slug);

    const { data: tenant, error } = await admin
      .from("tenants")
      .insert({
        slug: spec.slug,
        name: spec.name,
        legal_name: spec.legalName,
        business_type:
          template.code === "cafe" ? "cafe" : (template.code as string),
        template_id: template.id,
        contact_email: spec.owner.email,
        contact_phone: "+968 2400 0000",
        contact_whatsapp: "+968 9400 0000",
        address_line: "Way 2817, Building 12",
        city: spec.city,
        country: "OM",
        timezone: "Asia/Muscat",
        default_locale: spec.defaultLocale,
        supported_locales: spec.locales,
        default_currency: spec.currency,
        registered_at: daysFromNow(-Math.abs(spec.expiresInDays) - 30),
        account_status: "active",
        internal_notes: `Development seed data. Plan: ${spec.planCode}.`,
        created_by: adminUserId,
      })
      .select("id")
      .single();

    if (error || !tenant)
      throw new Error(`Could not create ${spec.slug}: ${error?.message}`);

    const tenantId = tenant.id;

    await admin.from("subscriptions").insert({
      tenant_id: tenantId,
      plan_id: planId,
      status: spec.subscriptionStatus,
      starts_at: daysFromNow(spec.expiresInDays - 365),
      expires_at: daysFromNow(spec.expiresInDays),
      is_current: true,
      created_by: adminUserId,
    });

    await admin.from("business_settings").insert({
      tenant_id: tenantId,
      enabled_item_fields: template.enabled_item_fields,
      primary_color: spec.templateCode === "salon" ? "#E2D6FF" : "#1F45FF",
      accent_color: "#D7FF2F",
    });

    const templateFlags = (template.default_feature_flags ?? {}) as Record<
      string,
      boolean
    >;
    await admin.from("tenant_feature_flags").insert(
      (flags ?? []).map((flag) => ({
        tenant_id: tenantId,
        flag_key: flag.key,
        is_enabled:
          flag.key === "branch_prices"
            ? spec.branches.some((b) => b.allowBranchPrices)
            : (templateFlags[flag.key] ?? flag.default_enabled),
        updated_by: adminUserId,
      })),
    );

    // Users
    const ownerUserId = await ensureUser(spec.owner.email, spec.owner.name);
    await admin.from("tenant_users").insert({
      tenant_id: tenantId,
      user_id: ownerUserId,
      role_id: roleByCode.get("owner")!,
      email: spec.owner.email,
      full_name: spec.owner.name,
      status: "active",
      is_owner: true,
      must_change_password: false,
      invited_by: adminUserId,
      invited_at: daysFromNow(-60),
      last_login_at: daysFromNow(-1),
    });

    for (const member of spec.staff) {
      const userId = await ensureUser(member.email, member.name);
      await admin.from("tenant_users").insert({
        tenant_id: tenantId,
        user_id: userId,
        role_id: roleByCode.get(member.roleCode) ?? roleByCode.get("viewer")!,
        email: member.email,
        full_name: member.name,
        status: "active",
        is_owner: false,
        must_change_password: false,
        invited_by: ownerUserId,
        invited_at: daysFromNow(-30),
      });
    }

    // Branches
    const { data: branches } = await admin
      .from("branches")
      .insert(
        spec.branches.map((branch, index) => ({
          tenant_id: tenantId,
          slug: branch.slug,
          name: branch.name,
          address_line: "Way 2817, Building 12",
          city: branch.city,
          country: "OM",
          phone: "+968 2400 0000",
          whatsapp: "+968 9400 0000",
          latitude: 23.588 + index * 0.01,
          longitude: 58.3829 + index * 0.01,
          timezone: "Asia/Muscat",
          opening_hours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            day,
            closed: day === 5,
            open: "08:00",
            close: "23:30",
          })),
          allow_branch_prices: branch.allowBranchPrices ?? false,
          is_active: true,
          display_order: index,
        })),
      )
      .select("id, slug, allow_branch_prices");

    // Modifier groups
    const groupIdByCode = new Map<string, string>();
    for (const [index, group] of spec.modifierGroups.entries()) {
      const { data: created } = await admin
        .from("modifier_groups")
        .insert({
          tenant_id: tenantId,
          code: group.code,
          selection_type: group.selectionType,
          is_required: group.required,
          min_selections: group.required ? 1 : 0,
          max_selections: group.selectionType === "single" ? 1 : null,
          display_order: index,
        })
        .select("id")
        .single();

      if (!created) continue;
      groupIdByCode.set(group.code, created.id);

      await admin.from("modifier_group_translations").insert(
        Object.entries(group.names).map(([locale, name]) => ({
          tenant_id: tenantId,
          modifier_group_id: created.id,
          locale,
          name,
          status: "approved" as const,
        })),
      );

      for (const [optionIndex, option] of group.options.entries()) {
        const { data: modifier } = await admin
          .from("modifiers")
          .insert({
            tenant_id: tenantId,
            modifier_group_id: created.id,
            code: option.code,
            price_adjustment: option.price,
            is_default: option.isDefault ?? false,
            display_order: optionIndex,
          })
          .select("id")
          .single();

        if (!modifier) continue;

        await admin.from("modifier_translations").insert(
          Object.entries(option.names).map(([locale, name]) => ({
            tenant_id: tenantId,
            modifier_id: modifier.id,
            locale,
            name,
            status: "approved" as const,
          })),
        );
      }
    }

    // Categories and items
    const itemIds: string[] = [];
    const categoryIds: string[] = [];

    for (const [categoryIndex, category] of spec.categories.entries()) {
      const { data: created } = await admin
        .from("categories")
        .insert({
          tenant_id: tenantId,
          slug: category.slug,
          display_order: categoryIndex,
          is_active: true,
        })
        .select("id")
        .single();

      if (!created) continue;
      categoryIds.push(created.id);

      await admin.from("category_translations").insert(
        Object.entries(category.names).map(([locale, name]) => ({
          tenant_id: tenantId,
          category_id: created.id,
          locale,
          name,
          // Only the tenant's default language is "approved"; the rest are
          // review-ready, which is what the translation workbench expects.
          status:
            locale === spec.defaultLocale
              ? ("approved" as const)
              : ("reviewed" as const),
        })),
      );

      for (const [itemIndex, item] of category.items.entries()) {
        const { data: createdItem } = await admin
          .from("items")
          .insert({
            tenant_id: tenantId,
            category_id: created.id,
            sku: item.sku,
            base_price: item.price,
            sale_price: item.salePrice ?? null,
            is_active: true,
            in_stock: item.inStock ?? true,
            out_of_stock_until: item.inStock === false ? daysFromNow(1) : null,
            is_featured: item.featured ?? false,
            is_new: item.isNew ?? false,
            is_popular: item.popular ?? false,
            display_order: itemIndex,
            dietary_tags: item.dietaryTags ?? [],
            allergens: item.allergens ?? [],
            spice_level: item.spiceLevel ?? null,
            calories: item.calories ?? null,
            preparation_time_minutes: item.prepMinutes ?? null,
            service_duration_minutes: item.serviceMinutes ?? null,
            created_by: ownerUserId,
          })
          .select("id")
          .single();

        if (!createdItem) continue;
        itemIds.push(createdItem.id);

        const locales = new Set([
          ...Object.keys(item.names),
          ...Object.keys(item.descriptions ?? {}),
        ]);

        await admin.from("item_translations").insert(
          [...locales].map((locale) => ({
            tenant_id: tenantId,
            item_id: createdItem.id,
            locale,
            name: item.names[locale] ?? item.names[spec.defaultLocale] ?? "",
            description: item.descriptions?.[locale] ?? "",
            status:
              locale === spec.defaultLocale
                ? ("approved" as const)
                : ("ai_generated" as const),
            is_machine_generated: locale !== spec.defaultLocale,
          })),
        );

        // Attach every modifier group to the first two items of each category,
        // which is enough to exercise the UI without being noise.
        if (itemIndex < 2 && groupIdByCode.size) {
          await admin.from("item_modifier_groups").insert(
            [...groupIdByCode.values()].map((groupId, order) => ({
              tenant_id: tenantId,
              item_id: createdItem.id,
              modifier_group_id: groupId,
              display_order: order,
            })),
          );
        }

        // Branch-specific price on the flagship item, where the plan allows it.
        const pricedBranch = (branches ?? []).find(
          (b) => b.allow_branch_prices,
        );
        if (pricedBranch && item.featured) {
          await admin.from("item_branch_settings").insert({
            tenant_id: tenantId,
            item_id: createdItem.id,
            branch_id: pricedBranch.id,
            is_available: true,
            in_stock: true,
            price_override: Number((item.price * 1.1).toFixed(3)),
          });
        }
      }
    }

    // Offers
    for (const [offerIndex, offer] of spec.offers.entries()) {
      const { data: createdOffer } = await admin
        .from("offers")
        .insert({
          tenant_id: tenantId,
          code: offer.code,
          discount_type: offer.type,
          discount_value: offer.value,
          starts_at: daysFromNow(offer.startsInDays),
          ends_at:
            offer.endsInDays === null ? null : daysFromNow(offer.endsInDays),
          is_active: true,
          display_order: offerIndex,
          created_by: ownerUserId,
        })
        .select("id")
        .single();

      if (!createdOffer) continue;

      await admin.from("offer_translations").insert(
        Object.entries(offer.names).map(([locale, name]) => ({
          tenant_id: tenantId,
          offer_id: createdOffer.id,
          locale,
          name,
          status: "approved" as const,
        })),
      );

      // Alternate between a whole-catalog offer and a category-scoped one.
      await admin.from("offer_targets").insert(
        offerIndex % 2 === 0 || !categoryIds.length
          ? [
              {
                tenant_id: tenantId,
                offer_id: createdOffer.id,
                target_type: "all_items" as const,
              },
            ]
          : [
              {
                tenant_id: tenantId,
                offer_id: createdOffer.id,
                target_type: "category" as const,
                category_id: categoryIds[0]!,
              },
            ],
      );
    }

    // Analytics — 60 days of plausible traffic so the dashboards are not empty.
    await seedAnalytics(
      tenantId,
      (branches ?? []).map((b) => b.id),
      categoryIds,
      itemIds,
      spec.locales,
    );

    await admin.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: adminUserId,
      actor_type: "platform",
      actor_email: adminEmail,
      action: "business.created",
      entity_type: "tenant",
      entity_id: tenantId,
      new_values: { name: spec.name, slug: spec.slug, plan: spec.planCode },
      metadata: { source: "seed" },
    });

    const expiry =
      spec.expiresInDays < 0 ? "EXPIRED" : `${spec.expiresInDays}d left`;
    console.log(
      `  ${spec.name.padEnd(22)} /${spec.slug.padEnd(16)} ${spec.templateCode.padEnd(11)} ${expiry}`,
    );
  }

  console.log(
    "\n─────────────────────────────────────────────────────────────",
  );
  console.log("  DEVELOPMENT CREDENTIALS — never use these outside local dev");
  console.log("─────────────────────────────────────────────────────────────");
  console.log(`  Password for every seeded account: ${DEV_PASSWORD}`);
  if (adminPassword !== DEV_PASSWORD) {
    console.log(
      "  (the Super Admin uses PLATFORM_SUPER_ADMIN_PASSWORD instead)",
    );
  }
  console.log("");
  console.log("  Platform admin portal  /admin/login");
  console.log(`    ${adminEmail}          (super admin)`);
  console.log(`    ${supportEmail}        (support — can impersonate)\n`);
  console.log("  Business portal        /login");
  for (const spec of TENANTS) {
    console.log(`    ${spec.owner.email.padEnd(30)} owner of ${spec.name}`);
    for (const member of spec.staff) {
      console.log(`    ${member.email.padEnd(30)} ${member.roleCode}`);
    }
  }
  console.log("\n  Public API examples");
  console.log(
    `    GET /api/v1/public/businesses/bait-al-mandi/branches/main/menu?locale=ar`,
  );
  console.log(
    `    GET /api/v1/public/businesses/crown-barbers   → 404 (subscription expired)`,
  );
  console.log(
    "─────────────────────────────────────────────────────────────\n",
  );
}

/** Generates realistic traffic: weekday-weighted, weighted towards popular items. */
async function seedAnalytics(
  tenantId: string,
  branchIds: string[],
  categoryIds: string[],
  itemIds: string[],
  locales: string[],
): Promise<void> {
  if (!itemIds.length) return;

  const searches = [
    "mandi",
    "chicken",
    "coffee",
    "vegan",
    "haircut",
    "gluten free",
    "xyzzy",
  ];
  const rows: Record<string, unknown>[] = [];

  for (let dayOffset = 60; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(Date.now() - dayOffset * 86_400_000);
    const weekday = day.getUTCDay();
    const base = weekday === 4 || weekday === 5 ? 45 : 22;
    const views = base + Math.floor(Math.random() * 20);

    for (let i = 0; i < views; i += 1) {
      const occurredAt = new Date(day);
      occurredAt.setUTCHours(
        8 + Math.floor(Math.random() * 14),
        Math.floor(Math.random() * 60),
      );
      const session = randomUUID().slice(0, 16);
      const locale = locales[Math.floor(Math.random() * locales.length)]!;
      const branchId = branchIds.length
        ? branchIds[Math.floor(Math.random() * branchIds.length)]!
        : null;

      rows.push({
        tenant_id: tenantId,
        branch_id: branchId,
        event_type: "menu_view",
        session_hash: session,
        locale,
        device_type: Math.random() > 0.25 ? "mobile" : "desktop",
        occurred_at: occurredAt.toISOString(),
      });

      // Item views cluster on the first few items, as real menus do.
      const itemViews = 1 + Math.floor(Math.random() * 4);
      for (let v = 0; v < itemViews; v += 1) {
        const weighted = Math.floor(
          Math.pow(Math.random(), 2) * itemIds.length,
        );
        rows.push({
          tenant_id: tenantId,
          branch_id: branchId,
          event_type: "item_view",
          item_id: itemIds[weighted],
          session_hash: session,
          locale,
          occurred_at: occurredAt.toISOString(),
        });
      }

      if (categoryIds.length && Math.random() > 0.5) {
        rows.push({
          tenant_id: tenantId,
          branch_id: branchId,
          event_type: "category_view",
          category_id:
            categoryIds[Math.floor(Math.random() * categoryIds.length)],
          session_hash: session,
          locale,
          occurred_at: occurredAt.toISOString(),
        });
      }

      if (Math.random() > 0.82) {
        const query = searches[Math.floor(Math.random() * searches.length)]!;
        rows.push({
          tenant_id: tenantId,
          branch_id: branchId,
          event_type: "search",
          search_query: query,
          // 'xyzzy' is the deliberate zero-result search.
          search_results_count:
            query === "xyzzy" ? 0 : 1 + Math.floor(Math.random() * 6),
          session_hash: session,
          locale,
          occurred_at: occurredAt.toISOString(),
        });
      }

      if (Math.random() > 0.9) {
        rows.push({
          tenant_id: tenantId,
          branch_id: branchId,
          event_type: "language_change",
          session_hash: session,
          locale: locales[Math.floor(Math.random() * locales.length)]!,
          occurred_at: occurredAt.toISOString(),
        });
      }
    }
  }

  // Insert in chunks — a single statement with thousands of rows is fragile.
  for (let i = 0; i < rows.length; i += 500) {
    await admin
      .from("analytics_events")
      .insert(rows.slice(i, i + 500) as never);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "\nSeed failed:",
      error instanceof Error ? error.message : error,
    );
    process.exit(1);
  });
