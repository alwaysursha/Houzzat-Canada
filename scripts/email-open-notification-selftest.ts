/**
 * Email open / click staff notification classification selftest.
 * Run: pnpm email-open-notification:selftest
 *
 * Hermetic. No DB. No push. No real emails.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  emailClickNotificationCopy,
  emailOpenNotificationCopy,
  shouldNotifyAgentOnEmailOpen,
} from "../src/lib/email/email-open-notification";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";
import {
  isStaffCategoryPushEnabled,
  mergeStaffCategoryPrefs,
  staffCategoriesForUi,
} from "../src/lib/notifications/staff-categories";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testManualAgentEmailOpen() {
  const copy = emailOpenNotificationCopy({
    kind: "agent_message",
    subject: "Hi there",
    leadName: "Ada Lovelace",
    propertyAddress: "1020 Ewart Street, Innisfil", // must be ignored for manual mail
  });
  assert.equal(copy.title, "Email Opened");
  assert.equal(copy.body, "Ada Lovelace opened your email: Hi there");
  assert.equal(copy.pushType, "email_engagement");
  assert.equal(copy.body.includes("Ewart"), false);
}

function testPropertyAlertOpen() {
  const copy = emailOpenNotificationCopy({
    kind: "price_reduction",
    subject: "Price reduced · 127 Spadina Road E",
    leadName: "Ada Lovelace",
    propertyAddress: "127 Spadina Road E, Kitchener",
  });
  assert.equal(copy.title, "Property Alert Opened");
  assert.ok(copy.body.includes("127 Spadina Road E, Kitchener"));
  assert.equal(copy.pushType, "alert_engagement");
}

function testPropertyAlertWithoutMlsUsesSubject() {
  const copy = emailOpenNotificationCopy({
    kind: "just_listed",
    subject: "Just listed in Kernighan, Hamilton",
    leadName: "Ada",
    propertyAddress: null,
  });
  assert.equal(copy.title, "Property Alert Opened");
  assert.ok(copy.body.includes("Just listed in Kernighan, Hamilton"));
}

function testDigestOpenWording() {
  const copy = emailOpenNotificationCopy({
    kind: "saved_search_digest",
    subject: "New listing alert · 1020 Ewart Street, Innisfil, ON L0L 1C0",
    leadName: "Ada Lovelace",
  });
  assert.equal(copy.title, "Morning Digest Opened");
  assert.ok(copy.body.includes("1020 Ewart Street"));
  assert.equal(copy.pushType, "alert_engagement");
}

function testManualWithUnrelatedAddressIgnored() {
  const copy = emailOpenNotificationCopy({
    kind: "agent_message",
    subject: "Following up",
    leadName: "Bo",
    propertyAddress: "999 Unrelated Ave",
  });
  assert.equal(copy.title, "Email Opened");
  assert.equal(copy.body.includes("999 Unrelated"), false);
}

function testUnknownKindFallback() {
  assert.equal(shouldNotifyAgentOnEmailOpen("welcome"), false);
  assert.equal(shouldNotifyAgentOnEmailOpen("password_reset"), false);
  assert.equal(shouldNotifyAgentOnEmailOpen(null), false);
  assert.equal(shouldNotifyAgentOnEmailOpen("agent_message"), true);

  // If somehow notified for unknown kind, copy stays neutral.
  const copy = emailOpenNotificationCopy({
    kind: "some_future_kind",
    subject: "Hello",
    leadName: null,
  });
  assert.equal(copy.title, "Email Opened");
  assert.equal(copy.body, "Your lead opened your email: Hello");
  assert.equal(copy.pushType, "email_engagement");
}

function testClickOnlyForPropertyAlerts() {
  assert.equal(
    emailClickNotificationCopy({
      kind: "agent_message",
      subject: "Hi",
      leadName: "Ada",
    }),
    null,
  );
  const click = emailClickNotificationCopy({
    kind: "sold_alert",
    subject: "Sold · 1 Main St",
    leadName: "Ada",
    propertyAddress: "1 Main St",
  });
  assert.ok(click);
  assert.equal(click!.title, "Property Alert Clicked");
  assert.equal(click!.pushType, "alert_engagement");
}

function testWebhookWiring() {
  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("emailOpenNotificationCopy"));
  assert.ok(webhook.includes("shouldNotifyAgentOnEmailOpen"));
  assert.ok(webhook.includes("maybeNotifyFirstOpen"));
  assert.ok(webhook.includes("email_engagement"));
  assert.ok(webhook.includes("propertyAddressForEmailMls"));
  // Must not hardcode property-alert title for every open.
  assert.equal(
    webhook.includes('title: "Property alert opened"'),
    false,
  );
  // Duplicate push prevention remains first-open gated.
  assert.ok(webhook.includes("const isFirstOpen = !log.openedAt"));
  assert.ok(webhook.includes("authorizeStaffRecipientForLead"));
  assert.ok(webhook.includes("assignedAgentId"));
}

function testCatalogAndPrefs() {
  const catalog = read("src/lib/notifications/catalog.ts");
  const categories = read("src/lib/notifications/staff-categories.ts");
  assert.ok(catalog.includes('"email_engagement"'));
  assert.ok(catalog.includes('id: "email_engagement"'));
  assert.ok(categories.includes('"email_engagement"'));
  assert.ok(categories.includes("alert_engagement"));
}

/**
 * Legacy Engagement opt-out: alert_engagement=false, email_engagement missing.
 * Delivery + category UI must both stay OFF (no CRM email-open push).
 */
