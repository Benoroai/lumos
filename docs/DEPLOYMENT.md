# Deployment

## Overview

Two pieces of infrastructure:

1. **Supabase project** — PostgreSQL, Auth, Storage.
2. **Next.js application** — any Node host. Vercel is the smoothest fit; the
   application is a standard Next.js build with no platform-specific APIs.

The customer-facing menu deploys separately and talks to the public API.

---

## 1. Supabase

Create a project, then note from **Settings → API**:

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server only**)

And from **Settings → Database** the connection string → `DATABASE_URL`.

### Apply migrations

```bash
DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres" \
  npm run db:migrate
```

Do **not** pass `--bootstrap` against Supabase — that flag installs a local shim
for the `auth` schema and roles that Supabase already provides.

Migration `0007_storage` creates the `tenant-media` bucket and its policies. If
your project restricts bucket creation, create `tenant-media` manually first
(public read, 5 MB limit, image MIME types) and re-run.

### Auth settings

In **Authentication → URL Configuration**:

- Site URL → your application URL
- Redirect URLs → add `https://<your-app>/reset-password` and
  `https://<your-app>/admin/reset-password`

Email confirmation can stay on. Accounts created by the Super Admin are
confirmed programmatically so an owner can sign in the moment they are handed
their temporary password.

### Create the first Platform Super Admin

```bash
PLATFORM_SUPER_ADMIN_EMAIL="you@company.com" \
PLATFORM_SUPER_ADMIN_PASSWORD="<a strong password>" \
  npm run db:seed
```

On production, sign in immediately and change the password. The seed also
creates four demo businesses — for a clean production database, run the
migrations and create the admin, then delete the demo tenants from the Super
Admin portal, or run only the migrations and insert the `platform_users` row by
hand.

---

## 2. Application

### Vercel

1. Import the repository.
2. Add every variable from `.env.example` under **Settings → Environment Variables**.
3. Mark `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` as
   sensitive. They are read server-side only and are never inlined into a client
   bundle — `serverEnv()` throws if it is reached in a browser.
4. Deploy. Build command `npm run build`, output handled by the Next.js preset.

### Any Node host

```bash
npm ci
npm run build
npm run start          # defaults to port 3000
```

Node 20.11 or newer. Put a TLS terminator in front and forward
`X-Forwarded-For` — rate limiting and audit metadata read it.

### Docker

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 3000
CMD ["npm", "run", "start"]
```

---

## 3. Configure the public API

```bash
PUBLIC_API_CORS_ORIGINS="https://menu.example.com,https://www.example.com"
PUBLIC_API_RATE_LIMIT_PER_MINUTE="120"
PUBLIC_API_ANALYTICS_RATE_LIMIT_PER_MINUTE="240"
PUBLIC_API_CACHE_SECONDS="60"
PUBLIC_API_BLOCK_EXPIRED_SUBSCRIPTIONS="true"
```

Never leave `*` in the allowlist in production. Verify:

```bash
curl -i https://<your-app>/api/v1/public/health
curl -i -H "Origin: https://menu.example.com" \
  https://<your-app>/api/v1/public/businesses/<slug>
```

The second must return `Access-Control-Allow-Origin`; an origin outside the
allowlist must not.

---

## 4. AI translation (optional)

```bash
AI_TRANSLATION_PROVIDER="anthropic"
AI_TRANSLATION_MODEL="claude-sonnet-5"
ANTHROPIC_API_KEY="sk-ant-…"
```

Leave `AI_TRANSLATION_PROVIDER=echo` and the feature still works end to end with
a deterministic offline stub — useful for staging. If a provider is selected but
its key is missing, the platform logs a warning and falls back to the stub
rather than failing a translation job.

---

## Production checklist

**Secrets**

- [ ] `SUPABASE_SERVICE_ROLE_KEY` set as a sensitive variable, never `NEXT_PUBLIC_`
- [ ] `PLATFORM_SUPER_ADMIN_PASSWORD` rotated after first sign-in
- [ ] Demo/seed businesses removed from the production database

**Public API**

- [ ] `PUBLIC_API_CORS_ORIGINS` lists real origins, not `*`
- [ ] Rate limits appropriate for expected traffic
- [ ] `/api/v1/public/health` reachable; `/api/v1/public/openapi.json` correct

**Database**

- [ ] All migrations applied (`select * from public._migrations`)
- [ ] RLS enabled on every table:
      `select tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity;`
      must return no rows
- [ ] Point-in-time recovery / backups enabled in Supabase

**Storage**

- [ ] `tenant-media` bucket exists with its policies
- [ ] `MEDIA_MAX_UPLOAD_BYTES` matches the bucket's file size limit

**Application**

- [ ] `npm run verify` green
- [ ] `E2E=1 npm run test:e2e` green against staging
- [ ] Security headers present (`curl -I https://<your-app>/login`)

---

## Operations

### Verifying isolation after a schema change

```bash
createdb lumos_test
TEST_DATABASE_URL=postgresql://127.0.0.1:5432/lumos_test npm run test:db
```

This applies the real migrations to a throwaway database and exercises the real
policies as real principals. Treat a failure here as a release blocker: it means
a tenant boundary moved.

### Subscription expiry

Nothing to schedule. Expiry is derived from `expires_at` every time it is read,
in SQL and in TypeScript. A subscription that lapses at midnight starts behaving
as expired at midnight, with no job involved.

### Rotating the service-role key

The impersonation cookie is HMAC-signed with the service-role key, so rotating it
invalidates any in-flight support sessions. That is the intended behaviour —
operators simply re-enter support mode.

### Monitoring

Worth alerting on:

- `audit_logs` where `action = 'support.impersonation_started'` — support access
- `login_audit` where `was_successful = false`, grouped by email — credential stuffing
- `rate_limits` rows with a high `hit_count` — abuse or a misbehaving client
- Subscriptions inside 7 days of expiry — the Super Admin overview shows these,
  but a scheduled query is a useful backstop

### Backups

Supabase point-in-time recovery covers the database. Storage objects are
separate — configure bucket backups if media loss is unacceptable.

Note that "deletion" in this platform is almost always a soft delete: a
suspended or deleted business keeps every row and can be restored from the Super
Admin portal without touching a backup.
