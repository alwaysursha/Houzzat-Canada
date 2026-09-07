/**
 * Stage 6.10C.1 — host-bound owner onboarding authority selftest.
 * Run: pnpm stage-6.10c1-host-bound-onboarding:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  requireHostBoundOwnerOnboardingContext,
  updateOwnerOnboardingBusinessProfile,
} from "@/lib/platform/activation";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_REMAX = "cmtn5glsq0005psp7z8wk891q";
const WS_HOUZZAT = "ws_houzzat_fixture";
const WS_B = "ws_other_owned";
const USER_OWNER = "user_remax_owner";
const USER_AGENT = "user_remax_agent";
const USER_STRANGER = "user_unaffiliated";
const USER_MULTI = "user_multi_owner";

type Member = {
  workspaceId: string;
  userId: string;
  role: string;
  status: string;
};

type FakeState = {
  workspaces: Map<
    string,
    { id: string; slug: string; name: string; status: string }
  >;
  members: Member[];
  brandings: Map<
    string,
    {
      workspaceId: string;
      displayName: string;
      contactEmail: string | null;
      contactPhone: string | null;
    }
  >;
  emailIdentities: Map<
    string,
    {
      workspaceId: string;
      contactEmail: string | null;
      replyToEmail: string | null;
      senderDisplayName: string | null;
      domainStatus: string;
    }
  >;
  onboarding: Map<
    string,
    {
      workspaceId: string;
      accountActivatedAt: Date | null;
      businessProfileStatus: string;
      brandingStatus: string;
      professionalIdentityStatus: string;
      templateThemeStatus: string;
      emailIdentityStatus: string;
      completedAt: Date | null;
    }
  >;
  professionalIdentities: Map<
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
};

function seedState(): FakeState {
  const state: FakeState = {
    workspaces: new Map([
      [
        WS_REMAX,
        {
          id: WS_REMAX,
          slug: "re-max-realty",
          name: "RE/MAX REALTY",
          status: "ACTIVE",
        },
      ],
      [
        WS_HOUZZAT,
        {
          id: WS_HOUZZAT,
          slug: "houzzat",
          name: "Houzzat",
          status: "ACTIVE",
        },
      ],
      [
        WS_B,
        {
          id: WS_B,
          slug: "other-brokerage",
          name: "Other Brokerage",
          status: "ACTIVE",
        },
      ],
      [
        "ws_inactive",
        {
          id: "ws_inactive",
          slug: "inactive-co",
          name: "Inactive Co",
          status: "SUSPENDED",
        },
      ],
    ]),
    members: [
      {
        workspaceId: WS_REMAX,
        userId: USER_OWNER,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        workspaceId: WS_REMAX,
        userId: USER_AGENT,
        role: "AGENT",
        status: "ACTIVE",
      },
      {
        workspaceId: WS_REMAX,
        userId: USER_MULTI,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        workspaceId: WS_B,
        userId: USER_MULTI,
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        workspaceId: WS_HOUZZAT,
        userId: "user_houzzat_owner",
        role: "OWNER",
        status: "ACTIVE",
      },
      {
        workspaceId: WS_REMAX,
        userId: "user_disabled",
        role: "OWNER",
        status: "DISABLED",
      },
    ],
    brandings: new Map([
      [
        WS_REMAX,
        {
          workspaceId: WS_REMAX,
          displayName: "RE/MAX REALTY",
          contactEmail: "owner@remax.test",
          contactPhone: "647-221-2725",
        },
      ],
      [
        WS_B,
        {
          workspaceId: WS_B,
          displayName: "Other Brokerage",
          contactEmail: "b@other.test",
          contactPhone: null,
        },
      ],
      [
        WS_HOUZZAT,
        {
          workspaceId: WS_HOUZZAT,
          displayName: "Houzzat",
          contactEmail: "a@houzzat.test",
          contactPhone: null,
        },
      ],
    ]),
    emailIdentities: new Map([
      [
        WS_REMAX,
        {
          workspaceId: WS_REMAX,
          contactEmail: "owner@remax.test",
          replyToEmail: "owner@remax.test",
          senderDisplayName: "RE/MAX REALTY",
          domainStatus: "NONE",
        },
      ],
      [
        WS_B,
        {
          workspaceId: WS_B,
          contactEmail: "b@other.test",
          replyToEmail: "b@other.test",
          senderDisplayName: "Other Brokerage",
          domainStatus: "NONE",
        },
      ],
    ]),
    onboarding: new Map(),
    professionalIdentities: new Map(),
  };
  return state;
}

function createFakePrisma(state: FakeState): PrismaClient {
  return {
    workspace: {
      async findUnique({
        where,
        select,
      }: {
        where: { id?: string; slug?: string };
        select?: Record<string, unknown>;
      }) {
        const ws = where.id
          ? state.workspaces.get(where.id)
          : [...state.workspaces.values()].find((w) => w.slug === where.slug);
        if (!ws) return null;
        if (!select || !("branding" in select)) {
          return { ...ws };
        }
        const branding = state.brandings.get(ws.id) ?? null;
        const emailIdentity = state.emailIdentities.get(ws.id) ?? null;
        const onboardingState = state.onboarding.get(ws.id) ?? null;
        const professionalIdentity =
          state.professionalIdentities.get(ws.id) ?? null;
        return {
          ...ws,
          branding,
          emailIdentity,
          onboardingState,
          professionalIdentity,
          teamProfile: null,
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
        if (!ws) throw new Error("workspace missing");
        Object.assign(ws, data);
        return { ...ws };
      },
    },
    workspaceTeamMember: {
      async findMany() {
        return [];
      },
    },
    workspaceTeamProfile: {
      async findUnique() {
        return null;
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
    workspaceBranding: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.brandings.get(where.workspaceId);
        return row ? { ...row } : null;
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
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceEmailIdentity: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.emailIdentities.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.emailIdentities.get(where.workspaceId);
        if (!row) throw new Error("email missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceOnboardingState: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.onboarding.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        if (state.onboarding.has(workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = {
          workspaceId,
          accountActivatedAt: null,
          businessProfileStatus: "NOT_STARTED",
          brandingStatus: "NOT_STARTED",
          professionalIdentityStatus: "NOT_STARTED",
          templateThemeStatus: String(data.templateThemeStatus ?? "NOT_STARTED"),
          emailIdentityStatus: "NOT_STARTED",
          completedAt: null,
        };
        state.onboarding.set(workspaceId, row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.onboarding.get(where.workspaceId);
        if (!row) throw new Error("onboarding missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
    workspaceProfessionalIdentity: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.professionalIdentities.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        if (state.professionalIdentities.has(workspaceId)) {
          const err = new Error("Unique") as Error & { code: string };
          err.code = "P2002";
          throw err;
        }
        const row = {
          workspaceId,
          agentRegisteredName: (data.agentRegisteredName as string) ?? null,
          agentDesignation: (data.agentDesignation as string) ?? null,
          agentCellPhone: (data.agentCellPhone as string) ?? null,
          brokerageRegisteredName:
            (data.brokerageRegisteredName as string) ?? null,
          brokerageFax:
            (data.brokerageFax as string) ?? null,
          brokeragePhone: (data.brokeragePhone as string) ?? null,
          brokerageAddress: (data.brokerageAddress as string) ?? null,
        };
        state.professionalIdentities.set(workspaceId, row);
        return { ...row };
      },
      async update({
        where,
        data,
      }: {
        where: { workspaceId: string };
        data: Record<string, unknown>;
      }) {
        const row = state.professionalIdentities.get(where.workspaceId);
        if (!row) throw new Error("professional identity missing");
        Object.assign(row, data);
        return { ...row };
      },
    },
  } as unknown as PrismaClient;
}

const DOMAIN_ROWS: DomainLookupRow[] = [
  {
    hostname: "re-max-realty.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_REMAX,
    workspaceSlug: "re-max-realty",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "other-brokerage.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_B,
    workspaceSlug: "other-brokerage",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "houzzat.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: WS_HOUZZAT,
    workspaceSlug: "houzzat",
    domainStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
  },
  {
    hostname: "inactive-co.houzzatpro.com",
    kind: "PLATFORM",
    role: "PRIMARY",
    workspaceId: "ws_inactive",
    workspaceSlug: "inactive-co",
    domainStatus: "ACTIVE",
    workspaceStatus: "SUSPENDED",
  },
];

function makeRequest(hostname: string): Request {
  return new Request(`https://${hostname}/api/onboarding`, {
    headers: { host: hostname },
  });
}

async function expectDenied(
  fn: () => Promise<unknown>,
  code?: string,
): Promise<void> {
  try {
    await fn();
    assert.fail("expected OwnerActivationError");
  } catch (err) {
    assert.ok(err instanceof OwnerActivationError);
    if (code) assert.equal(err.code, code);
    assert.ok(err.status === 403 || err.status === 400 || err.status === 401);
  }
}

async function main() {
  console.log("\n=== STAGE 6.10C.1 — HOST-BOUND OWNER ONBOARDING ===\n");

  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";

  try {
    // 0. Source guards
    {
      const onboarding = read("src/lib/platform/activation/onboarding.ts");
      const route = read("src/app/api/onboarding/route.ts");
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      assert.ok(onboarding.includes("requireHostBoundOwnerOnboardingContext"));
      assert.ok(onboarding.includes("extractTrustedRequestHostname"));
      assert.ok(onboarding.includes("WORKSPACE_HOST_MISMATCH"));
      assert.ok(onboarding.includes('templateThemeStatus: "NOT_STARTED"'));
      assert.ok(onboarding.includes("updateOwnerOnboardingTemplateTheme"));
      assert.ok(route.includes("clientWorkspaceId"));
      assert.ok(route.includes("listOwnerOnboardingWorkspaces({ request })"));
      assert.ok(route.includes("template_theme"));
      assert.ok(!client.includes("<select"));
      assert.ok(client.includes("host-bound"));
      console.log("[0] Source guards... PASS");
    }

    const hostDeps = createFixtureHostResolutionDeps(DOMAIN_ROWS);

    // 1. RE/MAX hostname + OWNER allowed
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      const items = await listOwnerOnboardingWorkspaces({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
      });
      assert.equal(items.length, 1);
      assert.equal(items[0]!.workspaceId, WS_REMAX);
      assert.ok(state.onboarding.has(WS_REMAX));
      assert.equal(state.onboarding.get(WS_REMAX)!.templateThemeStatus, "NOT_STARTED");
      console.log("[1] RE/MAX hostname + OWNER allowed... PASS");
    }

    // 2. AGENT denied
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_AGENT,
          }),
        "FORBIDDEN",
      );
      console.log("[2] AGENT denied... PASS");
    }

    // 3. Unaffiliated denied
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_STRANGER,
          }),
        "FORBIDDEN",
      );
      console.log("[3] Unaffiliated denied... PASS");
    }

    // 4. Client Houzzat workspaceId while on RE/MAX host → mismatch fail
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const before = JSON.stringify(state.brandings.get(WS_HOUZZAT));
      await expectDenied(
        () =>
          updateOwnerOnboardingBusinessProfile({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_OWNER,
            clientWorkspaceId: WS_HOUZZAT,
            displayName: "Hacked",
            contactEmail: "x@evil.test",
          }),
        "WORKSPACE_HOST_MISMATCH",
      );
      assert.equal(JSON.stringify(state.brandings.get(WS_HOUZZAT)), before);
      console.log("[4] Client Houzzat workspaceId denied... PASS");
    }

    // 5. Multi-OWNER cannot mutate B while on A hostname
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const beforeB = JSON.stringify(state.brandings.get(WS_B));
      await expectDenied(
        () =>
          updateOwnerOnboardingBusinessProfile({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_MULTI,
            clientWorkspaceId: WS_B,
            displayName: "Steal B",
            contactEmail: "steal@b.test",
          }),
        "WORKSPACE_HOST_MISMATCH",
      );
      // Without client id, update still only mutates hostname workspace (RE/MAX)
      const updated = await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma: createFakePrisma(state),
        hostDeps,
        userId: USER_MULTI,
        displayName: "RE/MAX Updated",
        contactEmail: "owner@remax.test",
      });
      assert.equal(updated.workspaceId, WS_REMAX);
      assert.equal(state.brandings.get(WS_REMAX)!.displayName, "RE/MAX Updated");
      assert.equal(JSON.stringify(state.brandings.get(WS_B)), beforeB);
      console.log("[5] Multi-OWNER cannot mutate B on A host... PASS");
    }

    // 6. Unknown hostname fails closed
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("unknown-xyz.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_OWNER,
          }),
        "TENANCY_DENIED",
      );
      console.log("[6] Unknown hostname fails closed... PASS");
    }

    // 7. Disabled membership fails
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: "user_disabled",
          }),
        "FORBIDDEN",
      );
      console.log("[7] Disabled membership fails... PASS");
    }

    // 8. Inactive/suspended workspace fails
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      state.members.push({
        workspaceId: "ws_inactive",
        userId: USER_OWNER,
        role: "OWNER",
        status: "ACTIVE",
      });
      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("inactive-co.houzzatpro.com"),
            prisma: createFakePrisma(state),
            hostDeps,
            userId: USER_OWNER,
          }),
      );
      console.log("[8] Inactive workspace fails... PASS");
    }

    // 9. Platform hosts have no tenant onboarding authority
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      for (const host of ["app.houzzatpro.com", "houzzatpro.com", "www.houzzatpro.com"]) {
        await expectDenied(
          () =>
            requireHostBoundOwnerOnboardingContext({
              request: makeRequest(host),
              prisma: createFakePrisma(state),
              hostDeps,
              userId: USER_OWNER,
            }),
          "PLATFORM_HOST_NO_TENANT_AUTHORITY",
        );
      }
      console.log("[9] Platform hosts denied... PASS");
    }

    // 10. Matching client workspaceId OK; User.role/PlatformOperator unused
    {
      clearHostResolutionCacheForTests();
      const onboardingSrc = read("src/lib/platform/activation/onboarding.ts");
      assert.ok(onboardingSrc.includes("never User.role"));
      assert.ok(onboardingSrc.includes("PlatformOperator"));
      assert.ok(!onboardingSrc.includes("platformOperator"));
      assert.ok(!/\buser\.role\b/.test(onboardingSrc));
      const state = seedState();
      const ctx = await requireHostBoundOwnerOnboardingContext({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma: createFakePrisma(state),
        hostDeps,
        userId: USER_OWNER,
        clientWorkspaceId: WS_REMAX,
      });
      assert.equal(ctx.workspaceId, WS_REMAX);
      console.log("[10] Matching client id OK + no User.role authority... PASS");
    }

    // 11. templateThemeStatus stays NOT_STARTED after save
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma: createFakePrisma(state),
        hostDeps,
        userId: USER_OWNER,
        displayName: "RE/MAX REALTY",
        contactEmail: "owner@remax.test",
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.templateThemeStatus,
        "NOT_STARTED",
      );
      assert.equal(state.onboarding.get(WS_REMAX)!.businessProfileStatus, "COMPLETE");
      console.log("[11] templateThemeStatus remains NOT_STARTED... PASS");
    }

    console.log("\nSTAGE 6.10C.1 SELFTEST PASSED\n");
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
    clearHostResolutionCacheForTests();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
