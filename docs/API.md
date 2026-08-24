# Public Catalog API — v1

Read-only API for the customer-facing menu frontend.

- **Base URL** — `https://<your-platform>/api/v1/public`
- **Machine-readable spec** — `GET /api/v1/public/openapi.json` (OpenAPI 3.1, served live)
- **Authentication** — none. Access is controlled by an origin allowlist and per-address rate limits.

---

## Response envelope

Every successful response has the same shape:

```jsonc
{
  "data": {/* endpoint-specific */},
  "meta": {
    "locale": "ar", // the language actually served
    "fallbackLocale": "en", // what untranslated content fell back to
    "currency": { "code": "OMR", "symbol": "ر.ع.", "decimalDigits": 3 },
    "generatedAt": "2026-06-01T09:12:44.101Z",
    "version": "v1",
  },
}
```

Errors:

```jsonc
{
  "error": {
    "code": "not_found",
    "message": "No published business matches that identifier.",
  },
}
```

| Code                 | HTTP | Meaning                                                 |
| -------------------- | ---- | ------------------------------------------------------- |
| `bad_request`        | 400  | Malformed slug, locale, identifier or body              |
| `origin_not_allowed` | 403  | The `Origin` header is not in `PUBLIC_API_CORS_ORIGINS` |
| `not_found`          | 404  | No published business, branch or item matches           |
| `rate_limited`       | 429  | See `X-RateLimit-*` and `Retry-After`                   |
| `internal_error`     | 500  | Something failed server-side; no detail is leaked       |

A business that is **suspended, soft-deleted, or out of subscription** returns
`404`, identical to one that never existed. The API does not confirm that such a
slug exists.

---

## Language

Request a language with `?locale=ar` or the `Accept-Language` header; the query
parameter wins. A region subtag is accepted and narrowed (`ar-OM` → `ar`).

If the business does not publish the requested language, the response falls back
to its default and `meta.locale` tells you what you actually received. Within a
response, any individual field with no translation falls back to the default
language, then to any available translation — a half-translated catalog still
renders something readable rather than a blank card.

---

## Rate limits

| Scope     | Default                         |
| --------- | ------------------------------- |
| Reads     | 120 requests/minute per address |
| Analytics | 240 requests/minute per address |

Every response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and
`X-RateLimit-Reset`; a `429` adds `Retry-After`.

## Caching

Read endpoints send `Cache-Control: public, max-age=0, s-maxage=60,
stale-while-revalidate=120` by default (`PUBLIC_API_CACHE_SECONDS`), so a CDN
absorbs menu traffic while edits still appear promptly.

---

## Endpoints

### `GET /businesses/{slug}`

Business profile, branding and branch summary.

```jsonc
{
  "data": {
    "business": {
      "id": "0f2c…", // stable public UUID, not the internal id
      "slug": "bait-al-mandi",
      "name": "Bait Al Mandi",
      "businessType": "restaurant",
      "logoUrl": "https://…",
      "contact": {
        "email": "…",
        "phone": "…",
        "whatsapp": "…",
        "website": "…",
      },
      "address": { "line": "…", "city": "Muscat", "country": "OM" },
      "timezone": "Asia/Muscat",
      "defaultLocale": "en",
      "supportedLocales": ["en", "ar", "fa"],
      "currency": { "code": "OMR", "symbol": "ر.ع.", "decimalDigits": 3 },
      "branding": {
        "primaryColor": "#1F45FF",
        "priceDisplayFormat": "symbol_before",
        "showPrices": true,
        "taxDisplay": "inclusive",
        "taxRate": 5,
        "taxLabel": "VAT",
        "socialLinks": { "instagram": "…" },
      },
    },
    "branches": [/* Branch */],
  },
}
```

### `GET /businesses/{slug}/branches`

Active branches with opening hours, coordinates and QR targets.

```jsonc
{
  "id": "9b1e…",
  "slug": "main",
  "name": "Bait Al Mandi — Qurum",
  "address": { "line": "…", "city": "Muscat", "country": "OM" },
  "phone": "+968 …",
  "whatsapp": "+968 …",
  "location": { "latitude": 23.588, "longitude": 58.3829 },
  "timezone": "Asia/Muscat",
  "openingHours": [
    { "day": 0, "closed": false, "open": "08:00", "close": "23:30" },
  ],
  "menuCode": "a1b2c3d4e5f6",
  "qrTargetUrl": null,
}
```

`day` is `0` = Sunday.

### `GET /businesses/{slug}/branches/{branchSlug}/menu`

**The primary endpoint.** One call returns everything a menu screen needs.

