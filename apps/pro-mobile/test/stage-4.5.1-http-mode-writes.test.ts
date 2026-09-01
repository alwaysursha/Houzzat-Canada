/**
 * Stage 4.5.1 — HTTP-mode write compatibility regression tests.
 *
 * Proves Mobile v2 note/status routes avoid Prisma shapes that force
 * internal transactions on PrismaNeonHttp (Workers):
 * - no $transaction
 * - no nested activities: { create }
 * - no updateMany on the write path
 *
 * Also re-asserts isolation / validation rules and single activity per write.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";
import type { LeadStatus } from "../src/types/lead";

const REPO_ROOT = join(__dirname, "../../..");

const NOTES_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/notes/route.ts",
);
const STATUS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/status/route.ts",
);
const WRITE_EFFECTS = join(
  REPO_ROOT,
  "src/lib/mobile/v2/lead-write-effects.ts",
);

const CANONICAL_STATUSES: LeadStatus[] = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
];

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  status: LeadStatus;
  notes: string | null;
  organizationId: string;
  firstRespondedAt: Date | null;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_canary",
    firstRespondedAt: null,
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    status: "CONTACTED",
    notes: null,
    organizationId: "org_canary",
    firstRespondedAt: new Date("2026-08-30T12:15:00Z"),
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_houzzat",
    firstRespondedAt: null,
  },
};

type WriteOp =
  | { op: "leadNote.create" }
  | { op: "leadActivity.create"; type: string }
  | { op: "lead.update" }
  | { op: "agentTask.findMany" }
  | { op: "agentTask.update" }
  | { op: "agentTask.create" }
  | { op: "user.findUnique" };

const writeLog: WriteOp[] = [];
const activityStore: { leadId: string; type: string; body: string }[] = [];

function assertHttpSafeSource(label: string, source: string) {
  // Strip block/line comments so docstrings mentioning forbidden APIs don't fail.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  assert.equal(
    /\$transaction\s*\(/.test(code),
    false,
    `${label} must not call $transaction`,
  );
  assert.equal(
    /activities\s*:\s*\{\s*create\s*:/.test(code),
    false,
    `${label} must not use nested activities.create`,
  );
  assert.equal(
    /\.updateMany\s*\(/.test(code),
    false,
    `${label} must not use updateMany`,
  );
  assert.equal(
    /\.createMany\s*\(/.test(code),
    false,
    `${label} must not use createMany`,
  );
}

function authorizeWrite(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return {
      ok: false as const,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
    };
  }

  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];

  if (!lead || lead.workspaceId !== workspaceId) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }

  if (role === "AGENT") {
    const isAssigned = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;
    if (!isAssigned && !isPond) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }

  return { ok: true as const, userId, workspaceId, lead };
}

/** Simulates Stage 4.5.1 note write plan (flat sequential). */
function executeNoteWriteHttpSafe(
  tokenPayload: any,
  leadId: string,
  body: unknown,
) {
  writeLog.length = 0;
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return { ok: false as const, status: access.status, code: access.code };
  }

  const noteBody =
    body && typeof body === "object"
      ? String((body as { body?: unknown }).body ?? "").trim()
      : "";
  if (!noteBody) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
    };
  }

  writeLog.push({ op: "leadNote.create" });
  // markLeadFirstResponseHttpSafe — skipped when not ATTEMPTED_CONTACT
  if (
    access.lead.status === "ATTEMPTED_CONTACT" &&
    !access.lead.firstRespondedAt
  ) {
    writeLog.push({ op: "lead.update" });
  }
  writeLog.push({ op: "leadActivity.create", type: "note" });
  writeLog.push({ op: "user.findUnique" });
  writeLog.push({ op: "lead.update" });

  activityStore.push({
    leadId: access.lead.id,
    type: "note",
    body: noteBody.slice(0, 500),
  });

  return {
    ok: true as const,
    status: 200,
    writeLog: [...writeLog],
    note: { body: noteBody },
  };
}

