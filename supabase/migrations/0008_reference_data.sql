-- =============================================================================
-- 0008 — Platform reference data: permissions, system roles, languages,
--        currencies, plans, business templates, feature flags.
--        Idempotent: safe to re-run on every deploy.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions catalogue
-- -----------------------------------------------------------------------------
insert into public.permissions (key, category, description, is_destructive, sort_order) values
  ('catalog.categories.view',    'catalog',   'View categories',                         false, 10),
  ('catalog.categories.manage',  'catalog',   'Create, edit, reorder and delete categories', true,  11),
  ('catalog.items.view',         'catalog',   'View products and services',              false, 20),
  ('catalog.items.manage',       'catalog',   'Create, edit and delete products and services', true, 21),
  ('catalog.items.pricing',      'catalog',   'Change prices and sale prices',           false, 22),
  ('catalog.items.availability', 'catalog',   'Toggle stock status and 86 items',        false, 23),
  ('catalog.modifiers.view',     'catalog',   'View modifier groups and add-ons',        false, 30),
  ('catalog.modifiers.manage',   'catalog',   'Create, edit and delete modifiers',       true,  31),
  ('offers.view',                'offers',    'View offers and promotions',              false, 40),
  ('offers.manage',              'offers',    'Create, edit and delete offers',          true,  41),
  ('branches.view',              'branches',  'View branches',                           false, 50),
  ('branches.manage',            'branches',  'Create, edit and delete branches',        true,  51),
  ('media.view',                 'media',     'View the media library',                  false, 60),
  ('media.manage',               'media',     'Upload, replace and remove media',        true,  61),
  ('translations.view',          'content',   'View translations',                       false, 70),
  ('translations.manage',        'content',   'Edit translations and run AI translation', false, 71),
  ('translations.approve',       'content',   'Approve translations',                    false, 72),
  ('analytics.view',             'insights',  'View analytics dashboards',               false, 80),
  ('staff.view',                 'people',    'View staff members',                      false, 90),
  ('staff.manage',               'people',    'Invite staff and change permissions',     true,  91),
  ('settings.view',              'settings',  'View business settings',                  false, 100),
  ('settings.manage',            'settings',  'Change business profile and settings',    false, 101),
  ('branding.manage',            'settings',  'Change branding, colours and localization', false, 102),
  ('subscription.view',          'settings',  'View subscription and plan details',      false, 110),
  ('integration.manage',         'settings',  'Manage public API and integration settings', false, 111),
  ('audit.view',                 'settings',  'View the business activity log',          false, 120)
on conflict (key) do update
  set category = excluded.category,
      description = excluded.description,
      is_destructive = excluded.is_destructive,
      sort_order = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- System roles (tenant_id IS NULL = available to every business)
-- -----------------------------------------------------------------------------
insert into public.roles (code, name, description, is_system, is_owner_role, sort_order) values
  ('owner',          'Business Owner', 'Full access to everything in the business.',                     true, true,  1),
  ('menu_manager',   'Menu Manager',   'Manages the catalog, prices, offers and availability.',          true, false, 2),
  ('content_editor', 'Content Editor', 'Edits descriptions, media and translations. Cannot change prices.', true, false, 3),
  ('branch_manager', 'Branch Manager', 'Manages branch details and day-to-day availability.',            true, false, 4),
  ('viewer',         'Viewer',         'Read-only access.',                                              true, false, 5)
on conflict (code) where tenant_id is null do update
  set name = excluded.name, description = excluded.description;

-- Rebuild system-role grants so the matrix always matches this file.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id and r.tenant_id is null and r.is_system;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on true
where r.tenant_id is null and r.code = 'menu_manager'
  and p.key in (
    'catalog.categories.view', 'catalog.categories.manage',
    'catalog.items.view', 'catalog.items.manage', 'catalog.items.pricing', 'catalog.items.availability',
    'catalog.modifiers.view', 'catalog.modifiers.manage',
    'offers.view', 'offers.manage',
    'branches.view', 'media.view', 'media.manage',
    'translations.view', 'translations.manage',
    'analytics.view', 'settings.view'
  );

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on true
where r.tenant_id is null and r.code = 'content_editor'
  and p.key in (
    'catalog.categories.view', 'catalog.items.view', 'catalog.items.manage',
    'catalog.modifiers.view', 'offers.view', 'branches.view',
    'media.view', 'media.manage',
    'translations.view', 'translations.manage', 'settings.view'
  );

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on true
where r.tenant_id is null and r.code = 'branch_manager'
  and p.key in (
    'catalog.categories.view', 'catalog.items.view', 'catalog.items.availability',
    'catalog.modifiers.view', 'offers.view',
    'branches.view', 'branches.manage',
    'media.view', 'analytics.view', 'settings.view'
  );

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r
join public.permissions p on true
where r.tenant_id is null and r.code = 'viewer'
  and p.key in (
    'catalog.categories.view', 'catalog.items.view', 'catalog.modifiers.view',
    'offers.view', 'branches.view', 'media.view', 'translations.view', 'settings.view'
  );

