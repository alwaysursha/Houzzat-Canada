/**
 * Stage 6.11C.1 — Tenant brand assets foundation selftest.
 * Run: pnpm stage-6.11c1-brand-assets:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import {
  buildBrandingObjectKey,
  extractBrandingObjectKeyFromUrl,
  evaluateBrandingStatus,
  brandingRequirementsForCategory,
  validateBrandingImageBytes,
  BRANDING_ASSET_KINDS,
} from "@/lib/tenancy/branding-assets";
import {
  AGENT_SIGNATURE_DEMO,
  resolveAgentSignatureView,
} from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

/** Minimal valid 1×1 PNG (logo/favicon dimension floor). */
function tinyPng(): Uint8Array {
  return Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  );
}

/** Solid gray PNG IHDR 400×500 — agent profile minimum. */
function agentProfilePng(): Uint8Array {
  // Prebuilt 400x500 gray PNG (compressed) would be large; use JPEG SOF instead.
  // Minimal JPEG with SOF0 declaring 400×500 (truncated entropy after header is ok for our parser).
  const parts: number[] = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x01,
    0xf4, 0x01, 0x90, 0x01, 0x01, 0x11, 0x00, 0xff, 0xd9,
  ];
  // height 500 = 0x01f4, width 400 = 0x0190
  return Uint8Array.from(parts);
}

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "RE/MAX REALTY",
    tagline: "Tagline",
    workspaceSlug: "re-max-realty",
    workspaceId: "ws_remax",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: "/images/logo.png",
    brokerageLogoUrl: null,
    faviconUrl: null,
    ogImageUrl: null,
    colors: {
      primary: "#0F6B4C",
      secondary: "#0A4D38",
      accent: "#1F7A8C",
      surface: "#FFFFFF",
      ink: "#14201C",
    },
    contact: { email: null, phone: null },
    footerLegalText: null,
    seoDescription: "desc",
    version: 1,
    publicOrigin: "https://re-max-realty.houzzatpro.com",
    canonicalOrigin: "https://re-max-realty.houzzatpro.com",
    templateId: "agent-signature",
    agent: {
      name: "RE/MAX REALTY",
      title: null,
      photoUrl: null,
      bio: null,
      brokerageName: "RE/MAX",
      phone: null,
      email: null,
      markets: [],
    },
    professionalIdentity: {
      agent: {
        name: null,
        designation: null,
        cellPhone: null,
        photoUrl: null,
      },
      brokerage: {
        name: null,
        fax: null,
        address: null,
        phone: null,
        logoUrl: null,
      },
    },
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11C.1 — TENANT BRAND ASSETS FOUNDATION ===\n");

  // 0. Schema + migration additive
  {
    const schema = read("prisma/schema.prisma");
    assert.ok(schema.includes("agentProfilePhotoUrl"));
    assert.ok(!schema.includes("heroPhotoUrl"));
    assert.ok(!schema.includes("meetPhotoUrl"));
    const migration = read(
      "prisma/migrations/20260905200000_stage_611c1_agent_profile_photo/migration.sql",
    );
    assert.ok(migration.includes('ADD COLUMN "agentProfilePhotoUrl"'));
    assert.ok(!migration.toLowerCase().includes("drop "));
    console.log("[0] Schema + additive migration... PASS");
  }

  // 1. Requirements: AGENT requires profile; DEFAULT does not
  {
    const agentReqs = brandingRequirementsForCategory("AGENT");
    assert.ok(
      agentReqs.some((r) => r.asset === "agent-profile" && r.required),
    );
    assert.ok(!agentReqs.some((r) => r.asset === "logo" && r.required));
    assert.equal(
      evaluateBrandingStatus({
        category: "AGENT",
        assets: {
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
        },
      }),
      "NOT_STARTED",
    );
    assert.equal(
      evaluateBrandingStatus({
        category: "AGENT",
        assets: {
          agentProfilePhotoUrl: "/uploads/branding/x.jpg",
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
        },
      }),
      "COMPLETE",
    );
    assert.equal(
      evaluateBrandingStatus({
        category: "DEFAULT",
        assets: {
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
        },
      }),
      "COMPLETE",
    );
    console.log("[1] brandingStatus category semantics... PASS");
  }

  // 2. Agent Signature resolution — no logo fallback; preview demo; live photo
  {
    const liveNoPhoto = resolveAgentSignatureView(baseBrand());
    assert.equal(liveNoPhoto.photoUrl, null);
    assert.ok(liveNoPhoto.name.startsWith("RE/MAX"));

    const liveWithPhoto = resolveAgentSignatureView(
      baseBrand({
        agent: {
          name: "Jordan Lee",
          title: null,
          photoUrl: "/uploads/branding/workspaces/ws/branding/agent-profile/a.jpg",
          bio: null,
          brokerageName: "RE/MAX",
          phone: null,
          email: null,
          markets: [],
        },
        logoUrl: "/images/should-not-be-portrait.png",
      }),
    );
    assert.equal(
      liveWithPhoto.photoUrl,
      "/uploads/branding/workspaces/ws/branding/agent-profile/a.jpg",
    );
    assert.ok(liveWithPhoto.photoUrl !== "/images/should-not-be-portrait.png");

    const preview = resolveAgentSignatureView(
      baseBrand({
        templatePreview: {
          active: true,
          themeId: "agent-signature:editorial",
          displayLabel: "Agent Signature · Editorial",
          source: "owner_cookie",
        },
      }),
    );
    assert.equal(preview.photoUrl, AGENT_SIGNATURE_DEMO.photoUrl);

    const identity = read("src/lib/tenancy/resolve-public-agent-identity.ts");
    assert.ok(identity.includes("agentProfilePhotoUrl"));
    assert.ok(!identity.includes("agent?.image"));
    assert.ok(
      !identity.includes("firstNonEmpty(agent?.image, workspace.branding?.logoUrl)"),
    );
    const view = read(
      "src/lib/tenancy/templates/resolve-agent-signature-view.ts",
    );
    assert.ok(view.includes("brand.agent?.photoUrl ?? null"));
    assert.ok(!view.includes("brand.agent?.photoUrl ?? brand.logoUrl"));
    console.log("[2] Portrait resolution (demo / live / monogram)... PASS");
  }

  // 3. Object key isolation
  {
    const key = buildBrandingObjectKey({
      workspaceId: "ws_a",
      kind: "agent-profile",
      uniqueId: "abc123",
      ext: "jpg",
    });
    assert.equal(
      key,
      "workspaces/ws_a/branding/agent-profile/abc123.jpg",
    );
    const url = `https://branding.example.com/${key}`;
    assert.equal(extractBrandingObjectKeyFromUrl(url, "ws_a"), key);
    assert.equal(extractBrandingObjectKeyFromUrl(url, "ws_b"), null);
    assert.equal(
      extractBrandingObjectKeyFromUrl(
        "/uploads/branding/workspaces/ws_a/branding/logo/x.png",
        "ws_a",
      ),
      "workspaces/ws_a/branding/logo/x.png",
    );
    console.log("[3] Storage key workspace isolation... PASS");
  }

  // 4. Validation — MIME / size / dimensions / SVG rejected
  {
    const tiny = validateBrandingImageBytes(tinyPng(), "logo");
    assert.ok(!("code" in tiny));
    if (!("code" in tiny)) {
      assert.equal(tiny.mime, "image/png");
    }

    const tooSmallPortrait = validateBrandingImageBytes(tinyPng(), "agent-profile");
    assert.ok("code" in tooSmallPortrait);
    if ("code" in tooSmallPortrait) {
      assert.equal(tooSmallPortrait.code, "DIMENSIONS_TOO_SMALL");
    }

    const portrait = validateBrandingImageBytes(
      agentProfilePng(),
      "agent-profile",
    );
    assert.ok(!("code" in portrait));
    if (!("code" in portrait)) {
      assert.equal(portrait.width, 400);
      assert.equal(portrait.height, 500);
      assert.equal(portrait.mime, "image/jpeg");
    }

    const svg = validateBrandingImageBytes(
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
      "logo",
    );
    assert.ok("code" in svg);
    if ("code" in svg) assert.equal(svg.code, "UNSUPPORTED_MIME");

    const oversized = validateBrandingImageBytes(
      new Uint8Array(6 * 1024 * 1024),
      "logo",
    );
    assert.ok("code" in oversized);
    if ("code" in oversized) assert.equal(oversized.code, "FILE_TOO_LARGE");

    assert.deepEqual(
      [...BRANDING_ASSET_KINDS],
      ["agent-profile", "logo", "brokerage-logo", "favicon"],
    );
    console.log("[4] Image validation rules... PASS");
  }

  // 5. Host-bound API + no FSBO upload reuse
  {
    const route = read("src/app/api/onboarding/branding-assets/route.ts");
    assert.ok(route.includes("uploadWorkspaceBrandingAsset"));
    assert.ok(route.includes("removeWorkspaceBrandingAsset"));
    assert.ok(!route.includes("requireOwnerUser"));
    assert.ok(!route.includes("saveOwnerUpload"));
    const manage = read("src/lib/tenancy/branding-assets/manage.ts");
    assert.ok(manage.includes("requireHostBoundOwnerOnboardingContext"));
    assert.ok(manage.includes("clientWorkspaceId"));
    assert.ok(!manage.includes("$transaction"));
    assert.ok(!manage.includes("updateMany"));
    const ownerUpload = read("src/app/api/owner/upload/route.ts");
    assert.ok(ownerUpload.includes("requireOwnerUser"));
    console.log("[5] Upload API authority isolation... PASS");
  }

  // 6. Wrangler R2 — houzzat + houzzatpro + canary
  {
    const pro = read("wrangler.houzzatpro.jsonc");
    const canary = read("wrangler.tenant-canary.jsonc");
    const houzzat = read("wrangler.jsonc");
    assert.ok(pro.includes('"binding": "BRANDING_ASSETS"'));
    assert.ok(pro.includes("houzzatpro-branding-assets"));
    assert.ok(canary.includes('"binding": "BRANDING_ASSETS"'));
    assert.ok(houzzat.includes('"binding": "BRANDING_ASSETS"'));
    assert.ok(houzzat.includes("houzzatpro-branding-assets"));
    console.log("[6] R2 binding config (houzzat + houzzatpro + canary)... PASS");
  }

  // 7. UI + Default isolation
  {
    assert.ok(
      read("src/components/onboarding/BrandAssetsSection.tsx").includes(
        "Agent Profile Photo",
      ),
    );
    assert.ok(
      read("src/components/onboarding/OwnerOnboardingClient.tsx").includes(
        "BrandAssetsSection",
      ),
    );
    const page = read("src/app/(marketing)/page.tsx");
    assert.ok(page.includes("Find Homes in Ontario"));
    assert.ok(
      read("src/components/home/HomeDeferredBody.tsx").includes(
        "HomepageMarketRails",
      ),
    );
    const hero = read(
      "src/components/templates/agent-signature/AgentSignatureHero.tsx",
    );
    assert.ok(hero.includes("view.photoUrl"));
    assert.ok(hero.includes("object-top"));
    console.log("[7] Brand Assets UI + Default / AS design frozen... PASS");
  }

  // 8. Favicon optional documented
  {
    const section = read("src/components/onboarding/BrandAssetsSection.tsx");
    assert.ok(section.includes("Favicon"));
    assert.ok(section.includes("generated tenant favicon"));
    console.log("[8] Favicon optional remove UX... PASS");
  }

  console.log("\nSTAGE 6.11C.1 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error("\nSTAGE 6.11C.1 SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