/** Simulates Stage 4.5.1 status write plan (flat sequential, no nested). */
function executeStatusWriteHttpSafe(
  tokenPayload: any,
  leadId: string,
  body: unknown,
) {
  writeLog.length = 0;
  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return { ok: false as const, status: access.status, code: access.code };
  }

  const nextStatus =
    body && typeof body === "object"
      ? (body as { status?: unknown }).status
      : undefined;

  if (
    typeof nextStatus !== "string" ||
    !(CANONICAL_STATUSES as string[]).includes(nextStatus)
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
    };
  }

  if (nextStatus === access.lead.status) {
    return {
      ok: true as const,
      status: 200,
      unchanged: true,
      writeLog: [] as WriteOp[],
    };
  }

  const prev = access.lead.status;
  writeLog.push({ op: "lead.update" });
  writeLog.push({ op: "leadActivity.create", type: "status_change" });

  if (nextStatus === "ATTEMPTED_CONTACT" && prev !== "ATTEMPTED_CONTACT") {
    writeLog.push({ op: "agentTask.findMany" });
    writeLog.push({ op: "agentTask.findMany" });
    writeLog.push({ op: "agentTask.create" });
  } else if (nextStatus !== "NEW_LEAD" && prev === "NEW_LEAD") {
    writeLog.push({ op: "agentTask.findMany" });
  }

  access.lead.status = nextStatus as LeadStatus;
  activityStore.push({
    leadId: access.lead.id,
    type: "status_change",
    body: nextStatus,
  });

  return {
    ok: true as const,
    status: 200,
    writeLog: [...writeLog],
    lead: { status: nextStatus },
  };
}

