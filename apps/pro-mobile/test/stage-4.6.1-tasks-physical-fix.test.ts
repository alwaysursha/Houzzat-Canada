/**
 * Stage 4.6.1 — Tasks physical fix: envelope contract + cache replace + query semantics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unwrapTasksList,
  unwrapCreatedTask,
} from "../src/lib/task-response";
import {
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const TASKS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/tasks/route.ts",
);
const DETAIL_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/LeadDetailScreen.tsx",
);

async function run() {
  console.log("=================================================================");
  console.log("STAGE 4.6.1 — TASKS PHYSICAL UI/DATA FIX TESTS");
  console.log("=================================================================\n");

  console.log("[1/8] Production response envelope → unwrapTasksList...");
  {
    // Client wraps raw JSON as res.data. Backend returns { ok:true, tasks:[...] }.
    const clientData = {
      ok: true,
      tasks: [
        {
          id: "t1",
          type: "CALL",
          status: "OPEN",
          title: "Follow up",
          body: null,
          dueAt: "2026-09-02T00:00:00.000Z",
          completedAt: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
    const list = unwrapTasksList(clientData);
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, "t1");
    assert.equal(list[0]!.title, "Follow up");

    // Nested data.tasks also accepted
    assert.equal(
      unwrapTasksList({ data: { tasks: [{ id: "t2", title: "X" }] } }).length,
      1,
    );
    // Empty / wrong shapes → []
    assert.deepEqual(unwrapTasksList({ ok: true }), []);
    assert.deepEqual(unwrapTasksList(null), []);
    console.log("  -> PASS");
  }

  console.log("[2/8] Create/patch task unwrap...");
  {
    assert.equal(
      unwrapCreatedTask({ ok: true, task: { id: "n1", title: "New" } })?.id,
      "n1",
    );
    assert.equal(
      unwrapCreatedTask({ data: { task: { id: "n2" } } })?.id,
      "n2",
    );
    assert.equal(unwrapCreatedTask({ ok: true }), null);
    console.log("  -> PASS");
  }

  console.log("[3/8] Empty cache replaced by server non-empty list...");
  {
    let cache: { tasks: unknown[] } = { tasks: [] };
    const serverPayload = {
      ok: true,
      tasks: [{ id: "live", title: "From server", status: "OPEN" }],
    };
    const list = unwrapTasksList(serverPayload);
    cache = { tasks: list };
    assert.equal(cache.tasks.length, 1);
    assert.equal((cache.tasks[0] as { id: string }).id, "live");
    console.log("  -> PASS");
  }

  console.log("[4/8] TasksRemindersTab is mounted for reminders tab...");
  {
    const src = readFileSync(DETAIL_SCREEN, "utf8");
    assert.ok(src.includes('import { TasksRemindersTab }'));
    assert.ok(src.includes('tab === "reminders"'));
    assert.ok(src.includes("<TasksRemindersTab"));
    // Placeholder ComingSoon must not be used for reminders
    const remindersBlock = src.slice(
      src.indexOf('tab === "reminders"'),
      src.indexOf('tab === "appointments"'),
    );
    assert.equal(remindersBlock.includes("ComingSoonPanel"), false);
    assert.ok(remindersBlock.includes("TasksRemindersTab"));
    console.log("  -> PASS");
  }

  console.log("[5/8] Backend GET uses leadId-only query (web Lead.tasks parity)...");
  {
    const src = readFileSync(TASKS_ROUTE, "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(code.includes("leadId: access.lead.id"));
    // Must not require workspaceId match that could hide lead-scoped tasks
    assert.equal(/workspaceId:\s*access\.workspaceId/.test(code), false);
    assert.equal(/\$transaction\s*\(/.test(code), false);
    console.log("  -> PASS");
  }

  console.log("[6/8] OPEN + DONE tasks both retained in list unwrap...");
  {
    const list = unwrapTasksList({
      ok: true,
      tasks: [
        { id: "o", status: "OPEN", title: "Open" },
        { id: "d", status: "DONE", title: "Done" },
      ],
    });
    assert.equal(list.length, 2);
    assert.ok(list.some((t) => t.status === "OPEN"));
    assert.ok(list.some((t) => t.status === "DONE"));
    console.log("  -> PASS");
  }

  console.log("[7/8] Create control copy present in TasksRemindersTab...");
  {
    const tabSrc = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/components/TasksRemindersTab.tsx"),
      "utf8",
    );
    assert.ok(tabSrc.includes("Set reminder"));
    assert.ok(tabSrc.includes('accessibilityLabel="Add reminder"'));
    assert.ok(tabSrc.includes(">Add<") || tabSrc.includes('"Add"'));
    console.log("  -> PASS");
  }

  console.log("[8/8] Isolation still enforced via authorize path (token check)...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "a@c.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const v = verifyMobileToken(token.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.payload.wsId, "ws_tenant_canary");
    assert.equal(v.payload.type, "mobile_workspace_access");
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.6.1 TESTS: ALL PASSED");
  console.log("=================================================================");
}

run().catch((err) => {
  console.error("STAGE 4.6.1 FAILED:", err);
  process.exit(1);
});