-- The owner role carries every permission explicitly as well as the
-- is_owner_role short-circuit, so permission listings render correctly.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
from public.roles r cross join public.permissions p
where r.tenant_id is null and r.code = 'owner';

-- -----------------------------------------------------------------------------
-- Languages
-- -----------------------------------------------------------------------------
insert into public.languages (code, english_name, native_name, direction, is_enabled, sort_order) values
  ('en', 'English', 'English',  'ltr', true,  1),
  ('ar', 'Arabic',  'العربية',   'rtl', true,  2),
  ('fa', 'Persian', 'فارسی',     'rtl', true,  3),
  ('ur', 'Urdu',    'اردو',      'rtl', false, 4),
  ('hi', 'Hindi',   'हिन्दी',      'ltr', false, 5),
  ('fr', 'French',  'Français', 'ltr', false, 6),
  ('tr', 'Turkish', 'Türkçe',   'ltr', false, 7)
on conflict (code) do update
  set english_name = excluded.english_name,
      native_name = excluded.native_name,
      direction = excluded.direction;

-- -----------------------------------------------------------------------------
-- Currencies — note the 3-decimal Gulf currencies.
-- -----------------------------------------------------------------------------
insert into public.currencies (code, name, symbol, decimal_digits, is_enabled, sort_order) values
  ('OMR', 'Omani Rial',        'ر.ع.', 3, true,  1),
  ('AED', 'UAE Dirham',        'د.إ',  2, true,  2),
  ('SAR', 'Saudi Riyal',       'ر.س',  2, true,  3),
  ('QAR', 'Qatari Riyal',      'ر.ق',  2, true,  4),
  ('KWD', 'Kuwaiti Dinar',     'د.ك',  3, true,  5),
  ('BHD', 'Bahraini Dinar',    'ب.د',  3, true,  6),
  ('USD', 'US Dollar',         '$',    2, true,  7),
  ('EUR', 'Euro',              '€',    2, true,  8),
  ('GBP', 'Pound Sterling',    '£',    2, false, 9)
on conflict (code) do update
  set name = excluded.name, symbol = excluded.symbol, decimal_digits = excluded.decimal_digits;

-- -----------------------------------------------------------------------------
-- Feature flags
-- -----------------------------------------------------------------------------
insert into public.feature_flags (key, name, description, default_enabled, sort_order) values
  ('multi_branch',       'Multiple branches',    'Allow more than one branch or outlet.',                  true,  1),
  ('branch_prices',      'Branch-specific prices','Allow a different price per branch.',                   false, 2),
  ('modifiers',          'Modifiers and add-ons','Reusable option groups attached to items.',              true,  3),
  ('offers',             'Offers and promotions','Scheduled discounts and promotional prices.',            true,  4),
  ('ai_translation',     'AI translation',       'One-click machine translation of catalog content.',      true,  5),
  ('analytics',          'Analytics',            'Menu, item and search analytics dashboards.',            true,  6),
  ('custom_attributes',  'Custom attributes',    'Arbitrary key/value fields on items.',                   false, 7),
  ('item_gallery',       'Item galleries',       'More than one image per item.',                          true,  8),
  ('qr_codes',           'QR configuration',     'Per-branch public menu identifiers and QR targets.',     true,  9),
  ('public_api',         'Public API',           'Serve this business through the public catalog API.',    true,  10),
  ('scheduled_visibility','Scheduled visibility','Time-of-day and date-window visibility for catalog content.', true, 11)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, default_enabled = excluded.default_enabled;

