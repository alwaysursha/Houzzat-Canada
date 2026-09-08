/**
 * V1 — HouzzatPRO thin /pricing + /templates selftest.
 * Run: pnpm stage-6.11-v1-houzzatpro-pricing-templates:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  matchesHouzzatProPlatformMarketingShell,
  PLATFORM_HOME_NAV,
  PLATFORM_MARKETING_PRICING_PATH,
  PLATFORM_MARKETING_TEMPLATES_PATH,
  PLATFORM_PAGE_PRIMARY_CTA_HREF,
  PLATFORM_PAGE_SECONDARY_CTA_HREF,
  PLATFORM_PRICING_DOCUMENT_TITLE,
  PLATFORM_TEMPLATES_CATALOG,
  PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION,
  PLATFORM_TEMPLATES_DOCUMENT_TITLE,
} from "@/lib/platform/public";
import { blocksTenantHostnameResolution } from "@/lib/tenancy/reserved-domains";

const root = process.cwd();
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

async function main() {
  console.log("\n=== V1 HOUZZATPRO PRICING + TEMPLATES ===\n");

  // A. apex + www pricing/templates shell
  {
    for (const host of ["houzzatpro.com", "www.houzzatpro.com"] as const) {
      for (const path of [
        PLATFORM_MARKETING_PRICING_PATH,
        PLATFORM_MARKETING_TEMPLATES_PATH,
      ] as const) {
        assert.equal(
          matchesHouzzatProPlatformMarketingShell({
            hostname: host,
            pathname: path,
          }),
          true,
        );
      }
    }
    console.log("[A] apex + www pricing/templates shell... PASS");
  }

  // B. tenant rejection
  {
    for (const path of ["/pricing", "/templates"] as const) {
      assert.equal(
        matchesHouzzatProPlatformMarketingShell({
          hostname: "acme.houzzatpro.com",
          pathname: path,
        }),
        false,
      );
      assert.equal(
        matchesHouzzatProPlatformMarketingShell({
          hostname: "houzzat.com",
          pathname: path,
        }),
        false,
      );
    }
    const pricingPage = read("src/app/(marketing)/pricing/page.tsx");
    const templatesPage = read("src/app/(marketing)/templates/page.tsx");
    assert.ok(pricingPage.includes("notFound"));
    assert.ok(templatesPage.includes("isHouzzatProPlatformRoot"));
    assert.ok(templatesPage.includes("notFound"));
    assert.ok(pricingPage.includes("HouzzatProPlatformPricing"));
    assert.ok(templatesPage.includes("HouzzatProPlatformTemplates"));
    console.log("[B] tenant non-platform rejection... PASS");
  }

  // C. unknown host still closed
  {
    assert.equal(
      matchesHouzzatProPlatformMarketingShell({
        hostname: "evil.example.com",
        pathname: "/pricing",
      }),
      false,
    );
    assert.equal(
      blocksTenantHostnameResolution("houzzatpro.com"),
      "platform_houzzatpro_root",
    );
    console.log("[C] unknown host / G.7C apex block... PASS");
  }

  // D. CTA destinations + no consumer auth / dollar pricing
  {
    assert.equal(PLATFORM_PAGE_PRIMARY_CTA_HREF, "/book-a-demo");
    assert.equal(
      PLATFORM_PAGE_SECONDARY_CTA_HREF,
      "https://app.houzzatpro.com/pro/sign-in",
    );
    const pricing = read(
      "src/components/platform/public/HouzzatProPlatformPricing.tsx",
    );
    const templates = read(
      "src/components/platform/public/HouzzatProPlatformTemplates.tsx",
    );
    const copy = read(
      "src/lib/platform/public/platform-pricing-templates-copy.ts",
    );
    for (const src of [pricing, templates, copy]) {
      assert.ok(!src.includes("/auth/sign-up"));
      assert.ok(!src.includes('"/auth/sign-in"'));
      assert.ok(!/\$\d/.test(src));
      assert.ok(!src.toLowerCase().includes("free trial"));
    }
    assert.ok(copy.includes("not a public self-serve checkout"));
    assert.ok(!copy.includes("$399"));
    assert.ok(!copy.includes("39_900"));
    assert.ok(
      copy.includes("private proposal") || copy.includes("Private proposal"),
    );    console.log("[D] CTA destinations + no public dollar pricing... PASS");
  }

  // E. Team Signature available at launch
  {
    const team = PLATFORM_TEMPLATES_CATALOG.find(
      (t) => t.name === "Team Signature",
    );
    assert.ok(team);
    assert.equal(team!.status, "available");
    const available = PLATFORM_TEMPLATES_CATALOG.filter(
      (t) => t.status === "available",
    ).map((t) => t.name);
    assert.ok(available.includes("Default"));
    assert.ok(available.includes("Agent Signature"));
    assert.ok(available.includes("Team Signature"));
    assert.ok(
      !PLATFORM_TEMPLATES_CATALOG.some((t) => t.status === "coming_soon"),
    );
    const templates = read(
      "src/components/platform/public/HouzzatProPlatformTemplates.tsx",
    );
    assert.ok(templates.includes("Available"));
    assert.ok(
      PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION.includes("Team Signature"),
    );
    assert.ok(
      !PLATFORM_TEMPLATES_DOCUMENT_DESCRIPTION.toLowerCase().includes(
        "coming soon",
      ),
    );
    console.log("[E] Team Signature available wording... PASS");
  }

  // F. nav routes + metadata + wiring
  {
    const templatesNav = PLATFORM_HOME_NAV.find((n) => n.label === "Templates");
    const pricingNav = PLATFORM_HOME_NAV.find((n) => n.label === "Pricing");
    assert.equal(templatesNav?.href, "/templates");
    assert.equal(pricingNav?.href, "/pricing");
    assert.ok(PLATFORM_PRICING_DOCUMENT_TITLE.includes("Pricing"));
    assert.ok(PLATFORM_TEMPLATES_DOCUMENT_TITLE.includes("Templates"));

    const footer = read(
      "src/components/platform/public/PlatformMarketingFooter.tsx",
    );
    assert.ok(footer.includes('href="/pricing"'));
    assert.ok(footer.includes('href="/templates"'));

    const home = read(
      "src/components/platform/public/HouzzatProPlatformHome.tsx",
    );
    assert.ok(home.includes('href="/pricing"'));
    assert.ok(home.includes('href="/templates"'));

    const shell = read("src/lib/platform/public/platform-marketing-shell.ts");
    assert.ok(shell.includes("PLATFORM_MARKETING_PRICING_PATH"));
    assert.ok(shell.includes("PLATFORM_MARKETING_TEMPLATES_PATH"));
    console.log("[F] nav + metadata + wiring... PASS");
  }

  console.log("\nV1 HouzzatPRO pricing + templates selftest OK\n");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