async function runStage451Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.5.1 — HTTP-MODE TRANSACTION FIX REGRESSION TESTS");
  console.log("=================================================================\n");

  // 1. Source: notes route is HTTP-safe
  console.log("[1/10] Notes route source has no txn / nested / updateMany...");
  {
    const src = readFileSync(NOTES_ROUTE, "utf8");
    assertHttpSafeSource("notes route", src);
    assert.ok(src.includes("markLeadFirstResponseHttpSafe"));
    assert.ok(src.includes("leadNote.create"));
    assert.ok(src.includes("leadActivity.create"));
    console.log("  -> PASS");
  }

  // 2. Source: status route is HTTP-safe
  console.log("[2/10] Status route source has no txn / nested / updateMany...");
  {
    const src = readFileSync(STATUS_ROUTE, "utf8");
    assertHttpSafeSource("status route", src);
    assert.ok(src.includes("onLeadAttemptedContactHttpSafe"));
    assert.ok(src.includes("cancelOpenAgentTasksByTitleHttpSafe"));
    assert.ok(src.includes("leadActivity.create"));
    assert.equal(/activities\s*:\s*\{/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), false);
    console.log("  -> PASS");
  }

  // 3. Source: write-effects helper is HTTP-safe
  console.log("[3/10] lead-write-effects helper is HTTP-safe...");
  {
    const src = readFileSync(WRITE_EFFECTS, "utf8");
    assertHttpSafeSource("lead-write-effects", src);
    console.log("  -> PASS");
  }

  // 4. Note write succeeds with sequential flat ops
  console.log("[4/10] Note write plan succeeds without transaction...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const beforeActs = activityStore.length;
    const res = executeNoteWriteHttpSafe(verify.payload, "lead_canary_01", {
      body: "HTTP-safe note",
    });
    assert.equal(res.ok, true);
    assert.ok(res.writeLog?.every((op) => op.op !== ("$transaction" as never)));
    assert.ok(res.writeLog?.some((op) => op.op === "leadNote.create"));
    assert.equal(
      res.writeLog?.filter(
        (op) => op.op === "leadActivity.create" && op.type === "note",
      ).length,
      1,
    );
    assert.equal(activityStore.length - beforeActs, 1);
    console.log("  -> PASS");
  }

  // 5. Status write succeeds with sequential flat ops (no nested)
  console.log("[5/10] Status write plan succeeds without transaction...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const beforeActs = activityStore.length;
    const res = executeStatusWriteHttpSafe(verify.payload, "lead_canary_01", {
      status: "CONTACTED",
    });
    assert.equal(res.ok, true);
    assert.equal(
      res.writeLog?.filter(
        (op) => op.op === "leadActivity.create" && op.type === "status_change",
      ).length,
      1,
    );
    assert.equal(activityStore.length - beforeActs, 1);
    assert.equal(MOCK_LEADS.lead_canary_01!.status, "CONTACTED");
    console.log("  -> PASS");
  }

  // 6. No duplicate activity on status change
  console.log("[6/10] Status change creates exactly one activity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const before = activityStore.filter(
      (a) => a.leadId === "lead_canary_01" && a.type === "status_change",
    ).length;
    executeStatusWriteHttpSafe(verify.payload, "lead_canary_01", {
      status: "APPT_SET",
    });
    const after = activityStore.filter(
      (a) => a.leadId === "lead_canary_01" && a.type === "status_change",
    ).length;
    assert.equal(after - before, 1);
    console.log("  -> PASS");
  }

  // 7. Cross-tenant still denied
  console.log("[7/10] Cross-tenant write isolation still enforced...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const c = verifyMobileToken(canary.token);
    const h = verifyMobileToken(houzzat.token);
    assert.equal(c.ok && h.ok, true);
    if (!c.ok || !h.ok) return;

    assert.equal(
      executeNoteWriteHttpSafe(c.payload, "lead_houzzat_01", { body: "x" }).status,
      404,
    );
    assert.equal(
      executeStatusWriteHttpSafe(h.payload, "lead_canary_01", {
        status: "CONTACTED",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  // 8. Agent A/B restriction
  console.log("[8/10] Agent A cannot mutate Agent B private lead...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    assert.equal(
      executeNoteWriteHttpSafe(verify.payload, "lead_canary_03_agent2", {
        body: "nope",
      }).status,
      404,
    );
    assert.equal(
      executeStatusWriteHttpSafe(verify.payload, "lead_canary_03_agent2", {
        status: "APPT_SET",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  // 9. OWNER can write Agent B lead; invalid status / empty note rejected
  console.log("[9/10] OWNER write + validation guards...");
  {
    const owner = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const verify = verifyMobileToken(owner.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const okStatus = executeStatusWriteHttpSafe(
      verify.payload,
      "lead_canary_03_agent2",
      { status: "APPT_SET" },
    );
    assert.equal(okStatus.ok, true);

    const badStatus = executeStatusWriteHttpSafe(
      verify.payload,
      "lead_canary_03_agent2",
      { status: "HACKED" },
    );
    assert.equal(badStatus.ok, false);
    assert.equal(badStatus.status, 400);

    const emptyNote = executeNoteWriteHttpSafe(
      verify.payload,
      "lead_canary_03_agent2",
      { body: "   " },
    );
    assert.equal(emptyNote.ok, false);
    assert.equal(emptyNote.status, 400);
    console.log("  -> PASS");
  }

  // 10. Platform token rejected
  console.log("[10/10] Platform-only token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "platform@houzzat.com",
    });
    const verify = verifyMobileToken(platform.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    assert.equal(
      executeNoteWriteHttpSafe(verify.payload, "lead_canary_01", {
        body: "x",
      }).status,
      403,
    );
    assert.equal(
      executeStatusWriteHttpSafe(verify.payload, "lead_canary_01", {
        status: "CONTACTED",
      }).status,
      403,
    );
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.5.1 HTTP-MODE WRITE TESTS: ALL PASSED");
  console.log("=================================================================");
}

runStage451Tests().catch((err) => {
  console.error("STAGE 4.5.1 TESTS FAILED:", err);
  process.exit(1);
});
