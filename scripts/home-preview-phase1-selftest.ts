/**
 * Approved HouzzatPRO homepage is the platform apex `/`.
 * `/home-preview` is not a second implementation.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PLATFORM_MARKETING_SHELL_PATHS } from "../src/lib/platform/public/platform-marketing-shell";

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const liveHome = read("src/app/(marketing)/page.tsx");
const liveLayout = read("src/app/(marketing)/layout.tsx");
const liveHeader = read(
  "src/components/platform/public/PlatformMarketingHeader.tsx",
);
const sitemap = read("src/app/sitemap.ts");
const robots = read("src/app/robots.ts");
const preview = read("src/components/platform/public/HomePreviewPage.tsx");
const nav = read("src/components/platform/public/HomePreviewNav.tsx");
const footer = read("src/components/platform/public/HomePreviewFinalCta.tsx");
const middleware = read("src/middleware.ts");

assert.ok(liveHome.includes("HomePreviewPage"));
assert.ok(liveHome.includes("HomePreviewMotion"));
assert.ok(!liveHome.includes("<HouzzatProPlatformHome"));
assert.ok(!liveHome.includes("HouzzatProPlatformHome.tsx"));
assert.ok(
  !existsSync(new URL("../src/app/home-preview/page.tsx", import.meta.url)),
);
assert.ok(liveLayout.includes("isHouzzatProPlatformHomeRequest"));
assert.ok(liveLayout.includes('robots: { index: true, follow: true }'));
assert.ok(!liveHeader.includes("home-preview"));
assert.ok(!sitemap.includes("home-preview"));
assert.ok(robots.includes('"/home-preview"'));
assert.ok(
  !(PLATFORM_MARKETING_SHELL_PATHS as readonly string[]).includes(
    "/home-preview",
  ),
);
assert.ok(middleware.includes('pathname === "/home-preview"'));
assert.ok(middleware.includes("308"));
assert.ok(nav.includes('href="/"'));
assert.ok(footer.includes('href="/"'));
assert.ok(!nav.includes('href="/home-preview"'));
assert.ok(!footer.includes('href="/home-preview"'));
assert.ok(preview.includes("PLATFORM_HOME_PRIMARY_CTA_HREF"));
assert.ok(preview.includes("See How It Works"));
assert.ok(preview.includes("Grow Your"));

console.log("home-preview promotion selftest PASS");
