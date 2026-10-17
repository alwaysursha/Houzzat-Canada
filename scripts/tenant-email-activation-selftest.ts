/**
 * Tenant-specific email feature-flag allowlists.
 * Covers branding + templates activation matrix and no-DB-on-deny.
 */
import assert from "node:assert/strict";
import {
  isTenantEmailBrandingEnabled,
  isTenantEmailBrandingEnabledForWorkspace,
  resolveTenantEmailBrand,
  type TenantEmailBrandDeps,
} from "../src/lib/email/tenant-email-brand";
import {
  isTenantEmailTemplatesEnabled,
  isTenantEmailTemplatesEnabledForWorkspace,
} from "../src/lib/email/workspace-templates/feature-flag";
import { loadPublishedPropertyWatchOverride } from "../src/lib/email/workspace-templates/property-watch";
import type { WorkspaceEmailTemplateStore } from "../src/lib/email/workspace-templates/store";
import {
  parseWorkspaceIdAllowlist,
  isWorkspaceIdAllowlisted,
} from "../src/lib/email/workspace-id-allowlist";
import {
  TENANT_B_TEST_BRANDING_ROW,
  TENANT_B_TEST_WORKSPACE_ID,
} from "../src/lib/tenancy/test-fixtures/tenant-b-brand";

const HOUZZAT_WS = "ws_houzzat_fixture";
const CANARY_WS = TENANT_B_TEST_WORKSPACE_ID;
const OTHER_WS = "ws_other_tenant_01";

function countingStore(): {
  store: WorkspaceEmailTemplateStore;
  finds: { count: number };
} {
  const finds = { count: 0 };
  const store: WorkspaceEmailTemplateStore = {
    async findTemplate() {
      finds.count += 1;
      throw new Error("store must not be queried when workspace is denied");
    },
    async listTemplates() {
      return [];
    },
    async upsertDraft() {
      throw new Error("unused");
    },
    async publishDraft() {
      throw new Error("unused");
    },
    async clearPublished() {
      return null;
    },
    async listVersions() {
      return [];
    },
  };
  return { store, finds };
}

function testAllowlistParsing() {
  assert.equal(parseWorkspaceIdAllowlist(undefined).size, 0);
  assert.equal(parseWorkspaceIdAllowlist("").size, 0);
  assert.equal(parseWorkspaceIdAllowlist("   ").size, 0);

  const parsed = parseWorkspaceIdAllowlist(
    `${HOUZZAT_WS}, bad!, ${CANARY_WS}  short  @@invalid@@  ${OTHER_WS}`,
  );
  assert.equal(parsed.has(HOUZZAT_WS), true);
  assert.equal(parsed.has(CANARY_WS), true);
  assert.equal(parsed.has(OTHER_WS), true);
  assert.equal(parsed.has("bad!"), false);
  assert.equal(parsed.has("short"), false);
  assert.equal(parsed.has("@@invalid@@"), false);

  assert.equal(
    isWorkspaceIdAllowlisted(HOUZZAT_WS, `${HOUZZAT_WS},${CANARY_WS}`),
    true,
  );
  assert.equal(isWorkspaceIdAllowlisted(OTHER_WS, HOUZZAT_WS), false);
  assert.equal(isWorkspaceIdAllowlisted("x", HOUZZAT_WS), false);
  assert.equal(isWorkspaceIdAllowlisted(HOUZZAT_WS, ""), false);
}

function testTemplatesActivationMatrix() {
  assert.equal(isTenantEmailTemplatesEnabled({}), false);
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {}),
    false,
  );
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_TEMPLATES: "off",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: HOUZZAT_WS,
    }),
    false,
  );

  // Global ON, no allowlist → fail closed.
  assert.equal(
    isTenantEmailTemplatesEnabled({ TENANT_EMAIL_TEMPLATES: "on" }),
    true,
  );
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_TEMPLATES: "on",
    }),
    false,
  );
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_TEMPLATES: "on",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: "",
    }),
    false,
  );

  // One permitted workspace.
  const oneOnly = {
    TENANT_EMAIL_TEMPLATES: "on",
    TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: HOUZZAT_WS,
  } as NodeJS.ProcessEnv;
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, oneOnly),
    true,
  );
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(CANARY_WS, oneOnly),
    false,
  );

  // Malformed-only allowlist → fail closed.
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_TEMPLATES: "on",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: "!,x,bad id",
    }),
    false,
  );

  // Malformed mixed with valid — only valid counts.
  assert.equal(
    isTenantEmailTemplatesEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_TEMPLATES: "on",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: `!!!,${HOUZZAT_WS},no`,
    }),
    true,
  );
}

