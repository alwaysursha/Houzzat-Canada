/**
 * Stage 3J.9.1 / 3K.5.8E.2 — canary activation selftest (URL safety + rotation + owner guards).
 * Run: pnpm workspace-canary-activation:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import {
  CANARY_ACTIVATION_CONFIRM_TOKEN,
  CANARY_ACTIVATION_PRODUCTION_HOST,
  buildActivationInviteUrl,
  expectedTenantCanaryPlatformActivationHostname,
  isProductionAckAllowedActivationHost,
  parseActivationCanaryCliArgs,
  parseActivationUserTarget,
  resolveCanaryActivationBaseUrl,
  validateActivationCanaryApplyConfirmation,
  validateActivationUserTarget,
} from "./lib/tenant-activation-canary";
import {
  CANARY_AFFILIATION,
  CANARY_NAME,
  CANARY_ROUTING_SETTINGS_ID,
  CANARY_SLUG,
} from "./lib/tenant-canary-provision";
import {
  resolveActivationCanaryContext,
  resolveTrustedCanaryBContext,
  resolveTrustedCanaryBOwnerActivationContext,
} from "./lib/tenant-lead-canary";
import { HOUZZAT_WORKSPACE_SLUG } from "../src/lib/crm-ownership";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testApplyGuard() {
  assert.equal(
    validateActivationCanaryApplyConfirmation({ apply: true, confirm: null }),
    `--apply requires --confirm=${CANARY_ACTIVATION_CONFIRM_TOKEN}`,
  );
  assert.equal(
    validateActivationCanaryApplyConfirmation({
      apply: true,
      confirm: CANARY_ACTIVATION_CONFIRM_TOKEN,
    }),
    null,
  );
}

function testUserTargetFailClosed() {
  assert.equal(parseActivationUserTarget("agent"), "agent");
  assert.equal(parseActivationUserTarget("owner"), "owner");
  assert.equal(parseActivationUserTarget("both"), null);

  assert.equal(
    validateActivationUserTarget({
      apply: true,
      userRaw: null,
      userTarget: null,
    }),
    "--apply requires --user=agent (or --user=owner)",
  );
  assert.equal(
    validateActivationUserTarget({
      apply: true,
      userRaw: "both",
      userTarget: null,
    }),
    "Unknown --user=both (allowed: agent, owner)",
  );

  const parsed = parseActivationCanaryCliArgs([
    "--apply",
    "--confirm=tenant-canary-activation",
    "--user=agent",
    "--rotate",
  ]);
  assert.equal(parsed.apply, true);
  assert.equal(parsed.rotate, true);
  assert.equal(parsed.userTarget, "agent");
}

function testProductionUrlRejectsLocalhost() {
  const bad = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  });
  assert.equal(bad.baseUrl, null);
  assert.ok(bad.error?.includes("localhost") || bad.error?.includes("CANARY_SITE_URL"));

  const skippedLocalUsesCanary = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
    CANARY_SITE_URL: "https://houzzat.com",
  });
  assert.equal(skippedLocalUsesCanary.error, null);
  assert.equal(skippedLocalUsesCanary.baseUrl, "https://houzzat.com");

  const badHost = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "https://example.com",
  });
  assert.equal(badHost.baseUrl, null);
  assert.ok(badHost.error?.includes("houzzat.com"));

  const http = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "http://houzzat.com",
  });
  assert.equal(http.baseUrl, null);
  assert.ok(http.error?.includes("https"));
}

function testProductionUrlAccepted() {
  const ok = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    CANARY_SITE_URL: "https://houzzat.com",
  });
  assert.equal(ok.error, null);
  assert.equal(ok.baseUrl, "https://houzzat.com");

  const fromNext = resolveCanaryActivationBaseUrl({
    CANARY_ACK_PRODUCTION_SCOPES: "1",
    NEXT_PUBLIC_SITE_URL: "https://houzzat.com/",
  });
  assert.equal(fromNext.baseUrl, "https://houzzat.com");

  const url = buildActivationInviteUrl(
    "https://houzzat.com",
    "TEST_TOKEN_VALUE_NOT_FOR_LOGS",
  );
  assert.equal(url, "https://houzzat.com/auth/invite/TEST_TOKEN_VALUE_NOT_FOR_LOGS");
  assert.ok(!url.includes("127.0.0.1"));
  assert.ok(!url.includes("localhost"));
}

function testNoSiteUrlLocalhostFallbackInLib() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  assert.ok(!lib.includes('from "../../src/lib/constants"'));
  assert.ok(lib.includes("resolveCanaryActivationBaseUrl"));
  assert.ok(lib.includes("CANARY_SITE_URL"));
  assert.ok(lib.includes("--rotate"));
  assert.ok(lib.includes("CANCELLED"));
  assert.ok(lib.includes("status: \"CANCELLED\"") || lib.includes('status: "CANCELLED"'));
}

function testActivationStrategy() {
  const invite = read("src/lib/workspace-invite.ts");
  assert.ok(invite.includes("needsPasswordActivation"));
  assert.ok(invite.includes("canActivatePasswordlessExisting"));
  assert.ok(invite.includes("bcrypt.hash"));
  assert.ok(invite.includes('priorMembership?.status === "ACTIVE"'));
  assert.ok(!invite.includes("PushDevice"));
}

function testReuseExistingSeat() {
  const invite = read("src/lib/workspace-invite.ts");
  const acceptStart = invite.indexOf(
    "export async function acceptWorkspaceInvite",
  );
  const accept = invite.slice(acceptStart, acceptStart + 4500);
  assert.ok(accept.includes("workspaceMember.upsert"));
  assert.ok(accept.includes("user.update"));
  assert.ok(accept.includes("password: hashed"));
  assert.ok(!accept.includes("user.create"));
}

function testUiAndCliSafety() {
  const ui = read("src/components/auth/TeamInviteClient.tsx");
  assert.ok(ui.includes("needsPasswordActivation"));

  const cli = read("scripts/workspace-prepare-canary-activation.ts");
  assert.ok(cli.includes("--rotate"));
  assert.ok(cli.includes("DO NOT paste"));
  assert.ok(cli.includes("executeActivationCanaryApply"));
  assert.ok(!cli.includes("console.log(rawToken)"));
}

function testRotationPreservesUser() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  assert.ok(lib.includes("rotation does not mutate User.password"));
  assert.ok(lib.includes("PRESERVE"));
  assert.ok(!lib.includes("pushDevice.create"));
  assert.ok(!lib.includes("user.update"));
}

function createMockPrismaForContext(houzzatPollutionCount: number) {
  const wsB = {
    id: "ws_b_canary",
    slug: CANARY_SLUG,
    status: "ACTIVE",
    name: CANARY_NAME,
    brokerageAffiliation: CANARY_AFFILIATION,
    primaryAgentId: "agent_b_id",
  };
  const houzzat = { id: "ws_houzzat" };
  const compatOrg = { id: "org_demo", slug: "demo-agent" };
  const members = [
    {
      role: "OWNER",
      userId: "owner_b_id",
      user: {
        email: "hadia_owner@yahoo.com",
        role: "ADMIN",
        password: null,
        disabledAt: null,
        agentProfile: null,
      },
    },
    {
      role: "AGENT",
      userId: "agent_b_id",
      user: {
        email: "hadia_agent@yahoo.com",
        role: "AGENT",
        agentProfile: { active: true },
      },
    },
  ];
  const routing = {
    id: CANARY_ROUTING_SETTINGS_ID,
    workspaceId: wsB.id,
    listingAgentId: "agent_b_id",
    sellerAssignMode: "LISTING_AGENT",
    weights: [
      { lane: "BUYER", percent: 100, agentId: "agent_b_id" },
      { lane: "SELLER", percent: 100, agentId: "agent_b_id" },
    ],
  };

  return {
    workspace: {
      findUnique: async (args: { where: { slug: string } }) => {
        if (args.where.slug === CANARY_SLUG) return wsB;
        if (args.where.slug === HOUZZAT_WORKSPACE_SLUG) return houzzat;
        return null;
      },
    },
    organization: {
      findUnique: async () => compatOrg,
    },
    workspaceMember: {
      findMany: async () => members,
      findFirst: async () => null,
    },
    crmRoutingSettings: {
      findUnique: async (args: { where: { id: string } }) => {
        if (args.where.id === CANARY_ROUTING_SETTINGS_ID) return routing;
        return null;
      },
    },
    crmRoutingWeight: {
      count: async () => houzzatPollutionCount,
    },
  } as unknown as PrismaClient;
}

async function testOwnerContextIgnoresRoutingPollution() {
  const prisma = createMockPrismaForContext(2);
  const ownerContext = await resolveTrustedCanaryBOwnerActivationContext(prisma);
  assert.equal(ownerContext.ownerBId, "owner_b_id");
  assert.equal(ownerContext.agentBId, "agent_b_id");

  await assert.rejects(
    () => resolveTrustedCanaryBContext(prisma),
    /Houzzat default routing/,
  );

  const viaResolver = await resolveActivationCanaryContext(prisma, "owner");
  assert.equal(viaResolver.ownerBId, "owner_b_id");

  await assert.rejects(
    () => resolveActivationCanaryContext(prisma, "agent"),
    /Houzzat default routing/,
  );
}

function testTenantCanaryHostnameAllowlist() {
  const tenantHost = expectedTenantCanaryPlatformActivationHostname();
  assert.equal(tenantHost, "tenant-canary.houzzatpro.com");

  assert.equal(
    isProductionAckAllowedActivationHost(tenantHost, "owner"),
    true,
  );
  assert.equal(
    isProductionAckAllowedActivationHost("www.tenant-canary.houzzatpro.com", "owner"),
    false,
  );
  assert.equal(
    isProductionAckAllowedActivationHost("other-tenant.houzzatpro.com", "owner"),
    false,
  );
  assert.equal(isProductionAckAllowedActivationHost("houzzatpro.com", "owner"), false);
  assert.equal(
    isProductionAckAllowedActivationHost("www.houzzatpro.com", "owner"),
    false,
  );
  assert.equal(
    isProductionAckAllowedActivationHost("houzzat-tenant-canary.workers.dev", "owner"),
    false,
  );
  assert.equal(
    isProductionAckAllowedActivationHost("localhost", "owner"),
    false,
  );

  assert.equal(
    isProductionAckAllowedActivationHost(CANARY_ACTIVATION_PRODUCTION_HOST, "agent"),
    true,
  );
  assert.equal(
    isProductionAckAllowedActivationHost(tenantHost, "agent"),
    false,
  );
}

function testOwnerProductionUrlAccepted() {
  const tenantHost = expectedTenantCanaryPlatformActivationHostname();
  const ok = resolveCanaryActivationBaseUrl(
    {
      CANARY_ACK_PRODUCTION_SCOPES: "1",
      CANARY_SITE_URL: `https://${tenantHost}`,
    },
    "owner",
  );
  assert.equal(ok.error, null);
  assert.equal(ok.baseUrl, `https://${tenantHost}`);

  const url = buildActivationInviteUrl(
    `https://${tenantHost}`,
    "TEST_TOKEN_VALUE_NOT_FOR_LOGS",
  );
  assert.equal(
    url,
    `https://${tenantHost}/auth/invite/TEST_TOKEN_VALUE_NOT_FOR_LOGS`,
  );
}

function testOwnerProductionUrlRejected() {
  const rejects = [
    "https://houzzatpro.com",
    "https://www.houzzatpro.com",
    "https://other-tenant.houzzatpro.com",
    "https://tenant-canary.workers.dev",
    "https://tenant-canary.pages.dev",
    "https://wrong-slug.houzzatpro.com",
  ];
  for (const siteUrl of rejects) {
    const result = resolveCanaryActivationBaseUrl(
      {
        CANARY_ACK_PRODUCTION_SCOPES: "1",
        CANARY_SITE_URL: siteUrl,
      },
      "owner",
    );
    assert.equal(result.baseUrl, null, `expected reject for ${siteUrl}`);
    assert.ok(result.error);
  }
}

function testOwnerContextNarrowingStructure() {
  const leadLib = read("scripts/lib/tenant-lead-canary.ts");
  const activationLib = read("scripts/lib/tenant-activation-canary.ts");
  const cli = read("scripts/workspace-prepare-canary-activation.ts");

  assert.ok(leadLib.includes("resolveTrustedCanaryBOwnerActivationContext"));
  assert.ok(leadLib.includes("resolveActivationCanaryContext"));
  assert.ok(leadLib.includes("B agents present in Houzzat default routing"));
  assert.ok(
    !leadLib.includes(
      "resolveTrustedCanaryBOwnerActivationContext(prisma, agentEmail)",
    ),
  );

  assert.ok(activationLib.includes("resolveActivationCanaryContext"));
  assert.ok(activationLib.includes("platformHostnameForWorkspaceSlug"));
  assert.ok(activationLib.includes("isProductionAckAllowedActivationHost"));
  assert.ok(cli.includes("resolveActivationCanaryContext"));
}

function testOwnerSingleMutationGuards() {
  const lib = read("scripts/lib/tenant-activation-canary.ts");
  assert.ok(lib.includes('if (userTarget === "agent" && target.demoAgentOrgSeats'));
  assert.ok(lib.includes('if (userTarget === "agent" && target.agentProfileActive'));
  assert.ok(lib.includes('object: "PushDevice"'));
  assert.ok(lib.includes('object: "Email send"'));
  assert.ok(lib.includes("token: tokenHash"));
  assert.ok(!lib.includes("organizationMembership.create"));
  assert.ok(!lib.includes("agentProfile.create"));
  assert.ok(!lib.includes("pushDevice.create"));
  assert.ok(!lib.includes("user.create"));
}

async function main() {
  testApplyGuard();
  testUserTargetFailClosed();
  testProductionUrlRejectsLocalhost();
  testProductionUrlAccepted();
  testTenantCanaryHostnameAllowlist();
  testOwnerProductionUrlAccepted();
  testOwnerProductionUrlRejected();
  testOwnerContextNarrowingStructure();
  testOwnerSingleMutationGuards();
  await testOwnerContextIgnoresRoutingPollution();
  testNoSiteUrlLocalhostFallbackInLib();
  testActivationStrategy();
  testReuseExistingSeat();
  testUiAndCliSafety();
  testRotationPreservesUser();
  console.log("workspace-canary-activation:selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
