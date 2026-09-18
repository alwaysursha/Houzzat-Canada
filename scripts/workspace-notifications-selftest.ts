/**
 * Stage 3H — workspace notification recipient isolation selftest (fixtures).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  USERS,
  WS_A,
  WS_B,
  ctxFor,
  leadById,
} from "./lib/multi-workspace-isolation-fixtures";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { parseWorkspaceNotificationScope } from "../src/lib/workspace-scope-flags";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

type DeskMember = {
  workspaceId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "AGENT";
  status: "ACTIVE" | "SUSPENDED";
};

const DESK: DeskMember[] = [
  { workspaceId: WS_A, userId: USERS.ownerA, role: "OWNER", status: "ACTIVE" },
  { workspaceId: WS_A, userId: USERS.adminA, role: "ADMIN", status: "ACTIVE" },
  { workspaceId: WS_A, userId: USERS.agentA1, role: "AGENT", status: "ACTIVE" },
  { workspaceId: WS_B, userId: USERS.ownerB, role: "OWNER", status: "ACTIVE" },
  { workspaceId: WS_B, userId: USERS.agentB1, role: "AGENT", status: "ACTIVE" },
];

function deskRecipients(workspaceId: string, assigneeId?: string | null) {
  const ids = new Set<string>();
  if (assigneeId) {
    const member = DESK.find(
      (m) => m.workspaceId === workspaceId && m.userId === assigneeId,
    );
    if (member?.status === "ACTIVE") ids.add(assigneeId);
  }
  for (const m of DESK) {
    if (
      m.workspaceId === workspaceId &&
      m.status === "ACTIVE" &&
      (m.role === "OWNER" || m.role === "ADMIN")
    ) {
      ids.add(m.userId);
    }
  }
  return [...ids];
}

function testLeadANewLeadRecipients() {
  const recipients = deskRecipients(WS_A, USERS.agentA1);
  assert.ok(recipients.includes(USERS.agentA1));
  assert.ok(recipients.includes(USERS.ownerA));
  assert.ok(!recipients.includes(USERS.agentB1));
  assert.ok(!recipients.includes(USERS.ownerB));
}

function testLeadBInverse() {
  const recipients = deskRecipients(WS_B, USERS.agentB1);
  assert.ok(recipients.includes(USERS.agentB1));
  assert.ok(!recipients.includes(USERS.agentA1));
}

function testPlatformAdminExcluded() {
  const recipients = deskRecipients(WS_A, USERS.agentA1);
  assert.ok(!recipients.includes(USERS.platformAdmin));
}

function testDeepLinkDeniedCrossWorkspace() {
  const prev = process.env.WORKSPACE_READ_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  try {
    const agentA = ctxFor("a", "AGENT", USERS.agentA1);
    assert.equal(canAccessLead(agentA, leadById("lead_b1")), false);
  } finally {
    if (prev === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = prev;
  }
}

function testLegacyNotificationFlagDefault() {
  delete process.env.WORKSPACE_NOTIFICATION_SCOPE;
  assert.equal(parseWorkspaceNotificationScope(), "legacy");
}

function testRecipientResolverModule() {
  const mod = readFileSync(
    join(root, "src/lib/workspace-notification-recipients.ts"),
    "utf8",
  );
  assert.ok(mod.includes("resolveLeadDeskNotifiers"));
  assert.ok(mod.includes("resolveWorkspaceDeskRecipients"));
  assert.ok(mod.includes("authorizeStaffRecipientForLead"));
  assert.ok(mod.includes("authorizeStaffRecipientForTask"));
}

function testEmitterCoverage() {
  const events = readFileSync(
    join(root, "src/lib/notifications/staff-events.ts"),
    "utf8",
  );
  assert.ok(events.includes("authorizeStaffRecipientForLead"));
  assert.ok(events.includes("authorizeStaffRecipientForTask"));
  const chatPush = readFileSync(
    join(root, "src/lib/notifications/customer-chat-agent-push.ts"),
    "utf8",
  );
  assert.ok(chatPush.includes("authorizeStaffRecipientForLead"));
  assert.ok(chatPush.includes("assignedAgentId"));
  assert.ok(!chatPush.includes("resolveLeadDeskNotifiers"));
  const webhook = readFileSync(
    join(root, "src/lib/email/resend-webhook.ts"),
    "utf8",
  );
  assert.ok(webhook.includes("alert_engagement"));
  assert.ok(webhook.includes("authorizeStaffRecipientForLead"));
}

async function main() {
  testLeadANewLeadRecipients();
  testLeadBInverse();
  testPlatformAdminExcluded();
  testDeepLinkDeniedCrossWorkspace();
  testLegacyNotificationFlagDefault();
  testRecipientResolverModule();
  testEmitterCoverage();
  console.log("workspace-notifications:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
