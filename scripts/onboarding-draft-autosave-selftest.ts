/**
 * V1 onboarding draft auto-save — persist without COMPLETE, flush before upload.
 * Run: pnpm onboarding-draft-autosave:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingBusinessProfile,
  updateOwnerOnboardingProfessionalIdentity,
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import {
  DebouncedDraftSaver,
  createFakeDraftClock,
} from "@/lib/onboarding/draft-autosave";
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
const WS_B = "ws_other_owned";
const USER_OWNER = "user_remax_owner";
const USER_AGENT = "user_remax_agent";
const USER_MULTI = "user_multi_owner";
const THEME_ID = "default-signature:dark-blue";

type FakeState = {
  workspaces: Map<
    string,
    { id: string; slug: string; name: string; status: string }
  >;
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
      contactEmail: string | null;
      contactPhone: string | null;
      themeId: string | null;
      primaryColor: string | null;
      secondaryColor: string | null;
      accentColor: string | null;
      version: number;
      agentProfilePhotoUrl: string | null;
      logoUrl: string | null;
      brokerageLogoUrl: string | null;
      faviconUrl: string | null;
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

function emptyIdentity(workspaceId: string) {
  return {
    workspaceId,
    agentRegisteredName: null as string | null,
    agentDesignation: null as string | null,
    agentCellPhone: null as string | null,
    brokerageRegisteredName: null as string | null,
    brokerageFax: null as string | null,
    brokeragePhone: null as string | null,
    brokerageAddress: null as string | null,
  };
}

function seedState(): FakeState {
  return {
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
        WS_B,
        {
          id: WS_B,
          slug: "other-brokerage",
          name: "Other Brokerage",
          status: "ACTIVE",
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
        workspaceId: WS_B,
        userId: USER_OWNER,
        role: "OWNER",
        status: "ACTIVE",
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
          themeId: null,
          primaryColor: "#C8102E",
          secondaryColor: null,
          accentColor: null,
          version: 1,
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
        },
      ],
      [
        WS_B,
        {
          workspaceId: WS_B,
          displayName: "Other Brokerage",
          contactEmail: "b@other.test",
          contactPhone: null,
          themeId: null,
          primaryColor: "#111111",
          secondaryColor: null,
          accentColor: null,
          version: 1,
          agentProfilePhotoUrl: null,
          logoUrl: null,
          brokerageLogoUrl: null,
          faviconUrl: null,
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
    professionalIdentities: new Map([
      [WS_REMAX, emptyIdentity(WS_REMAX)],
      [WS_B, emptyIdentity(WS_B)],
    ]),
  };
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
        if (!select || !("branding" in select)) return { ...ws };
        return {
          ...ws,
          branding: state.brandings.get(ws.id) ?? null,
          emailIdentity: state.emailIdentities.get(ws.id) ?? null,
          onboardingState: state.onboarding.get(ws.id) ?? null,
          professionalIdentity: state.professionalIdentities.get(ws.id) ?? null,
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
        const next = { ...data };
        if (
          next.version &&
          typeof next.version === "object" &&
          next.version !== null &&
          "increment" in (next.version as object)
        ) {
          row.version += Number(
            (next.version as { increment: number }).increment,
          );
          delete next.version;
        }
        Object.assign(row, next);
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
        const row = {
          ...emptyIdentity(workspaceId),
          ...data,
          workspaceId,
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
  }
}

async function main() {
  console.log("\n=== ONBOARDING DRAFT AUTO-SAVE ===\n");

  {
    const clock = createFakeDraftClock();
    const saved: string[] = [];
    const saver = new DebouncedDraftSaver<string>({
      debounceMs: 700,
      scheduleTimer: clock.scheduleTimer,
      save: async (value) => {
        saved.push(value);
      },
    });
    saver.schedule("Hom");
    saver.schedule("HomeLife Miracle");
    await clock.advance(400);
    assert.deepEqual(saved, []);
    await clock.advance(400);
    await saver.whenIdle();
    assert.deepEqual(saved, ["HomeLife Miracle"]);
    assert.equal(saver.status, "saved");
    console.log("[1] typing → debounce → persisted draft... PASS");
  }

  {
    const clock = createFakeDraftClock();
    const store = {
      displayName: "RE/MAX REALTY",
      logoUrl: null as string | null,
    };
    const saver = new DebouncedDraftSaver<string>({
      debounceMs: 700,
      scheduleTimer: clock.scheduleTimer,
      save: async (value) => {
        store.displayName = value;
      },
    });
    saver.schedule("HomeLife Miracle Realty");
    assert.equal(store.displayName, "RE/MAX REALTY");
    await saver.flush();
    store.logoUrl = "https://cdn.example/logo.png";
    assert.equal(store.displayName, "HomeLife Miracle Realty");
    assert.equal(store.logoUrl, "https://cdn.example/logo.png");
    console.log("[2] upload while debounce pending flushes text first... PASS");
  }

  {
    const clock = createFakeDraftClock();
    const saved: string[] = [];
    const saver = new DebouncedDraftSaver<string>({
      debounceMs: 700,
      scheduleTimer: clock.scheduleTimer,
      save: async (value) => {
        saved.push(value);
      },
    });
    saver.schedule("a");
    saver.schedule("b");
    saver.schedule("latest");
    await clock.advance(700);
    await saver.whenIdle();
    assert.deepEqual(saved, ["latest"]);
    console.log("[3] rapid edits → latest value wins... PASS");
  }

  {
    const statuses: string[] = [];
    const saver = new DebouncedDraftSaver<string>({
      debounceMs: 10,
      save: async () => {
        throw new Error("nope");
      },
      onStatus: (status) => statuses.push(status),
    });
    saver.schedule("partial");
    await saver.flush();
    assert.equal(saver.status, "error");
    assert.ok(!statuses.includes("saved"));
    console.log("[4] failed auto-save does not show Saved... PASS");
  }

  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  const hostDeps = createFixtureHostResolutionDeps(DOMAIN_ROWS);

  try {
    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        persistAsDraft: true,
        displayName: "HomeLife Miracle Realty",
        contactEmail: "maria@",
        contactPhone: "416-555-0101",
      });
      assert.equal(
        state.brandings.get(WS_REMAX)!.displayName,
        "HomeLife Miracle Realty",
      );
      assert.equal(state.brandings.get(WS_REMAX)!.contactEmail, "maria@");
      assert.equal(state.brandings.get(WS_REMAX)!.contactPhone, "416-555-0101");
      assert.equal(
        state.onboarding.get(WS_REMAX)!.businessProfileStatus,
        "NOT_STARTED",
      );
      assert.equal(
        state.onboarding.get(WS_REMAX)!.emailIdentityStatus,
        "NOT_STARTED",
      );

      const refreshed = await listOwnerOnboardingWorkspaces({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
      });
      assert.equal(refreshed[0]!.displayName, "HomeLife Miracle Realty");
      assert.equal(refreshed[0]!.contactPhone, "416-555-0101");
      assert.equal(refreshed[0]!.onboarding.businessProfileStatus, "NOT_STARTED");
      console.log("[5] refresh restores draft; auto-save is not COMPLETE... PASS");
    }

    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      await updateOwnerOnboardingProfessionalIdentity({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        persistAsDraft: true,
        agentRegisteredName: "Maria Khalid",
        agentDesignation: "",
        agentCellPhone: "",
        brokerageRegisteredName: "HomeLife Miracle Realty Ltd.",
        brokerageFax: "",
        brokeragePhone: "",
        brokerageAddress: "",
      });
      assert.equal(
        state.professionalIdentities.get(WS_REMAX)!.agentRegisteredName,
        "Maria Khalid",
      );
      assert.equal(
        state.professionalIdentities.get(WS_REMAX)!.brokerageRegisteredName,
        "HomeLife Miracle Realty Ltd.",
      );
      assert.equal(
        state.onboarding.get(WS_REMAX)!.professionalIdentityStatus,
        "NOT_STARTED",
      );

      await expectDenied(
        () =>
          updateOwnerOnboardingProfessionalIdentity({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_OWNER,
            persistAsDraft: false,
            agentRegisteredName: "Maria Khalid",
            agentDesignation: "",
            agentCellPhone: "",
            brokerageRegisteredName: "HomeLife Miracle Realty Ltd.",
            brokerageFax: "",
            brokeragePhone: "",
            brokerageAddress: "",
          }),
        "INVALID_AGENT_DESIGNATION",
      );

      await updateOwnerOnboardingProfessionalIdentity({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        agentRegisteredName: "Maria Khalid",
        agentDesignation: "Broker",
        agentCellPhone: "416-555-0199",
        brokerageRegisteredName: "HomeLife Miracle Realty Ltd.",
        brokerageFax: "416-555-0100",
        brokeragePhone: "416-555-0102",
        brokerageAddress: "1 Main St",
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.professionalIdentityStatus,
        "NOT_STARTED",
      );
      state.brandings.get(WS_REMAX)!.brokerageLogoUrl =
        "https://cdn.example/brokerage.png";
      await updateOwnerOnboardingProfessionalIdentity({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        agentRegisteredName: "Maria Khalid",
        agentDesignation: "Broker",
        agentCellPhone: "416-555-0199",
        brokerageRegisteredName: "HomeLife Miracle Realty Ltd.",
        brokerageFax: "416-555-0100",
        brokeragePhone: "416-555-0102",
        brokerageAddress: "1 Main St",
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.professionalIdentityStatus,
        "COMPLETE",
      );
      console.log("[6] identity draft persists partial; Continue still validates... PASS");
    }

    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        persistAsDraft: true,
        displayName: "HomeLife Miracle Realty",
        contactEmail: "maria@homelife.test",
      });
      state.brandings.get(WS_REMAX)!.logoUrl =
        "https://cdn.example/homelife-logo.png";
      const refreshed = await listOwnerOnboardingWorkspaces({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
      });
      assert.equal(refreshed[0]!.displayName, "HomeLife Miracle Realty");
      assert.equal(
        refreshed[0]!.brandAssets.logoUrl,
        "https://cdn.example/homelife-logo.png",
      );
      assert.equal(refreshed[0]!.onboarding.businessProfileStatus, "NOT_STARTED");
      console.log("[7] upload after draft keeps text + image... PASS");
    }

    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        displayName: "HomeLife Miracle Realty",
        contactEmail: "maria@homelife.test",
        contactPhone: "416-555-0101",
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.businessProfileStatus,
        "COMPLETE",
      );
      assert.equal(
        state.onboarding.get(WS_REMAX)!.emailIdentityStatus,
        "COMPLETE",
      );
      console.log("[8] explicit Save still marks business profile COMPLETE... PASS");
    }

    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      await updateOwnerOnboardingTemplateTheme({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        persistAsDraft: true,
        themeId: THEME_ID,
      });
      assert.equal(state.brandings.get(WS_REMAX)!.themeId, THEME_ID);
      assert.equal(
        state.onboarding.get(WS_REMAX)!.templateThemeStatus,
        "NOT_STARTED",
      );
      await updateOwnerOnboardingTemplateTheme({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        themeId: THEME_ID,
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.templateThemeStatus,
        "COMPLETE",
      );
      console.log("[9] theme draft is not COMPLETE; explicit Save is... PASS");
    }

    {
      clearHostResolutionCacheForTests();
      const state = seedState();
      const prisma = createFakePrisma(state);
      const beforeB = JSON.stringify(state.brandings.get(WS_B));
      await expectDenied(
        () =>
          updateOwnerOnboardingBusinessProfile({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_OWNER,
            persistAsDraft: true,
            clientWorkspaceId: WS_B,
            displayName: "Stolen",
            contactEmail: "stolen@b.test",
          }),
        "WORKSPACE_HOST_MISMATCH",
      );
      assert.equal(JSON.stringify(state.brandings.get(WS_B)), beforeB);

      await expectDenied(
        () =>
          updateOwnerOnboardingBusinessProfile({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_AGENT,
            persistAsDraft: true,
            displayName: "Agent Hack",
            contactEmail: "agent@remax.test",
          }),
        "FORBIDDEN",
      );
      assert.equal(state.brandings.get(WS_REMAX)!.displayName, "RE/MAX REALTY");
      console.log("[10] tenant/workspace isolation + OWNER-only drafts... PASS");
    }

    {
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      const brand = read("src/components/onboarding/BrandAssetsSection.tsx");
      const identity = read(
        "src/components/onboarding/ProfessionalIdentitySection.tsx",
      );
      const team = read("src/components/onboarding/TeamRosterSection.tsx");
      const domains = read("src/components/onboarding/WebsiteDomainSection.tsx");
      const route = read("src/app/api/onboarding/route.ts");
      const server = read("src/lib/platform/activation/onboarding.ts");
      const statusUi = read(
        "src/components/onboarding/onboarding-draft-flush.tsx",
      );

      assert.ok(client.includes('draft: true'));
      assert.ok(client.includes("preserveLocalForms"));
      assert.ok(client.includes("pagehide"));
      assert.ok(client.includes("flushAll"));
      assert.ok(brand.includes("await flushAll()"));
      assert.ok(identity.includes('draft: true'));
      assert.ok(team.includes("await flushAll()"));
      assert.ok(team.includes("profileDraft.schedule"));
      assert.ok(domains.includes("onClaim"));
      assert.ok(!domains.includes("draft: true"));
      assert.ok(route.includes("body.draft === true"));
      assert.ok(server.includes("persistAsDraft"));
      assert.ok(server.includes("if (!persistAsDraft)"));
      assert.ok(statusUi.includes("Saving..."));
      assert.ok(statusUi.includes("Saved"));
      assert.ok(statusUi.includes("Couldn't save"));
      console.log("[11] UI flush/preserve/status wiring across sections... PASS");
    }
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
    clearHostResolutionCacheForTests();
  }

  console.log("\nONBOARDING DRAFT AUTO-SAVE SELFTEST PASSED\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
