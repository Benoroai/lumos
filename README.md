# Lumos

Multi-tenant digital catalog and menu management for restaurants, cafés, salons,
barbershops and anything else with a list of things and prices.

One platform hosts hundreds of completely isolated businesses. Each has its own
users, branches, catalog, languages, currency, branding, analytics and public
API — and cannot see any part of another.

This repository contains the **platform**: the Super Admin portal, the business
dashboard, the database, and the public API. The customer-facing menu is a
**separate application** that connects through
[the public API](#connecting-the-customer-facing-frontend).

---

## Contents

- [Architecture](#architecture)
- [How isolation actually works](#how-isolation-actually-works)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Seed data](#seed-data)
- [Testing](#testing)
- [Connecting the customer-facing frontend](#connecting-the-customer-facing-frontend)
- [Deployment](#deployment)
- [Project layout](#project-layout)
- [Design system](#design-system)
- [Decisions and assumptions](#decisions-and-assumptions)

---

## Architecture

| Layer              | Choice                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Framework          | Next.js 16 (App Router), React 19, TypeScript strict                         |
| Database           | PostgreSQL via Supabase, with Row-Level Security on every table              |
| Auth               | Supabase Auth — separate portals for platform staff and business users       |
| Storage            | Supabase Storage, tenant-prefixed object keys                                |
| Styling            | Tailwind CSS v4 with CSS-variable design tokens                              |
| Forms & validation | React Hook Form patterns + Zod on both client and server                     |
| Data fetching      | Server Components and Server Actions; TanStack Query for interactive widgets |
| Charts             | Recharts                                                                     |
| i18n               | next-intl for the dashboard; per-row translation tables for content          |
| Tests              | Vitest (unit + database), Playwright (end-to-end)                            |

Three request paths, three different database identities:

```
Browser ──▶ Server Component / Server Action ──▶ supabase/server.ts   (user session, RLS enforced)
Browser ──▶ Route handler (public API)       ──▶ supabase/public.ts   (anon key, RLS enforced)
Server  ──▶ Platform operations, audit, auth ──▶ supabase/admin.ts    (service role, RLS bypassed)
```

The service-role client is the only one that can cross a tenant boundary. It is
imported by server modules only — `import 'server-only'` makes a client-side
import a build failure, and ESLint flags it in `src/components/**` before that.

### One catalog model, many vocabularies

There is no `restaurants` table and no `salons` table. A dish, a drink and a
haircut are all rows in `items`. What differs between business types lives in
`business_templates`:

- **terminology** per locale — "Menu / Category / Dish" vs "Services / Service Category / Service"
- **enabled optional fields** — a barbershop surfaces _service duration_, a restaurant surfaces _calories_ and _spice level_
- **starter categories and modifier groups** created with the business
- **default feature flags**

A business owner can override the terminology and the field set at any time from
**Settings**. Adding a new business type is a row in `business_templates`, not a
migration.

---

## How isolation actually works

Isolation is enforced in the database, not in application code. Application
filtering is a second line of defence, never the first.

**Every tenant-owned table** carries `tenant_id`, has RLS enabled, and is gated
by two SQL predicates:

```sql
app.is_tenant_member(tenant_id)              -- can this user see this tenant at all?
app.has_permission(tenant_id, 'items.manage') -- may they perform this write?
```

`has_permission` resolves in this order: owner short-circuit → explicit per-user
revoke → explicit per-user grant → role grant. So a Menu Manager can have one
capability taken away without inventing a bespoke role.

**Column privileges are granted explicitly, never granted broadly and revoked.**
In Postgres a table-level `GRANT SELECT` outranks a column-level `REVOKE`, so
"grant all then take some away" silently leaves the column readable. Listing the
allowed columns is the only construction that holds — this is why business users
cannot read `tenants.internal_notes` or write `tenants.account_status`. The
isolation test suite contains the cases that caught this.

**The public surface is a deliberate allowlist.** The `anon` role — whose key
ships to the customer frontend — starts from zero privileges and is granted
`SELECT` on exactly the published rows. It has no `INSERT` anywhere, including
`analytics_events`: events are written by the API route through the service role
after validation and rate limiting, so the public key cannot forge traffic.

**Audit logs are append-only in the database.** A trigger rejects `UPDATE` and
`DELETE`, and no principal has an insert grant — entries are written through the
service role, so an actor cannot edit or suppress their own trail.

Run `npm run test:db` to see all of this asserted against the real migrations.

---

## Local setup

```bash
git clone <repository> && cd Menu
npm install
cp .env.example .env.local     # then fill in the Supabase values
```

You need a Supabase project (hosted or local via `supabase start`) and a
PostgreSQL 14+ instance reachable at `DATABASE_URL`.

```bash
npm run db:migrate    # apply migrations
npm run db:seed       # development data — prints login credentials
npm run dev           # http://localhost:3000
```

Then sign in:

| Portal                  | URL            | Seeded account          |
| ----------------------- | -------------- | ----------------------- |
| Platform administration | `/admin/login` | `admin@lumos.local`     |
| Business dashboard      | `/login`       | `owner@baitalmandi.dev` |

The seed prints every credential, including the shared development password.

### Without Supabase

The unit and database test suites need only PostgreSQL — they apply the real
migrations to a throwaway database and exercise the real RLS policies:

```bash
createdb lumos_test
TEST_DATABASE_URL=postgresql://127.0.0.1:5432/lumos_test npm test
```

---

## Environment variables

Every variable is documented in [`.env.example`](.env.example). The ones that
matter most:

| Variable                                                     | Purpose                                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Safe to expose. The anon key is what the customer frontend uses.              |
| `SUPABASE_SERVICE_ROLE_KEY`                                  | **Server only. Bypasses RLS.** Never prefix with `NEXT_PUBLIC_`.              |
| `DATABASE_URL`                                               | Direct Postgres connection for migrations and seeding. Not used at runtime.   |
| `TEST_DATABASE_URL`                                          | Throwaway database, dropped and recreated on every `npm run test:db`.         |
| `PUBLIC_API_CORS_ORIGINS`                                    | Comma-separated allowlist for the public API. `*` for local development only. |
| `PUBLIC_API_BLOCK_EXPIRED_SUBSCRIPTIONS`                     | Whether a lapsed subscription stops serving the public menu.                  |
| `PLATFORM_SUPER_ADMIN_EMAIL` / `_PASSWORD`                   | Consumed once by the seed to create the first admin. Rotate immediately.      |
| `AI_TRANSLATION_PROVIDER`                                    | `anthropic`, `openai`, or `echo` (offline stub, the default).                 |

Environment is validated by Zod at load. `publicEnv` is the only object readable
from client components; `serverEnv()` throws if it is ever reached in a browser
bundle.

---

## Database

Migrations are plain SQL in [`supabase/migrations/`](supabase/migrations), applied
in filename order and recorded in `public._migrations`, so re-running is a no-op.

```bash
npm run db:migrate                 # apply pending migrations
npm run db:migrate -- --bootstrap  # also install the local Supabase shim (plain Postgres only)
ALLOW_DB_RESET=true npm run db:reset -- --bootstrap
npm run db:types                   # regenerate TypeScript types from the live schema
```

| Migration                             | Contents                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `0001_foundation`                     | Schemas, enums, shared triggers and helper functions                         |
| `0002_platform_core`                  | Platform users, plans, templates, tenants, subscriptions, roles, permissions |
| `0003_catalog`                        | Branches, categories, items, modifiers, offers, and all translation tables   |
| `0004_settings_media_analytics_audit` | Business settings, media, analytics, audit trail, rate limiting              |
| `0005_platform_settings`              | Platform-wide policy the database itself reads                               |
| `0006_rls`                            | Row-Level Security policies and the explicit privilege allowlists            |
| `0007_storage`                        | Tenant-isolated media bucket and its policies                                |
| `0008_reference_data`                 | Permissions, system roles, languages, currencies, plans, templates           |

TypeScript types in `src/lib/types/database.generated.ts` are **derived from the
live schema**, including foreign-key relationships, so a migration cannot
silently drift from the code compiled against it. Regenerate with
`npm run db:types` after any schema change.

### Money

Every price column is `numeric(14,3)`. OMR, KWD and BHD use three decimal
places, and the decimal count is data (`currencies.decimal_digits`) rather than a
hard-coded `2` — so a three-decimal price is stored and displayed exactly,
never rounded to two and patched up in the UI.

---

## Seed data

`npm run db:seed` creates a Platform Super Admin, a support operator, and four
businesses chosen to exercise every axis of the model:

| Business          | Type       | Languages            | Subscription                                        |
| ----------------- | ---------- | -------------------- | --------------------------------------------------- |
| Bait Al Mandi     | Restaurant | en, ar, fa           | Active, 3 branches, branch-specific prices          |
| Noor Café         | Café       | en, ar               | **Expiring in 12 days** — shows the renewal alerts  |
| Glow Beauty Salon | Salon      | ar (default), en, fa | Active, 2 branches, RTL-first                       |
| Crown Barbers     | Barbershop | en, ar               | **Expired** — shows the read-only and 404 behaviour |

It also creates staff at every role, live/scheduled/expired offers, out-of-stock
items, and 60 days of realistic analytics so the dashboards are not empty.

All seeded credentials are clearly marked development-only and share one
password, printed at the end of the run.

---

## Testing

```bash
npm test              # unit + database
npm run test:unit     # pure logic, jsdom
npm run test:db       # RLS and schema behaviour against real PostgreSQL
npm run test:e2e      # Playwright, needs a seeded environment
npm run verify        # format + lint + typecheck + tests
```

**The database suite is the important one.** It creates a throwaway database,
applies the actual migrations (with a shim that provides `auth.uid()` and the
Supabase roles on plain Postgres), and drives every query as a real principal —
`SET LOCAL ROLE` plus JWT claims, exactly as PostgREST does. A mock could not
tell you whether a policy is correct; this can.

It covers: cross-tenant reads and writes on every table, per-role and per-user
permission resolution, platform-staff access, the public `anon` surface,
subscription lifecycle and expiry, scheduled visibility, offer windows, and the
append-only audit trail.

End-to-end tests skip unless `E2E=1` and the environment is seeded. The unit
suite needs nothing at all; the database suite needs only a local PostgreSQL and
`TEST_DATABASE_URL`. Neither needs a Supabase project, so the suites that guard
the security properties run on every pull request.

```bash
npm run db:seed
E2E=1 npm run test:e2e
```

---

## Connecting the customer-facing frontend

The public menu is a separate application. It needs no API key and no session —
it reads published data over HTTPS and is gated by an origin allowlist.

**1. Allow your frontend's origin**

```bash
PUBLIC_API_CORS_ORIGINS="https://menu.example.com"
```

**2. Fetch a menu**

```ts
const res = await fetch(
  "https://platform.example.com/api/v1/public/businesses/bait-al-mandi/branches/main/menu?locale=ar",
  { headers: { "Accept-Language": "ar" } },
);

const { data, meta } = await res.json();

data.business.branding; // colours, price format, tax display
data.categories[0].items[0]; // localized item with price, offer, availability
meta.locale; // language actually served
meta.fallbackLocale; // what untranslated content fell back to
meta.currency.decimalDigits; // 3 for OMR — format with this, not with 2
```

**3. Report usage**

```ts
await fetch("https://platform.example.com/api/v1/public/analytics/events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    businessSlug: "bait-al-mandi",
    type: "item_view",
    itemId: item.id,
    locale: "ar",
    sessionId: yourOpaqueSessionId,
  }),
});
```

### Endpoints

| Method | Path                                                        |
| ------ | ----------------------------------------------------------- |
| `GET`  | `/api/v1/public/businesses/:slug`                           |
| `GET`  | `/api/v1/public/businesses/:slug/branches`                  |
| `GET`  | `/api/v1/public/businesses/:slug/branches/:branchSlug/menu` |
| `GET`  | `/api/v1/public/businesses/:slug/categories`                |
| `GET`  | `/api/v1/public/businesses/:slug/items/:itemId`             |
| `GET`  | `/api/v1/public/businesses/:slug/offers`                    |
| `POST` | `/api/v1/public/analytics/events`                           |
| `GET`  | `/api/v1/public/openapi.json`                               |

The full contract is served live at `/api/v1/public/openapi.json` and described
in [`docs/API.md`](docs/API.md).

### What the API guarantees

- Only **published, in-window, active** content is returned.
- Item identifiers are **stable public UUIDs**. Internal ids never leave.
- **Out-of-stock items are still returned**, flagged through
  `availability.inStock` — so your frontend renders them greyed out rather than
  losing them from the menu.
- **The best applicable offer is already applied** to `price.effective`; you do
  not reimplement discount logic.
- Requesting a language a business does not publish falls back to its default,
  and `meta.locale` tells you what you actually got.
- A business that is suspended, soft-deleted, or out of subscription returns
  **404** — the API does not confirm that such a slug exists.

---

## Deployment

Deployment details, including the Supabase and Vercel steps, secret rotation and
the production checklist, are in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
npm run build
npm run start
```

Security headers (HSTS, `X-Frame-Options: DENY`, `nosniff`, a restrictive
`Permissions-Policy`) are applied globally except on the public API, which sets
its own CORS headers per request from the allowlist.

---

## Project layout

```
supabase/
  migrations/         SQL migrations — the source of truth for the schema
  bootstrap/local.sql Supabase shim for plain Postgres (tests and local dev only)
scripts/              Migration runner, type generator, seed
src/
  app/
    admin/            Platform Super Admin portal
    dashboard/        Business dashboard
    api/v1/public/    Public catalog API
  components/
    ui/               Design-system primitives
    layout/           Shell, navigation, command palette
    platform/         Super Admin screens
    business/         Business dashboard screens
    charts/           Recharts wrappers
  lib/
    supabase/         The three clients: server, public (anon), admin (service role)
    auth/             Session resolution, permissions, audited impersonation
    actions/          Server actions — every mutation, each one authorized server-side
    queries/          Server-side reads with pagination
    api/              Public API helpers: CORS, rate limiting, envelope, read model
    validation/       Zod schemas shared by client and server
    i18n/             Dashboard locales, direction, content-locale fallback
    ai/               Translation provider abstraction
tests/
  unit/               Pure logic
  db/                 RLS and schema behaviour against real PostgreSQL
  e2e/                Playwright
```

---

## Design system

Tokens live in `src/app/globals.css` as CSS variables, with a full dark theme.

| Colour        | Hex       | Used for                                          |
| ------------- | --------- | ------------------------------------------------- |
| Electric Blue | `#1F45FF` | Primary actions, active navigation                |
| Acid Lime     | `#D7FF2F` | Availability, success, selection                  |
| Ink Black     | `#111111` | Text, dark surfaces                               |
| Warm Cream    | `#F5F0E7` | Light canvas                                      |
| Sunset Coral  | `#FF6B4A` | Expiry alerts, destructive emphasis, support mode |
| Soft Lilac    | `#E2D6FF` | Secondary panels, analytics accents               |

Restraint is part of the system: a screen leans on one accent, not six. The full
palette appears together in exactly one place — the sign-in panel.

Layout uses CSS logical properties throughout (`ms-`, `me-`, `start-`, `end-`),
so Arabic and Persian mirror the entire interface without a second stylesheet.
Selecting either language switches `dir` on `<html>` and the whole dashboard
follows.

---

## Decisions and assumptions

Where the brief left room, these are the choices made and why.

**Subscription status is derived, never stored.** `expiring_soon` and `expired`
are functions of the clock. Persisting them would mean a nightly job and a
window in which the database disagrees with reality. `app.subscription_status()`
in SQL and `deriveSubscriptionStatus()` in TypeScript implement the same rules
for different audiences, and both are tested.

**An expired subscription pauses editing but never deletes.** The dashboard goes
read-only with a clear explanation, the public API stops serving (configurable),
and every row stays exactly as it was. Renewal restores access immediately.

**A trial nearing its end is flagged like any other subscription.** A trial with
20 days left reads as `expiring_soon`; the plan type does not change the urgency.

**Out of stock is a flag, not a deletion.** An 86'd item stays in the catalog and
in the API response with `availability.inStock: false`, optionally with an
`availableUntil` for a temporary stock-out that clears itself.

**Support impersonation is deliberately loud.** It is limited by platform role,
audited on entry and exit, flags every mutation made inside it with
`is_impersonated`, and shows a coral banner for the whole session. There is no
silent variant.

**Analytics are anonymous by construction.** No IP, no cookie, no user id. The
client's opaque session id is re-hashed server-side with the tenant, the UTC
date and a server secret — enough to count unique sessions for one business on
one day, and nothing else. Referrers are reduced to a host.

**The best offer wins.** When several offers apply to an item, the API returns
the lowest resulting price. A customer should never be shown the worse of two
promotions that both apply.

**AI translation never silently replaces approved copy.** Approved translations
are skipped and reported back; replacing them requires an explicit confirmation.
The default provider is an offline stub, so development and CI never depend on a
paid API being reachable.

**Deleting a category keeps its items.** They move to another category or become
uncategorised. Losing menu items to a mis-click is not recoverable from the UI.

**A business must keep at least one branch.** Its public menu has nothing to
resolve against otherwise.

**TypeScript is pinned to 5.9.** TypeScript 7 is the current stable release, but
`typescript-eslint` still declares a peer range of `<6.1.0`. A working lint
pipeline is worth more than the newest compiler; revisit when the ecosystem
catches up.

**One user, one business — for now.** `tenant_users` is a many-to-many table and
RLS handles a user belonging to several businesses correctly, but the dashboard
resolves the first active membership rather than offering a tenant switcher.
Adding one is a UI change plus a session cookie; the data model already supports
it. Platform staff reach any business through audited support mode instead.

**Appointment booking, ordering and payments are out of scope for v1**, as
specified. The schema leaves room for them: items already carry
`service_duration_minutes`, branches carry opening hours and timezones, and
modifier groups carry the selection constraints an order builder would need.
