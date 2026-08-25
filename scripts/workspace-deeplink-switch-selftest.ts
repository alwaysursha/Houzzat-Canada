/**
 * Stage 3I — multi-workspace deep-link handoff selftest.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  openLeadHandoffHref,
  openLeadProfileHref,
} from "../src/lib/agent/lead-profile-query";
import { shouldConfirmWorkspaceSwitch } from "../src/lib/open-lead-workspace-switch";
import { USERS, WS_A, WS_B, leadById } from "./lib/multi-workspace-isolation-fixtures";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testHandoffHref() {
  const href = openLeadHandoffHref("lead_abc123");
  assert.equal(href, "/agent/open-lead/lead_abc123");
  assert.ok(!href.includes("workspaceId"));
}

function testDeskHrefUnchanged() {
  const href = openLeadProfileHref("lead_abc123");
  assert.equal(href, "/agent/leads?lead=lead_abc123");
}

function testOpenLeadPageServerValidated() {
  const page = read("src/app/(agent)/agent/open-lead/[leadId]/page.tsx");
  assert.ok(page.includes("resolveOpenLeadHandoff"));
  assert.ok(page.includes("Switch Workspace?"));
  assert.ok(page.includes('method="post"'));
  assert.ok(page.includes("/api/agent/open-lead/"));
  // Server Components must not mutate cookies (Next.js throws → error boundary).
  assert.ok(!page.includes("cookies().set"));
  assert.ok(!page.includes("cookieStore.set"));
  assert.ok(!page.includes("signActiveWorkspaceId"));
  assert.ok(!page.includes('searchParams.get("workspaceId")'));
}

function testOpenLeadMatrix() {
  const houzzat = "cmt7kfcth0000gvu0bqsycsvz";

  // Production regression: sole Houzzat membership + no cookie → DIRECT OPEN
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: houzzat,
      cookieWorkspaceId: null,
      activeMemberWorkspaceIds: [houzzat],
    }),
    false,
  );

  // Sole membership + stale cookie for unknown id → DIRECT OPEN
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: houzzat,
      cookieWorkspaceId: "stale_other_workspace_id",
      activeMemberWorkspaceIds: [houzzat],
    }),
    false,
  );

  // Sole membership + matching cookie → DIRECT OPEN
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: houzzat,
      cookieWorkspaceId: houzzat,
      activeMemberWorkspaceIds: [houzzat],
    }),
    false,
  );

  // Multi: cookie A, lead B → CONFIRM
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: WS_B,
      cookieWorkspaceId: WS_A,
      activeMemberWorkspaceIds: [WS_A, WS_B],
    }),
    true,
  );

  // Multi: cookie B, lead B → DIRECT OPEN
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: WS_B,
      cookieWorkspaceId: WS_B,
      activeMemberWorkspaceIds: [WS_A, WS_B],
    }),
    false,
  );

  // Multi: no cookie, lead B → DIRECT OPEN (establishing selection, not switching)
  assert.equal(
    shouldConfirmWorkspaceSwitch({
      leadWorkspaceId: WS_B,
      cookieWorkspaceId: null,
      activeMemberWorkspaceIds: [WS_A, WS_B],
    }),
    false,
  );
}

function testPushUsesHandoff() {
  const events = read("src/lib/notifications/staff-events.ts");
  assert.ok(events.includes("openLeadHandoffHref"));
  assert.ok(events.includes("href: openLeadHandoffHref(input.leadId)"));
  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("openLeadHandoffHref"));
}

function testMembershipGateLogic() {
  const leadB = leadById("lead_b1");
  assert.equal(leadB.workspaceId, WS_B);
  assert.notEqual(leadB.workspaceId, WS_A);
  assert.ok(USERS.sharedUser);
}

function testOpenLeadExcludedFromChooserGate() {
  const gate = readFileSync(
    join(root, "src/components/agent/ActiveWorkspaceGate.tsx"),
    "utf8",
  );
  assert.ok(gate.includes("/agent/open-lead/"));
}

async function main() {
  testHandoffHref();
  testDeskHrefUnchanged();
  testOpenLeadPageServerValidated();
  testOpenLeadMatrix();
  testPushUsesHandoff();
  testMembershipGateLogic();
  testOpenLeadExcludedFromChooserGate();
  console.log("workspace-deeplink-switch:selftest: ok");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
