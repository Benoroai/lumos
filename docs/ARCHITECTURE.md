# Architecture

Notes on the decisions that shaped this codebase, and why they were made that
way rather than another.

---

## The multi-tenant model

### One catalog, configured per business type

The brief asked for restaurants, cafés, salons and barbershops in one platform
without separate applications. The temptation is a table per vertical. That is
wrong for a reason that shows up in month three: every feature — search,
offers, analytics, translations, the public API — then needs a branch per
vertical, and adding a fifth business type becomes a migration and a rewrite.

So there is one `items` table. A dish, a drink and a haircut are the same row
shape. What differs is configuration in `business_templates`:

| Facet                    | Restaurant                                  | Salon                     |
| ------------------------ | ------------------------------------------- | ------------------------- |
| `terminology.en.catalog` | Menu                                        | Services                  |
| `terminology.en.item`    | Dish                                        | Service                   |
| `enabled_item_fields`    | calories, prep time, spice level, allergens | service duration, gallery |
| `default_categories`     | Starters, Mains, Grills…                    | Hair, Nails, Skincare…    |

Terminology resolves as _template default → tenant override_, each with locale
fallback to English. `resolveTerminology()` is the single place that happens, and
every screen reads its nouns from it.

Optional fields are opt-in per business: a restaurant that does not want calories
switches the field off in Settings and it disappears from the item form. Turning
a field off never deletes data already entered — it only stops surfacing it.

Adding a business type is one row in `business_templates`. No migration.

### Tenancy is a database property, not an application one

Every tenant-owned table carries `tenant_id`, has RLS enabled, and is reachable
only through two predicates:

```sql
app.is_tenant_member(tenant_id)
app.has_permission(tenant_id, '<permission key>')
```

Both are `SECURITY DEFINER` so they can consult membership tables without
tripping the policies they serve.

Application code still filters by `tenant_id`, but as defence in depth. If a
query forgets the filter, RLS returns nothing rather than another business's
data. The database suite asserts exactly this.

### Permission resolution

`app.has_permission` resolves in a fixed order:

1. **Owner short-circuit** — the owner role bypasses individual checks inside
   its own tenant.
2. **Explicit per-user revoke** — always wins, even over a role grant.
3. **Explicit per-user grant** — adds a capability the role lacks.
4. **Role grant** — the baseline.

Revoke-before-grant is deliberate: taking a capability away must be reliable, so
it cannot be undone by a later grant elsewhere in the chain. It means a Menu
Manager can have exactly one capability removed without inventing a bespoke role
for that person.

---

## What the tests found

Two of the isolation tests failed on their first run, and both were real holes.

**Column-level `REVOKE` after a table-level `GRANT` does nothing.** The original
policy read:

```sql
grant select, update on public.tenants to authenticated;
revoke select (internal_notes) on public.tenants from authenticated;
revoke update (account_status, slug, …) on public.tenants from authenticated;
```

This looks correct and is not. In PostgreSQL a table-level privilege outranks a
column-level revoke, so business users could read the platform's private notes
about them and rewrite their own `account_status`. The fix is to grant the
allowed columns explicitly and never grant table-wide:

```sql
revoke select, update on public.tenants from authenticated;
grant select (id, slug, name, … /* everything except internal_notes */) on public.tenants to authenticated;
grant update (name, legal_name, contact_email, … /* profile fields only */) on public.tenants to authenticated;
```

The same treatment applies to `subscriptions.notes`. This is the single most
valuable thing the test suite does, and it is the reason the suite runs against
real PostgreSQL rather than a mock.

**A blocked `UPDATE` returns zero rows; it does not raise.** RLS makes rows
invisible, so an unauthorized update is a no-op rather than an error. A test that
only checks "did this throw" passes vacuously. The suite asserts both the row
count and the unchanged value.

---

## Three database identities

```
supabase/server.ts   user session      RLS enforced   dashboard reads and writes
supabase/public.ts   anon key          RLS enforced   the public catalog API
supabase/admin.ts    service role      RLS bypassed   platform ops, auth, audit, analytics
```

The public API runs on the **anon** client rather than the service role. That is
the important choice: it means the `anon` RLS policies are the definition of
"published", and the API layer cannot accidentally serve something they forbid.
If a policy is wrong, the API returns nothing — the opposite of filtering in
application code, where a forgotten condition leaks.

The service role is used for exactly three things: cross-tenant platform
operations, auth-user management, and writing audit and analytics rows that no
principal may forge or suppress on their own behalf.

---

## Derived state

`expiring_soon` and `expired` are functions of the clock, so they are computed on
read rather than stored:

- `app.subscription_status(manual, expires_at)` in SQL, used by RLS
- `deriveSubscriptionStatus()` in TypeScript, used by the dashboards

Both exist deliberately: the database is the authority for access decisions, the
TypeScript is the authority for what the UI renders, and they must agree. Both
are tested, in `tests/db/subscriptions.test.ts` and `tests/unit/subscriptions.test.ts`.

The alternative — a nightly job writing a status column — introduces a window in
which the database disagrees with reality, and a job that can fail silently.

The same reasoning applies to offers: `app.offer_is_live()` is a window check, so
an offer starts and stops on time with nothing scheduled, and expired offers stay
in the table for history.

---

## Money

Every price column is `numeric(14,3)`, and the decimal count is data:

