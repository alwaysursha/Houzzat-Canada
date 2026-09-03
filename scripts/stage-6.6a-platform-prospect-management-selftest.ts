/**
 * Stage 6.6A — Master Admin prospect management selftest.
 * Run: node --import tsx scripts/stage-6.6a-platform-prospect-management-selftest.ts
 *
 * No production writes. Uses in-memory fakes.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  assertActiveMasterAdminOperator,
  PlatformOperatorAuthError,
  PlatformProspectActionError,
  addPlatformProspectInternalNote,
  applyPlatformProspectDemoAction,
  changePlatformProspectStatus,
  createOrReopenPlatformProspect,
  normalizeProspectEmail,
  updatePlatformProspect,
  validateContactName,
  validateProspectEmail,
} from "../src/lib/platform";

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

type FakeProspect = {
  id: string;
  contactName: string;
  email: string;
  businessName: string | null;
  phone: string | null;
  brokerageName: string | null;
  estimatedTeamSize: number | null;
  region: string | null;
  website: string | null;
  source: string;
  status: string;
  notesInternal: string | null;
  ownerOperatorId: string | null;
};

type FakeActivity = {
  id: string;
  prospectId: string;
  type: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  operatorId: string | null;
  body: string | null;
};

type FakeState = {
  prospects: Map<string, FakeProspect>;
  byEmail: Map<string, string>;
  activities: FakeActivity[];
  audits: Array<{ action: string; entityId: string; metadata: unknown }>;
  nextId: number;
};

function createFakePrisma(state: FakeState) {
  const id = (prefix: string) => `${prefix}_${state.nextId++}`;

  return {
    platformProspect: {
      async findUnique({
        where,
      }: {
        where: { id?: string; email?: string };
      }) {
        if (where.id) return state.prospects.get(where.id) ?? null;
        if (where.email) {
          const pid = state.byEmail.get(where.email);
          return pid ? (state.prospects.get(pid) ?? null) : null;
        }
        return null;
      },
      async create({
        data,
      }: {
        data: Omit<FakeProspect, "id"> & { id?: string };
        select?: unknown;
      }) {
        const prospect: FakeProspect = {
          id: id("p"),
          contactName: data.contactName,
          email: data.email,
          businessName: data.businessName ?? null,
          phone: data.phone ?? null,
          brokerageName: data.brokerageName ?? null,
          estimatedTeamSize: data.estimatedTeamSize ?? null,
          region: data.region ?? null,
          website: data.website ?? null,
          source: data.source,
          status: data.status,
          notesInternal: data.notesInternal ?? null,
          ownerOperatorId: data.ownerOperatorId ?? null,
        };
        state.prospects.set(prospect.id, prospect);
        state.byEmail.set(prospect.email, prospect.id);
        return { id: prospect.id, status: prospect.status };
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeProspect>;
      }) {
        const current = state.prospects.get(where.id);
        if (!current) throw new Error("missing prospect");
        if (data.email && data.email !== current.email) {
          state.byEmail.delete(current.email);
          state.byEmail.set(data.email, current.id);
        }
        const next = { ...current, ...data };
        state.prospects.set(where.id, next);
        return next;
      },
    },
    platformProspectActivity: {
      async create({
        data,
      }: {
        data: {
          prospectId: string;
          type: string;
          operatorId?: string | null;
          body?: string | null;
          scheduledAt?: Date | null;
          completedAt?: Date | null;
        };
        select?: unknown;
      }) {
        const row: FakeActivity = {
          id: id("a"),
          prospectId: data.prospectId,
          type: data.type,
          operatorId: data.operatorId ?? null,
          body: data.body ?? null,
          scheduledAt: data.scheduledAt ?? null,
          completedAt: data.completedAt ?? null,
        };
        state.activities.push(row);
        return { id: row.id };
      },
    },
    platformAuditEvent: {
      async create({
        data,
      }: {
        data: {
          action: string;
          entityId: string;
          metadata?: unknown;
          actorOperatorId?: string | null;
          actorType?: string;
          entityType?: string;
          summary?: string;
        };
        select?: unknown;
      }) {
        const row = {
          id: id("audit"),
          action: data.action,
          entityId: data.entityId,
          metadata: data.metadata ?? null,
        };
        state.audits.push(row);
        return { id: row.id };
      },
    },
  };
}

function freshState(): FakeState {
  return {
    prospects: new Map(),
    byEmail: new Map(),
    activities: [],
    audits: [],
    nextId: 1,
  };
}

async function main() {
  console.log("\n=== STAGE 6.6A — PLATFORM PROSPECT MANAGEMENT ===\n");

  // 1. Auth matrix
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
          {
            id: "op",
            userId: "u",
            role: "MASTER_ADMIN",
            status: "DISABLED",
          },
          "x@example.com",
        ),
      (e: unknown) =>
        e instanceof PlatformOperatorAuthError &&
        e.code === "PLATFORM_OPERATOR_DISABLED",
    );
    const ok = assertActiveMasterAdminOperator(
      {
        id: "op",
        userId: "u",
        role: "MASTER_ADMIN",
        status: "ACTIVE",
      },
      "master@example.com",
    );
    assert.equal(ok.role, "MASTER_ADMIN");
    console.log("[1] Platform operator auth matrix... PASS");
  }

  // 2. Routes exist and use platform operator wrapper
  {
    const routes = [
      "src/app/api/platform/v1/prospects/route.ts",
      "src/app/api/platform/v1/prospects/[prospectId]/route.ts",
      "src/app/api/platform/v1/prospects/[prospectId]/status/route.ts",
      "src/app/api/platform/v1/prospects/[prospectId]/demo/route.ts",
      "src/app/api/platform/v1/prospects/[prospectId]/activities/route.ts",
    ];
    for (const route of routes) {
      const src = read(route);
      assert.ok(
        src.includes("runPlatformRoute") ||
          src.includes("runPlatformRouteWithOperator"),
        route,
      );
      assert.ok(!src.includes("requireAgentContext"), route);
      assert.ok(!src.includes("isAdminRole"), route);
      assert.ok(!src.includes("$transaction"), route);
    }
    assert.ok(read(routes[0]!).includes("createOrReopenPlatformProspect"));
    assert.ok(read(routes[1]!).includes("updatePlatformProspect"));
    console.log("[2] Prospect write routes present... PASS");
  }

  // 3. Create + normalized duplicate returns existing
  {
    const state = freshState();
    const db = createFakePrisma(state) as never;
    const created = await createOrReopenPlatformProspect({
      contactName: "Ada Lovelace",
      email: "  Ada@Example.COM ",
      businessName: "Analytical Engines",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(created.outcome, "created");
    assert.equal(normalizeProspectEmail("  Ada@Example.COM "), "ada@example.com");
    const again = await createOrReopenPlatformProspect({
      contactName: "Ada 2",
      email: "ada@example.com",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(again.outcome, "existing");
    assert.equal(again.prospectId, created.prospectId);
    assert.equal(state.prospects.size, 1);
    console.log("[3] Create + duplicate normalized email... PASS");
  }

  // 4. LOST reopen same record
  {
    const state = freshState();
    const db = createFakePrisma(state) as never;
    const created = await createOrReopenPlatformProspect({
      contactName: "Grace Hopper",
      email: "grace@example.com",
      operatorId: "op_1",
      prisma: db,
    });
    await changePlatformProspectStatus({
      prospectId: created.prospectId,
      status: "LOST",
      operatorId: "op_1",
      prisma: db,
    });
    const priorActivityCount = state.activities.length;
    const reopened = await createOrReopenPlatformProspect({
      contactName: "Grace Hopper",
      email: "grace@example.com",
      phone: "4165550100",
      operatorId: "op_1",
      prisma: db,
    });
    assert.equal(reopened.outcome, "reopened");
    assert.equal(reopened.prospectId, created.prospectId);
    assert.equal(state.prospects.get(created.prospectId)?.status, "NEW");
    assert.ok(state.activities.length > priorActivityCount);
    assert.ok(
      state.activities.some(
        (a) => a.type === "STATUS_CHANGE" && a.body === "LOST → NEW",
      ),
    );
    console.log("[4] LOST reopen preserves history... PASS");
  }

  // 5. Validation
  {
    assert.throws(
      () => validateContactName(" "),
      (e: unknown) =>
        e instanceof PlatformProspectActionError &&
        e.code === "INVALID_CONTACT_NAME",
    );
    assert.throws(
      () => validateProspectEmail("not-an-email"),
      (e: unknown) =>
        e instanceof PlatformProspectActionError && e.code === "INVALID_EMAIL",
    );
    console.log("[5] Create/edit validation... PASS");
  }

  // 6. Status + demo activities
  {
    const state = freshState();
    const db = createFakePrisma(state) as never;
    const created = await createOrReopenPlatformProspect({
      contactName: "Demo Person",
      email: "demo@example.com",
      operatorId: "op_1",
      prisma: db,
    });
    await changePlatformProspectStatus({
      prospectId: created.prospectId,
      status: "CONTACTED",
      operatorId: "op_1",
      prisma: db,
    });
    await applyPlatformProspectDemoAction({
      prospectId: created.prospectId,
      operatorId: "op_1",
      action: "schedule",
      scheduledAt: "2026-09-10T15:00:00.000Z",
      prisma: db,
    });
    assert.equal(state.prospects.get(created.prospectId)?.status, "DEMO_SCHEDULED");
    assert.ok(state.activities.some((a) => a.type === "DEMO_SCHEDULED"));
    await applyPlatformProspectDemoAction({
      prospectId: created.prospectId,
      operatorId: "op_1",
      action: "complete",
      prisma: db,
    });
    assert.equal(state.prospects.get(created.prospectId)?.status, "DEMO_COMPLETED");
    assert.ok(state.activities.some((a) => a.type === "DEMO_COMPLETED"));
    await applyPlatformProspectDemoAction({
      prospectId: created.prospectId,
      operatorId: "op_1",
      action: "no_show",
      prisma: db,
    });
    await applyPlatformProspectDemoAction({
      prospectId: created.prospectId,
      operatorId: "op_1",
      action: "cancel",
      prisma: db,
    });
    assert.ok(state.activities.some((a) => a.type === "DEMO_NO_SHOW"));
    assert.ok(state.activities.some((a) => a.type === "DEMO_CANCELLED"));
    console.log("[6] Status + demo activities... PASS");
  }

  // 7. Internal note + audit omits body
  {
    const state = freshState();
    const db = createFakePrisma(state) as never;
    const created = await createOrReopenPlatformProspect({
      contactName: "Note Person",
      email: "note@example.com",
      operatorId: "op_1",
      prisma: db,
    });
    const secret = "PRIVATE_SALES_NOTE_BODY_XYZ";
    await addPlatformProspectInternalNote({
      prospectId: created.prospectId,
      operatorId: "op_1",
      body: secret,
      prisma: db,
    });
    assert.ok(state.activities.some((a) => a.type === "NOTE" && a.body === secret));
    const noteAudit = state.audits.find(
      (a) => a.action === "PLATFORM_PROSPECT_NOTE_ADDED",
    );
    assert.ok(noteAudit);
    assert.equal(JSON.stringify(noteAudit?.metadata).includes(secret), false);
    console.log("[7] Internal note private from audit metadata... PASS");
  }

  // 8. Edit does not mutate offers/subscriptions (source scan + update fields only)
  {
    const state = freshState();
    const db = createFakePrisma(state) as never;
    const created = await createOrReopenPlatformProspect({
      contactName: "Edit Person",
      email: "edit@example.com",
      operatorId: "op_1",
      prisma: db,
    });
    await updatePlatformProspect({
      prospectId: created.prospectId,
      operatorId: "op_1",
      businessName: "Updated Co",
      prisma: db,
    });
    assert.equal(state.prospects.get(created.prospectId)?.businessName, "Updated Co");
    const manage = read("src/lib/platform/prospects/manage.ts");
    assert.ok(!manage.includes("commercialOffer"));
    assert.ok(!manage.includes("subscription"));
    assert.ok(!manage.includes("billingCustomer"));
    assert.ok(!manage.includes("workspace."));
    assert.ok(!/prisma\.\$transaction|db\.\$transaction/.test(manage));
    assert.ok(!/\bstripe\b/i.test(manage));
    assert.ok(!/\bprovisioning\b/i.test(manage));
    console.log("[8] Edit isolation from offers/subscriptions... PASS");
  }

  // 9. CRM isolation
  {
    const forbidden = [
      /from\s+["']@\/lib\/crm-read-scope["']/,
      /from\s+["']@\/lib\/agent\/lead-summary["']/,
      /from\s+["']@\/lib\/agent["']/,
      /prisma\.lead\./,
      /prisma\.leadNote\./,
      /prisma\.leadEmailLog\./,
    ];
    const dirs = [
      "src/lib/platform/prospects",
      "src/app/api/platform/v1/prospects",
      "src/components/platform/PlatformProspectActions.tsx",
      "src/components/platform/PlatformProspectCreateForm.tsx",
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
    console.log("[9] CRM isolation in prospect management... PASS");
  }

  // 10. UI present
  {
    const list = read("src/app/platform/(shell)/prospects/page.tsx");
    const detail = read("src/app/platform/(shell)/prospects/[prospectId]/page.tsx");
    const create = read("src/components/platform/PlatformProspectCreateForm.tsx");
    const actions = read("src/components/platform/PlatformProspectActions.tsx");
    assert.ok(list.includes("PlatformProspectCreateForm"));
    assert.ok(create.includes("+ New Prospect"));
    assert.ok(detail.includes("PlatformProspectActions"));
    assert.ok(actions.includes("Edit Prospect"));
    assert.ok(actions.includes("Schedule Demo"));
    assert.ok(actions.includes("Add Internal Note"));
    assert.ok(create.includes("constants"));
    assert.ok(!create.includes('from "@/lib/platform/prospects/manage"'));
    assert.ok(!actions.includes('from "@/lib/platform/prospects/manage"'));
    console.log("[10] Master Admin UI actions present... PASS");
  }

  // 11. Handler maps prospect errors
  {
    const handler = read("src/lib/platform/api/handler.ts");
    assert.ok(handler.includes("PlatformProspectActionError"));
    console.log("[11] Handler passes through prospect errors... PASS");
  }

  console.log("\nSTAGE 6.6A — ALL TESTS PASSED\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