-- -----------------------------------------------------------------------------
-- Plans
-- -----------------------------------------------------------------------------
insert into public.plans (
  code, name, description, price_amount, price_currency, billing_period, duration_days,
  max_branches, max_categories, max_items, max_users, max_languages, max_storage_mb,
  features, is_active, is_default, sort_order
) values
  ('trial', 'Trial', '30-day evaluation of the full platform.', 0, 'OMR', 'custom', 30,
   1, 15, 60, 2, 2, 256,
   '{"ai_translation": true, "analytics": true, "branch_prices": false}'::jsonb, true, false, 1),
  ('starter', 'Starter', 'A single outlet with a complete digital menu.', 96.000, 'OMR', 'yearly', 365,
   1, 30, 200, 3, 2, 512,
   '{"ai_translation": true, "analytics": true, "branch_prices": false}'::jsonb, true, true, 2),
  ('growth', 'Growth', 'Multi-branch businesses with richer content and analytics.', 240.000, 'OMR', 'yearly', 365,
   5, 80, 1000, 10, 4, 2048,
   '{"ai_translation": true, "analytics": true, "branch_prices": true}'::jsonb, true, false, 3),
  ('enterprise', 'Enterprise', 'Large groups with many outlets and languages.', 720.000, 'OMR', 'yearly', 365,
   50, 300, 10000, 50, 10, 10240,
   '{"ai_translation": true, "analytics": true, "branch_prices": true, "custom_attributes": true}'::jsonb, true, false, 4)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      price_amount = excluded.price_amount,
      duration_days = excluded.duration_days,
      max_branches = excluded.max_branches,
      max_categories = excluded.max_categories,
      max_items = excluded.max_items,
      max_users = excluded.max_users,
      max_languages = excluded.max_languages,
      max_storage_mb = excluded.max_storage_mb,
      features = excluded.features;

