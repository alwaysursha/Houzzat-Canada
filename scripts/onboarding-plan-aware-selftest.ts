/**
 * V1 plan-aware onboarding: SOLO must not require Team roster.
 * Run: pnpm onboarding-plan-aware:selftest
 *
 * Hermetic. No production writes. No deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PlanCode, PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import { FEATURE_TEAM_MANAGEMENT } from "@/lib/platform/catalog/features";
import {
  evaluateWebsiteSetupComplete,
  listMissingWebsiteSetupFields,
} from "@/lib/tenancy/professional-identity";
import { createOwnerTeamMember } from "@/lib/tenancy/team-roster";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  TEAM_SIGNATURE_TEMPLATE_ID,
  listOwnerWebsiteDesignTemplateOptions,
  resolveOnboardingCategoryFromThemeId,
  resolvePublicTemplateIdForPlan,
} from "@/lib/tenancy/templates";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_SOLO = "ws_solo_plan";
const WS_TEAM = "ws_team_plan";
const WS_BROKERAGE = "ws_brokerage_plan";
const USER_SOLO = "user_solo_owner";
const USER_TEAM = "user_team_owner";
const USER_BROKERAGE = "user_brokerage_owner";

type EntitlementRow = {
  enabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
};

type State = {
  workspaces: Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      status: string;
      currentSubscriptionId: string | null;
    }
  >;
  subscriptions: Map<
    string,
    { id: string; planCode: PlanCode; entitlementProfileCode: string }
  >;
  entitlements: Map<string, EntitlementRow>;
  members: Array<{
    workspaceId: string;
    userId: string;
    role: string;
    status: string;
  }>;
  brandings: Map<
    string,
    {
      workspaceId: string;
      displayName: string;
      contactEmail: string;
      contactPhone: string | null;
      themeId: string | null;
      version: number;
      agentProfilePhotoUrl: string | null;
      logoUrl: string | null;
      brokerageLogoUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string | null;
      secondaryColor: string | null;
      accentColor: string | null;
    }
  >;
  identities: Map<
    string,
    {
      workspaceId: string;
      agentRegisteredName: string | null;
      agentDesignation: string | null;
      agentCellPhone: string | null;
      brokerageRegisteredName: string | null;
      brokerageFax: string | null;
      brokeragePhone: string | null;
      brokerageAddress: string | null;
    }
  >;
  onboarding: Map<string, Record<string, unknown>>;
  users: Map<string, { id: string; phone: string | null; name: string | null }>;
};

function entitlementKey(workspaceId: string, featureCode: string) {
  return `${workspaceId}:${featureCode}`;
}

function seedWorkspace(
  state: State,
  input: {
    workspaceId: string;
    slug: string;
    userId: string;
    planCode: PlanCode;
    teamManagement: boolean;
    themeId: string;
    brandingComplete?: boolean;
  },
) {
  const subId = `sub_${input.workspaceId}`;
  state.workspaces.set(input.workspaceId, {
    id: input.workspaceId,
    slug: input.slug,
    name: input.slug,
    status: "ACTIVE",
    currentSubscriptionId: subId,
  });
  state.subscriptions.set(subId, {
    id: subId,
    planCode: input.planCode,
    entitlementProfileCode: input.planCode,
  });
  state.entitlements.set(
    entitlementKey(input.workspaceId, FEATURE_TEAM_MANAGEMENT),
    {
      enabled: input.teamManagement,
      startsAt: null,
      endsAt: null,
    },
  );
  state.members.push({
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: "OWNER",
    status: "ACTIVE",
  });
  state.users.set(input.userId, {
    id: input.userId,
    name: "Maria Khalid",
    phone: "437-677-4949",
  });
  state.brandings.set(input.workspaceId, {
    workspaceId: input.workspaceId,
    displayName: "Team Maria Khalid",
    contactEmail: "maria@homelife.test",
    contactPhone: "4376774949",
    themeId: input.themeId,
    version: 1,
    agentProfilePhotoUrl: "/photo.png",
    logoUrl: "/logo.png",
    brokerageLogoUrl: "/brokerage.png",
    faviconUrl: null,
    primaryColor: "#0F6B4C",
    secondaryColor: null,
    accentColor: null,
  });
  state.identities.set(input.workspaceId, {
    workspaceId: input.workspaceId,
    agentRegisteredName: "Maria Khalid",
    agentDesignation: "Salesperson",
    agentCellPhone: "437-677-4949",
    brokerageRegisteredName: "Homelife Miracle Realty Ltd",
    brokerageFax: "905-797-1020",
    brokeragePhone: "905-797-1000",
    brokerageAddress: "Mississauga",
  });
  state.onboarding.set(input.workspaceId, {
    workspaceId: input.workspaceId,
    businessProfileStatus: "COMPLETE",
    brandingStatus: "COMPLETE",
    professionalIdentityStatus: "COMPLETE",
    templateThemeStatus: "COMPLETE",
    emailIdentityStatus: "COMPLETE",
    accountActivatedAt: new Date(),
    completedAt: null,
  });
}

function emptyState(): State {
  return {
    workspaces: new Map(),
    subscriptions: new Map(),
    entitlements: new Map(),
    members: [],
    brandings: new Map(),
    identities: new Map(),
    onboarding: new Map(),
    users: new Map(),
  };
}

function createFakePrisma(state: State): PrismaClient {
  return {
    workspace: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string };
        select?: Record<string, unknown>;
      }) {
        const ws = where.id ? state.workspaces.get(where.id) : null;
        if (!ws) return null;
        if (!select || !("branding" in select)) return { ...ws };
        return {
          ...ws,
          branding: state.brandings.get(ws.id) ?? null,
          emailIdentity: {
            contactEmail: "maria@homelife.test",
            replyToEmail: "maria@homelife.test",
            senderDisplayName: "Maria Khalid",
            domainStatus: "NONE",
          },
          professionalIdentity: state.identities.get(ws.id) ?? null,
          teamProfile: { leaderMemberId: null },
          onboardingState: state.onboarding.get(ws.id) ?? null,
        };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const ws = state.workspaces.get(where.id);
        if (!ws) throw new Error("missing workspace");
        Object.assign(ws, data);
        return { ...ws };
      },
    },
    subscription: {
      async findUnique({ where }: { where: { id: string } }) {
        return state.subscriptions.get(where.id) ?? null;
      },
      async findFirst() {
        return null;
      },
    },
    workspaceEntitlement: {
      async findUnique({
        where,
      }: {
        where: {
          workspaceId_featureCode: { workspaceId: string; featureCode: string };
        };
      }) {
        return (
          state.entitlements.get(
            entitlementKey(
              where.workspaceId_featureCode.workspaceId,
              where.workspaceId_featureCode.featureCode,
            ),
          ) ?? null
        );
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
      async findFirst({
        where,
      }: {
        where: { workspaceId: string; role?: string; status?: string };
      }) {
        const hit = state.members.find(
          (m) =>
            m.workspaceId === where.workspaceId &&
            (!where.role || m.role === where.role) &&
            (!where.status || m.status === where.status),
        );
        if (!hit) return null;
        const user = state.users.get(hit.userId) ?? {
          id: hit.userId,
          phone: null,
          name: null,
        };
        return { ...hit, user: { ...user, agentProfile: null } };
      },
    },
    workspaceTeamMember: {
      async findMany() {
        return [];
      },
    },
    workspaceTeamProfile: {
      async findUnique() {
        return { leaderMemberId: null };
      },
      async create({ data }: { data: { workspaceId: string } }) {
        return { workspaceId: data.workspaceId, leaderMemberId: null };
      },
    },
    workspaceBranding: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        return state.brandings.get(where.workspaceId) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.brandings.get(where.workspaceId);
        if (!row) throw new Error("branding missing");
        const next = { ...data };
        if (
          next.version &&
          typeof next.version === "object" &&
          next.version !== null &&
          "increment" in (next.version as object)
        ) {
          row.version += 1;
          delete next.version;
        }
        Object.assign(row, next);
        return { ...row };
      },
    },
    workspaceProfessionalIdentity: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        return state.identities.get(where.workspaceId) ?? null;
      },
    },
    workspaceOnboardingState: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        return state.onboarding.get(where.workspaceId) ?? null;
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
    hostname: "solo.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_SOLO,
    workspaceSlug: "solo",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "team.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_TEAM,
    workspaceSlug: "team",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "brokerage.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_BROKERAGE,
    workspaceSlug: "brokerage",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
];

function req(hostname: string) {
  return new Request(`https://${hostname}/api/onboarding`, {
    headers: { host: hostname },
  });
}

async function main() {
  console.log("\n=== ONBOARDING PLAN-AWARE (SOLO / TEAM / BROKERAGE) ===\n");
  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  clearHostResolutionCacheForTests();

  try {
    {
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      assert.ok(client.includes("item.teamRosterEnabled === true"));
      assert.ok(client.includes("TeamRosterSection"));
      const manage = read("src/lib/tenancy/team-roster/manage.ts");
      assert.ok(manage.includes("PLAN_TEAM_ROSTER_UNAVAILABLE"));
      assert.ok(manage.includes("resolveWorkspacePlanCapabilities"));
      const marketing = read("src/lib/tenancy/resolve-marketing-tenancy.ts");
      assert.ok(marketing.includes("resolvePublicTemplateIdForPlan"));
      assert.ok(marketing.includes("plan.teamRosterEnabled"));
      console.log("[0] wiring: UI/API/public site use provisioned plan... PASS");
    }

    {
      const soloOpts = listOwnerWebsiteDesignTemplateOptions({
        teamRosterEnabled: false,
      });
      assert.equal(
        soloOpts.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID),
        false,
      );
      assert.ok(soloOpts.some((t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID));
      const teamOpts = listOwnerWebsiteDesignTemplateOptions({
        teamRosterEnabled: true,
      });
      assert.ok(teamOpts.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID));
      assert.equal(
        resolveOnboardingCategoryFromThemeId("team-signature:mint", false),
        "DEFAULT",
      );
      assert.equal(
        resolveOnboardingCategoryFromThemeId("team-signature:mint", true),
        "TEAM",
      );
      assert.equal(
        resolvePublicTemplateIdForPlan(TEAM_SIGNATURE_TEMPLATE_ID, false),
        AGENT_SIGNATURE_TEMPLATE_ID,
      );
      assert.equal(
        resolvePublicTemplateIdForPlan(TEAM_SIGNATURE_TEMPLATE_ID, true),
        TEAM_SIGNATURE_TEMPLATE_ID,
      );
      console.log("[1] catalog/public template: SOLO has no Team Signature... PASS");
    }

    {
      const completeBase = {
        businessProfileStatus: "COMPLETE",
        brandingStatus: "COMPLETE",
        professionalIdentityStatus: "COMPLETE",
        templateThemeStatus: "COMPLETE",
      };
      assert.equal(
        evaluateWebsiteSetupComplete({
          ...completeBase,
          category: "TEAM",
          themeId: "team-signature:mint",
          teamSignatureDataReady: false,
          teamRosterEnabled: false,
        }),
        true,
      );
      const soloMissing = listMissingWebsiteSetupFields({
        category: "TEAM",
        businessProfileStatus: "COMPLETE",
        templateThemeStatus: "COMPLETE",
        identity: {
          agentRegisteredName: "Maria Khalid",
          agentDesignation: "Salesperson",
          agentCellPhone: "437-677-4949",
          brokerageRegisteredName: "Homelife",
          brokerageFax: "1",
          brokeragePhone: "2",
          brokerageAddress: "3",
        },
        assets: {
          agentProfilePhotoUrl: "/p.png",
          brokerageLogoUrl: "/b.png",
          logoUrl: null,
        },
        teamSignatureReadiness: {
          missing: ["visibleTeamMember", "teamLeader"],
          sections: {
            business: true,
            branding: false,
            brokerage: true,
            roster: false,
            leader: false,
          },
        },
        themeId: "team-signature:mint",
        teamRosterEnabled: false,
      });
      assert.equal(soloMissing.includes("visibleTeamMember"), false);
      assert.equal(soloMissing.includes("teamLeader"), false);
      assert.equal(
        evaluateWebsiteSetupComplete({
          ...completeBase,
          category: "TEAM",
          themeId: "team-signature:mint",
          teamSignatureDataReady: false,
          teamRosterEnabled: true,
        }),
        false,
      );
      assert.equal(
        evaluateWebsiteSetupComplete({
          ...completeBase,
          category: "TEAM",
          themeId: "team-signature:mint",
          teamSignatureDataReady: true,
          teamRosterEnabled: true,
        }),
        true,
      );
      console.log("[2] SOLO ignores Team readiness; TEAM still requires it... PASS");
    }

    {
      const state = emptyState();
      seedWorkspace(state, {
        workspaceId: WS_SOLO,
        slug: "solo",
        userId: USER_SOLO,
        planCode: "SOLO",
        teamManagement: false,
        themeId: "agent-signature:forest",
      });
      const prisma = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      const [solo] = await listOwnerOnboardingWorkspaces({
        request: req("solo.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_SOLO,
      });
      assert.equal(solo!.planCode, "SOLO");
      assert.equal(solo!.teamRosterEnabled, false);
      assert.equal(solo!.teamSignatureDataReadiness, null);
      assert.equal(
        solo!.templateOptions.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID),
        false,
      );
      assert.equal(solo!.onboarding.websiteSetupComplete, true);
      assert.equal(
        solo!.onboarding.websiteSetupMissingFields.includes("Team Leader"),
        false,
      );
      assert.equal(
        solo!.onboarding.websiteSetupMissingFields.includes(
          "At least one visible Team member",
        ),
        false,
      );
      assert.equal(solo!.onboarding.professionalIdentityStatus, "COMPLETE");
      assert.equal(solo!.professionalIdentity.agentCellPhone, "437-677-4949");
      console.log("[3] SOLO payload: no roster UI data; completion preserved... PASS");
    }

    {
      const state = emptyState();
      seedWorkspace(state, {
        workspaceId: WS_SOLO,
        slug: "solo",
        userId: USER_SOLO,
        planCode: "SOLO",
        teamManagement: false,
        themeId: "team-signature:mint",
      });
      const prisma = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      const [solo] = await listOwnerOnboardingWorkspaces({
        request: req("solo.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_SOLO,
      });
      assert.equal(solo!.teamRosterEnabled, false);
      assert.equal(solo!.onboarding.websiteSetupComplete, true);
      assert.equal(solo!.templateCategory, "DEFAULT");
      await assert.rejects(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: req("solo.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_SOLO,
            themeId: "team-signature:beige",
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError &&
          err.code === "PLAN_THEME_NOT_AVAILABLE",
      );
      await assert.rejects(
        () =>
          createOwnerTeamMember({
            request: req("solo.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_SOLO,
            body: { name: "Fake Member" },
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError &&
          err.code === "PLAN_TEAM_ROSTER_UNAVAILABLE",
      );
      console.log("[4] SOLO leftover Team theme stays complete; plan cannot be spoofed... PASS");
    }

    {
      const state = emptyState();
      seedWorkspace(state, {
        workspaceId: WS_TEAM,
        slug: "team",
        userId: USER_TEAM,
        planCode: "TEAM",
        teamManagement: true,
        themeId: "team-signature:mint",
      });
      seedWorkspace(state, {
        workspaceId: WS_BROKERAGE,
        slug: "brokerage",
        userId: USER_BROKERAGE,
        planCode: "BROKERAGE",
        teamManagement: true,
        themeId: "default-signature:mint",
      });
      const prisma = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      const [team] = await listOwnerOnboardingWorkspaces({
        request: req("team.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_TEAM,
      });
      assert.equal(team!.planCode, "TEAM");
      assert.equal(team!.teamRosterEnabled, true);
      assert.ok(team!.teamSignatureDataReadiness);
      assert.equal(team!.teamSignatureDataReadiness!.ready, false);
      assert.ok(
        team!.templateOptions.some((t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID),
      );
      assert.ok(
        team!.onboarding.websiteSetupMissingFields.includes("Team Leader") ||
          team!.teamSignatureDataReadiness!.missing.includes("teamLeader"),
      );

      const [brokerage] = await listOwnerOnboardingWorkspaces({
        request: req("brokerage.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_BROKERAGE,
      });
      assert.equal(brokerage!.planCode, "BROKERAGE");
      assert.equal(brokerage!.teamRosterEnabled, true);
      assert.ok(
        brokerage!.templateOptions.some(
          (t) => t.id === TEAM_SIGNATURE_TEMPLATE_ID,
        ),
      );
      console.log("[5] TEAM/BROKERAGE keep Team roster + applicable readiness... PASS");
    }

    {
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      const state = emptyState();
      seedWorkspace(state, {
        workspaceId: WS_SOLO,
        slug: "solo",
        userId: USER_SOLO,
        planCode: "SOLO",
        teamManagement: false,
        themeId: "agent-signature:forest",
      });
      seedWorkspace(state, {
        workspaceId: WS_TEAM,
        slug: "team",
        userId: USER_TEAM,
        planCode: "TEAM",
        teamManagement: true,
        themeId: "team-signature:mint",
      });
      const prisma = createFakePrisma(state);
      await assert.rejects(
        () =>
          listOwnerOnboardingWorkspaces({
            request: req("solo.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_TEAM,
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError && err.status === 403,
      );
      console.log("[6] tenant isolation preserved... PASS");
    }
  } finally {
    clearHostResolutionCacheForTests();
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
  }

  console.log("\nonboarding-plan-aware:selftest: ok\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