```sql
currencies.decimal_digits  -- OMR 3, KWD 3, BHD 3, USD 2, AED 2
```

Three-decimal Gulf currencies are the default case here, not an edge case. The
formatter, the price inputs, the discount arithmetic and the public API all read
`decimalDigits` from the currency rather than assuming `2`. `formatAmount()`
returns `—` for a missing price rather than `0.000`, because "no price" and "free"
are different facts and rendering one as the other tells a customer something
untrue.

---

## Analytics

Privacy is structural rather than promised.

No IP address, cookie or user identifier is stored. The client sends an opaque
per-session value; the server re-hashes it with the tenant id, the UTC date and a
server secret:

```
session_hash = sha256(secret : tenant_id : YYYY-MM-DD : client_session_id)
```

That is enough to count unique sessions for one business on one day. It cannot be
reversed, cannot be joined across tenants, and rotates at midnight. Referrers are
reduced to a bare host.

Ingestion goes through a route handler, never directly from the anon key: `anon`
has no `INSERT` grant on `analytics_events`. So the public key cannot be used to
forge traffic, and events for a business that is no longer published are counted
as rejected rather than accumulating against a dormant account.

---

## Support impersonation

A real capability, treated as one.

- Limited by platform role (`super_admin`, `support`).
- The session cookie is HMAC-signed with the service-role key and expires after
  one hour, so it cannot be forged or replayed indefinitely.
- The cookie alone grants nothing: `getTenantSession()` re-checks on every
  request that the bearer is still an active platform operator.
- Entry and exit are audited; every mutation made inside is flagged
  `is_impersonated` with the operator's identity.
- A coral banner is fixed to the top of every page for the whole session.

There is no silent variant, by design.

---

## Rate limiting

A Postgres-backed fixed-window counter (`public.rate_limit_hit`) rather than
in-process memory. Serverless instances are ephemeral and numerous, so an
in-memory limiter lets an attacker multiply their budget by fanning out across
cold starts.

If the limiter itself fails, reads fail **open**. Losing the availability of the
whole public API because a counter table hiccuped is the worse outcome; the
limiter protects against volume, not against a determined attacker who has
already found a way to break it.

---

## Internationalisation

Two separate concerns, deliberately not conflated:

**Dashboard UI** — next-intl, three locales (en/ar/fa), no locale URL segment.
The language follows the signed-in user via a cookie, which keeps deep links
stable when someone switches language and avoids duplicating every admin route
per locale.

**Catalog content** — one row per (entity, locale) in dedicated translation
tables, each carrying a status: `draft`, `ai_generated`, `reviewed`, `approved`.
A business may publish in languages the dashboard itself is not translated into.

Fallback is _requested locale → tenant default → any non-empty translation_. The
last step matters: a half-translated catalog should render something readable
rather than a blank card.

RTL is handled with CSS logical properties throughout (`ms-`, `me-`, `start-`,
`end-`), so the entire interface mirrors from a single `dir` attribute with no
second stylesheet and no per-component RTL branches.

---

## AI translation

Behind a provider interface with three implementations: Anthropic, OpenAI, and a
deterministic offline stub (`echo`) that is the default. Development and CI never
depend on a paid API being reachable, and a missing key downgrades to the stub
with a warning rather than failing a job.

Approved translations are never silently replaced. When a job encounters one it
skips it and reports the count; replacing them requires an explicit
`overwriteApproved` confirmation from the operator, surfaced as a dialog.

---

## Type generation

`src/lib/types/database.generated.ts` is introspected from the live schema —
including foreign-key relationships, which is what lets supabase-js type embedded
selects like `categories:category_id ( … )`. Without them every join resolves to
`never`.

The point is that a migration cannot silently drift from the code compiled
against it. Change the schema, run `npm run db:types`, and the type checker shows
you every call site that needs attention.

---

## Testing strategy

| Suite        | Runs against                     | Guards                                                                   |
| ------------ | -------------------------------- | ------------------------------------------------------------------------ |
| `tests/unit` | Pure functions, jsdom            | Subscription derivation, money, locale fallback, validation, permissions |
| `tests/db`   | Real PostgreSQL, real migrations | Tenant isolation, RLS, the public surface, subscription lifecycle        |
| `tests/e2e`  | Running app + seeded data        | Sign-in, business creation, catalog editing, RTL, public API             |

The database suite drives queries as real principals — `SET LOCAL ROLE` plus JWT
claims in `request.jwt.claims`, exactly as PostgREST binds them — inside a
transaction that is always rolled back. A mock could not tell you whether a
policy is correct. This can, and did.

End-to-end tests skip unless `E2E=1`, so a fresh checkout still gets a green
`npm test` from the suites that guard the security properties.

---

## Extension points

The brief excludes booking, ordering and payments from v1. The schema leaves room:

- `items.service_duration_minutes` and `preparation_time_minutes` are already there
- `branches.opening_hours` and `branches.timezone` support availability windows
- `modifier_groups` already carry the selection constraints an order builder needs
- `item_branch_settings` already models per-branch price and availability
- `offers` already resolve to an effective price

An orders feature would add `orders` and `order_items` with a `tenant_id`, and
inherit the isolation model unchanged — the RLS policy generator in
`0006_rls.sql` takes a table name and a permission key, so a new tenant-owned
table is two lines.