function testLegacyEngagementOptOutInheritance() {
  const legacyOff = { alert_engagement: false };
  assert.equal(isPushTypeEnabled(legacyOff, "email_engagement"), false);
  assert.equal(isPushTypeEnabled(legacyOff, "alert_engagement"), false);
  assert.equal(isStaffCategoryPushEnabled(legacyOff, "engagement"), false);
  assert.equal(
    staffCategoriesForUi(legacyOff).find((r) => r.id === "engagement")
      ?.pushEnabled,
    false,
  );

  // Missing email_engagement with alert ON (or absent) → permitted.
  const legacyOn = { alert_engagement: true };
  assert.equal(isPushTypeEnabled(legacyOn, "email_engagement"), true);
  assert.equal(isPushTypeEnabled({}, "email_engagement"), true);
  assert.equal(isStaffCategoryPushEnabled(legacyOn, "engagement"), true);
  assert.equal(isStaffCategoryPushEnabled({}, "engagement"), true);

  // Explicit email_engagement=false always off.
  assert.equal(
    isPushTypeEnabled(
      { alert_engagement: true, email_engagement: false },
      "email_engagement",
    ),
    false,
  );
  assert.equal(
    isPushTypeEnabled({ email_engagement: false }, "email_engagement"),
    false,
  );

  // Explicit email_engagement=true only when Engagement partner allows.
  assert.equal(
    isPushTypeEnabled(
      { alert_engagement: true, email_engagement: true },
      "email_engagement",
    ),
    true,
  );
  assert.equal(
    isPushTypeEnabled(
      { alert_engagement: false, email_engagement: true },
      "email_engagement",
    ),
    false,
    "category partner opt-out must block even explicit email_engagement=true",
  );
  assert.equal(
    isStaffCategoryPushEnabled(
      { alert_engagement: false, email_engagement: true },
      "engagement",
    ),
    false,
  );

  // Property-alert path unchanged: alert_engagement alone still controls alerts.
  assert.equal(
    isPushTypeEnabled({ alert_engagement: true }, "alert_engagement"),
    true,
  );
  assert.equal(
    isPushTypeEnabled({ alert_engagement: false }, "alert_engagement"),
    false,
  );
  // email_engagement=false must not flip alert_engagement off by itself.
  assert.equal(
    isPushTypeEnabled(
      { alert_engagement: true, email_engagement: false },
      "alert_engagement",
    ),
    true,
  );

  // Unrelated types keep missing=ON / explicit=false semantics.
  assert.equal(isPushTypeEnabled(legacyOff, "new_lead"), true);
  assert.equal(isPushTypeEnabled(legacyOff, "chat_message"), true);
  assert.equal(
    isPushTypeEnabled({ ...legacyOff, new_lead: false }, "new_lead"),
    false,
  );
  assert.equal(isPushTypeEnabled({ task_due: false }, "task_due"), false);
  assert.equal(isPushTypeEnabled({ task_due: false }, "email_engagement"), true);

  // Category toggle still writes both keys; UI matches delivery.
  let prefs: unknown = { alert_engagement: false };
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "engagement",
    channel: "push",
    enabled: true,
  });
  assert.equal(isPushTypeEnabled(prefs, "email_engagement"), true);
  assert.equal(isPushTypeEnabled(prefs, "alert_engagement"), true);
  assert.equal(isStaffCategoryPushEnabled(prefs, "engagement"), true);
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "engagement",
    channel: "push",
    enabled: false,
  });
  assert.equal(isPushTypeEnabled(prefs, "email_engagement"), false);
  assert.equal(isPushTypeEnabled(prefs, "alert_engagement"), false);
  assert.equal(isStaffCategoryPushEnabled(prefs, "engagement"), false);
}

function testWebhookWiringPreservesAuthGate() {
  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("authorizeStaffRecipientForLead"));
  assert.ok(webhook.includes("assignedAgentId"));
  // Delivery still goes through sendPushToUser → isPushTypeEnabled.
  assert.ok(webhook.includes("sendPushToUser"));
}

function main() {
  testManualAgentEmailOpen();
  testPropertyAlertOpen();
  testPropertyAlertWithoutMlsUsesSubject();
  testDigestOpenWording();
  testManualWithUnrelatedAddressIgnored();
  testUnknownKindFallback();
  testClickOnlyForPropertyAlerts();
  testWebhookWiring();
  testCatalogAndPrefs();
  testLegacyEngagementOptOutInheritance();
  testWebhookWiringPreservesAuthGate();
  console.log("email-open-notification-selftest: ok");
}

main();
