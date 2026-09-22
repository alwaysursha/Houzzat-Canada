/**
 * Mobile SOLO owner desk context.
 * Empty workspaces resolve through the desktop brokerage org, read-only.
 * Does not touch a live database.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leadWhereForDesk, agentTaskTenantWhere } from "../src/lib/crm-read-scope";
import {
  buildMobileStatisticsContext,
  isLaunchpadDeskContextResolved,
  type MobileStatisticsContextDeps,
} from "../src/lib/mobile/v2/statistics-context";
import { workspaceMembershipAccessDenial } from "../src/lib/mobile/v2/workspace-access";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const maria = {
  id: "user-maria",
  email: "owner@example.com",
  name: "Maria Khalid",
  image: null,
  phone: null,
  role: "AGENT" as const,
};

const soloOpts = {
  userId: maria.id,
  workspaceId: "ws-maria",
  role: "OWNER" as const,
};

function deps(partial: MobileStatisticsContextDeps): MobileStatisticsContextDeps {
  return {
    findUser: async () => maria,
    resolveLeadOrganizationId: async () => null,
    resolveMembershipOrganizationId: async () => null,
    resolveBrokerageOrganization: async () => {
      throw new Error("brokerage resolver should not run");
    },
    ...partial,
  };
}

async function main() {
  {
    let brokerageCalls = 0;
    const ctx = await buildMobileStatisticsContext(
      soloOpts,
      deps({
        resolveBrokerageOrganization: async () => {
          brokerageCalls += 1;
          return { id: "brokerage-org" };
        },
      }),
    );
    assert.ok(ctx);
    assert.equal(ctx.organizationId, "brokerage-org");
    assert.equal(ctx.workspaceId, "ws-maria");
    assert.equal(ctx.workspaceRole, "OWNER");
    assert.equal(ctx.canSeeTeamLeads, true);
    assert.equal(ctx.readScope, "workspace");
    assert.equal(brokerageCalls, 1);
    assert.equal(isLaunchpadDeskContextResolved(ctx), true);
    console.log("[1] SOLO owner with zero leads resolves... PASS");
  }

  {
    const contextSrc = read("src/lib/mobile/v2/statistics-context.ts");
    assert.ok(contextSrc.includes("ensureBrokerageOrganization(false)"));
    assert.equal(contextSrc.includes(".create("), false);
    assert.equal(contextSrc.includes("organizationMembership.create"), false);
    assert.equal(contextSrc.includes("workspaceMember.create"), false);
    assert.equal(contextSrc.includes("agentProfile.create"), false);
    assert.equal(contextSrc.includes("lead.create"), false);
    assert.equal(contextSrc.includes("primaryAgentId"), false);
    console.log("[2] fallback creates no membership, member, profile, or lead... PASS");
  }

  {
    const calls: string[] = [];
    const ctx = await buildMobileStatisticsContext(
      soloOpts,
      deps({
        resolveLeadOrganizationId: async () => {
          calls.push("lead");
          return "org-from-lead";
        },
        resolveMembershipOrganizationId: async () => {
          calls.push("membership");
          return "org-from-membership";
        },
        resolveBrokerageOrganization: async () => {
          calls.push("brokerage");
          return { id: "brokerage-org" };
        },
      }),
    );
    assert.equal(ctx?.organizationId, "org-from-lead");
    assert.deepEqual(calls, ["lead"]);
    console.log("[3] an existing lead organization id stays first... PASS");
  }

  {
    const calls: string[] = [];
    const ctx = await buildMobileStatisticsContext(
      soloOpts,
      deps({
        resolveLeadOrganizationId: async () => {
          calls.push("lead");
          return null;
        },
        resolveMembershipOrganizationId: async () => {
          calls.push("membership");
          return "org-from-membership";
        },
        resolveBrokerageOrganization: async () => {
          calls.push("brokerage");
          return { id: "brokerage-org" };
        },
      }),
    );
    assert.equal(ctx?.organizationId, "org-from-membership");
    assert.deepEqual(calls, ["lead", "membership"]);
    console.log("[4] an existing organization membership stays second... PASS");
  }

  {
    const previousRead = process.env.WORKSPACE_READ_SCOPE;
    const previousDomain = process.env.TENANT_DOMAIN_SCOPE;
    process.env.WORKSPACE_READ_SCOPE = "workspace";
    process.env.TENANT_DOMAIN_SCOPE = "workspace";
    try {
      const ctx = await buildMobileStatisticsContext(
        soloOpts,
        deps({
          resolveBrokerageOrganization: async () => ({ id: "shared-brokerage" }),
        }),
      );
      assert.ok(ctx);
      const leads = leadWhereForDesk(ctx, null);
      const tasks = agentTaskTenantWhere(ctx);
      assert.deepEqual(leads, { workspaceId: "ws-maria" });
      assert.deepEqual(tasks, { workspaceId: "ws-maria" });
      assert.equal(JSON.stringify(leads).includes("ws-other"), false);
      assert.equal(JSON.stringify(leads).includes("shared-brokerage"), false);
    } finally {
      if (previousRead == null) delete process.env.WORKSPACE_READ_SCOPE;
      else process.env.WORKSPACE_READ_SCOPE = previousRead;
      if (previousDomain == null) delete process.env.TENANT_DOMAIN_SCOPE;
      else process.env.TENANT_DOMAIN_SCOPE = previousDomain;
    }
    console.log("[5] desk reads stay on workspaceId... PASS");
  }

  {
    assert.equal(
      workspaceMembershipAccessDenial(null)?.code,
      "WORKSPACE_FORBIDDEN",
    );
    assert.equal(
      workspaceMembershipAccessDenial({
        role: "OWNER",
        status: "SUSPENDED",
        workspace: { status: "ACTIVE" },
      })?.message,
      "Inactive or unauthorized workspace membership",
    );
    assert.equal(
      workspaceMembershipAccessDenial({
        role: "OWNER",
        status: "ACTIVE",
        workspace: { status: "SUSPENDED" },
      })?.status,
      403,
    );
    assert.equal(
      workspaceMembershipAccessDenial({
        role: "OWNER",
        status: "ACTIVE",
        workspace: { status: "ACTIVE" },
      }),
      null,
    );
    const access = read("src/lib/mobile/v2/workspace-access.ts");
    assert.ok(access.includes("workspaceMembershipAccessDenial(membership)"));
    assert.ok(access.includes("authenticateMobileRequest"));
    console.log("[6] inactive membership still fails authorization... PASS");
  }

  {
    const ctx = await buildMobileStatisticsContext(
      soloOpts,
      deps({
        resolveBrokerageOrganization: async () => ({ id: "brokerage-org" }),
      }),
    );
    assert.equal(isLaunchpadDeskContextResolved(ctx), true);
    assert.equal(isLaunchpadDeskContextResolved(null), false);
    const route = read("src/app/api/mobile/v2/launchpad/route.ts");
    const guardAt = route.indexOf("isLaunchpadDeskContextResolved(ctx)");
    const forbiddenAt = route.indexOf("Unable to resolve workspace desk context");
    assert.ok(guardAt >= 0 && forbiddenAt > guardAt);
    for (const path of [
      "src/app/api/mobile/v2/statistics/route.ts",
      "src/app/api/mobile/v2/activity/route.ts",
      "src/lib/mobile/v2/team.ts",
    ]) {
      const src = read(path);
      assert.ok(
        src.includes("buildMobileStatisticsContext") ||
          src.includes("buildMobileTeamContext"),
        path,
      );
    }
    console.log("[7] Launchpad 403 is only a missing context, not zero leads... PASS");
  }

  console.log("mobile-solo-desk-context-selftest: all cases passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
