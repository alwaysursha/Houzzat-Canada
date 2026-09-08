/**
 * Stage 6.11A — Default template + six themes foundation selftest.
 * Run: pnpm stage-6.11a-default-template-themes:selftest
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
  updateOwnerOnboardingTemplateTheme,
} from "@/lib/platform/activation";
import { buildTenantThemeCss } from "@/lib/tenancy/brand-theme-css";
import { LEGACY_HOUZZAT_COLORS } from "@/lib/tenancy/legacy-houzzat-brand";
import { workspaceBrandingRowToBrand } from "@/lib/tenancy/resolve-workspace-brand";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  type DomainLookupRow,
} from "@/lib/tenancy/resolve-workspace-host";
import {
  DEFAULT_SIGNATURE_THEMES,
} from "@/lib/tenancy/templates/default-signature-themes";
import {
  DEFAULT_TEMPLATE_ID,
  RESERVED_TEMPLATE_IDS,
  TEMPLATE_CATEGORIES,
  buildThemeId,
  getThemeById,
  isValidThemeId,
  listSelectableTemplates,
  parseThemeId,
  requireValidDefaultThemeId,
  resolveThemePalette,
} from "@/lib/tenancy/templates";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_PRIMARY_COLOR,
  TENANT_B_TEST_WORKSPACE_ID,
} from "@/lib/tenancy/test-fixtures/tenant-b-brand";
import { deriveTenantThemeTokens } from "@/lib/tenancy/tenant-theme-tokens";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS_REMAX = "cmtn5glsq0005psp7z8wk891q";
const WS_HOUZZAT = "ws_houzzat_fixture";
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
        WS_HOUZZAT,
        { id: WS_HOUZZAT, slug: "houzzat", name: "Houzzat", status: "ACTIVE" },
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
          themeId: null,
          primaryColor: "#2563EB",
          secondaryColor: "#1E40AF",
          accentColor: "#0EA5E9",
          version: 1,
        },
      ],
      [
        WS_HOUZZAT,
        {
          workspaceId: WS_HOUZZAT,
          displayName: "Houzzat",
          contactEmail: "a@houzzat.test",
          contactPhone: null,
          themeId: null,
          primaryColor: LEGACY_HOUZZAT_COLORS.primary,
          secondaryColor: LEGACY_HOUZZAT_COLORS.secondary,
          accentColor: LEGACY_HOUZZAT_COLORS.accent,
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
  console.log("\n=== STAGE 6.11A — DEFAULT TEMPLATE + SIX THEMES ===\n");

  const prev = process.env.TENANT_DOMAIN_SCOPE;
  process.env.TENANT_DOMAIN_SCOPE = "workspace";

  try {
    // 0. Catalog architecture
    {
      assert.deepEqual([...TEMPLATE_CATEGORIES], [
        "DEFAULT",
        "AGENT",
        "TEAM",
        "BROKERAGE",
      ]);
      const selectable = listSelectableTemplates();
      assert.equal(selectable.length, 3);
      assert.equal(selectable[0]!.id, DEFAULT_TEMPLATE_ID);
      assert.equal(selectable[0]!.category, "DEFAULT");
      assert.equal(selectable[0]!.themes.length, 6);
      assert.equal(selectable[1]!.id, "agent-signature");
      assert.equal(selectable[1]!.category, "AGENT");
      assert.equal(selectable[2]!.id, "team-signature");
      assert.equal(selectable[2]!.category, "TEAM");
      assert.deepEqual([...RESERVED_TEMPLATE_IDS], ["brokerage-signature"]);
      assert.ok(selectable.some((t) => t.id === "team-signature"));
      assert.ok(!read("src/lib/tenancy/templates/index.ts").includes("agent-signature-02"));
      console.log("[0] CATEGORY → TEMPLATE → THEME catalog... PASS");
    }

    // 1. Six theme IDs resolve; invalid fails
    {
      const expectedIds = [
        "default-signature:mint",
        "default-signature:light-blue",
        "default-signature:dark-blue",
        "default-signature:purple",
        "default-signature:professional-red",
        "default-signature:beige",
      ];
      for (const id of expectedIds) {
        assert.ok(isValidThemeId(id), id);
        const theme = getThemeById(id);
        assert.ok(theme);
        const palette = resolveThemePalette(id);
        assert.ok(palette);
        assert.match(palette.primary, /^#[0-9A-Fa-f]{6}$/);
        const tokens = deriveTenantThemeTokens({
          primary: palette.primary,
          secondary: palette.secondary,
          accent: palette.accent,
          surface: "#FFFFFF",
          ink: "#14201C",
        });
        assert.equal(tokens.primary, palette.primary.toUpperCase());
        const css = buildTenantThemeCss({
          primary: palette.primary,
          secondary: palette.secondary,
          accent: palette.accent,
          surface: "#FFFFFF",
          ink: "#14201C",
        });
        assert.ok(css.includes(`--canopy:${palette.primary}`));
      }
      assert.equal(resolveThemePalette(null), null);
      assert.equal(resolveThemePalette("default-signature:neon"), null);
      assert.equal(isValidThemeId("agent-signature:mint"), false);
      assert.ok(isValidThemeId("agent-signature:editorial"));
      assert.throws(() => requireValidDefaultThemeId("agent-signature:editorial"), /INVALID_THEME_ID/);
      assert.throws(() => requireValidDefaultThemeId("nope"), /INVALID_THEME_ID/);
      assert.throws(() => requireValidDefaultThemeId(null), /INVALID_THEME_ID/);
      assert.equal(parseThemeId("default-signature:mint")?.themeKey, "mint");
      assert.equal(buildThemeId(DEFAULT_TEMPLATE_ID, "mint"), expectedIds[0]);
      console.log("[1] Theme ID resolution + token CSS... PASS");
    }

    // 2. Mint matches Houzzat legacy colors (stability)
    {
      const mint = getThemeById("default-signature:mint")!;
      assert.equal(mint.palette.primary, LEGACY_HOUZZAT_COLORS.primary);
      assert.equal(mint.palette.secondary, LEGACY_HOUZZAT_COLORS.secondary);
      assert.equal(mint.palette.accent, LEGACY_HOUZZAT_COLORS.accent);
      const themeStyle = read("src/components/tenancy/TenantThemeStyle.tsx");
      assert.ok(themeStyle.includes("isHouzzatWorkspace"));
      assert.ok(themeStyle.includes("return null"));
      console.log("[2] Houzzat mint / TenantThemeStyle skip... PASS");
    }

    // 3. themeId null keeps freeform colors (RE/MAX + Canary)
    {
      const canary = workspaceBrandingRowToBrand(
        TENANT_B_TEST_WORKSPACE_ID,
        TENANT_B_TEST_BRANDING_ROW,
      );
      assert.equal(TENANT_B_TEST_BRANDING_ROW.themeId, null);
      assert.equal(canary.colors.primary, TENANT_B_TEST_PRIMARY_COLOR);

      const remaxRow = {
        ...TENANT_B_TEST_BRANDING_ROW,
        workspaceId: WS_REMAX,
        displayName: "RE/MAX REALTY",
        themeId: null,
        primaryColor: "#C8102E",
        secondaryColor: "#003DA5",
        accentColor: "#C8102E",
      };
      const remaxBrand = workspaceBrandingRowToBrand(WS_REMAX, remaxRow);
      assert.equal(remaxBrand.colors.primary, "#C8102E");

      const themed = workspaceBrandingRowToBrand(WS_REMAX, {
        ...remaxRow,
        themeId: "default-signature:dark-blue",
      });
      assert.equal(
        themed.colors.primary,
        getThemeById("default-signature:dark-blue")!.palette.primary,
      );
      assert.notEqual(themed.colors.primary, "#C8102E");
      console.log("[3] null themeId preserves brand colors; valid overrides... PASS");
    }

    // 4. Tenant identity still from branding row (not hardcoded Houzzat/REMAX)
    {
      const brand = workspaceBrandingRowToBrand(WS_REMAX, {
        ...TENANT_B_TEST_BRANDING_ROW,
        workspaceId: WS_REMAX,
        displayName: "RE/MAX REALTY",
        themeId: "default-signature:beige",
        logoUrl: "/tenant-logo.png",
      });
      assert.equal(brand.displayName, "RE/MAX REALTY");
      assert.equal(brand.logoUrl, "/tenant-logo.png");
      assert.equal(
        brand.colors.primary,
        getThemeById("default-signature:beige")!.palette.primary,
      );
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      assert.ok(!client.includes("RE/MAX"));
      assert.ok(!client.includes("Tenant Canary"));
      assert.ok(!/\bHouzzat\b/.test(client));
      console.log("[4] Tenant branding overrides identity... PASS");
    }

    // 5. OWNER can select; AGENT cannot; cross-tenant impossible
    {
      clearHostResolutionCacheForTests();
      const hostDeps = createFixtureHostResolutionDeps(DOMAIN_ROWS);
      const state = seedState();
      const prisma = createFakePrisma(state);

      const beforeRemax = { ...state.brandings.get(WS_REMAX)! };
      const beforeB = { ...state.brandings.get(WS_B)! };

      await expectDenied(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_AGENT,
            themeId: "default-signature:mint",
          }),
        "FORBIDDEN",
      );
      assert.equal(state.brandings.get(WS_REMAX)!.themeId, null);

      await expectDenied(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_MULTI,
            clientWorkspaceId: WS_B,
            themeId: "default-signature:purple",
          }),
        "WORKSPACE_HOST_MISMATCH",
      );
      assert.deepEqual(state.brandings.get(WS_B), beforeB);

      await expectDenied(
        () =>
          requireHostBoundOwnerOnboardingContext({
            request: makeRequest("unknown-xyz.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_OWNER,
          }),
        "TENANCY_DENIED",
      );

      await expectDenied(
        () =>
          updateOwnerOnboardingTemplateTheme({
            request: makeRequest("re-max-realty.houzzatpro.com"),
            prisma,
            hostDeps,
            userId: USER_OWNER,
            themeId: "not-a-theme",
          }),
        "INVALID_THEME_ID",
      );
      assert.equal(state.brandings.get(WS_REMAX)!.themeId, beforeRemax.themeId);

      const updated = await updateOwnerOnboardingTemplateTheme({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        themeId: "default-signature:dark-blue",
      });
      assert.equal(updated.themeId, "default-signature:dark-blue");
      assert.equal(updated.onboarding.templateThemeStatus, "COMPLETE");
      assert.equal(updated.onboarding.completedAt, null);
      assert.equal(
        state.brandings.get(WS_REMAX)!.themeId,
        "default-signature:dark-blue",
      );
      assert.equal(
        state.brandings.get(WS_REMAX)!.primaryColor,
        getThemeById("default-signature:dark-blue")!.palette.primary,
      );
      assert.equal(state.onboarding.get(WS_REMAX)!.completedAt, null);
      assert.deepEqual(
        {
          themeId: state.brandings.get(WS_B)!.themeId,
          primaryColor: state.brandings.get(WS_B)!.primaryColor,
        },
        {
          themeId: beforeB.themeId,
          primaryColor: beforeB.primaryColor,
        },
      );

      // Business profile must not wipe COMPLETE theme status
      await updateOwnerOnboardingBusinessProfile({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
        displayName: "RE/MAX REALTY",
        contactEmail: "owner@remax.test",
      });
      assert.equal(
        state.onboarding.get(WS_REMAX)!.templateThemeStatus,
        "COMPLETE",
      );
      assert.equal(
        state.brandings.get(WS_REMAX)!.themeId,
        "default-signature:dark-blue",
      );

      const items = await listOwnerOnboardingWorkspaces({
        request: makeRequest("re-max-realty.houzzatpro.com"),
        prisma,
        hostDeps,
        userId: USER_OWNER,
      });
      assert.equal(items[0]!.themeOptions.length, 6);
      assert.equal(items[0]!.templateLabel, "Default");
      assert.ok(items[0]!.themeOptions.every((t) => !t.id.includes("agent")));
      console.log("[5] OWNER select / AGENT deny / host-bound... PASS");
    }

    // 6. No production migration / no premium UI trees
    {
      assert.ok(!read("prisma/schema.prisma").includes("WorkspaceTemplate"));
      const client = read("src/components/onboarding/OwnerOnboardingClient.tsx");
      assert.ok(client.includes("Website design"));
      assert.ok(client.includes("Live preview"));
      assert.ok(client.includes('action: "template_theme"'));
      assert.ok(client.includes("theme.label"));
      assert.ok(!client.includes("Brokerage Signature"));
      assert.equal(DEFAULT_SIGNATURE_THEMES.length, 6);
      assert.ok(
        DEFAULT_SIGNATURE_THEMES.some((t) => t.label === "Mint / Green"),
      );
      console.log("[6] No DB catalog tables; Brokerage not exposed... PASS");
    }

    console.log("\nSTAGE 6.11A SELFTEST PASSED\n");
  } finally {
    if (prev === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = prev;
    clearHostResolutionCacheForTests();
  }
}

main().catch((err) => {
  console.error("\nSTAGE 6.11A SELFTEST FAILED\n");
  console.error(err);
  process.exit(1);
});
