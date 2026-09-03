/**
 * Stage 6.5A — workspace suspend/reactivate selftest.
 * Run: node --import tsx scripts/stage-6.5a-workspace-status-selftest.ts
 *
 * No production writes. Uses in-memory fakes.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertActiveMasterAdminOperator,
  HOUZZAT_WORKSPACE_SLUG,
  PlatformOperatorAuthError,
  reactivateWorkspace,
  suspendWorkspace,
  validateSuspendReason,
  WorkspaceStatusActionError,
} from "../src/lib/platform";
import { resolveStrictTenantWorkspace } from "../src/lib/tenancy/tenant-authority";

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function listTsFiles(dir: string): string[] {
  const abs = join(root, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(rel));
    else if (name.name.endsWith(".ts") || name.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

type FakeWorkspace = {
  id: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
};

type FakeStatusEvent = {
  id: string;
  workspaceId: string;
  fromStatus: FakeWorkspace["status"];
  toStatus: FakeWorkspace["status"];
  reasonCode: string;
  reasonDetail: string | null;
  actorType: string;
  actorOperatorId: string | null;
  createdAt: Date;
};

type FakeState = {
  workspaces: Map<string, FakeWorkspace>;
  statusEvents: FakeStatusEvent[];
  auditEvents: Array<{
    action: string;
    entityId: string;
    metadata: unknown;
  }>;
  entitlements: Array<{ workspaceId: string; featureCode: string }>;
  nextId: number;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;

  return {
    workspace: {
      async findUnique({ where }: { where: { id: string } }) {
        return state.workspaces.get(where.id) ?? null;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: FakeWorkspace["status"] };
      }) {
        const ws = state.workspaces.get(where.id);
        if (!ws) throw new Error("workspace not found");
        ws.status = data.status;
        return ws;
      },
    },
    workspaceStatusEvent: {
      async findFirst({
        where,
        select,
      }: {
        where: { workspaceId: string; toStatus: string };
        orderBy: { createdAt: "desc" };
        select: { reasonCode: true };
      }) {
        const rows = state.statusEvents
          .filter(
            (e) =>
              e.workspaceId === where.workspaceId && e.toStatus === where.toStatus,
          )
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const row = rows[0];
        if (!row) return null;
        if (select.reasonCode) return { reasonCode: row.reasonCode };
        return row;
      },
      async create({
        data,
        select,
      }: {
        data: Omit<FakeStatusEvent, "id" | "createdAt">;
        select: { id: true };
      }) {
        const row: FakeStatusEvent = {
          id: id("wse"),
          createdAt: new Date(),
          ...data,
        };
        state.statusEvents.push(row);
        if (select.id) return { id: row.id };
        return row;
      },
    },
    platformAuditEvent: {
      async create({
        data,
        select,
      }: {
        data: {
          actorOperatorId: string | null;
          actorType: string;
          action: string;
          entityType: string;
          entityId: string;
          summary: string;
          metadata?: unknown;
        };
        select: { id: true };
      }) {
        const row = { id: id("audit"), ...data };
        state.auditEvents.push({
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata,
        });
        return { id: row.id };
      },
    },
  } as unknown as import("@prisma/client").PrismaClient;
}

function seedWorkspace(
  state: FakeState,
  input: { id: string; slug: string; status: FakeWorkspace["status"] },
) {
  state.workspaces.set(input.id, input);
}

async function main() {
  console.log("\n=== STAGE 6.5A — WORKSPACE STATUS ACTIONS ===\n");

  // 1. Routes + service exist, no $transaction
  {
    assert.ok(read("src/lib/platform/workspaces/status.ts").includes("suspendWorkspace"));
    assert.ok(read("src/lib/platform/workspaces/status.ts").includes("reactivateWorkspace"));
    assert.ok(
      read("src/app/api/platform/v1/workspaces/[workspaceId]/suspend/route.ts").includes(
        "runPlatformRouteWithOperator",
      ),
    );
    assert.ok(
      read("src/app/api/platform/v1/workspaces/[workspaceId]/reactivate/route.ts").includes(
        "runPlatformRouteWithOperator",
      ),
    );
    assert.ok(!/prisma\.\$transaction\s*\(/.test(read("src/lib/platform/workspaces/status.ts")));
    console.log("[1] Service + API routes present, no $transaction... PASS");
  }

  // 2. Auth matrix
  {
    assert.throws(
      () => assertActiveMasterAdminOperator(null, "x@example.com"),
      (e: unknown) =>
        e instanceof PlatformOperatorAuthError &&
        e.code === "PLATFORM_OPERATOR_REQUIRED",
    );
    assert.throws(
      () =>
        assertActiveMasterAdminOperator(
          { id: "op", userId: "u", role: "MASTER_ADMIN", status: "DISABLED" },
          "x@example.com",
        ),
      (e: unknown) =>
        e instanceof PlatformOperatorAuthError &&
        e.code === "PLATFORM_OPERATOR_DISABLED",
    );
    assert.doesNotThrow(() =>
      assertActiveMasterAdminOperator(
        { id: "op", userId: "u", role: "MASTER_ADMIN", status: "ACTIVE" },
        "master@example.com",
      ),
    );
    console.log("[2] Platform operator auth matrix... PASS");
  }

  // 3. Suspend ACTIVE -> SUSPENDED with events
  {
    const state: FakeState = {
      workspaces: new Map(),
      statusEvents: [],
      auditEvents: [],
      entitlements: [{ workspaceId: "ws_a", featureCode: "LIVE_CHAT" }],
      nextId: 1,
    };
    seedWorkspace(state, { id: "ws_a", slug: "tenant-canary", status: "ACTIVE" });
    const db = createFakePrisma(state);
    const result = await suspendWorkspace({
      workspaceId: "ws_a",
      reason: "Canary QA suspension test",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(result.outcome, "changed");
    assert.equal(state.workspaces.get("ws_a")?.status, "SUSPENDED");
    assert.equal(state.statusEvents.length, 1);
    assert.equal(state.statusEvents[0]?.reasonCode, "MANUAL");
    assert.equal(state.auditEvents.length, 1);
    assert.equal(state.auditEvents[0]?.action, "WORKSPACE_SUSPENDED");
    assert.equal(state.entitlements.length, 1);
    console.log("[3] Suspend ACTIVE creates status + audit events... PASS");
  }

  // 4. Suspend idempotent
  {
    const state: FakeState = {
      workspaces: new Map(),
      statusEvents: [],
      auditEvents: [],
      entitlements: [],
      nextId: 1,
    };
    seedWorkspace(state, { id: "ws_b", slug: "suspended-one", status: "SUSPENDED" });
    const db = createFakePrisma(state);
    const result = await suspendWorkspace({
      workspaceId: "ws_b",
      reason: "Should not apply",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(result.outcome, "no_op");
    assert.equal(state.statusEvents.length, 0);
    assert.equal(state.auditEvents.length, 0);
    console.log("[4] Repeat suspend is idempotent... PASS");
  }

  // 5. Reactivate manual suspension
  {
    const state: FakeState = {
      workspaces: new Map(),
      statusEvents: [],
      auditEvents: [],
      entitlements: [],
      nextId: 1,
    };
    seedWorkspace(state, { id: "ws_c", slug: "canary-qa", status: "SUSPENDED" });
    state.statusEvents.push({
      id: "evt_manual",
      workspaceId: "ws_c",
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      reasonCode: "MANUAL",
      reasonDetail: "QA",
      actorType: "PLATFORM_OPERATOR",
      actorOperatorId: "op_1",
      createdAt: new Date(),
    });
    const db = createFakePrisma(state);
    const result = await reactivateWorkspace({
      workspaceId: "ws_c",
      reason: "QA complete",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(result.outcome, "changed");
    assert.equal(state.workspaces.get("ws_c")?.status, "ACTIVE");
    assert.equal(state.auditEvents[0]?.action, "WORKSPACE_REACTIVATED");
    console.log("[5] Reactivate manual suspension... PASS");
  }

  // 6. Billing-controlled suspension refused
  {
    const state: FakeState = {
      workspaces: new Map(),
      statusEvents: [],
      auditEvents: [],
      entitlements: [],
      nextId: 1,
    };
    seedWorkspace(state, { id: "ws_d", slug: "billing-suspended", status: "SUSPENDED" });
    state.statusEvents.push({
      id: "evt_billing",
      workspaceId: "ws_d",
      fromStatus: "ACTIVE",
      toStatus: "SUSPENDED",
      reasonCode: "BILLING_PAST_DUE",
      reasonDetail: null,
      actorType: "SYSTEM",
      actorOperatorId: null,
      createdAt: new Date(),
    });
    const db = createFakePrisma(state);
    await assert.rejects(
      () =>
        reactivateWorkspace({
          workspaceId: "ws_d",
          operatorId: "op_1",
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof WorkspaceStatusActionError &&
        e.code === "BILLING_CONTROLLED_SUSPENSION",
    );
    assert.equal(state.workspaces.get("ws_d")?.status, "SUSPENDED");
    console.log("[6] Billing-controlled suspension blocks manual reactivate... PASS");
  }

  // 7. CANCELLED refused
  {
    const state: FakeState = {
      workspaces: new Map(),
      statusEvents: [],
      auditEvents: [],
      entitlements: [],
      nextId: 1,
    };
    seedWorkspace(state, { id: "ws_e", slug: "cancelled", status: "CANCELLED" });
    const db = createFakePrisma(state);
    await assert.rejects(
      () =>
        reactivateWorkspace({
          workspaceId: "ws_e",
          operatorId: "op_1",
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof WorkspaceStatusActionError && e.code === "WORKSPACE_CANCELLED",
    );
    await assert.rejects(
      () =>
        suspendWorkspace({
          workspaceId: "ws_e",
          reason: "Should fail",
          operatorId: "op_1",
          prisma: db,
        }),
      (e: unknown) =>
        e instanceof WorkspaceStatusActionError && e.code === "WORKSPACE_CANCELLED",
    );
    console.log("[7] CANCELLED workspace refused... PASS");
  }

  // 8. Reason validation
  {
    assert.throws(
      () => validateSuspendReason("  "),
      (e: unknown) =>
        e instanceof WorkspaceStatusActionError && e.code === "INVALID_SUSPEND_REASON",
    );
    assert.equal(validateSuspendReason("  Valid reason "), "Valid reason");
    console.log("[8] Suspend reason validation... PASS");
  }

  // 9. CRM isolation in platform workspace module
  {
    const forbidden = [
      /from\s+["']@\/lib\/crm-read-scope["']/,
      /from\s+["']@\/lib\/agent\/lead-summary["']/,
      /from\s+["']@\/lib\/agent["']/,
      /prisma\.lead\./,
    ];
    const dirs = [
      "src/lib/platform/workspaces",
      "src/app/api/platform/v1/workspaces",
      "src/components/platform/PlatformWorkspaceActions.tsx",
    ];
    for (const entry of dirs) {
      const files = entry.endsWith(".tsx") ? [entry] : listTsFiles(entry);
      for (const file of files) {
        const src = read(file);
        for (const re of forbidden) {
          assert.ok(!re.test(src), `${file} matches forbidden ${re}`);
        }
      }
    }
    console.log("[9] CRM isolation in status module... PASS");
  }

  // 10. API routes do not use requireAgentContext or User.role
  {
    const suspendRoute = read(
      "src/app/api/platform/v1/workspaces/[workspaceId]/suspend/route.ts",
    );
    const reactivateRoute = read(
      "src/app/api/platform/v1/workspaces/[workspaceId]/reactivate/route.ts",
    );
    for (const src of [suspendRoute, reactivateRoute]) {
      assert.ok(!src.includes("requireAgentContext"));
      assert.ok(!src.includes("isAdminRole"));
    }
    console.log("[10] API routes use platform operator only... PASS");
  }

  // 11. UI workspace actions only
  {
    const ui = read("src/components/platform/PlatformWorkspaceActions.tsx");
    assert.ok(ui.includes("Suspend workspace"));
    assert.ok(ui.includes("Reactivate workspace"));
    assert.ok(!/\bRetry\b/.test(ui));
    assert.ok(!/Create offer/i.test(ui));
    assert.ok(!/tokenHash/.test(ui));
    console.log("[11] UI workspace actions only... PASS");
  }

  // 12. Houzzat safety — selftest never seeds houzzat slug in mutations
  {
    const selftestSrc = read("scripts/stage-6.5a-workspace-status-selftest.ts");
    const seededSlugs = [...selftestSrc.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
    assert.ok(!seededSlugs.includes(HOUZZAT_WORKSPACE_SLUG));
    console.log("[12] Selftest avoids Houzzat production slug... PASS");
  }

  // 13. Existing SUSPENDED tenant runtime enforcement (fixture)
  {
    const suspended = await resolveStrictTenantWorkspace("suspended-tenant.houzzatpro.com", {
      lookupActiveDomain: async () => ({
        hostname: "suspended-tenant.houzzatpro.com",
        kind: "PLATFORM",
        role: "PRIMARY",
        workspaceId: "ws_suspended_fixture",
        workspaceSlug: "suspended-tenant",
        domainStatus: "ACTIVE",
        workspaceStatus: "SUSPENDED",
      }),
    });
    assert.equal(suspended.ok, false);
    if (!suspended.ok) {
      assert.equal(suspended.reason, "workspace_inactive");
    }
    console.log("[13] SUSPENDED blocks tenant strict host resolution... PASS");
  }

  console.log("\nSTAGE 6.5A — ALL TESTS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
