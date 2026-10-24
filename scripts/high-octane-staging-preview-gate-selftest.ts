/**
 * HIGH OCTANE Vercel Preview gate.
 * Run: pnpm exec tsx scripts/high-octane-staging-preview-gate-selftest.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shouldDeferStaffWebRoleToHostnameMembership } from "../src/lib/auth/pro-sign-in-routing";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";
import {
  clearHostResolutionCacheForTests,
  createFixtureHostResolutionDeps,
  resolveWorkspaceFromHostname,
  type DomainLookupRow,
} from "../src/lib/tenancy/resolve-workspace-host";
import { resolveRequestTenancy } from "../src/lib/tenancy/resolve-request-tenancy";
import {
  evaluateHighOctaneStagingEnvironment,
  resolveHighOctaneStagingTemplateId,
} from "../src/lib/tenancy/templates/high-octane-staging";
import { isHighOctaneStagingAnalyticsSuppressed } from "../src/lib/tenancy/templates/high-octane-staging-analytics";
import {
  HIGH_OCTANE_STAGING_BRANCH_ID,
  HIGH_OCTANE_STAGING_DIRECT_HOST,
  HIGH_OCTANE_STAGING_POOLED_HOST,
  HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  evaluateHighOctanePreviewEnvironment,
  shouldUseHighOctanePreviewWorkspaceBrand,
} from "../src/lib/tenancy/templates/high-octane-staging-preview";
import { HIGH_OCTANE_STAGING_WORKSPACE_SLUG } from "../src/lib/tenancy/templates/high-octane-staging-slug";
import type { WorkspaceBrandInternal } from "../src/lib/tenancy/brand-dto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const previewSource = readFileSync(
  join(root, "src/lib/tenancy/templates/high-octane-staging-preview.ts"),
  "utf8",
);

const STAGING_POOLED = `postgresql://staging-user:staging-secret@${HIGH_OCTANE_STAGING_POOLED_HOST}/neondb`;
const STAGING_DIRECT = `postgresql://staging-user:staging-secret@${HIGH_OCTANE_STAGING_DIRECT_HOST}/neondb`;
const PRODUCTION_POOLED =
  "postgresql://prod-user:prod-secret@ep-snowy-river-axfgwomo-pooler.c-4.us-east-2.aws.neon.tech/neondb";
const PRODUCTION_DIRECT =
  "postgresql://prod-user:prod-secret@ep-snowy-river-axfgwomo.c-4.us-east-2.aws.neon.tech/neondb";

const localhostReady = {
  NODE_ENV: "development",
  STAGING_DATABASE_URL: "postgresql://staging.example/neondb",
  DATABASE_URL: "postgresql://production.example/neondb",
  HIGH_OCTANE_STAGING: "1",
  HIGH_OCTANE_STAGING_ACCESS: "authenticated",
};

function previewEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    VERCEL_ENV: "preview",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
    DATABASE_URL: STAGING_POOLED,
    DIRECT_URL: STAGING_DIRECT,
    VERCEL_BRANCH_URL: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
    ...overrides,
  };
}

function documentedPreviewHostname(): string {
  const project = "high-octane-staging";
  const branch = "feature/high-octane-royal-collection";
  const org = "houzzat";
  const branchSlug = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const deploymentName = `${project}-git-${branchSlug}-${org}`;
  const hash = createHash("sha256").update(`git-${branch}${project}`).digest("hex").slice(0, 6);
  const suffix = `${hash}-${org}`;
  const truncated = deploymentName.slice(0, 63 - suffix.length - 1);
  return `${truncated}-${suffix}.vercel.app`;
}

const label = HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME.slice(0, -".vercel.app".length);
assert.equal(HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME, documentedPreviewHostname());
assert.ok(label.length <= 63);
assert.equal(label.includes("*"), false);

assert.equal(
  previewSource.includes("prisma") ||
    previewSource.includes("STRIPE_SECRET") ||
    previewSource.includes("RESEND_API_KEY") ||
    previewSource.includes("TWILIO_AUTH_TOKEN") ||
    previewSource.includes("MLS_SYNC_SECRET") ||
    previewSource.includes("PROPTX_BEARER_TOKEN") ||
    previewSource.includes("TYPESENSE_ADMIN_API_KEY") ||
    previewSource.includes("OPENAI_API_KEY") ||
    previewSource.includes("R2_SECRET_ACCESS_KEY") ||
    previewSource.includes("CRON_SECRET"),
  false,
);

assert.equal(evaluateHighOctaneStagingEnvironment(localhostReady).ready, true);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: localhostReady,
  }),
  "royal-collection-one",
);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    env: localhostReady,
  }),
  null,
);

const approved = previewEnv();
assert.equal(
  evaluateHighOctanePreviewEnvironment(approved, {
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }).ready,
  true,
);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: approved,
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
    branchId: HIGH_OCTANE_STAGING_BRANCH_ID,
  }),
  "royal-collection-one",
);

assert.equal(
  evaluateHighOctaneStagingEnvironment(
    previewEnv({ VERCEL_ENV: "production" }),
    { hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME },
  ).ready,
  false,
);
assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    env: previewEnv({ VERCEL_ENV: "production" }),
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }),
  null,
);

assert.equal(
  evaluateHighOctaneStagingEnvironment({
    NODE_ENV: "production",
    HIGH_OCTANE_STAGING: "1",
    HIGH_OCTANE_STAGING_ACCESS: "authenticated",
    DATABASE_URL: STAGING_POOLED,
    DIRECT_URL: STAGING_DIRECT,
  }).ready,
  false,
);

assert.equal(
  evaluateHighOctanePreviewEnvironment(
    previewEnv({ DATABASE_URL: PRODUCTION_POOLED, DIRECT_URL: PRODUCTION_DIRECT }),
    { hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME },
  ).ready,
  false,
);
assert.equal(
  evaluateHighOctanePreviewEnvironment(
    previewEnv({ DIRECT_URL: PRODUCTION_DIRECT }),
    { hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME },
  ).ready,
  false,
);

for (const overrides of [
  { HIGH_OCTANE_STAGING: undefined },
  { HIGH_OCTANE_STAGING: "0" },
  { HIGH_OCTANE_STAGING_ACCESS: "public" },
  { HIGH_OCTANE_STAGING_ACCESS: undefined },
]) {
  assert.equal(
    evaluateHighOctanePreviewEnvironment(previewEnv(overrides), {
      hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
    }).ready,
    false,
  );
}

assert.equal(
  evaluateHighOctanePreviewEnvironment(approved, {
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
    branchId: "br-falling-credit-axrjacil",
  }).ready,
  false,
);
assert.equal(
  evaluateHighOctanePreviewEnvironment(
    previewEnv({ HIGH_OCTANE_STAGING_BRANCH_ID: "br-falling-credit-axrjacil" }),
    { hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME },
  ).ready,
  false,
);
assert.equal(
  evaluateHighOctanePreviewEnvironment(approved, {
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }).ready,
  true,
);

for (const hostname of [
  "houzzat-vercel-test.vercel.app",
  "houzzat.com",
  "www.houzzat.com",
  "localhost",
  "high-octane-staging-abc123def-houzzat.vercel.app",
  "high-octane-staging-git-feature-high-octane-royal-collection-houzzat.vercel.app",
  `https://${HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME}`,
]) {
  assert.equal(
    evaluateHighOctanePreviewEnvironment(approved, { hostname }).ready,
    false,
    hostname,
  );
  assert.equal(
    resolveHighOctaneStagingTemplateId({
      workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
      env: approved,
      hostname,
    }),
    null,
    hostname,
  );
}

assert.equal(
  resolveHighOctaneStagingTemplateId({
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    env: approved,
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }),
  null,
);
assert.equal(
  shouldUseHighOctanePreviewWorkspaceBrand({
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    hostname: "houzzat.com",
    env: approved,
  }),
  false,
);
assert.equal(
  shouldUseHighOctanePreviewWorkspaceBrand({
    workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
    env: approved,
  }),
  true,
);

assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({
    workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    env: approved,
    hostname: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
  }),
  false,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({ env: approved }),
  true,
);
assert.equal(
  isHighOctaneStagingAnalyticsSuppressed({ env: localhostReady }),
  true,
);

const previousEnv = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
  HIGH_OCTANE_STAGING: process.env.HIGH_OCTANE_STAGING,
  HIGH_OCTANE_STAGING_ACCESS: process.env.HIGH_OCTANE_STAGING_ACCESS,
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL,
  HIGH_OCTANE_STAGING_BRANCH_ID: process.env.HIGH_OCTANE_STAGING_BRANCH_ID,
  TENANT_DOMAIN_SCOPE: process.env.TENANT_DOMAIN_SCOPE,
};

function applyEnv(env: NodeJS.ProcessEnv): void {
  for (const [key, value] of Object.entries(env)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
}

function restoreEnv(): void {
  applyEnv(previousEnv);
}

const localhostRow: DomainLookupRow = {
  hostname: "localhost",
  kind: "CUSTOM",
  role: "PRIMARY",
  workspaceId: "ws_ho",
  workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
  domainStatus: "ACTIVE",
  workspaceStatus: "ACTIVE",
};

function resolutionDeps(lookupCalls: { count: number }) {
  return {
    ...createFixtureHostResolutionDeps([localhostRow], {
      workspaceId: "ws_houzzat",
      workspaceSlug: HOUZZAT_WORKSPACE_SLUG,
    }),
    lookupHighOctaneStagingWorkspace: async () => {
      lookupCalls.count += 1;
      return { workspaceId: "ws_ho", workspaceSlug: HIGH_OCTANE_STAGING_WORKSPACE_SLUG };
    },
  };
}

const previewBrand: WorkspaceBrandInternal = {
  workspaceId: "ws_ho",
  tier: "SEMI_BRANDED",
  displayName: "HIGH OCTANE Real Estate",
  tagline: "staging",
  logoUrl: null,
  brokerageLogoUrl: null,
  faviconUrl: null,
  ogImageUrl: null,
  colors: {
    primary: "#102A43",
    secondary: "#243B53",
    accent: "#D4A017",
    surface: "#F7F4EF",
    ink: "#102A43",
  },
  contact: { email: "saad@highoctaneniagara.ca", phone: null },
  footerLegalText: null,
  poweredByHouzzatPro: true,
  seoDescription: "staging",
  version: 1,
  staffDisplayName: "HIGH OCTANE Real Estate",
  source: "workspace_row",
};

async function main(): Promise<void> {
  clearHostResolutionCacheForTests();
  try {
    applyEnv(approved);
    delete process.env.TENANT_DOMAIN_SCOPE;
    const lookupCalls = { count: 0 };
    const deps = resolutionDeps(lookupCalls);
    const previewHost = await resolveWorkspaceFromHostname(
      HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
      deps,
    );
    assert.equal(previewHost.ok, true);
    if (previewHost.ok) {
      assert.equal(previewHost.workspaceSlug, HIGH_OCTANE_STAGING_WORKSPACE_SLUG);
      assert.equal(previewHost.mode, "workspace");
    }
    assert.equal(lookupCalls.count, 1);

    clearHostResolutionCacheForTests();
    const otherPreview = await resolveWorkspaceFromHostname(
      "high-octane-staging-abc123def-houzzat.vercel.app",
      deps,
    );
    assert.equal(otherPreview.ok && otherPreview.workspaceSlug, HOUZZAT_WORKSPACE_SLUG);

    clearHostResolutionCacheForTests();
    const houzzat = await resolveWorkspaceFromHostname("houzzat.com", deps);
    assert.equal(houzzat.ok && houzzat.workspaceSlug, HOUZZAT_WORKSPACE_SLUG);
    assert.equal(lookupCalls.count, 1);

    clearHostResolutionCacheForTests();
    applyEnv(previewEnv({ VERCEL_ENV: "production" }));
    const productionContext = await resolveWorkspaceFromHostname(
      HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
      deps,
    );
    assert.notEqual(
      productionContext.ok && productionContext.workspaceSlug,
      HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    );

    clearHostResolutionCacheForTests();
    applyEnv(previewEnv({ DATABASE_URL: PRODUCTION_POOLED }));
    const productionDatabase = await resolveWorkspaceFromHostname(
      HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
      deps,
    );
    assert.notEqual(
      productionDatabase.ok && productionDatabase.workspaceSlug,
      HIGH_OCTANE_STAGING_WORKSPACE_SLUG,
    );

    clearHostResolutionCacheForTests();
    applyEnv(previewEnv({ HIGH_OCTANE_STAGING: "0" }));
    const wrongFlag = await resolveWorkspaceFromHostname(
      HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME,
      deps,
    );
    assert.notEqual(wrongFlag.ok && wrongFlag.workspaceSlug, HIGH_OCTANE_STAGING_WORKSPACE_SLUG);

    clearHostResolutionCacheForTests();
    applyEnv({ ...localhostReady, TENANT_DOMAIN_SCOPE: "workspace" });
    delete process.env.VERCEL_ENV;
    const localhost = await resolveWorkspaceFromHostname("localhost", deps);
    assert.equal(localhost.ok, true);
    if (localhost.ok) {
      assert.equal(localhost.workspaceSlug, HIGH_OCTANE_STAGING_WORKSPACE_SLUG);
      assert.equal(localhost.normalizedHostname, "localhost");
    }

    clearHostResolutionCacheForTests();
    applyEnv(approved);
    delete process.env.TENANT_DOMAIN_SCOPE;
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership(HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME),
      true,
    );
    assert.equal(shouldDeferStaffWebRoleToHostnameMembership("houzzat.com"), false);
    assert.equal(
      shouldDeferStaffWebRoleToHostnameMembership("houzzat-vercel-test.vercel.app"),
      true,
    );

    let brandCalls = 0;
    const requestDeps = {
      ...deps,
      resolveBrand: async () => {
        brandCalls += 1;
        return previewBrand;
      },
    };
    const previewRequest = new Request(`https://${HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME}/`, {
      headers: { host: HIGH_OCTANE_STAGING_PREVIEW_HOSTNAME },
    });
    const previewTenancy = await resolveRequestTenancy(previewRequest, requestDeps);
    assert.equal(previewTenancy.ok, true);
    if (previewTenancy.ok) {
      assert.equal(previewTenancy.workspaceSlug, HIGH_OCTANE_STAGING_WORKSPACE_SLUG);
      assert.equal(previewTenancy.brand.displayName, "HIGH OCTANE Real Estate");
    }
    assert.equal(brandCalls, 1);

    clearHostResolutionCacheForTests();
    const houzzatRequest = new Request("https://houzzat.com/", {
      headers: { host: "houzzat.com" },
    });
    const houzzatTenancy = await resolveRequestTenancy(houzzatRequest, requestDeps);
    assert.equal(houzzatTenancy.ok, true);
    if (houzzatTenancy.ok) {
      assert.equal(houzzatTenancy.workspaceSlug, HOUZZAT_WORKSPACE_SLUG);
      assert.notEqual(houzzatTenancy.brand.displayName, "HIGH OCTANE Real Estate");
    }
    assert.equal(brandCalls, 1);

    applyEnv({ TENANT_DOMAIN_SCOPE: "workspace" });
    delete process.env.VERCEL_ENV;
    delete process.env.HIGH_OCTANE_STAGING;
    assert.equal(shouldDeferStaffWebRoleToHostnameMembership("localhost"), true);
  } finally {
    restoreEnv();
    clearHostResolutionCacheForTests();
  }
}

main()
  .then(() => {
    console.log("high-octane-staging-preview-gate-selftest: ok");
  })
  .catch((error: unknown) => {
    restoreEnv();
    clearHostResolutionCacheForTests();
    console.error(error instanceof Error ? error.message : "preview gate selftest failed");
    process.exitCode = 1;
  });
