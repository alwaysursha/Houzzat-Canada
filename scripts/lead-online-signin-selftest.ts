/**
 * V1 — consumer sign-in lead_online (no Vitest).
 * Run: pnpm lead-online-signin:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ONLINE_MS } from "../src/lib/agent/hotness";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";
import {
  hasRecentLeadOnlineSignIn,
  markLeadOnlineSignIn,
  resetLeadOnlineSignInMemoryForTests,
  shouldEmitLeadOnline,
  uniqueAssignedAgentIds,
} from "../src/lib/notifications/lead-online-gate";
import {
  mergeStaffCategoryPrefs,
} from "../src/lib/notifications/staff-categories";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testAssignedCustomerSignInEmitsOnce() {
  resetLeadOnlineSignInMemoryForTests();
  const now = new Date("2026-09-15T14:12:00Z");
  const emit = shouldEmitLeadOnline({
    source: "sign-in",
    role: "BUYER",
    previousLastSeenAt: now,
    recentSignInAt: null,
    now,
  });
  assert.equal(emit, true, "assigned customer sign-in must qualify for lead_online");

  const agents = uniqueAssignedAgentIds(
    [{ assignedAgentId: "agent_1" }, { assignedAgentId: "agent_1" }],
    "customer_1",
  );
  assert.deepEqual(agents, ["agent_1"], "one assigned agent → one recipient");
}

function testUnassignedCustomerNoAgent() {
  assert.deepEqual(
    uniqueAssignedAgentIds(
      [{ assignedAgentId: null }, { assignedAgentId: null }],
      "customer_1",
    ),
    [],
    "unassigned customer → no agent push",
  );
}

function testStaffSignInNeverEmits() {
  resetLeadOnlineSignInMemoryForTests();
  for (const role of ["ADMIN", "AGENT"] as const) {
    assert.equal(
      shouldEmitLeadOnline({
        source: "sign-in",
        role,
        previousLastSeenAt: null,
        recentSignInAt: null,
      }),
      false,
      `${role} sign-in must not emit lead_online`,
    );
  }
  const staffEvents = read("src/lib/notifications/staff-events.ts");
  assert.ok(
    staffEvents.includes("if (!userId || !isConsumerRole(role)) return;"),
    "staff sign-in must return before scheduling lead_online",
  );
}

function testImmediateBeaconAfterSignInNoDuplicate() {
  resetLeadOnlineSignInMemoryForTests();
  const now = new Date("2026-09-15T14:12:00Z");
  const signInAt = new Date(now.getTime() - 5_000);
  const staleLastSeen = new Date(now.getTime() - 40 * 60 * 1000);

  markLeadOnlineSignIn("customer_1", signInAt.getTime());
  assert.equal(hasRecentLeadOnlineSignIn("customer_1", now.getTime()), true);

  assert.equal(
    shouldEmitLeadOnline({
      source: "beacon",
      previousLastSeenAt: staleLastSeen,
      recentSignInAt: signInAt,
      now,
    }),
    false,
    "beacon within 3 minutes of SIGN_IN must not duplicate lead_online",
  );

  const returned = new Date(now.getTime() + ONLINE_MS + 1_000);
  assert.equal(
    shouldEmitLeadOnline({
      source: "beacon",
      previousLastSeenAt: new Date(returned.getTime() - ONLINE_MS - 5_000),
      recentSignInAt: signInAt,
      now: returned,
    }),
    true,
    "beacon after the 3-minute window must still detect returned-online",
  );
}

function testPreferenceDisabledNoPush() {
  let prefs: unknown = {};
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "live_activity",
    channel: "push",
    enabled: false,
  });
  assert.equal(isPushTypeEnabled(prefs, "lead_online"), false);
  assert.equal(isPushTypeEnabled(null, "lead_online"), true);
}

function testWiring() {
  const auth = read("src/lib/auth.ts");
  const staffEvents = read("src/lib/notifications/staff-events.ts");
  const beacon = read("src/app/api/analytics/beacon/route.ts");

  assert.ok(
    auth.includes("scheduleNotifyCustomerCameOnlineFromSignIn"),
    "jwt sign-in must schedule consumer lead_online",
  );
  assert.ok(
    auth.includes("await recordActivityEvent"),
    "SIGN_IN row must commit before jwt returns so beacon dedupe can see it",
  );
  assert.ok(
    staffEvents.includes("isConsumerRole(role)"),
    "sign-in scheduler must refuse staff roles",
  );
  assert.ok(
    staffEvents.includes('source: "sign-in"'),
    "sign-in must bypass the inactivity gate via source=sign-in",
  );
  assert.ok(
    staffEvents.includes("authorizeStaffRecipientForLead"),
    "assigned-agent workspace authorization must remain",
  );
  assert.ok(
    staffEvents.includes("assignedAgentId: { not: null }"),
    "unassigned leads must not fan out",
  );
  assert.ok(
    beacon.includes("scheduleNotifyCustomerCameOnline"),
    "beacon returned-online path stays",
  );
  assert.ok(
    !beacon.includes("scheduleNotifyCustomerCameOnlineFromSignIn"),
    "beacon must not use the sign-in scheduler",
  );
}

testAssignedCustomerSignInEmitsOnce();
testUnassignedCustomerNoAgent();
testStaffSignInNeverEmits();
testImmediateBeaconAfterSignInNoDuplicate();
testPreferenceDisabledNoPush();
testWiring();

console.log("lead-online-signin-selftest: ok");