-- -----------------------------------------------------------------------------
-- Business templates — terminology + defaults per business type.
-- These configure the SAME catalog tables; they never branch the schema.
-- -----------------------------------------------------------------------------
insert into public.business_templates (
  code, business_type, name, description, icon, terminology,
  enabled_item_fields, default_categories, default_modifier_groups,
  default_feature_flags, is_system, sort_order
) values
  (
    'restaurant', 'restaurant', 'Restaurant', 'Table-service and casual dining menus.', 'utensils-crossed',
    '{
      "en": {"catalog": "Menu", "category": "Category", "categories": "Categories", "item": "Dish", "items": "Dishes", "price": "Price"},
      "ar": {"catalog": "القائمة", "category": "التصنيف", "categories": "التصنيفات", "item": "طبق", "items": "الأطباق", "price": "السعر"},
      "fa": {"catalog": "منو", "category": "دسته", "categories": "دسته‌ها", "item": "غذا", "items": "غذاها", "price": "قیمت"}
    }'::jsonb,
    '["description","image","gallery","ingredients","allergens","dietary_tags","calories","preparation_time","spice_level"]'::jsonb,
    '[{"slug":"starters","en":"Starters","ar":"المقبلات","fa":"پیش‌غذا"},
      {"slug":"main-courses","en":"Main Courses","ar":"الأطباق الرئيسية","fa":"غذای اصلی"},
      {"slug":"grills","en":"Grills","ar":"المشاوي","fa":"کباب‌ها"},
      {"slug":"desserts","en":"Desserts","ar":"الحلويات","fa":"دسر"},
      {"slug":"beverages","en":"Beverages","ar":"المشروبات","fa":"نوشیدنی‌ها"}]'::jsonb,
    '[{"code":"portion-size","en":"Portion size","selection_type":"single","is_required":true},
      {"code":"extras","en":"Extras","selection_type":"multiple","is_required":false}]'::jsonb,
    '{"modifiers": true, "offers": true, "item_gallery": true}'::jsonb,
    true, 1
  ),
  (
    'cafe', 'cafe', 'Café', 'Coffee shops, bakeries and juice bars.', 'coffee',
    '{
      "en": {"catalog": "Menu", "category": "Category", "categories": "Categories", "item": "Drink", "items": "Drinks", "price": "Price"},
      "ar": {"catalog": "القائمة", "category": "التصنيف", "categories": "التصنيفات", "item": "مشروب", "items": "المشروبات", "price": "السعر"},
      "fa": {"catalog": "منو", "category": "دسته", "categories": "دسته‌ها", "item": "نوشیدنی", "items": "نوشیدنی‌ها", "price": "قیمت"}
    }'::jsonb,
    '["description","image","ingredients","allergens","dietary_tags","calories","preparation_time"]'::jsonb,
    '[{"slug":"hot-coffee","en":"Hot Coffee","ar":"قهوة ساخنة","fa":"قهوه گرم"},
      {"slug":"iced-coffee","en":"Iced Coffee","ar":"قهوة مثلجة","fa":"قهوه سرد"},
      {"slug":"tea","en":"Tea","ar":"الشاي","fa":"چای"},
      {"slug":"bakery","en":"Bakery","ar":"المخبوزات","fa":"نانوایی"},
      {"slug":"cold-drinks","en":"Cold Drinks","ar":"مشروبات باردة","fa":"نوشیدنی سرد"}]'::jsonb,
    '[{"code":"size","en":"Size","selection_type":"single","is_required":true},
      {"code":"milk","en":"Milk choice","selection_type":"single","is_required":false},
      {"code":"add-ons","en":"Add-ons","selection_type":"multiple","is_required":false}]'::jsonb,
    '{"modifiers": true, "offers": true}'::jsonb,
    true, 2
  ),
  (
    'salon', 'salon', 'Salon', 'Beauty, hair and spa services.', 'scissors',
    '{
      "en": {"catalog": "Services", "category": "Service Category", "categories": "Service Categories", "item": "Service", "items": "Services", "price": "Price"},
      "ar": {"catalog": "الخدمات", "category": "تصنيف الخدمة", "categories": "تصنيفات الخدمات", "item": "خدمة", "items": "الخدمات", "price": "السعر"},
      "fa": {"catalog": "خدمات", "category": "دسته خدمت", "categories": "دسته‌های خدمات", "item": "خدمت", "items": "خدمات", "price": "قیمت"}
    }'::jsonb,
    '["description","image","gallery","service_duration"]'::jsonb,
    '[{"slug":"hair","en":"Hair","ar":"الشعر","fa":"مو"},
      {"slug":"nails","en":"Nails","ar":"الأظافر","fa":"ناخن"},
      {"slug":"skincare","en":"Skincare","ar":"العناية بالبشرة","fa":"مراقبت پوست"},
      {"slug":"makeup","en":"Makeup","ar":"المكياج","fa":"آرایش"},
      {"slug":"spa","en":"Spa","ar":"السبا","fa":"اسپا"}]'::jsonb,
    '[{"code":"hair-length","en":"Hair length","selection_type":"single","is_required":false},
      {"code":"service-add-ons","en":"Service add-ons","selection_type":"multiple","is_required":false}]'::jsonb,
    '{"modifiers": true, "offers": true, "item_gallery": true}'::jsonb,
    true, 3
  ),
  (
    'barbershop', 'barbershop', 'Barbershop', 'Men''s grooming and barbering services.', 'scissors',
    '{
      "en": {"catalog": "Services", "category": "Service Category", "categories": "Service Categories", "item": "Service", "items": "Services", "price": "Price"},
      "ar": {"catalog": "الخدمات", "category": "تصنيف الخدمة", "categories": "تصنيفات الخدمات", "item": "خدمة", "items": "الخدمات", "price": "السعر"},
      "fa": {"catalog": "خدمات", "category": "دسته خدمت", "categories": "دسته‌های خدمات", "item": "خدمت", "items": "خدمات", "price": "قیمت"}
    }'::jsonb,
    '["description","image","service_duration"]'::jsonb,
    '[{"slug":"haircuts","en":"Haircuts","ar":"قص الشعر","fa":"اصلاح مو"},
      {"slug":"beard","en":"Beard","ar":"اللحية","fa":"ریش"},
      {"slug":"shaving","en":"Shaving","ar":"الحلاقة","fa":"اصلاح صورت"},
      {"slug":"treatments","en":"Treatments","ar":"العلاجات","fa":"درمان‌ها"},
      {"slug":"packages","en":"Packages","ar":"الباقات","fa":"پکیج‌ها"}]'::jsonb,
    '[{"code":"style","en":"Style","selection_type":"single","is_required":false},
      {"code":"service-add-ons","en":"Add-ons","selection_type":"multiple","is_required":false}]'::jsonb,
    '{"modifiers": true, "offers": true}'::jsonb,
    true, 4
  ),
  (
    'custom', 'custom', 'Custom', 'A neutral catalog for any other kind of business.', 'store',
    '{
      "en": {"catalog": "Catalog", "category": "Category", "categories": "Categories", "item": "Item", "items": "Items", "price": "Price"},
      "ar": {"catalog": "الكتالوج", "category": "التصنيف", "categories": "التصنيفات", "item": "عنصر", "items": "العناصر", "price": "السعر"},
      "fa": {"catalog": "کاتالوگ", "category": "دسته", "categories": "دسته‌ها", "item": "آیتم", "items": "آیتم‌ها", "price": "قیمت"}
    }'::jsonb,
    '["description","image"]'::jsonb,
    '[{"slug":"general","en":"General","ar":"عام","fa":"عمومی"}]'::jsonb,
    '[]'::jsonb,
    '{"offers": true}'::jsonb,
    true, 5
  )
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      terminology = excluded.terminology,
      enabled_item_fields = excluded.enabled_item_fields,
      default_categories = excluded.default_categories,
      default_modifier_groups = excluded.default_modifier_groups,
      default_feature_flags = excluded.default_feature_flags;
