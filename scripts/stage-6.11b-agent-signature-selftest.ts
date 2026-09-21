/**
 * Stage 6.11B — Agent Signature template foundation selftest.
 * Run: pnpm stage-6.11b-agent-signature:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  OwnerActivationError,
  listOwnerOnboardingWorkspaces,
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";
import {
  AGENT_SIGNATURE_TEMPLATE_ID,
  DEFAULT_TEMPLATE_ID,
  getThemeById,
  isAgentSignatureTemplateId,
  listOnboardingTemplateOptions,
  listSelectableTemplates,
  parseThemeId,
  requireValidSelectableThemeId,
  resolveTemplateIdFromThemeId,
  resolveThemePalette,
} from "@/lib/tenancy/templates";
import {
  resolveOwnerTemplatePreviewThemeIdForWorkspace,
  signOwnerTemplatePreviewCookie,
} from "@/lib/tenancy/owner-template-preview";
import { resolveDevOnlyTemplatePreviewThemeId } from "@/lib/tenancy/template-preview";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_REMAX = "cmtn5glsq0005psp7z8wk891q";
const WS_B = "ws_other_owned";
const USER_OWNER = "user_remax_owner";
const USER_AGENT = "user_remax_agent";
const USER_MULTI = "user_multi_owner";

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
      templateThemeStatus: string;
      emailIdentityStatus: string;
      completedAt: Date | null;
    }
  >;
};

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
          secondaryColor: "#003DA5",
          accentColor: "#C8102E",
          version: 1,
        },
      ],
      [
        WS_B,
        {
          workspaceId: WS_B,
          displayName: "Other Brokerage",
          contactEmail: "b@other.test",
          contactPhone: null,
          themeId: "default-signature:mint",
          primaryColor: "#0F6B4C",
          secondaryColor: "#0A4D38",
          accentColor: "#1F7A8C",
          version: 1,
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
    ]),
    onboarding: new Map(),
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
          teamProfile: null,
          professionalIdentity: null,
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
        return {
          ...hit,
          user: { phone: null, agentProfile: null },
        };
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
      async update() {
        return null;
      },
    },
    workspaceOnboardingState: {
      async findUnique({ where }: { where: { workspaceId: string } }) {
        const row = state.onboarding.get(where.workspaceId);
        return row ? { ...row } : null;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const workspaceId = String(data.workspaceId);
        const row = {
          workspaceId,
          accountActivatedAt: null,
          businessProfileStatus: "NOT_STARTED",
          brandingStatus: "NOT_STARTED",
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
    workspaceEntitlement: {
      async findUnique() {
        return null;
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
  console.log("\n=== STAGE 6.11B — AGENT SIGNATURE ===\n");

  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";

  try {
    // 0. Catalog
    {
      const selectable = listSelectableTemplates();
      assert.equal(selectable.length, 3);
      const agent = selectable.find((t) => t.id === AGENT_SIGNATURE_TEMPLATE_ID);
      assert.ok(agent);
      assert.equal(agent.category, "AGENT");
      assert.equal(agent.categoryLabel, "Agent Branded");
      assert.equal(agent.label, "Agent Signature");
      assert.equal(agent.themes.length, 6);
      assert.equal(agent.themes[0]!.id, "agent-signature:editorial");
      assert.ok(agent.themes.some((t) => t.id === "agent-signature:navy"));
      assert.ok(agent.themes.some((t) => t.id === "agent-signature:forest"));
      assert.ok(agent.themes.some((t) => t.id === "agent-signature:slate"));
      assert.ok(agent.themes.some((t) => t.id === "agent-signature:burgundy"));
      assert.ok(agent.themes.some((t) => t.id === "agent-signature:bronze"));
      const options = listOnboardingTemplateOptions();
      assert.ok(options.some((o) => o.categoryLabel === "Default"));
      assert.ok(options.some((o) => o.categoryLabel === "Agent Branded"));
      assert.ok(options.some((o) => o.category === "TEAM"));
      assert.ok(!options.some((o) => o.category === "BROKERAGE"));
      console.log("[0] Agent Signature catalog... PASS");
    }

    // 1. Theme / template resolution
    {
      assert.equal(
        resolveTemplateIdFromThemeId("agent-signature:editorial"),
        AGENT_SIGNATURE_TEMPLATE_ID,
      );
      assert.equal(
        resolveTemplateIdFromThemeId("default-signature:mint"),
        DEFAULT_TEMPLATE_ID,
      );
      assert.equal(resolveTemplateIdFromThemeId(null), DEFAULT_TEMPLATE_ID);
      assert.equal(
        resolveTemplateIdFromThemeId("unknown-template:x"),
        DEFAULT_TEMPLATE_ID,
      );
      assert.ok(isAgentSignatureTemplateId(AGENT_SIGNATURE_TEMPLATE_ID));
      assert.ok(!isAgentSignatureTemplateId(DEFAULT_TEMPLATE_ID));
      const palette = resolveThemePalette("agent-signature:editorial");
      assert.ok(palette);
      assert.equal(palette.primary, "#1C1917");
      assert.equal(requireValidSelectableThemeId("agent-signature:editorial"), "agent-signature:editorial");
      assert.throws(() => requireValidSelectableThemeId("nope"), /INVALID_THEME_ID/);
      assert.equal(parseThemeId("agent-signature:editorial")?.themeKey, "editorial");
      console.log("[1] Template/theme resolve + fail-closed... PASS");
    }

    // 2. Default themes unchanged
    {
      for (const key of [
        "mint",
        "light-blue",
        "dark-blue",
        "purple",
        "professional-red",
        "beige",
      ]) {
        assert.ok(getThemeById(`default-signature:${key}`));
      }
      const home = read("src/app/(marketing)/page.tsx");
      assert.ok(home.includes("Find Homes in Ontario"));
      assert.ok(home.includes("AgentSignatureHome"));
      assert.ok(home.includes("isAgentSignatureTemplateId"));
      console.log("[2] Default homepage preserved + Agent branch... PASS");
    }

    // 3. Presentation files exist; demo only via resolveAgentSignatureView
    {
      const hero = read(
        "src/components/templates/agent-signature/AgentSignatureHero.tsx",
      );
      const home = read(
        "src/components/templates/agent-signature/AgentSignatureHome.tsx",
      );
      assert.ok(hero.includes("view.photoUrl") || hero.includes("view.name"));
      assert.ok(!hero.includes("Ali Syed"));
      assert.ok(!hero.includes("Alex Morgan"));
      assert.ok(!home.includes("RE/MAX"));
      assert.ok(!home.includes("Tenant Canary"));
      assert.ok(home.includes("AgentSignatureFeaturedProperties"));
      assert.ok(!home.includes("HomeDeferredBody"));
      assert.ok(
        read("src/lib/tenancy/resolve-public-agent-identity.ts").includes(
          "primaryAgent",
        ),
      );
      assert.ok(
        read(
          "src/lib/tenancy/templates/resolve-agent-signature-view.ts",
        ).includes("templatePreview?.active"),
      );
      console.log("[3] Tenant branding / demo gated via view... PASS");
    }

    // 4. OWNER can select Agent Signature; AGENT cannot; cross-tenant blocked
    {
      clearHostResolutionCacheForTests();
      const hostDeps = createFixtureHostResolutionDeps(DOMAIN_ROWS);
      const state = seedState();
      const prisma = createFakePrisma(state);
      const beforeB = { ...state.brandings.get(WS_B)! };

      await expectDenied(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_AGENT,
            themeId: "agent-signature:editorial",
          }),
        "FORBIDDEN",
      );

      await expectDenied(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_MULTI,
            clientWorkspaceId: WS_B,
            themeId: "agent-signature:editorial",
          }),
        "WORKSPACE_HOST_MISMATCH",
      );
      assert.deepEqual(state.brandings.get(WS_B), beforeB);

      const updated = await updateOwnerOnboardingTemplateTheme({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        themeId: "agent-signature:editorial",
      });
      assert.equal(updated.themeId, "agent-signature:editorial");
      assert.equal(updated.templateId, AGENT_SIGNATURE_TEMPLATE_ID);
      assert.equal(updated.templateCategory, "AGENT");
      assert.equal(updated.templateLabel, "Agent Signature");
      assert.equal(updated.onboarding.templateThemeStatus, "COMPLETE");
      assert.equal(updated.onboarding.completedAt, null);
      assert.equal(
        state.brandings.get(WS_REMAX)!.themeId,
        "agent-signature:editorial",
      );
      assert.equal(
        state.brandings.get(WS_REMAX)!.primaryColor,
        getThemeById("agent-signature:editorial")!.palette.primary,
      );
      assert.equal(state.brandings.get(WS_B)!.themeId, beforeB.themeId);

      const items = await listOwnerOnboardingWorkspaces({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
      });
      assert.ok(
        items[0]!.templateOptions.some(
          (t) => t.label === "Agent Signature",
        ),
      );
      console.log("[4] OWNER select / AGENT deny / host-bound... PASS");
    }

    // 5. Secure preview cookie (no DB write); production query fail-closed
    {
      process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-611b";
      const prevNode = process.env.NODE_ENV;
      const cookie = signOwnerTemplatePreviewCookie({
        workspaceId: WS_REMAX,
        themeId: "agent-signature:editorial",
      });
      assert.equal(
        resolveOwnerTemplatePreviewThemeIdForWorkspace(cookie, WS_REMAX)
          ?.themeId,
        "agent-signature:editorial",
      );
      assert.equal(
        resolveOwnerTemplatePreviewThemeIdForWorkspace(cookie, WS_B),
        null,
      );

      process.env.NODE_ENV = "production";
      process.env.ALLOW_TEMPLATE_PREVIEW = "1";
      assert.equal(
        resolveDevOnlyTemplatePreviewThemeId(
          "https://re-max-realty.houzzatpro.com/?previewTemplate=agent-signature",
        ),
        null,
      );
      assert.ok(!read("src/middleware.ts").includes("x-houzzat-preview-template"));
      delete process.env.ALLOW_TEMPLATE_PREVIEW;
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      console.log("[5] Secure preview cookie; production query blocked... PASS");
    }

    // 6. No migration / no Team-Brokerage UI
    {
      assert.ok(!read("prisma/schema.prisma").includes("WorkspaceTemplate"));
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      assert.ok(client.includes("Agent Branded") || client.includes("Agent Signature"));
      assert.ok(!client.includes("Brokerage Signature"));
      console.log("[6] Persistence via themeId; Brokerage not hardcoded... PASS");
    }

    console.log("\nSTAGE 6.11B SELFTEST PASSED\n");
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
    clearHostResolutionCacheForTests();
  }
}

main().catch((err) => {
  console.error("\nSTAGE 6.11B SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
