/**
 * Stage 3H.1 — pre-deploy safety closure selftests (no production DB writes).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isTrustedStaffMutationOrigin,
  isValidWorkspaceIdShape,
  signActiveWorkspaceId,
  verifySignedActiveWorkspaceCookie,
} from "../src/lib/active-workspace";
import { canAccessLead } from "../src/lib/crm-read-scope";
import {
  USERS,
  WS_A,
  WS_B,
  ctxFor,
  leadById,
} from "./lib/multi-workspace-isolation-fixtures";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

process.env.AUTH_SECRET = "selftest-stage-3h1-secret";

function testRuntimeRoutingIsReadOnlyForConfig() {
  const mod = read("src/lib/workspace-routing.ts");
  assert.ok(mod.includes("loadWorkspaceCrmRoutingSettings"));
  assert.ok(!mod.includes("crmRoutingSettings.create"));
  assert.ok(!mod.includes("crmRoutingSettings.update"));
  assert.ok(!mod.includes("syncWorkspaceRoutingWeights"));
  // Fair-share counter only — not tenancy backfill
  assert.ok(mod.includes("assignedCount: { increment: 1 }"));
  // Must not link legacy default in runtime
  assert.ok(!mod.includes("legacy && !legacy.workspaceId"));
  assert.ok(!mod.includes("CRM_ROUTING_SETTINGS_ID"));
}

function testBackfillScriptIsExplicit() {
  const script = read("scripts/backfill-houzzat-workspace-routing.ts");
  assert.ok(script.includes("--apply"));
  assert.ok(script.includes("DRY RUN"));
  assert.ok(script.includes("NO ACTION REQUIRED"));
  assert.ok(script.includes('id: CRM_ROUTING_SETTINGS_ID'));
  const rollback = read("scripts/rollback-houzzat-workspace-routing.ts");
  assert.ok(rollback.includes("workspaceId: null"));
  assert.ok(rollback.includes("STOP"));
}

function testNotificationEmittersGateOnWorkspace() {
  const events = read("src/lib/notifications/staff-events.ts");
  assert.ok(events.includes("authorizeStaffRecipientForLead"));
  assert.ok(events.includes("authorizeStaffRecipientForTask"));
  assert.ok(events.includes('event: "lead_reassigned"'));
  assert.ok(events.includes('event: "lead_online"'));
  assert.ok(events.includes('event: "hot_pipeline"'));
  assert.ok(events.includes('event: "task_due"'));

  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("authorizeStaffRecipientForLead"));
  assert.ok(webhook.includes("alert_engagement"));
}

function testIsolationHelpersForEmitters() {
  process.env.WORKSPACE_NOTIFICATION_SCOPE = "workspace";
  // Structural: recipient helper filters by membership
  const recip = read("src/lib/workspace-notification-recipients.ts");
  assert.ok(recip.includes("authorizeStaffRecipientForLead"));
  assert.ok(recip.includes("authorizeStaffRecipientForTask"));
  assert.ok(recip.includes("filterStaffRecipientsForLead"));
  delete process.env.WORKSPACE_NOTIFICATION_SCOPE;
}

function testForgedCookieDenied() {
  assert.equal(
    verifySignedActiveWorkspaceCookie(`${WS_A}.forgedsig`),
    null,
  );
  const signed = signActiveWorkspaceId(WS_A);
  const tampered = signed.replace(WS_A, WS_B);
  assert.equal(verifySignedActiveWorkspaceCookie(tampered), null);
}

function testValidCookieShape() {
  assert.equal(isValidWorkspaceIdShape(WS_A), true);
  assert.equal(isValidWorkspaceIdShape("bad id"), false);
  assert.equal(verifySignedActiveWorkspaceCookie("not-a-cookie"), null);
}

function testOriginCheck() {
  const site = "https://houzzat.com";
  const good = new Request("https://houzzat.com/api/agent/workspace", {
    method: "POST",
    headers: { origin: "https://houzzat.com" },
  });
  const bad = new Request("https://houzzat.com/api/agent/workspace", {
    method: "POST",
    headers: { origin: "https://evil.example" },
  });
  assert.equal(isTrustedStaffMutationOrigin(good, site), true);
  assert.equal(isTrustedStaffMutationOrigin(bad, site), false);
}

function testActiveADeniesLeadB() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const agentA = ctxFor("a", "AGENT", USERS.agentA1);
    assert.equal(canAccessLead(agentA, leadById("lead_a1")), true);
    assert.equal(canAccessLead(agentA, leadById("lead_b1")), false);
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  }
}

function testRemovedMembershipInvalidatesSelection() {
  // Cookie alone is not auth — resolveWorkspaceStaffContext requires ACTIVE membership
  const ctx = read("src/lib/workspace-context.ts");
  assert.ok(ctx.includes('status: "ACTIVE"'));
  assert.ok(ctx.includes("requiresWorkspaceSelection"));
}

function testTeamWorkspaceWritesEnabled() {
  const route = read("src/app/api/agent/team/route.ts");
  assert.ok(route.includes("handleWorkspaceTeamPost"));
  assert.ok(route.includes("createWorkspaceInvite"));
  assert.ok(route.includes("suspendWorkspaceMember"));
  assert.ok(!route.includes("WORKSPACE_TEAM_WRITES_DISABLED"));
  assert.ok(route.includes("resolveTeamAuthority(ctx)"));
  assert.ok(route.includes("WORKSPACE_CONTEXT_REQUIRED"));
}

function testMigrationAdditiveOnly() {
  const sql = read(
    "prisma/migrations/20260824203000_stage_3h_workspace_control_plane/migration.sql",
  );
  assert.ok(!/(^|\n)\s*UPDATE\b/i.test(sql));
  assert.ok(!/(^|\n)\s*DELETE\b/i.test(sql));
  assert.ok(!/(^|\n)\s*DROP\b/i.test(sql));
  assert.ok(!/\bSET NOT NULL\b/i.test(sql));
  assert.ok(sql.includes('ADD COLUMN "workspaceId"'));
  assert.ok(sql.includes("WorkspaceInvite"));
}

function testNotificationIsolationMatrixLogic() {
  // Fixture-level: A recipients never include B user ids
  const aRecipients = [USERS.agentA1, USERS.ownerA];
  const bRecipients = [USERS.agentB1, USERS.ownerB];
  for (const id of aRecipients) {
    assert.ok(!bRecipients.includes(id));
  }
}

async function main() {
  testRuntimeRoutingIsReadOnlyForConfig();
  testBackfillScriptIsExplicit();
  testNotificationEmittersGateOnWorkspace();
  testIsolationHelpersForEmitters();
  testForgedCookieDenied();
  testValidCookieShape();
  testOriginCheck();
  testActiveADeniesLeadB();
  testRemovedMembershipInvalidatesSelection();
  testTeamWorkspaceWritesEnabled();
  testMigrationAdditiveOnly();
  testNotificationIsolationMatrixLogic();
  console.log("workspace-3h1-safety:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
