/**
 * Stage 6.11D — Professional + brokerage identity foundation selftest.
 * Run: pnpm stage-6.11d-professional-identity:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  updateOwnerOnboardingProfessionalIdentity,
} from "@/lib/platform/activation";
import type { MarketingPresentationBrand } from "@/lib/tenancy/marketing-presentation-brand";
import {
  EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
  TEMPLATE_BROKERAGE_IDENTITY_CONTRACT,
  TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT,
  PUBLIC_AGENT_CONTACT_LABELS,
  PUBLIC_BROKERAGE_CONTACT_LABELS,
  agentCellLabelPrefix,
  agentEmailLabelPrefix,
  brokerageFaxLabelPrefix,
  brokeragePhoneLabelPrefix,
  evaluateProfessionalIdentityStatus,
  presentRequiredBrokerageIdentityFields,
} from "@/lib/tenancy/professional-identity";
import { resolvePublicProfessionalIdentity } from "@/lib/tenancy/professional-identity/resolve";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";
import { resolveAgentSignatureView } from "@/lib/tenancy/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_identity_a";
const WS_B = "ws_identity_b";
const USER_OWNER = "user_owner_a";
const USER_AGENT = "user_agent_a";

type IdentityRow = {
  workspaceId: string;
  agentRegisteredName: string | null;
  agentDesignation: string | null;
  agentCellPhone: string | null;
  brokerageRegisteredName: string | null;
  brokerageFax: string | null;
  brokeragePhone: string | null;
  brokerageAddress: string | null;
};

type BrandingRow = {
  workspaceId: string;
  agentProfilePhotoUrl: string | null;
  brokerageLogoUrl: string | null;
  logoUrl: string | null;
  displayName: string;
  contactPhone: string | null;
};

function createFakePrisma(state: {
  identities: Map<string, IdentityRow>;
  brandings: Map<string, BrandingRow>;
  members: Array<{
    workspaceId: string;
    userId: string;
    role: string;
    status: string;
  }>;
  workspaces: Map<string, { id: string; slug: string; status: string }>;
  onboarding: Map<string, Record<string, unknown>>;
}): PrismaClient {
  return {
    workspace: {
      async findUnique({
        where,
        select,
      }: {
        where: { id: string };
        select?: Record<string, unknown>;
      }) {
        const ws = state.workspaces.get(where.id);
        if (!ws) return null;
        if (!select) return { ...ws };
        return {
          ...ws,
          professionalIdentity: state.identities.get(ws.id) ?? null,
          branding: state.brandings.get(ws.id)
            ? {
                ...state.brandings.get(ws.id)!,
                themeId: "agent-signature:forest",
                contactEmail: null,
                contactPhone: state.brandings.get(ws.id)!.contactPhone,
                faviconUrl: null,
              }
            : null,
          primaryAgent: null,
          brokerageAffiliation: null,
          onboardingState: state.onboarding.get(ws.id) ?? null,
          emailIdentity: null,
          name: ws.slug,
        };
      },
    },
    workspaceMember: {
      async findUnique({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) {
        const hit = state.members.find(
          (m) =>
            m.workspaceId === where.workspaceId_userId.workspaceId &&
            m.userId === where.workspaceId_userId.userId,
        );
        return hit ? { ...hit } : null;
      },
    },
    workspaceProfessionalIdentity: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.identities.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: IdentityRow & { workspaceId: string } }) {
        if (state.identities.has(data.workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = { ...data };
        state.identities.set(data.workspaceId, row);
        return row;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Partial<IdentityRow>;
      }) {
        const row = state.identities.get(where.workspaceId);
        if (!row) throw new Error("missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceBranding: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.brandings.get(where.workspaceId);
        return row
          ? {
              ...row,
              contactEmail: null,
              themeId: "agent-signature:forest",
              faviconUrl: null,
            }
          : null;
      },
    },
    workspaceOnboardingState: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.onboarding.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: { workspaceId: string } }) {
        const row = {
          workspaceId: data.workspaceId,
          businessProfileStatus: "NOT_STARTED",
          brandingStatus: "NOT_STARTED",
          professionalIdentityStatus: "NOT_STARTED",
          templateThemeStatus: "NOT_STARTED",
          emailIdentityStatus: "NOT_STARTED",
          accountActivatedAt: null,
          completedAt: null,
        };
        state.onboarding.set(data.workspaceId, row);
        return row;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.onboarding.get(where.workspaceId) ?? {
          workspaceId: where.workspaceId,
        };
        Object.assign(row, data);
        state.onboarding.set(where.workspaceId, row);
        return { ...row };
      },
    },
    workspaceEmailIdentity: {
      async findUnique() {
        return null;
      },
    },
  } as unknown as PrismaClient;
}

const DOMAINS: DomainLookupRow[] = [
  {
    hostname: "tenant-a.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_A,
    workspaceSlug: "tenant-a",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "tenant-b.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "tenant-b",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function baseBrand(
  overrides: Partial<MarketingPresentationBrand> = {},
): MarketingPresentationBrand {
  return {
    displayName: "Marketing Display",
    tagline: "Tagline",
    workspaceSlug: "tenant-a",
    workspaceId: WS_A,
    poweredByHouzzatPro: true,
    isHouzzatWorkspace: false,
    logoUrl: null,
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
    contact: { email: "biz@example.com", phone: "111-111-1111" },
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
        photoUrl:
          "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/agent-profile/x.png",
      },
      brokerage: {
        name: "Acme Realty Inc.",
        fax: "416-555-0299",
        address: "1 Main St\nToronto, ON",
        phone: "416-555-0200",
        logoUrl:
          "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/brokerage-logo/y.png",
      },
    },
    teamRoster: null,
    templatePreview: null,
    ...overrides,
  };
}

async function main() {
  console.log("\n=== STAGE 6.11D — PROFESSIONAL + BROKERAGE IDENTITY ===\n");

  // 0. Schema + migration additive
  {
    const schema = read("prisma/schema.prisma");
    assert.ok(schema.includes("model WorkspaceProfessionalIdentity"));
    assert.ok(schema.includes("agentRegisteredName"));
    assert.ok(schema.includes("brokerageRegisteredName"));
    assert.ok(schema.includes("brokerageFax"));
    assert.ok(!schema.includes("brokerageRegistrationNumber"));
    assert.ok(schema.includes("professionalIdentityStatus"));
    assert.ok(schema.includes("agentProfilePhotoUrl"));
    assert.ok(schema.includes("brokerageLogoUrl"));
    const mig = read(
      "prisma/migrations/20260906010000_stage_611d_professional_identity/migration.sql",
    );
    assert.ok(mig.includes("CREATE TABLE \"WorkspaceProfessionalIdentity\""));
    assert.ok(mig.includes("brokerageFax"));
    assert.ok(!mig.includes('"brokerageRegistrationNumber"'));
    assert.ok(mig.includes("ADD COLUMN \"professionalIdentityStatus\""));
    assert.ok(!mig.toLowerCase().includes("drop column"));
    assert.ok(!mig.toLowerCase().includes("drop table"));
    console.log("0. schema + additive migration OK");
  }

  // 1. Requirements — fax + logo required; favicon/primary logo not
  {
    const base = {
      agentRegisteredName: "Jordan Lee",
      agentDesignation: "Salesperson",
      agentCellPhone: "647-555-0101",
      brokerageRegisteredName: "Acme Realty Inc.",
      brokerageFax: null,
      brokeragePhone: "416-555-0200",
      brokerageAddress: "1 Main St",
    };
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: base,
        assets: { brokerageLogoUrl: null },
      }),
      "NOT_STARTED",
    );
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: base,
        assets: { brokerageLogoUrl: "https://branding-assets.example/logo.png" },
      }),
      "NOT_STARTED",
      "fax required",
    );
    assert.equal(
      evaluateProfessionalIdentityStatus({
        identity: { ...base, brokerageFax: "416-555-0299" },
        assets: { brokerageLogoUrl: "https://branding-assets.example/logo.png" },
      }),
      "COMPLETE",
    );
    console.log("1. identity status requirements OK");
  }

  // 2. Resolver combines identity + branding assets; no displayName/contactPhone leak
  {
    const state = {
      identities: new Map<string, IdentityRow>([
        [
          WS_A,
          {
            workspaceId: WS_A,
            agentRegisteredName: "Jordan Lee",
            agentDesignation: "Broker",
            agentCellPhone: "647-555-0101",
            brokerageRegisteredName: "Acme Realty Inc.",
            brokerageFax: "416-555-0299",
            brokeragePhone: "416-555-0200",
            brokerageAddress: "1 Main St",
          },
        ],
      ]),
      brandings: new Map<string, BrandingRow>([
        [
          WS_A,
          {
            workspaceId: WS_A,
            agentProfilePhotoUrl:
              "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/agent-profile/x.png",
            brokerageLogoUrl:
              "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/brokerage-logo/y.png",
            logoUrl:
              "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/logo/z.png",
            displayName: "SHOULD NOT BE AGENT NAME",
            contactPhone: "SHOULD-NOT-BE-CELL",
          },
        ],
      ]),
      members: [],
      workspaces: new Map([
        [WS_A, { id: WS_A, slug: "tenant-a", status: "ACTIVE" }],
      ]),
      onboarding: new Map(),
    };
    const resolved = await resolvePublicProfessionalIdentity(
      WS_A,
      createFakePrisma(state),
    );
    assert.equal(resolved.agent.name, "Jordan Lee");
    assert.equal(resolved.agent.designation, "Broker");
    assert.equal(resolved.agent.cellPhone, "647-555-0101");
    assert.equal(
      resolved.agent.photoUrl,
      state.brandings.get(WS_A)!.agentProfilePhotoUrl,
    );
    assert.equal(resolved.brokerage.name, "Acme Realty Inc.");
    assert.equal(resolved.brokerage.phone, "416-555-0200");
    assert.equal(resolved.brokerage.fax, "416-555-0299");
    assert.equal(
      resolved.brokerage.logoUrl,
      state.brandings.get(WS_A)!.brokerageLogoUrl,
    );
    assert.notEqual(resolved.agent.name, "SHOULD NOT BE AGENT NAME");
    assert.notEqual(resolved.agent.cellPhone, "SHOULD-NOT-BE-CELL");
    assert.notEqual(resolved.agent.photoUrl, state.brandings.get(WS_A)!.logoUrl);
    assert.deepEqual(
      await resolvePublicProfessionalIdentity("missing", createFakePrisma(state)),
      EMPTY_PUBLIC_PROFESSIONAL_IDENTITY,
    );
    console.log("2. resolvePublicProfessionalIdentity OK");
  }

  // 3. Host-bound OWNER write; AGENT denied; cross-tenant denied; app host denied
  {
    const prevScope = process.env.TENANT_DOMAIN_SCOPE;
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
    clearHostResolutionCacheForTests();
    const restoreScope = () => {
      clearHostResolutionCacheForTests();
      if (prevScope === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
      else process.env.TENANT_DOMAIN_SCOPE = prevScope;
    };

    try {
      const state = {
        identities: new Map<string, IdentityRow>(),
        brandings: new Map<string, BrandingRow>([
          [
            WS_A,
            {
              workspaceId: WS_A,
              agentProfilePhotoUrl: null,
              brokerageLogoUrl:
                "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/brokerage-logo/y.png",
              logoUrl: null,
              displayName: "Tenant A",
              contactPhone: "111",
            },
          ],
          [
            WS_B,
            {
              workspaceId: WS_B,
              agentProfilePhotoUrl: null,
              brokerageLogoUrl: null,
              logoUrl: null,
              displayName: "Tenant B",
              contactPhone: null,
            },
          ],
        ]),
        members: [
          {
            workspaceId: WS_A,
            userId: USER_OWNER,
            role: "OWNER",
            status: "ACTIVE",
          },
          {
            workspaceId: WS_A,
            userId: USER_AGENT,
            role: "AGENT",
            status: "ACTIVE",
          },
          {
            workspaceId: WS_B,
            userId: USER_OWNER,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
        workspaces: new Map([
          [WS_A, { id: WS_A, slug: "tenant-a", status: "ACTIVE" }],
          [WS_B, { id: WS_B, slug: "tenant-b", status: "ACTIVE" }],
        ]),
        onboarding: new Map(),
      };
      const prisma = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);

      const ownerReq = new Request(
        "https://tenant-a.houzzatpro.com/api/onboarding",
        { method: "POST" },
      );
      const saved = await updateOwnerOnboardingProfessionalIdentity({
        request: ownerReq,
        prisma,
        hostDeps,
        userId: USER_OWNER,
        agentRegisteredName: "Jordan Lee",
        agentDesignation: "Salesperson",
        agentCellPhone: "647-555-0101",
        brokerageRegisteredName: "Acme Realty Inc.",
        brokerageFax: "416-555-0299",
        brokeragePhone: "416-555-0200",
        brokerageAddress: "1 Main St",
      });
      assert.equal(saved.workspaceId, WS_A);
      assert.equal(saved.professionalIdentity.agentRegisteredName, "Jordan Lee");
      assert.equal(saved.onboarding.professionalIdentityStatus, "COMPLETE");
      assert.ok(!state.identities.has(WS_B));

      await assert.rejects(
        () =>
          updateOwnerOnboardingProfessionalIdentity({
            request: ownerReq,
            prisma,
            hostDeps,
            userId: USER_AGENT,
            agentRegisteredName: "Nope",
            agentDesignation: "Salesperson",
            agentCellPhone: "1",
            brokerageRegisteredName: "X",
            brokeragePhone: "2",
            brokerageAddress: "Y",
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError && err.status === 403,
      );

      await assert.rejects(
        () =>
          updateOwnerOnboardingProfessionalIdentity({
            request: ownerReq,
            prisma,
            hostDeps,
            userId: USER_OWNER,
            clientWorkspaceId: WS_B,
            agentRegisteredName: "Cross",
            agentDesignation: "Salesperson",
            agentCellPhone: "1",
            brokerageRegisteredName: "X",
            brokeragePhone: "2",
            brokerageAddress: "Y",
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError &&
          err.code === "WORKSPACE_HOST_MISMATCH",
      );

      const appReq = new Request("https://app.houzzatpro.com/api/onboarding", {
        method: "POST",
      });
      await assert.rejects(
        () =>
          updateOwnerOnboardingProfessionalIdentity({
            request: appReq,
            prisma,
            hostDeps,
            userId: USER_OWNER,
            agentRegisteredName: "App",
            agentDesignation: "Salesperson",
            agentCellPhone: "1",
            brokerageRegisteredName: "X",
            brokeragePhone: "2",
            brokerageAddress: "Y",
          }),
        (err: unknown) => err instanceof OwnerActivationError,
      );
      console.log("3. host-bound OWNER authority OK");
    } finally {
      restoreScope();
    }
  }

  // 4. Agent Signature + Default consume canonical identity
  {
    const view = resolveAgentSignatureView(baseBrand());
    assert.equal(view.name, "Jordan Lee");
    assert.equal(view.title, "Salesperson");
    assert.equal(view.phone, "647-555-0101");
    assert.ok(view.photoUrl?.includes("agent-profile"));
    assert.equal(view.brokerage.name, "Acme Realty Inc.");
    assert.equal(view.brokerage.address, "1 Main St\nToronto, ON");
    assert.equal(view.brokerage.phone, "416-555-0200");
    assert.ok(view.brokerage.logoUrl?.includes("brokerage-logo"));
    // contactPhone / displayName must not override cell / agent name
    assert.notEqual(view.phone, "111-111-1111");
    assert.notEqual(view.name, "Marketing Display");
    // D.6 — agent cell ≠ brokerage phone; brokerage name remains on brokerage DTO
    assert.equal(view.phone, "647-555-0101");
    assert.notEqual(view.phone, view.brokerage.phone);
    assert.equal(view.brokerageName, "Acme Realty Inc.");
    assert.equal(view.brokerage.name, view.brokerageName);

    const defaultBrand = baseBrand({ templateId: "default", agent: null });
    assert.equal(
      defaultBrand.professionalIdentity.brokerage.name,
      "Acme Realty Inc.",
    );
    assert.deepEqual(
      presentRequiredBrokerageIdentityFields(
        defaultBrand.professionalIdentity.brokerage,
      ).sort(),
      ["address", "logoUrl", "name", "phone"],
    );
    console.log("4. AS + Default identity wiring OK");
  }

  // 5. Shared presentation contract + logo sizing + no tiny icon class
  {
    const footer = read(
      "src/components/templates/agent-signature/AgentSignatureFooter.tsx",
    );
    const contact = read(
      "src/components/templates/agent-signature/AgentSignatureContactSection.tsx",
    );
    const siteFooter = read("src/components/site/SiteFooter.tsx");
    const shared = read("src/components/site/BrokeragePublicIdentity.tsx");
    const agentContact = read("src/components/site/AgentPublicContact.tsx");
    const presentation = read(
      "src/lib/tenancy/professional-identity/presentation.ts",
    );

    assert.ok(footer.includes("BrokeragePublicIdentity"));
    assert.ok(footer.includes("AgentPublicContactLines"));
    assert.ok(footer.includes('data-agent-public-identity="true"'));
    assert.ok(siteFooter.includes("BrokeragePublicIdentity"));
    assert.ok(shared.includes('data-brokerage-public-identity="true"'));
    assert.ok(shared.includes('data-brokerage-logo="true"'));
    assert.ok(shared.includes("minHeight"));
    assert.equal(
      TEMPLATE_BROKERAGE_IDENTITY_CONTRACT.brokerageLogoMinCssHeightPx,
      48,
    );
    assert.ok(!footer.includes("h-8 w-auto object-contain opacity-80"));
    assert.ok(!shared.includes("h-8 "));
    assert.ok(shared.includes("h-12"));
    assert.ok(
      TEMPLATE_BROKERAGE_IDENTITY_CONTRACT.forbiddenSilentOmit === true,
    );

    // Stage 6.11D.6 — agent identity excludes brokerage name; Cell:/Email: labels
    assert.ok(!footer.includes("view.brokerageName"));
    const meet = read(
      "src/components/templates/agent-signature/AgentSignatureMeetSection.tsx",
    );
    assert.ok(!meet.includes("view.brokerageName"));
    assert.ok(footer.includes("cellPhone={view.phone}"));
    assert.ok(footer.includes("email={view.email}"));
    assert.ok(contact.includes("AgentPublicContactLines"));
    assert.ok(agentContact.includes("data-agent-cell"));
    assert.ok(agentContact.includes("data-agent-email"));
    assert.ok(agentContact.includes("agentCellLabelPrefix"));
    assert.ok(agentContact.includes("agentEmailLabelPrefix"));
    assert.equal(agentCellLabelPrefix(), "Cell:");
    assert.equal(agentEmailLabelPrefix(), "Email:");
    assert.equal(brokeragePhoneLabelPrefix(), "Phone:");
    assert.equal(brokerageFaxLabelPrefix(), "Fax:");
    assert.equal(PUBLIC_AGENT_CONTACT_LABELS.cell, "Cell");
    assert.equal(PUBLIC_AGENT_CONTACT_LABELS.email, "Email");
    assert.equal(PUBLIC_BROKERAGE_CONTACT_LABELS.phone, "Phone");
    assert.equal(PUBLIC_BROKERAGE_CONTACT_LABELS.fax, "Fax");
    assert.ok(shared.includes("brokeragePhoneLabelPrefix"));
    assert.ok(shared.includes("brokerageFaxLabelPrefix"));
    assert.ok(shared.includes('data-brokerage-name="true"'));
    assert.ok(shared.includes('data-brokerage-phone="true"'));
    assert.ok(shared.includes('data-brokerage-fax="true"'));

    // Default: dedicated brokerage block; no invented agent identity section
    assert.ok(siteFooter.includes("BrokeragePublicIdentity"));
    assert.ok(!siteFooter.includes("data-agent-public-identity"));
    assert.ok(siteFooter.includes("Business phone:"));
    assert.ok(siteFooter.includes("Email:"));

    // Shared future-template contract
    assert.deepEqual(
      [
        ...TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT.appliesToTemplateCategories,
      ],
      ["DEFAULT", "AGENT", "TEAM", "BROKERAGE"],
    );
    assert.equal(
      TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT.agentIdentityBlock
        .forbidBrokerageName,
      true,
    );
    assert.equal(
      TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT.cellVsBrokeragePhone
        .distinct,
      true,
    );
    assert.notEqual(
      TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT.cellVsBrokeragePhone
        .agentLabel,
      TEMPLATE_PROFESSIONAL_IDENTITY_PRESENTATION_CONTRACT.cellVsBrokeragePhone
        .brokerageLabel,
    );
    assert.ok(presentation.includes("future TEAM / BROKERAGE"));
    console.log("5. shared brokerage presentation + D.6 agent/brokerage split OK");
  }

  // 6. Branding requirements unchanged for favicon/logo/photo
  {
    const req = read("src/lib/tenancy/branding-assets/requirements.ts");
    assert.ok(req.includes('asset: "favicon", required: false'));
    assert.ok(req.includes('asset: "logo", required: false'));
    assert.ok(req.includes('asset: "agent-profile", required: true'));
    const resolveAgent = read(
      "src/lib/tenancy/resolve-public-agent-identity.ts",
    );
    assert.ok(resolveAgent.includes("Never User.image"));
    assert.ok(resolveAgent.includes("never logoUrl"));
    assert.ok(resolveAgent.includes("agentCellPhone"));
    assert.ok(resolveAgent.includes("never branding.contactPhone"));
    assert.ok(
      !resolveAgent.includes("workspace.branding?.contactPhone"),
    );
    const storage = read("src/lib/tenancy/branding-assets/storage.ts");
    assert.ok(!storage.includes("branding-assets.houzzatpro.com"));
    console.log("6. branding optionality + portrait rules OK");
  }

  // 7. Onboarding UI + API action present
  {
    const ui = read("src/components/onboarding/ProfessionalIdentitySection.tsx");
    assert.ok(ui.includes("Professional &amp; brokerage information") || ui.includes("Professional & brokerage"));
    assert.ok(ui.includes("Brokerage Logo"));
    assert.ok(ui.includes("Brand assets"));
    const route = read("src/app/api/onboarding/route.ts");
    assert.ok(route.includes("professional_identity"));
    assert.ok(route.includes("updateOwnerOnboardingProfessionalIdentity"));
    const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
    assert.ok(client.includes("ProfessionalIdentitySection"));
    assert.ok(client.includes("websiteSetupComplete"));
    console.log("7. Website Setup UI + API OK");
  }

  console.log("\nSTAGE 6.11D SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