Query parameters: `locale`, `categorySlug`, `search`.

```jsonc
{
  "data": {
    "business": {/* Business */},
    "branch": {/* Branch */},
    "categories": [
      {
        "id": "c1…",
        "slug": "main-courses",
        "name": "الأطباق الرئيسية",
        "description": "",
        "imageUrl": null,
        "icon": null,
        "color": null,
        "itemCount": 3,
        "items": [
          {
            "id": "3f8a…",
            "sku": "MC-001",
            "name": "مندي لحم",
            "description": "لحم مطهو ببطء فوق أرز بسمتي مدخن.",
            "ingredients": "",
            "price": {
              "base": 6.5,
              "sale": 5.75,
              "effective": 5.525, // best applicable offer already applied
              "currency": "OMR",
              "decimalDigits": 3,
            },
            "offer": {
              "id": "…",
              "name": "Family Friday",
              "type": "percentage",
              "value": 15,
              "endsAt": "…",
            },
            "imageUrl": "https://…",
            "gallery": [],
            "availability": { "inStock": true, "availableUntil": null },
            "badges": { "featured": true, "new": false, "popular": true },
            "dietaryTags": ["halal"],
            "allergens": ["nuts"],
            "attributes": {
              "calories": 890,
              "preparationTimeMinutes": 35,
              "spiceLevel": null,
            },
            "modifierGroups": [
              {
                "id": "…",
                "code": "portion-size",
                "name": "حجم الوجبة",
                "selectionType": "single",
                "required": true,
                "minSelections": 1,
                "maxSelections": 1,
                "options": [
                  {
                    "id": "…",
                    "name": "كامل",
                    "priceAdjustment": 0,
                    "isDefault": true,
                    "available": true,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    "offers": [/* live offers */],
    "itemCount": 12,
  },
}
```

Notes that matter when building against this:

- **`price.effective` is authoritative.** The best applicable offer and any sale
  price are already resolved. Do not reimplement discount logic.
- **Branch overrides are already applied.** `price.base` reflects a
  branch-specific price where the business has configured one.
- **Out-of-stock items are present**, with `availability.inStock: false`. Render
  them greyed out; do not filter them away. `availableUntil` is set for a
  temporary stock-out that clears itself.
- **Format prices with `decimalDigits`**, not with a hard-coded `2`. OMR, KWD and
  BHD use three.
- Items with no category appear in a synthetic `uncategorised` category.

### `GET /businesses/{slug}/categories`

The same category objects without their `items` — useful for navigation.

### `GET /businesses/{slug}/items/{itemId}`

One item with its modifier groups. `itemId` is the **public UUID** from a menu
response, never an internal identifier.

### `GET /businesses/{slug}/offers`

Only offers that are live at this instant. Scheduled and expired offers are
excluded by the database itself, so this endpoint cannot advertise a promotion
that has ended.

### `POST /analytics/events`

Accepts a single event or `{ "events": [ … ] }` with up to 50.

```jsonc
{
  "businessSlug": "bait-al-mandi",
  "type": "item_view",
  "branchSlug": "main",
  "itemId": "3f8a…",
  "categoryId": "c1…",
  "offerId": "…",
  "locale": "ar",
  "searchQuery": "mandi",
  "searchResultsCount": 4,
  "deviceType": "mobile",
  "sessionId": "<opaque client value>",
}
```

Types: `menu_view`, `category_view`, `item_view`, `search`, `language_change`,
`offer_view`, `branch_view`. A `search` event must include `searchQuery`.

Returns `202` with `{ "accepted": n, "rejected": n }`. Events for a business that
is not currently published are counted as rejected rather than erroring, so a
cached frontend does not fail on a business that has just been suspended.

**Privacy.** No IP address, cookie or personal data is stored. `sessionId` is
re-hashed server-side with the tenant, the UTC date and a server secret — enough
to count unique sessions for one business on one day, and impossible to correlate
across days or businesses. Referrers are reduced to a bare host.

### `GET /health`

Liveness probe. Reveals nothing about platform state.

---

## Recommended client patterns

**Send the session id, not a user id.** Generate an opaque random value per
browser session and reuse it for that visit only.

**Batch analytics.** Collect events and flush on navigation or a timer rather
than firing one request per interaction.

**Cache the menu.** It is CDN-cacheable and changes on the order of minutes.
Re-fetch on language change or when the visitor returns after a while.

**Handle 404 as "not published".** Show a neutral "menu unavailable" state; the
business may be suspended or between subscriptions, and neither is the visitor's
problem to interpret.
