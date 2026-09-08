/**
 * V1 — HouzzatPRO platform root + minimum home selftest.
 * Run: pnpm stage-6.11-v1-houzzatpro-platform-home:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchesHouzzatProPlatformHome,
  matchesHouzzatProPlatformMarketingShell,
  PLATFORM_HOME_DOCUMENT_DESCRIPTION,
  PLATFORM_HOME_DOCUMENT_TITLE,
  PLATFORM_HOME_PRIMARY_CTA_HREF,
  PLATFORM_HOME_SECONDARY_CTA_HREF,
  PLATFORM_MARKETING_SHELL_PATHS,
} from "@/lib/platform/public";
import { isHouzzatProPlatformRoot } from "@/lib/tenancy/platform-hostname";
import { blocksTenantHostnameResolution } from "@/lib/tenancy/reserved-domains";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== V1 HOUZZATPRO PLATFORM HOME ===\n");

  // A. apex / and www /
  {
    assert.equal(
      matchesHouzzatProPlatformHome({
        hostname: "houzzatpro.com",
        pathname: "/",
      }),
      true,
    );
    assert.equal(
      matchesHouzzatProPlatformHome({
        hostname: "www.houzzatpro.com",
        pathname: "/",
      }),
      true,
    );
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "houzzatpro.com",
        pathname: "/",
      }),
      true,
    );
    console.log("[A] apex + www home match... PASS");
  }

  // B. tenant / must NOT match platform home/shell
  {
    assert.equal(
      matchesHouzzatProPlatformHome({
        hostname: "acme.houzzatpro.com",
        pathname: "/",
      }),
      false,
    );
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "acme.houzzatpro.com",
        pathname: "/",
      }),
      false,
    );
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "houzzat.com",
        pathname: "/",
      }),
      false,
    );
    console.log("[B] tenant / excluded from platform shell... PASS");
  }

  // C. unknown host fails closed for platform shell + G.7C block on apex
  {
    assert.equal(
      matchesHouzzatProPlatformHome({
        hostname: "evil.example.com",
        pathname: "/",
      }),
      false,
    );
    assert.equal(
      blocksTenantHostnameResolution("houzzatpro.com"),
      "platform_houzzatpro_root",
    );
    assert.equal(
      blocksTenantHostnameResolution("www.houzzatpro.com"),
      "platform_houzzatpro_root",
    );
    assert.equal(isHouzzatProPlatformRoot("unknown.example"), false);
    console.log("[C] unknown host / apex non-tenant... PASS");
  }

  // D. apex /terms + /privacy
  {
    for (const path of ["/terms", "/privacy"] as const) {
      assert.equal(
        matchesHouzzatProPlatformMarketingShell({
          hostname: "houzzatpro.com",
          pathname: path,
        }),
        true,
      );
      assert.equal(
        matchesHouzzatProPlatformMarketingShell({
          hostname: "www.houzzatpro.com",
          pathname: path,
        }),
        true,
      );
      assert.equal(
        matchesHouzzatProPlatformMarketingShell({
          hostname: "acme.houzzatpro.com",
          pathname: path,
        }),
        false,
      );
    }
    assert.deepEqual(
      [...PLATFORM_MARKETING_SHELL_PATHS],
      ["/", "/terms", "/privacy", "/pricing", "/templates"],
    );
    console.log("[D] apex terms/privacy shell match... PASS");
  }

  // E. CTA destinations
  {
    assert.equal(PLATFORM_HOME_PRIMARY_CTA_HREF, "/book-a-demo");
    assert.equal(
      PLATFORM_HOME_SECONDARY_CTA_HREF,
      "https://app.houzzatpro.com/pro/sign-in",
    );
    const home = read(
      "src/components/platform/public/HouzzatProPlatformHome.tsx",
    );
    const header = read(
      "src/components/platform/public/PlatformMarketingHeader.tsx",
    );
    const footer = read(
      "src/components/platform/public/PlatformMarketingFooter.tsx",
    );
    const copy = read("src/lib/platform/public/platform-home-copy.ts");
    for (const src of [home, header, footer, copy]) {
      assert.ok(!src.includes("/auth/sign-up"));
      assert.ok(!src.includes('"/auth/sign-in"'));
      assert.ok(!src.includes("'/auth/sign-in'"));
    }
    assert.ok(home.includes("PLATFORM_HOME_PRIMARY_CTA_HREF"));
    assert.ok(home.includes("Coming soon"));
    assert.ok(copy.includes("Team Signature"));
    assert.ok(copy.includes("coming_soon"));
    assert.ok(!copy.includes("$399"));
    assert.ok(!copy.includes("Start free trial"));
    console.log("[E] CTA destinations + no consumer auth... PASS");
  }

  // F. wiring: layout + page branch
  {
    const layout = read("src/app/(marketing)/layout.tsx");
    assert.ok(layout.includes("isHouzzatProPlatformMarketingShellRequest"));
    assert.ok(layout.includes("PlatformMarketingHeader"));
    assert.ok(layout.includes("PlatformMarketingFooter"));
    assert.ok(layout.includes("PLATFORM_HOME_DOCUMENT_TITLE"));
    assert.ok(
      layout.includes("isHouzzatProPlatformBookDemoRequest") &&
        layout.includes("isHouzzatProPlatformPrivateOfferRequest") &&
        layout.includes("isHouzzatProPlatformSupportRequest"),
    );

    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("isHouzzatProPlatformHomeRequest"));
    assert.ok(page.includes("HouzzatProPlatformHome"));
    assert.ok(page.includes("resolveMarketingPresentationBrand"));

    const terms = read("src/app/(marketing)/terms/page.tsx");
    const privacy = read("src/app/(marketing)/privacy/page.tsx");
    assert.ok(terms.includes("isHouzzatProPlatformRoot"));
    assert.ok(privacy.includes("isHouzzatProPlatformRoot"));
    assert.ok(terms.includes("HOUZZATPRO_TERMS_MARKDOWN"));
    assert.ok(privacy.includes("HOUZZATPRO_PRIVACY_MARKDOWN"));

    assert.ok(PLATFORM_HOME_DOCUMENT_TITLE.includes("HouzzatPRO"));
    assert.ok(PLATFORM_HOME_DOCUMENT_DESCRIPTION.length > 40);
    console.log("[F] layout/page/legal wiring... PASS");
  }

  // G. no arbitrary route bypass
  {
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "houzzatpro.com",
        pathname: "/search",
      }),
      false,
    );
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "houzzatpro.com",
        pathname: "/features",
      }),
      false,
    );
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "houzzatpro.com",
        pathname: "/book-a-demo",
      }),
      false,
    );
    console.log("[G] non-shell paths not bypassed... PASS");
  }

  console.log("\nV1 HouzzatPRO platform home selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
