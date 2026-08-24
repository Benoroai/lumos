# Testing

```bash
npm test              # unit + database
npm run test:unit     # pure logic (jsdom)
npm run test:db       # RLS and schema behaviour against real PostgreSQL
npm run test:e2e      # Playwright — needs a running, seeded app
npm run verify        # format:check + lint + typecheck + test
```

---

## Unit tests — `tests/unit`

Pure functions, no database, no network.

| File                    | Covers                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `subscriptions.test.ts` | Status derivation, the 30/14/7/1-day thresholds, suspension precedence, one-year default |
| `money.test.ts`         | Three-decimal currencies, price formats, input parsing, discount arithmetic              |
| `localization.test.ts`  | Locale fallback chain, RTL detection, terminology resolution per business type           |
| `permissions.test.ts`   | Permission checks, platform-role capabilities, slug generation and validation            |
| `validation.test.ts`    | Zod schemas for business creation, items, offers, bulk actions                           |
| `public-api.test.ts`    | Locale negotiation and public API request validation                                     |

Two of these encode bugs the suite found: `warningThreshold` returned the
loosest matching threshold instead of the tightest (a subscription five days
from expiry showed the 30-day warning), and every optional numeric field
silently became `0` when left blank, because `z.coerce.number()` reads `''` as
zero and the union tried it before the empty-string branch.

---

## Database tests — `tests/db`

**These are the important ones.** They create a throwaway database, apply the
actual migrations, and drive every query as a real principal.

### Setup

```bash
createdb lumos_test
export TEST_DATABASE_URL=postgresql://127.0.0.1:5432/lumos_test
npm run test:db
```

The database named in `TEST_DATABASE_URL` is **dropped and recreated on every
run**. Never point it at anything you care about.

### How they bind a principal

Exactly the way PostgREST does — role plus verified JWT claims, inside a
transaction that is always rolled back:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<user-id>","role":"authenticated"}', true);
-- … the query under test …
rollback;
```

`supabase/bootstrap/local.sql` provides the `auth` schema, `auth.uid()` and the
`anon` / `authenticated` / `service_role` roles that Supabase supplies in a real
project. It is applied to local and test databases only, never to Supabase.

### What they cover

**`tenant-isolation.test.ts`** — the mandatory suite.

- A member sees only their own tenant, on every tenant-owned table
- A targeted lookup of another tenant's row returns nothing
- A user with no membership sees nothing at all
- Cross-tenant insert, update and delete all fail
- A member cannot grant themselves membership of another tenant
- A member cannot read `internal_notes` or write `account_status` / `slug`
- A member cannot write their own subscription
- Audit entries cannot be forged, edited or deleted by anyone
- Role permissions: viewer read-only, menu manager writes, per-user grant and revoke
- A disabled membership loses all access immediately
- Platform staff read across tenants; a deactivated one does not
- Only a super admin may write platform settings

**`public-access.test.ts`** — the anonymous surface.

- Active businesses with a live subscription are published
- Expired, suspended and soft-deleted businesses are withheld, catalog included
- Renewal restores public access immediately
- Internal notes, staff, audit logs and platform tables are unreachable
- `anon` cannot write anything, including analytics
- Inactive items are hidden; **out-of-stock items stay visible**, flagged
- Scheduled visibility windows are honoured in both directions
- Only live offers are served — not expired, scheduled, or paused ones
- Translations are served for every published language
- The platform switch that lets expired businesses keep serving works, and does
  not override a deliberate suspension

**`subscriptions.test.ts`** — lifecycle.

- Status derivation across every manual state and date offset
- Suspension and cancellation outrank the calendar
- A new business gets exactly one current subscription of exactly one year
- A second current subscription is refused; superseded periods stay in history
- A period ending before it starts is refused
- **Every catalog row survives expiry** — counted before and after

---

## End-to-end tests — `tests/e2e`

Playwright against a running application with seeded data.

```bash
npm run db:seed
E2E=1 npm run test:e2e
```

Without `E2E=1` they skip. The unit and database suites carry the security
guarantees and need no Supabase project — only a local PostgreSQL for the
latter.

| File                 | Covers                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`       | Both portals, identical failure messages for wrong password and unknown account, route guards                                                                        |
| `platform.spec.ts`   | The seven-step business wizard, one-year default, one-time password display, subscription filters, audit log, support-mode banner, expired-business notice           |
| `catalog.spec.ts`    | Category creation, item creation with a three-decimal price, quick-86 toggle, viewer restrictions, per-business-type terminology                                     |
| `rtl.spec.ts`        | Arabic and Persian flip `dir`, the sidebar mirrors to the right, forms stay usable                                                                                   |
| `public-api.spec.ts` | Response shape, localization and fallback, out-of-stock items present, expired business 404s, live-offer filtering, analytics ingestion, OpenAPI, rate-limit headers |

`public-api.spec.ts` also asserts the **negative** cases that matter: the raw
response body must not contain `internal_notes`, `tenant_id`, or seed notes.

---

## Adding tests

**A new tenant-owned table** — add it to the `it.each` list in
`tenant-isolation.test.ts`. If it should be publicly readable, add it to
`public-access.test.ts` too.

**A new permission** — add a case asserting that a role without it is refused,
and that a per-user grant enables it.

**A new public API field** — assert its shape in `public-api.spec.ts`, and if it
could carry anything internal, add it to the "never exposes" assertion.

---

## Continuous integration

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: postgres }
    ports: ["5432:5432"]
    options: >-
      --health-cmd pg_isready --health-interval 10s
      --health-timeout 5s --health-retries 5

steps:
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
    with: { node-version: 22, cache: npm }
  - run: npm ci
  - run: npm run format:check
  - run: npm run lint
  - run: npm run typecheck
  - run: npm test
    env:
      TEST_DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/lumos_test
  - run: npm run build
    env:
      NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: build-placeholder
      SUPABASE_SERVICE_ROLE_KEY: build-placeholder
```

The database suite needs only PostgreSQL — no Supabase project — so it runs on
every pull request.