function testBrandingActivationMatrix() {
  assert.equal(isTenantEmailBrandingEnabled({}), false);
  assert.equal(
    isTenantEmailBrandingEnabledForWorkspace(HOUZZAT_WS, {}),
    false,
  );

  assert.equal(
    isTenantEmailBrandingEnabledForWorkspace(HOUZZAT_WS, {
      TENANT_EMAIL_BRANDING: "on",
    }),
    false,
  );

  const oneOnly = {
    TENANT_EMAIL_BRANDING: "on",
    TENANT_EMAIL_BRANDING_WORKSPACE_IDS: CANARY_WS,
  } as NodeJS.ProcessEnv;
  assert.equal(
    isTenantEmailBrandingEnabledForWorkspace(CANARY_WS, oneOnly),
    true,
  );
  assert.equal(
    isTenantEmailBrandingEnabledForWorkspace(HOUZZAT_WS, oneOnly),
    false,
  );
}

async function testDeniedWorkspaceSkipsTemplateDb() {
  const { store, finds } = countingStore();
  const denied = await loadPublishedPropertyWatchOverride({
    workspaceId: CANARY_WS,
    store,
    env: {
      TENANT_EMAIL_TEMPLATES: "on",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: HOUZZAT_WS,
    },
  });
  assert.equal(denied, null);
  assert.equal(finds.count, 0);

  const noAllowlist = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: { TENANT_EMAIL_TEMPLATES: "on" },
  });
  assert.equal(noAllowlist, null);
  assert.equal(finds.count, 0);

  const globalOff = await loadPublishedPropertyWatchOverride({
    workspaceId: HOUZZAT_WS,
    store,
    env: {
      TENANT_EMAIL_TEMPLATES: "off",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: HOUZZAT_WS,
    },
  });
  assert.equal(globalOff, null);
  assert.equal(finds.count, 0);
}

async function testBrandingDeniedSkipsDeps() {
  let loads = 0;
  const deps: TenantEmailBrandDeps = {
    loadBranding: async () => {
      loads += 1;
      return TENANT_B_TEST_BRANDING_ROW;
    },
    loadEmailIdentity: async () => {
      loads += 1;
      return null;
    },
    loadProfessionalIdentity: async () => {
      loads += 1;
      return null;
    },
    loadAgentInWorkspace: async () => null,
    loadAssignedAgentForLead: async () => null,
    loadAssignedAgentForCustomer: async () => null,
    loadAgentEmailHeadshotAssociation: async () => null,
    resolveWebsiteUrl: async () => {
      loads += 1;
      return "https://example.com";
    },
  };

  const denied = await resolveTenantEmailBrand(
    { workspaceId: HOUZZAT_WS },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: CANARY_WS,
    },
  );
  assert.equal(denied, null);
  assert.equal(loads, 0);

  const allowed = await resolveTenantEmailBrand(
    { workspaceId: CANARY_WS },
    deps,
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: CANARY_WS,
    },
  );
  assert.ok(allowed);
  assert.equal(allowed.workspaceId, CANARY_WS);
  assert.ok(loads > 0);
}

async function testCrossTenantIsolationAllowlist() {
  const { store, finds } = countingStore();
  // Canary published content must not load when only Houzzat is allowlisted.
  const canary = await loadPublishedPropertyWatchOverride({
    workspaceId: CANARY_WS,
    store,
    env: {
      TENANT_EMAIL_TEMPLATES: "on",
      TENANT_EMAIL_TEMPLATES_WORKSPACE_IDS: HOUZZAT_WS,
    },
  });
  assert.equal(canary, null);
  assert.equal(finds.count, 0);

  const houzzatDeniedBranding = await resolveTenantEmailBrand(
    { workspaceId: HOUZZAT_WS },
    {
      loadBranding: async () => {
        throw new Error("must not load Houzzat branding when denied");
      },
      loadEmailIdentity: async () => null,
      loadProfessionalIdentity: async () => null,
      loadAgentInWorkspace: async () => null,
      loadAssignedAgentForLead: async () => null,
      loadAssignedAgentForCustomer: async () => null,
      loadAgentEmailHeadshotAssociation: async () => null,
      resolveWebsiteUrl: async () => "https://houzzat.com",
    },
    {
      TENANT_EMAIL_BRANDING: "on",
      TENANT_EMAIL_BRANDING_WORKSPACE_IDS: CANARY_WS,
    },
  );
  assert.equal(houzzatDeniedBranding, null);
}

async function main() {
  testAllowlistParsing();
  testTemplatesActivationMatrix();
  testBrandingActivationMatrix();
  await testDeniedWorkspaceSkipsTemplateDb();
  await testBrandingDeniedSkipsDeps();
  await testCrossTenantIsolationAllowlist();
  console.log("tenant-email-activation-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
