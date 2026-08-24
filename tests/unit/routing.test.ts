import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const APP = resolve(process.cwd(), "src/app");

/**
 * A guarded layout must never wrap the page it redirects to.
 *
 * `/admin/login` originally sat inside `src/app/admin/layout.tsx`, which
 * redirects unauthenticated visitors to `/admin/login` — so rendering the login
 * page ran the guard, which redirected to the login page, forever. The page
 * still server-rendered, so a naive status check passed while the browser span
 * on it. These tests assert the structural invariant instead.
 */

/** Every `layout.tsx` that performs a redirect, and where it sends people. */
function guardedLayouts(): { dir: string; redirectsTo: string[] }[] {
  const found: { dir: string; redirectsTo: string[] }[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "layout.tsx") {
        const source = readFileSync(full, "utf8");
        const targets = [
          ...source.matchAll(/redirect\(\s*['"`](\/[^'"`]*)['"`]/g),
        ].map((m) => m[1]!);
        if (targets.length) {
          found.push({
            dir: dir.replace(APP, "") || "/",
            redirectsTo: [...new Set(targets)],
          });
        }
      }
    }
  }

  walk(APP);
  return found;
}

/** The URL path a layout directory governs, with route groups stripped. */
function routePrefix(layoutDir: string): string {
  const stripped = layoutDir.replace(/\/\([^)]+\)/g, "");
  return stripped === "" ? "/" : stripped;
}

describe("route guards", () => {
  const layouts = guardedLayouts();

  it("finds the guarded layouts", () => {
    // If this drops to zero the walk broke and every assertion below is vacuous.
    expect(layouts.length).toBeGreaterThan(0);
  });

  it.each(layouts)(
    "the layout at $dir does not wrap the routes it redirects to",
    ({ dir, redirectsTo }) => {
      const prefix = routePrefix(dir);

      for (const target of redirectsTo) {
        if (prefix === "/") continue;
        if (!target.startsWith(`${prefix}/`) && target !== prefix) continue;

        // The target is under this layout's URL prefix. That is only safe if it
        // resolves to a page file outside the layout's own directory.
        const insideThisLayout = existsSync(
          join(APP, dir, target.slice(prefix.length), "page.tsx"),
        );

        expect(
          insideThisLayout,
          `${dir}/layout.tsx redirects to ${target}, which it also wraps — that is an infinite redirect loop. ` +
            `Move the guarded pages into a route group so the redirect target sits outside the layout.`,
        ).toBe(false);
      }
    },
  );

  it("keeps the authentication pages outside the guarded portals", () => {
    const unguarded = [
      "admin/login",
      "admin/forgot-password",
      "admin/change-password",
      "login",
      "forgot-password",
      "change-password",
      "reset-password",
      "account/suspended",
      "account/archived",
    ];

    for (const route of unguarded) {
      expect(
        existsSync(join(APP, route, "page.tsx")),
        `${route} should exist`,
      ).toBe(true);

      // No layout.tsx may sit on the path between src/app and the page.
      const segments = route.split("/");
      for (let depth = 1; depth < segments.length; depth += 1) {
        const ancestor = join(APP, ...segments.slice(0, depth), "layout.tsx");
        expect(
          existsSync(ancestor),
          `${ancestor} would wrap the unauthenticated page /${route}`,
        ).toBe(false);
      }
    }
  });
});
