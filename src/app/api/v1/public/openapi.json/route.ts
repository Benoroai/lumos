import { NextResponse } from "next/server";
import { resolveCorsHeaders } from "@/lib/api/cors";
import { publicEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * OpenAPI 3.1 description of the public catalog API, served from the running
 * application so it can never describe a version that is not deployed.
 */
export async function GET(request: Request) {
  const server = `${publicEnv.NEXT_PUBLIC_APP_URL}/api/v1/public`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: `${publicEnv.NEXT_PUBLIC_APP_NAME} Public Catalog API`,
      version: "1.0.0",
      description:
        "Read-only catalog API for customer-facing menu frontends. Returns only published, " +
        "in-window content belonging to businesses with an active subscription. No authentication " +
        "is required; access is controlled by an origin allowlist and per-address rate limits.",
      contact: { name: "Platform administrator" },
    },
    servers: [{ url: server }],
    tags: [
      {
        name: "Business",
        description: "Business profile, branding and branches",
      },
      { name: "Menu", description: "Localized catalog content" },
      { name: "Analytics", description: "Privacy-conscious usage reporting" },
    ],
    paths: {
      "/businesses/{slug}": {
        get: {
          tags: ["Business"],
          summary: "Business profile and branches",
          parameters: [
            ref("SlugParam"),
            ref("LocaleParam"),
            ref("AcceptLanguage"),
          ],
          responses: {
            200: jsonResponse("Business profile", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    business: { $ref: "#/components/schemas/Business" },
                    branches: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Branch" },
                    },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            404: ref("NotFound", "responses"),
            429: ref("RateLimited", "responses"),
          },
        },
      },
      "/businesses/{slug}/branches": {
        get: {
          tags: ["Business"],
          summary: "List active branches",
          parameters: [ref("SlugParam")],
          responses: {
            200: jsonResponse("Branches", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    branches: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Branch" },
                    },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            404: ref("NotFound", "responses"),
          },
        },
      },
      "/businesses/{slug}/branches/{branchSlug}/menu": {
        get: {
          tags: ["Menu"],
          summary: "Full localized menu for one branch",
          description:
            "The primary endpoint. Returns categories with their items, per-branch availability and " +
            "pricing, live offers already applied to each item, and currency formatting metadata. " +
            "Out-of-stock items are still returned, flagged through `availability.inStock`.",
          parameters: [
            ref("SlugParam"),
            {
              name: "branchSlug",
              in: "path",
              required: true,
              schema: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
            },
            ref("LocaleParam"),
            {
              name: "categorySlug",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Restrict the response to a single category.",
            },
            {
              name: "search",
              in: "query",
              required: false,
              schema: { type: "string", maxLength: 120 },
              description:
                "Filter items by name or description in the requested locale.",
            },
            ref("AcceptLanguage"),
          ],
          responses: {
            200: jsonResponse("Menu", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    business: { $ref: "#/components/schemas/Business" },
                    branch: { $ref: "#/components/schemas/Branch" },
                    categories: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Category" },
                    },
                    offers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Offer" },
                    },
                    itemCount: { type: "integer" },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            402: ref("SubscriptionInactive", "responses"),
            404: ref("NotFound", "responses"),
            429: ref("RateLimited", "responses"),
          },
        },
      },
      "/businesses/{slug}/categories": {
        get: {
          tags: ["Menu"],
          summary: "Categories without items",
          parameters: [ref("SlugParam"), ref("LocaleParam")],
          responses: {
            200: jsonResponse("Categories", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    categories: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Category" },
                    },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            404: ref("NotFound", "responses"),
          },
        },
      },
      "/businesses/{slug}/items/{itemId}": {
        get: {
          tags: ["Menu"],
          summary: "One item with its modifier groups",
          parameters: [
            ref("SlugParam"),
            {
              name: "itemId",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
              description:
                "The item's stable public identifier. Internal ids are never exposed.",
            },
            ref("LocaleParam"),
          ],
          responses: {
            200: jsonResponse("Item", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    item: { $ref: "#/components/schemas/Item" },
                    category: { type: "object" },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            404: ref("NotFound", "responses"),
          },
        },
      },
      "/businesses/{slug}/offers": {
        get: {
          tags: ["Menu"],
          summary: "Currently live offers",
          description:
            "Scheduled and expired offers are excluded by the database.",
          parameters: [ref("SlugParam"), ref("LocaleParam")],
          responses: {
            200: jsonResponse("Offers", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    offers: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Offer" },
                    },
                  },
                },
                meta: { $ref: "#/components/schemas/Meta" },
              },
            }),
            404: ref("NotFound", "responses"),
          },
        },
      },
      "/analytics/events": {
        post: {
          tags: ["Analytics"],
          summary: "Report menu usage",
          description:
            "Accepts a single event or a batch of up to 50. No IP address, cookie or personal data " +
            "is stored: `sessionId` is re-hashed server-side with a daily salt so it can only be " +
            "used to count unique sessions for one business on one day.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/AnalyticsEvent" },
                    {
                      type: "object",
                      required: ["events"],
                      properties: {
                        events: {
                          type: "array",
                          minItems: 1,
                          maxItems: 50,
                          items: {
                            $ref: "#/components/schemas/AnalyticsEvent",
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          responses: {
            202: jsonResponse("Accepted", {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    accepted: { type: "integer" },
                    rejected: {
                      type: "integer",
                      description:
                        "Events discarded because the business is not currently published.",
                    },
                  },
                },
              },
            }),
            400: ref("BadRequest", "responses"),
            429: ref("RateLimited", "responses"),
          },
        },
      },
      "/health": {
        get: {
          tags: ["Business"],
          summary: "Liveness probe",
          responses: { 200: jsonResponse("OK", { type: "object" }) },
        },
      },
    },
    components: {
      parameters: {
        SlugParam: {
          name: "slug",
          in: "path",
          required: true,
          schema: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
          description: "The public slug of the business.",
        },
        LocaleParam: {
          name: "locale",
          in: "query",
          required: false,
          schema: { type: "string", example: "ar" },
          description:
            "Requested language. Falls back to the business's default language for any content " +
            "not translated into it.",
        },
        AcceptLanguage: {
          name: "Accept-Language",
          in: "header",
          required: false,
          schema: { type: "string" },
          description: "Used when `locale` is not supplied.",
        },
      },
      responses: {
        BadRequest: errorResponse("The request was malformed."),
        NotFound: errorResponse(
          "No published business, branch or item matches. Also returned for a business that is " +
            "suspended or whose subscription has lapsed — the API does not distinguish between them.",
        ),
        SubscriptionInactive: errorResponse(
          "This business is not currently serving its public menu.",
        ),
        RateLimited: errorResponse(
          "Too many requests. See the X-RateLimit-* headers.",
        ),
      },
      schemas: {
        Meta: {
          type: "object",
          properties: {
            locale: { type: "string" },
            fallbackLocale: { type: "string" },
            currency: { $ref: "#/components/schemas/Currency" },
            generatedAt: { type: "string", format: "date-time" },
            version: { type: "string" },
          },
        },
        Currency: {
          type: "object",
          properties: {
            code: { type: "string", example: "OMR" },
            symbol: { type: "string" },
            decimalDigits: {
              type: "integer",
              example: 3,
              description: "OMR, KWD and BHD use three decimal places.",
            },
          },
        },
        Business: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
              description: "Stable public identifier.",
            },
            slug: { type: "string" },
            name: { type: "string" },
            businessType: {
              type: "string",
              enum: ["restaurant", "cafe", "salon", "barbershop", "custom"],
            },
            logoUrl: { type: ["string", "null"] },
            contact: { type: "object" },
            address: { type: "object" },
            timezone: { type: "string", example: "Asia/Muscat" },
            defaultLocale: { type: "string" },
            supportedLocales: { type: "array", items: { type: "string" } },
            currency: { $ref: "#/components/schemas/Currency" },
            branding: { type: ["object", "null"] },
          },
        },
        Branch: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            name: { type: "string" },
            address: { type: "object" },
            phone: { type: ["string", "null"] },
            whatsapp: { type: ["string", "null"] },
            location: { type: ["object", "null"] },
            timezone: { type: "string" },
            openingHours: { type: "array", items: { type: "object" } },
            menuCode: { type: "string" },
            qrTargetUrl: { type: ["string", "null"] },
          },
        },
        Category: {
          type: "object",
          properties: {
            id: { type: "string" },
            slug: { type: "string" },
            name: { type: "string" },
            description: { type: "string" },
            imageUrl: { type: ["string", "null"] },
            icon: { type: ["string", "null"] },
            color: { type: ["string", "null"] },
            itemCount: { type: "integer" },
            items: {
              type: "array",
              items: { $ref: "#/components/schemas/Item" },
            },
          },
        },
        Item: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            sku: { type: ["string", "null"] },
            name: { type: "string" },
            description: { type: "string" },
            ingredients: { type: "string" },
            price: {
              type: "object",
              properties: {
                base: { type: "number" },
                sale: { type: ["number", "null"] },
                effective: {
                  type: "number",
                  description:
                    "Base price after the best applicable offer or sale price.",
                },
                currency: { type: "string" },
                decimalDigits: { type: "integer" },
              },
            },
            offer: { type: ["object", "null"] },
            imageUrl: { type: ["string", "null"] },
            gallery: { type: "array", items: { type: "object" } },
            availability: {
              type: "object",
              properties: {
                inStock: { type: "boolean" },
                availableUntil: {
                  type: ["string", "null"],
                  format: "date-time",
                  description: "When a temporary stock-out clears itself.",
                },
              },
            },
            badges: { type: "object" },
            dietaryTags: { type: "array", items: { type: "string" } },
            allergens: { type: "array", items: { type: "string" } },
            attributes: { type: "object" },
            modifierGroups: { type: "array", items: { type: "object" } },
          },
        },
        Offer: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            description: { type: "string" },
            type: {
              type: "string",
              enum: ["percentage", "fixed_amount", "promotional_price"],
            },
            value: { type: "number" },
            startsAt: { type: "string", format: "date-time" },
            endsAt: { type: ["string", "null"], format: "date-time" },
            imageUrl: { type: ["string", "null"] },
          },
        },
        AnalyticsEvent: {
          type: "object",
          required: ["businessSlug", "type"],
          properties: {
            businessSlug: { type: "string" },
            type: {
              type: "string",
              enum: [
                "menu_view",
                "category_view",
                "item_view",
                "search",
                "language_change",
                "offer_view",
                "branch_view",
              ],
            },
            branchSlug: { type: "string" },
            categoryId: { type: "string", format: "uuid" },
            itemId: { type: "string", format: "uuid" },
            offerId: { type: "string", format: "uuid" },
            locale: { type: "string" },
            searchQuery: { type: "string", maxLength: 200 },
            searchResultsCount: { type: "integer", minimum: 0 },
            deviceType: {
              type: "string",
              enum: ["mobile", "tablet", "desktop", "unknown"],
            },
            sessionId: {
              type: "string",
              maxLength: 64,
              description:
                "Opaque client-generated value. Re-hashed server-side with a daily salt; never stored as sent.",
            },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: {
      ...resolveCorsHeaders(request.headers.get("origin")),
      "Cache-Control": "public, max-age=0, s-maxage=3600",
    },
  });
}

function ref(name: string, kind: "parameters" | "responses" = "parameters") {
  return { $ref: `#/components/${kind}/${name}` };
}

function jsonResponse(description: string, schema: Record<string, unknown>) {
  return { description, content: { "application/json": { schema } } };
}

function errorResponse(description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            error: {
              type: "object",
              properties: {
                code: { type: "string" },
                message: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}
