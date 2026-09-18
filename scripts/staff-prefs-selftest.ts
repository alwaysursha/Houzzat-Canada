/**
 * Phase 3 — staff notification preferences (structural).
 * Run: pnpm staff-prefs:selftest
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isPushTypeEnabled,
} from "../src/lib/notifications/catalog";
import {
  isStaffCategoryPushEnabled,
  isStaffEmailCategoryEnabled,
  mergeStaffCategoryPrefs,
  STAFF_CATEGORY_CATALOG,
  STAFF_EMAIL_PREFS_KEY,
  staffCategoriesForUi,
} from "../src/lib/notifications/staff-categories";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testDefaultsPreserveOn() {
  assert.equal(isStaffEmailCategoryEnabled(null, "new_leads"), true);
  assert.equal(isStaffEmailCategoryEnabled({}, "new_leads"), true);
  assert.equal(isStaffCategoryPushEnabled(null, "new_leads"), true);
  assert.equal(isPushTypeEnabled(null, "new_lead"), true);
}

function testPushEmailIndependence() {
  let prefs: unknown = {};
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "new_leads",
    channel: "push",
    enabled: false,
  });
  assert.equal(isStaffCategoryPushEnabled(prefs, "new_leads"), false);
  assert.equal(isPushTypeEnabled(prefs, "new_lead"), false);
  assert.equal(isStaffEmailCategoryEnabled(prefs, "new_leads"), true);

  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "new_leads",
    channel: "email",
    enabled: false,
  });
  assert.equal(isStaffCategoryPushEnabled(prefs, "new_leads"), false);
  assert.equal(isStaffEmailCategoryEnabled(prefs, "new_leads"), false);

  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "new_leads",
    channel: "push",
    enabled: true,
  });
  assert.equal(isStaffCategoryPushEnabled(prefs, "new_leads"), true);
  assert.equal(isStaffEmailCategoryEnabled(prefs, "new_leads"), false);
}

function testAllFourCombos() {
  const combos: Array<[boolean, boolean]> = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  for (const [push, email] of combos) {
    let prefs: unknown = {};
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "new_leads",
      channel: "push",
      enabled: push,
    });
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "new_leads",
      channel: "email",
      enabled: email,
    });
    assert.equal(isStaffCategoryPushEnabled(prefs, "new_leads"), push);
    assert.equal(isStaffEmailCategoryEnabled(prefs, "new_leads"), email);
  }
}

function testLiveActivityMapsBothPushKeys() {
  let prefs: unknown = {};
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "live_activity",
    channel: "push",
    enabled: false,
  });
  assert.equal(isPushTypeEnabled(prefs, "lead_online"), false);
  assert.equal(isPushTypeEnabled(prefs, "hot_pipeline"), false);
  assert.equal(isStaffCategoryPushEnabled(prefs, "live_activity"), false);
}

function testEmailNestPreservesPushKeys() {
  let prefs: unknown = { new_lead: false, lead_reassigned: true };
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "tasks",
    channel: "email",
    enabled: false,
  });
  assert.equal(isPushTypeEnabled(prefs, "new_lead"), false);
  assert.equal(isPushTypeEnabled(prefs, "lead_reassigned"), true);
  assert.equal(isStaffEmailCategoryEnabled(prefs, "tasks"), false);
  assert.ok(
    typeof (prefs as Record<string, unknown>)[STAFF_EMAIL_PREFS_KEY] ===
      "object",
  );
}

function testChatMessagePrefsDefaultOnWithoutUiRow() {
  assert.equal(isPushTypeEnabled(null, "chat_message"), true);
  assert.equal(isPushTypeEnabled({}, "chat_message"), true);
  assert.equal(
    isPushTypeEnabled({ chat_message: false }, "chat_message"),
    false,
  );
  assert.ok(
    !STAFF_CATEGORY_CATALOG.some((row) =>
      row.pushTypes.includes("chat_message"),
    ),
    "chat_message must not have a Messages preference UI row",
  );
}

function testUiCatalog() {
  const rows = staffCategoriesForUi(null);
  assert.equal(rows.length, STAFF_CATEGORY_CATALOG.length);
  const newLeads = rows.find((r) => r.id === "new_leads");
  assert.ok(newLeads?.emailActive);
  assert.ok(newLeads?.highStakes);
  assert.equal(newLeads?.pushEnabled, true);
  assert.equal(newLeads?.emailEnabled, true);

  const engagement = rows.find((r) => r.id === "engagement");
  assert.equal(engagement?.emailActive, false);
  assert.equal(engagement?.highStakes, false);
}

function testStructuralWiring() {
  const staffEvents = read("src/lib/notifications/staff-events.ts");
  const api = read("src/app/api/notifications/preferences/route.ts");
  const form = read(
    "src/components/notifications/StaffNotificationPreferencesForm.tsx",
  );
  const leads = read("src/app/api/leads/route.ts");
  const consumerForm = read(
    "src/components/notifications/NotificationPreferencesForm.tsx",
  );

  assert.ok(staffEvents.includes("isStaffEmailCategoryEnabled"));
  assert.ok(staffEvents.includes("recipientUserId"));
  assert.ok(staffEvents.includes("emailCategory"));
  assert.ok(staffEvents.includes("scheduleNewLeadStaffEmail"));
  assert.ok(staffEvents.includes('"new_leads"'));
  assert.ok(api.includes("staffCategoriesForUi"));
  assert.ok(api.includes("mergeStaffCategoryPrefs"));
  assert.ok(form.includes("useSiteAlert"));
  assert.ok(form.includes("destructive: true"));
  assert.ok(form.includes("requestGen"));
  assert.ok(leads.includes("scheduleNewLeadStaffEmail"));
  assert.ok(leads.includes('source: "listing_inquiry"'));
  assert.ok(
    !leads.includes('type: "contact_requested"'),
    "must not revive duplicate contact_requested push",
  );
  assert.ok(
    !leads.includes('type: "appointment"'),
    "must not revive duplicate appointment push",
  );
  assert.ok(
    consumerForm.includes('body: JSON.stringify({ prefs: { [id]: enabled } })'),
    "consumer form must keep prefs-based PATCH",
  );
  assert.ok(!consumerForm.includes("staffEmail"));
}

testDefaultsPreserveOn();
testPushEmailIndependence();
testAllFourCombos();
testLiveActivityMapsBothPushKeys();
testEmailNestPreservesPushKeys();
testUiCatalog();
testChatMessagePrefsDefaultOnWithoutUiRow();
testStructuralWiring();

console.log("staff-prefs-selftest: ok");
