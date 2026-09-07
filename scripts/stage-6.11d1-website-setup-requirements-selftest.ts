/**
 * Stage 6.11D.1 / 6.11D.2 — Website Setup completion requirements.
 * Registration number removed; Brokerage Fax required.
 * Run: pnpm stage-6.11d1-website-setup-requirements:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBrandingStatus } from "@/lib/tenancy/branding-assets/requirements";
import {
  evaluateProfessionalIdentityStatus,
  evaluateWebsiteSetupComplete,
  listMissingProfessionalIdentityFields,
  listMissingWebsiteSetupFields,
  WEBSITE_SETUP_FIELD_LABELS,
} from "@/lib/tenancy/professional-identity";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const FULL_IDENTITY = {
  agentRegisteredName: "Jordan Lee",
  agentDesignation: "Salesperson",
  agentCellPhone: "647-555-0101",
  brokerageRegisteredName: "Acme Realty Inc.",
  brokeragePhone: "416-555-0200",
  brokerageFax: "416-555-0299",
  brokerageAddress: "1 Main St",
};

const LOGO = "https://example.com/logo.png";
const PHOTO = "https://example.com/photo.png";

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "Marketing Display",
    tagline: "Tagline",
    workspaceSlug: "tenant-a",
    workspaceId: "ws_a",
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: null,
    brokerageLogoUrl: LOGO,
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
    publicOrigin: "https://tenant-a.houzzatpro.com",
    canonicalOrigin: "https://tenant-a.houzzatpro.com",
    templateId: "agent-signature",
    agent: null,
    professionalIdentity: {
      agent: {
        name: "Jordan Lee",
        designation: "Salesperson",
        cellPhone: "647-555-0101",
        photoUrl: PHOTO,
      },
      brokerage: {
        name: "Acme Realty Inc.",
        address: "1 Main St",
        phone: "416-555-0200",
        fax: "416-555-0299",
        logoUrl: LOGO,
      },
    },
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11D.1/D.2 — WEBSITE SETUP REQUIREMENTS ===\n");

  // 0. No registration number in contract; fax required
  {
    const schema = read("prisma/schema.prisma");
    const mig = read(
      "prisma/migrations/20260906010000_stage_611d_professional_identity/migration.sql",
    );
    assert.ok(schema.includes("brokerageFax"));
    assert.ok(!schema.includes("brokerageRegistrationNumber"));
    assert.ok(mig.includes("brokerageFax"));
    assert.ok(!mig.includes('"brokerageRegistrationNumber"'));
    const types = read("src/lib/tenancy/professional-identity/types.ts");
    assert.ok(types.includes("fax: string | null"));
    assert.ok(!types.includes("registrationNumber"));
    assert.ok(!types.includes("brokerageRegistrationNumber"));
    // Shared footer must not render a registration line.
    const shared = read("src/components/site/BrokeragePublicIdentity.tsx");
    assert.ok(!shared.includes("data-brokerage-registration"));
    assert.ok(shared.includes("data-brokerage-fax"));

    assert.ok(
      listMissingProfessionalIdentityFields({
        identity: { ...FULL_IDENTITY, brokerageFax: null },
        assets: { brokerageLogoUrl: LOGO },
      }).includes("brokerageFax"),
    );
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: { ...FULL_IDENTITY, brokerageFax: null },
        assets: { brokerageLogoUrl: LOGO },
      }),
      "NOT_STARTED",
    );
    console.log("0. registration removed; fax required OK");
  }

  // 1. Missing individual brokerage fields → incomplete
  {
    for (const key of [
      "brokerageRegisteredName",
      "brokerageAddress",
      "brokeragePhone",
      "brokerageFax",
    ] as const) {
      const identity = { ...FULL_IDENTITY, [key]: null };
      assert.equal(
        evaluateProfessionalIdentityStatus({
          identity,
          assets: { brokerageLogoUrl: LOGO },
        }),
        "NOT_STARTED",
        key,
      );
    }
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: FULL_IDENTITY,
        assets: { brokerageLogoUrl: null },
      }),
      "NOT_STARTED",
    );
    console.log("1. missing brokerage fields incomplete OK");
  }

  // 2. Full identity + logo → professional complete
  {
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: FULL_IDENTITY,
        assets: { brokerageLogoUrl: LOGO },
      }),
      "COMPLETE",
    );
    console.log("2. full identity including fax complete OK");
  }

  // 3. AGENT identity complete, photo missing → overall incomplete
  {
    const identityStatus = "COMPLETE";
    const brandingStatus = evaluateBrandingStatus({
      category: "AGENT",
      assets: {
        agentProfilePhotoUrl: null,
        logoUrl: null,
        brokerageLogoUrl: LOGO,
        faviconUrl: null,
      },
    });
    assert.equal(brandingStatus, "NOT_STARTED");
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus,
        professionalIdentityStatus: identityStatus,
        templateThemeStatus: "COMPLETE",
      }),
      false,
    );
    const missing = listMissingWebsiteSetupFields({
      category: "AGENT",
      businessProfileStatus: "COMPLETE",
      templateThemeStatus: "COMPLETE",
      identity: FULL_IDENTITY,
      assets: { agentProfilePhotoUrl: null, brokerageLogoUrl: LOGO },
    });
    assert.ok(missing.includes("agentProfilePhotoUrl"));
    assert.ok(
      missing.map((k) => WEBSITE_SETUP_FIELD_LABELS[k]).includes("Agent Profile Photo"),
    );
    console.log("3. AGENT missing photo → overall incomplete OK");
  }

  // 4. Photo present, fax missing → overall incomplete
  {
    const identityStatus = evaluateProfessionalIdentityStatus({
      identity: { ...FULL_IDENTITY, brokerageFax: "" },
      assets: { brokerageLogoUrl: LOGO },
    });
    const brandingStatus = evaluateBrandingStatus({
      category: "AGENT",
      assets: {
        agentProfilePhotoUrl: PHOTO,
        logoUrl: null,
        brokerageLogoUrl: LOGO,
        faviconUrl: null,
      },
    });
    assert.equal(identityStatus, "NOT_STARTED");
    assert.equal(brandingStatus, "COMPLETE");
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus,
        professionalIdentityStatus: identityStatus,
        templateThemeStatus: "COMPLETE",
      }),
      false,
    );
    const missing = listMissingWebsiteSetupFields({
      category: "AGENT",
      businessProfileStatus: "COMPLETE",
      templateThemeStatus: "COMPLETE",
      identity: { ...FULL_IDENTITY, brokerageFax: null },
      assets: { agentProfilePhotoUrl: PHOTO, brokerageLogoUrl: LOGO },
    });
    assert.ok(missing.includes("brokerageFax"));
    assert.ok(
      missing.map((k) => WEBSITE_SETUP_FIELD_LABELS[k]).includes("Brokerage Fax"),
    );
    console.log("4. missing fax → overall incomplete OK");
  }

  // 5. All required + photo → overall complete; logo/favicon optional
  {
    const identityStatus = evaluateProfessionalIdentityStatus({
      identity: FULL_IDENTITY,
      assets: { brokerageLogoUrl: LOGO },
    });
    const brandingStatus = evaluateBrandingStatus({
      category: "AGENT",
      assets: {
        agentProfilePhotoUrl: PHOTO,
        logoUrl: null,
        brokerageLogoUrl: LOGO,
        faviconUrl: null,
      },
    });
    assert.equal(
      evaluateWebsiteSetupComplete({
        businessProfileStatus: "COMPLETE",
        brandingStatus,
        professionalIdentityStatus: identityStatus,
        templateThemeStatus: "COMPLETE",
      }),
      true,
    );
    assert.deepEqual(
      listMissingWebsiteSetupFields({
        category: "AGENT",
        businessProfileStatus: "COMPLETE",
        templateThemeStatus: "COMPLETE",
        identity: FULL_IDENTITY,
        assets: { agentProfilePhotoUrl: PHOTO, brokerageLogoUrl: LOGO },
      }),
      [],
    );
    console.log("5. AGENT full complete; primary logo/favicon optional OK");
  }

  // 6. DEFAULT does not require agent photo
  {
    const brandingDefault = evaluateBrandingStatus({
      category: "DEFAULT",
      assets: {
        agentProfilePhotoUrl: null,
        logoUrl: null,
        brokerageLogoUrl: LOGO,
        faviconUrl: null,
      },
    });
    assert.equal(brandingDefault, "COMPLETE");
    const missing = listMissingWebsiteSetupFields({
      category: "DEFAULT",
      businessProfileStatus: "COMPLETE",
      templateThemeStatus: "COMPLETE",
      identity: FULL_IDENTITY,
      assets: { agentProfilePhotoUrl: null, brokerageLogoUrl: LOGO },
    });
    assert.ok(!missing.includes("agentProfilePhotoUrl"));
    console.log("6. DEFAULT no agent photo requirement OK");
  }

  // 7. AS + Default receive fax; UI non-locking; D.6 presentation labels
  {
    const asView = resolveAgentSignatureView(baseBrand());
    assert.equal(asView.brokerage.fax, "416-555-0299");
    assert.equal(asView.phone, "647-555-0101");
    assert.equal(asView.brokerage.name, "Acme Realty Inc.");
    const defaultBrand = baseBrand({ templateId: "default" });
    assert.equal(defaultBrand.professionalIdentity.brokerage.fax, "416-555-0299");

    const shared = read("src/components/site/BrokeragePublicIdentity.tsx");
    assert.ok(shared.includes('data-brokerage-fax="true"'));
    assert.ok(shared.includes("h-12"));
    assert.ok(!shared.includes("registration"));
    assert.ok(shared.includes("brokeragePhoneLabelPrefix"));
    assert.ok(shared.includes("brokerageFaxLabelPrefix"));

    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    assert.ok(footer.includes("AgentPublicContactLines"));
    assert.ok(!footer.includes("view.brokerageName"));
    assert.ok(footer.includes('data-agent-public-identity="true"'));
    assert.ok(footer.includes("BrokeragePublicIdentity"));

    const siteFooter = read("src/components/site/SiteFooter.tsx");
    assert.ok(siteFooter.includes("BrokeragePublicIdentity"));
    assert.ok(!siteFooter.includes("data-agent-public-identity"));

    const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
    assert.ok(client.includes("websiteSetupMissingFields"));
    assert.ok(client.includes("item.onboarding.websiteSetupComplete === true"));
    assert.ok(client.includes("live site and CRM stay available"));

    const identityUi = read(
      "src/components/onboarding/ProfessionalIdentitySection.tsx",
    );
    assert.ok(identityUi.includes("Brokerage Fax"));
    assert.ok(!identityUi.toLowerCase().includes("registration number"));

    const onboarding = read("src/lib/platform/activation/onboarding.ts");
    assert.ok(onboarding.includes("INVALID_BROKERAGE_FAX"));
    assert.ok(onboarding.includes("Brokerage fax is required"));
    assert.ok(!onboarding.includes("brokerageRegistrationNumber"));
    console.log("7. AS/Default fax + UI/write path + D.6 presentation OK");
  }

  console.log("\nSTAGE 6.11D.1/D.2 SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
