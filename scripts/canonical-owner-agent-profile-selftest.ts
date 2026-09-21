/**
 * V1 owner/agent identity consistency: onboarding → User/AgentProfile → Team.
 * Run: pnpm canonical-owner-agent-profile:selftest
 *
 * Hermetic. No production writes. No Maria backfill. No deploy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  OrgMembershipRole,
  PrismaClient,
  Role,
  WorkspaceMemberRole,
  WorkspaceMemberStatus,
  WorkspaceStatus,
} from "@prisma/client";
import type { AgentOrgContext } from "@/lib/agent";
import {
  loadWorkspaceAgentProfile,
  updateWorkspaceAgentProfile,
} from "@/lib/agent/admin-managed-profile";
import {
  OwnerActivationError,
  updateOwnerOnboardingProfessionalIdentity,
} from "@/lib/platform/activation";
import {
  applyOwnerCanonicalProfileFromCurrentSave,
  provisioningPhoneSeedFromProspect,
} from "@/lib/platform/activation/sync-owner-canonical-profile";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";
import { parsePhoneColumnsForWrite } from "@/lib/sms/e164";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_A = "ws_canonical_a";
const WS_B = "ws_canonical_b";
const USER_OWNER = "user_owner_a";
const USER_AGENT = "user_agent_a";
const USER_B = "user_owner_b";

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  phoneE164: string | null;
  emailVerified: Date | null;
};

type ProfileRow = {
  userId: string;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  recoLicenseNumber: string | null;
  recoLicenseExpiresAt: Date | null;
};

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

type State = {
  users: Map<string, UserRow>;
  agentProfiles: Map<string, ProfileRow>;
  identities: Map<string, IdentityRow>;
  members: Array<{
    id: string;
    workspaceId: string;
    userId: string;
    role: string;
    status: string;
  }>;
  workspaces: Map<string, { id: string; slug: string; name: string; status: string }>;
  brandings: Map<string, { workspaceId: string; themeId: string; brokerageLogoUrl: string | null }>;
  onboarding: Map<string, Record<string, unknown>>;
};

function seedState(): State {
  return {
    users: new Map([
      [
        USER_OWNER,
        {
          id: USER_OWNER,
          name: "Maria Khalid",
          email: "maria@homelife.test",
          phone: null,
          phoneE164: null,
          emailVerified: null,
        },
      ],
      [
        USER_AGENT,
        {
          id: USER_AGENT,
          name: "Agent Only",
          email: "agent@homelife.test",
          phone: "416-555-0000",
          phoneE164: "+14165550000",
          emailVerified: null,
        },
      ],
      [
        USER_B,
        {
          id: USER_B,
          name: "Other Owner",
          email: "other@tenant.test",
          phone: "416-555-2222",
          phoneE164: "+14165552222",
          emailVerified: null,
        },
      ],
    ]),
    agentProfiles: new Map(),
    identities: new Map(),
    members: [
      {
        id: "mem_owner_a",
        workspaceId: WS_A,
        userId: USER_OWNER,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        id: "mem_agent_a",
        workspaceId: WS_A,
        userId: USER_AGENT,
        role: "AGENT",
        status: "ACTIVE",
      },
      {
        id: "mem_owner_b",
        workspaceId: WS_B,
        userId: USER_B,
        role: "OWNER",
        status: "ACTIVE",
      },
    ],
    workspaces: new Map([
      [WS_A, { id: WS_A, slug: "tenant-a", name: "Tenant A", status: "ACTIVE" }],
      [WS_B, { id: WS_B, slug: "tenant-b", name: "Tenant B", status: "ACTIVE" }],
    ]),
    brandings: new Map([
      [
        WS_A,
        {
          workspaceId: WS_A,
          themeId: "agent-signature:forest",
          brokerageLogoUrl:
            "https://branding-assets.houzzatpro.com/workspaces/ws_a/branding/brokerage-logo/y.png",
        },
      ],
      [
        WS_B,
        {
          workspaceId: WS_B,
          themeId: "agent-signature:forest",
          brokerageLogoUrl: null,
        },
      ],
    ]),
    onboarding: new Map(),
  };
}

function createFakePrisma(state: State): PrismaClient {
  return {
    workspace: {
      async findUnique({
        where,
      }: {
        where: { id: string };
      }) {
        const ws = state.workspaces.get(where.id);
        if (!ws) return null;
        const branding = state.brandings.get(ws.id);
        return {
          ...ws,
          professionalIdentity: state.identities.get(ws.id) ?? null,
          branding: branding
            ? {
                displayName: ws.name,
                contactEmail: null,
                contactPhone: null,
                themeId: branding.themeId,
                agentProfilePhotoUrl: null,
                logoUrl: null,
                brokerageLogoUrl: branding.brokerageLogoUrl,
                faviconUrl: null,
              }
            : null,
          emailIdentity: null,
          teamProfile: null,
          onboardingState: state.onboarding.get(ws.id) ?? null,
        };
      },
    },
    workspaceTeamMember: {
      async findMany() {
        return [];
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
        where: {
          workspaceId: string;
          userId?: string;
          role?: string;
          status?: string;
        };
      }) {
        const hit = state.members.find(
          (m) =>
            m.workspaceId === where.workspaceId &&
            (!where.userId || m.userId === where.userId) &&
            (!where.role || m.role === where.role) &&
            (!where.status || m.status === where.status),
        );
        if (!hit) return null;
        const user = state.users.get(hit.userId);
        if (!user) return { ...hit, user: null };
        return {
          ...hit,
          user: {
            ...user,
            agentProfile: state.agentProfiles.get(hit.userId) ?? null,
          },
        };
      },
    },
    workspaceProfessionalIdentity: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.identities.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: IdentityRow }) {
        state.identities.set(data.workspaceId, { ...data });
        return { ...data };
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Partial<IdentityRow>;
      }) {
        const row = state.identities.get(where.workspaceId);
        if (!row) throw new Error("identity missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceBranding: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.brandings.get(where.workspaceId);
        return row ? { ...row, contactEmail: null, faviconUrl: null } : null;
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
    user: {
      async findUnique({ where }: { where: { id?: string; email?: string } }) {
        if (where.id) return state.users.get(where.id) ?? null;
        if (where.email) {
          return (
            [...state.users.values()].find((u) => u.email === where.email) ??
            null
          );
        }
        return null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = state.users.get(where.id);
        if (!row) throw new Error("user missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    agentProfile: {
      async upsert({
        where,
        create,
        update,
      }: {
        where: { userId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) {
        const existing = state.agentProfiles.get(where.userId);
        if (existing) {
          Object.assign(existing, update);
          return { ...existing };
        }
        const row: ProfileRow = {
          userId: where.userId,
          active: true,
          firstName: null,
          lastName: null,
          phone: null,
          recoLicenseNumber: null,
          recoLicenseExpiresAt: null,
          ...create,
        };
        state.agentProfiles.set(where.userId, row);
        return { ...row };
      },
    },
    workspaceEntitlement: {
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

function ownerCtx(workspaceId = WS_A): AgentOrgContext {
  return {
    user: {
      id: USER_OWNER,
      email: "maria@homelife.test",
      name: "Maria Khalid",
      image: null,
      phone: null,
      role: "AGENT" as Role,
    },
    organizationId: "org_a",
    organizationName: "Tenant A",
    organizationIds: ["org_a"],
    membershipRole: "OWNER" as OrgMembershipRole,
    canSeeTeamLeads: true,
    isPlatformAdmin: false,
    workspaceId,
    workspaceRole: "OWNER" as WorkspaceMemberRole,
    workspaceMemberStatus: "ACTIVE" as WorkspaceMemberStatus,
    workspaceStatus: "ACTIVE" as WorkspaceStatus,
    workspaceName: "Tenant A",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: true,
    readScope: "workspace",
  };
}

async function main() {
  console.log("\n=== CANONICAL OWNER/AGENT PROFILE CONSISTENCY ===\n");
  const prevScope = process.env.WORKSPACE_TEAM_SCOPE;
  const prevTenant = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_TEAM_SCOPE = "workspace";
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  clearHostResolutionCacheForTests();

  try {
    {
      const onboarding = read("src/lib/platform/activation/onboarding.ts");
      assert.ok(onboarding.includes("applyOwnerCanonicalProfileFromCurrentSave"));
      const steps = read("src/lib/platform/provisioning/steps.ts");
      assert.ok(steps.includes("provisioningPhoneSeedFromProspect"));
      assert.ok(steps.includes("Never overwrite a newer authenticated profile value"));
      const team = read("src/lib/agent/admin-managed-profile.ts");
      assert.ok(team.includes("workspaceProfessionalIdentity.update"));
      assert.ok(team.includes('loaded.profile.role === "OWNER"'));
      const notify = read("src/lib/sms/assigned-agent-inbound-notify.ts");
      assert.ok(notify.includes("select: { phoneE164: true, phone: true, disabledAt: true }"));
      const ui = read("src/components/onboarding/ProfessionalIdentitySection.tsx");
      assert.ok(ui.includes("recoLicenseNumber"));
      assert.ok(ui.includes("RECO license"));
      console.log("[1] wiring: onboarding/Team/SMS canonical records... PASS");
    }

    {
      const seed = provisioningPhoneSeedFromProspect("4376774949");
      assert.equal(seed?.phone, "4376774949");
      assert.equal(seed?.phoneE164, "+14376774949");
      assert.equal(provisioningPhoneSeedFromProspect("not-a-phone"), null);
      const lockstep = parsePhoneColumnsForWrite("416-555-0199");
      assert.equal(lockstep.ok, true);
      if (lockstep.ok) {
        assert.equal(lockstep.columns.phone, "416-555-0199");
        assert.equal(lockstep.columns.phoneE164, "+14165550199");
      }
      console.log("[2] phone/E164 helpers... PASS");
    }

    {
      const state = seedState();
      const db = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      const saved = await updateOwnerOnboardingProfessionalIdentity({
        request: new Request("https://tenant-a.houzzatpro.com/api/onboarding"),
        prisma: db,
        hostDeps,
        userId: USER_OWNER,
        agentRegisteredName: "Maria Khalid",
        agentDesignation: "Salesperson",
        agentCellPhone: "437-677-4949",
        recoLicenseNumber: "12345678",
        recoLicenseExpiresAt: "2027-06-15",
        brokerageRegisteredName: "Homelife Miracle Realty Ltd",
        brokerageFax: "905-797-1020",
        brokeragePhone: "905-797-1000",
        brokerageAddress: "Mississauga",
      });
      assert.equal(saved.professionalIdentity.agentCellPhone, "437-677-4949");
      assert.equal(saved.professionalIdentity.recoLicenseNumber, "12345678");
      assert.equal(state.users.get(USER_OWNER)?.phone, "437-677-4949");
      assert.equal(state.users.get(USER_OWNER)?.phoneE164, "+14376774949");
      assert.equal(state.agentProfiles.get(USER_OWNER)?.recoLicenseNumber, "12345678");
      assert.equal(state.identities.get(WS_A)?.brokerageRegisteredName, "Homelife Miracle Realty Ltd");

      const team = await loadWorkspaceAgentProfile(ownerCtx(), USER_OWNER, db);
      assert.equal(team.ok, true);
      if (!team.ok) return;
      assert.equal(team.profile.firstName, "Maria");
      assert.equal(team.profile.lastName, "Khalid");
      assert.equal(team.profile.email, "maria@homelife.test");
      assert.equal(team.profile.phone, "437-677-4949");
      assert.equal(team.profile.phoneE164, "+14376774949");
      assert.equal(team.profile.recoLicenseNumber, "12345678");
      assert.equal(team.profile.recoLicenseExpiresAt, "2027-06-15");
      console.log("[3] onboarding save → canonical User/AgentProfile → Team... PASS");
    }

    {
      const state = seedState();
      const db = createFakePrisma(state);
      state.users.get(USER_OWNER)!.phone = "416-555-0199";
      state.users.get(USER_OWNER)!.phoneE164 = "+14165550199";
      await applyOwnerCanonicalProfileFromCurrentSave(
        db,
        USER_OWNER,
        {
          agentRegisteredName: "Maria Khalid",
          agentCellPhone: "",
          recoLicenseNumber: "",
          recoLicenseExpiresAt: "",
        },
        { persistAsDraft: true },
      );
      assert.equal(state.users.get(USER_OWNER)?.phone, "416-555-0199");
      assert.equal(state.users.get(USER_OWNER)?.phoneE164, "+14165550199");

      await applyOwnerCanonicalProfileFromCurrentSave(
        db,
        USER_OWNER,
        { agentCellPhone: "not-a-phone" },
        { persistAsDraft: true },
      );
      assert.equal(state.users.get(USER_OWNER)?.phone, "416-555-0199");

      await assert.rejects(
        () =>
          applyOwnerCanonicalProfileFromCurrentSave(db, USER_OWNER, {
            agentCellPhone: "not-a-phone",
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError && err.code === "INVALID_AGENT_CELL",
      );
      assert.equal(state.users.get(USER_OWNER)?.phone, "416-555-0199");
      console.log("[4] empty/historical draft does not overwrite newer phone... PASS");
    }

    {
      const state = seedState();
      const db = createFakePrisma(state);
      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      await updateOwnerOnboardingProfessionalIdentity({
        request: new Request("https://tenant-a.houzzatpro.com/api/onboarding"),
        prisma: db,
        hostDeps,
        userId: USER_OWNER,
        agentRegisteredName: "Maria Khalid",
        agentDesignation: "Salesperson",
        agentCellPhone: "437-677-4949",
        recoLicenseNumber: "12345678",
        recoLicenseExpiresAt: "2027-06-15",
        brokerageRegisteredName: "Homelife Miracle Realty Ltd",
        brokerageFax: "905-797-1020",
        brokeragePhone: "905-797-1000",
        brokerageAddress: "Mississauga",
      });

      const edited = await updateWorkspaceAgentProfile({
        ctx: ownerCtx(),
        userId: USER_OWNER,
        prisma: db,
        raw: {
          firstName: "Maria",
          lastName: "Khalid",
          email: "maria@homelife.test",
          phone: "905-555-0100",
          recoLicenseNumber: "87654321",
          recoLicenseExpiresAt: "2028-01-31",
        },
      });
      assert.equal(edited.ok, true);
      if (!edited.ok) return;
      assert.equal(edited.profile.phone, "905-555-0100");
      assert.equal(edited.profile.phoneE164, "+19055550100");
      assert.equal(edited.profile.recoLicenseNumber, "87654321");
      assert.equal(state.users.get(USER_OWNER)?.phone, "905-555-0100");
      assert.equal(state.agentProfiles.get(USER_OWNER)?.recoLicenseNumber, "87654321");
      assert.equal(state.identities.get(WS_A)?.agentCellPhone, "905-555-0100");
      assert.equal(state.identities.get(WS_A)?.agentRegisteredName, "Maria Khalid");
      assert.equal(state.identities.get(WS_A)?.brokerageRegisteredName, "Homelife Miracle Realty Ltd");
      console.log("[5] authorized Team edit updates the same canonical records... PASS");
    }

    {
      const state = seedState();
      const db = createFakePrisma(state);
      const denied = await updateWorkspaceAgentProfile({
        ctx: { ...ownerCtx(), canManageWorkspace: false, workspaceRole: "AGENT" },
        userId: USER_OWNER,
        prisma: db,
        raw: {
          firstName: "Maria",
          lastName: "Khalid",
          email: "maria@homelife.test",
          phone: "905-555-0100",
          recoLicenseNumber: "87654321",
          recoLicenseExpiresAt: "2028-01-31",
        },
      });
      assert.equal(denied.ok, false);
      if (!denied.ok) assert.equal(denied.status, 403);

      const cross = await loadWorkspaceAgentProfile(ownerCtx(WS_A), USER_B, db);
      assert.equal(cross.ok, false);
      if (!cross.ok) assert.equal(cross.status, 404);

      const hostDeps = createFixtureHostResolutionDeps(DOMAINS);
      await assert.rejects(
        () =>
          updateOwnerOnboardingProfessionalIdentity({
            request: new Request("https://tenant-a.houzzatpro.com/api/onboarding"),
            prisma: db,
            hostDeps,
            userId: USER_OWNER,
            clientWorkspaceId: WS_B,
            agentRegisteredName: "Cross",
            agentDesignation: "Salesperson",
            agentCellPhone: "416-555-0101",
            brokerageRegisteredName: "X",
            brokerageFax: "1",
            brokeragePhone: "2",
            brokerageAddress: "Y",
          }),
        (err: unknown) =>
          err instanceof OwnerActivationError &&
          err.code === "WORKSPACE_HOST_MISMATCH",
      );
      assert.equal(state.users.get(USER_B)?.phone, "416-555-2222");
      console.log("[6] tenant isolation + Agent cannot edit Admin-managed profile... PASS");
    }
  } finally {
    clearHostResolutionCacheForTests();
    if (prevScope === undefined) delete process.env.WORKSPACE_TEAM_SCOPE;
    else process.env.WORKSPACE_TEAM_SCOPE = prevScope;
    if (prevTenant === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prevTenant;
  }

  console.log("\ncanonical-owner-agent-profile:selftest: ok\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
