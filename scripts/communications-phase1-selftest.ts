/**
 * Phase 1 communication preference / suppression foundation.
 * Run: pnpm communications-phase1:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyEmailKind } from "../src/lib/communications/classification";
import {
  legacyBuyerDigestPrimaryEligible,
  legacyBuyerDigestUserEligible,
  legacyCrmEmailEligible,
  legacyWatchEmailEligible,
} from "../src/lib/communications/legacy-eligibility";
import { evaluateCommunicationPolicy } from "../src/lib/communications/policy";
import {
  buildPreferenceAuditRecord,
  memoryPreferenceAuditStore,
  recordCommunicationPreferenceEvent,
} from "../src/lib/communications/preference-audit";
import {
  applyResendSuppressionEvent,
  classifyResendDeliveryEvent,
} from "../src/lib/communications/resend-delivery";
import { handleResendSuppressionWebhook } from "../src/lib/communications/resend-webhook-suppression";
import { evaluateOptionalEmailSuppression } from "../src/lib/communications/send-enforcement";
import {
  applyEmailSuppression,
  findActiveEmailSuppression,
  lookupEmailSuppression,
  memoryEmailSuppressionStore,
  type EmailSuppressionStore,
} from "../src/lib/communications/suppression";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function testLegacyWatchEquivalence() {
  const cases = [
    { email: "a@b.com", emailAlertsEnabled: true, monitorEmailAlerts: true },
    { email: "a@b.com", emailAlertsEnabled: false, monitorEmailAlerts: true },
    { email: "a@b.com", emailAlertsEnabled: true, monitorEmailAlerts: false },
    { email: null, emailAlertsEnabled: true, monitorEmailAlerts: true },
  ];
  for (const input of cases) {
    const legacy = legacyWatchEmailEligible(input);
    const policy = evaluateCommunicationPolicy({
      class: "alert",
      category: "property_watch",
      channel: "email",
      email: input.email,
      emailAlertsEnabled: input.emailAlertsEnabled,
      entityEmailAlerts: input.monitorEmailAlerts,
    });
    assert.equal(policy.allowed, legacy, JSON.stringify(input));
  }
}

function testLegacyAreaWatchEquivalence() {
  const allowed = evaluateCommunicationPolicy({
    class: "alert",
    category: "area_watch",
    channel: "email",
    email: "a@b.com",
    emailAlertsEnabled: true,
    entityEmailAlerts: true,
  });
  assert.equal(allowed.allowed, true);
  const off = evaluateCommunicationPolicy({
    class: "alert",
    category: "area_watch",
    channel: "email",
    email: "a@b.com",
    emailAlertsEnabled: true,
    entityEmailAlerts: false,
  });
  assert.equal(off.allowed, legacyWatchEmailEligible({
    email: "a@b.com",
    emailAlertsEnabled: true,
    monitorEmailAlerts: false,
  }));
}

function testLegacyBuyerDigestEquivalence() {
  const user = {
    isBuyer: true,
    emailAlertsEnabled: true,
    disabledAt: null,
    email: "buyer@example.com",
  };
  assert.equal(legacyBuyerDigestUserEligible(user), true);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "buyer_digest",
      channel: "email",
      ...user,
      entityEmailAlerts: true,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "buyer_digest",
      channel: "email",
      ...user,
      entityEmailAlerts: false,
    }).allowed,
    legacyBuyerDigestPrimaryEligible({ primaryEmailAlerts: false }),
  );
}

function testLegacyCrmEquivalence() {
  const consented = {
    contactConsentAt: new Date(),
    caslConsentAt: null as Date | null,
    emailAlertsEnabled: true,
  };
  assert.equal(legacyCrmEmailEligible(consented), true);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "agent",
      category: "agent_communication",
      channel: "email",
      ...consented,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "agent",
      category: "agent_communication",
      channel: "email",
      contactConsentAt: null,
      caslConsentAt: null,
      emailAlertsEnabled: true,
    }).allowed,
    false,
  );
}

function testPushPrefsUnchanged() {
  assert.equal(isPushTypeEnabled(null, "price_drop"), true);
  assert.equal(isPushTypeEnabled({ price_drop: false }, "price_drop"), false);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "property_watch",
      channel: "push",
      pushPrefs: { price_drop: false },
      pushType: "price_drop",
    }).allowed,
    false,
  );
}

function testMissingCategoryKeepsCurrentBehavior() {
  const decision = evaluateCommunicationPolicy({
    class: "alert",
    category: "property_watch",
    channel: "email",
    email: "a@b.com",
    emailAlertsEnabled: true,
    entityEmailAlerts: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "property_watch",
      channel: "email",
      email: "a@b.com",
      emailAlertsEnabled: true,
      entityEmailAlerts: true,
      categoryEnabled: false,
    }).allowed,
    false,
  );
}

function testTransactionalExemption() {
  const suppressed = evaluateCommunicationPolicy({
    class: "transactional",
    category: "account_security",
    channel: "email",
    email: "a@b.com",
    emailSuppressed: true,
    emailAlertsEnabled: false,
  });
  assert.equal(suppressed.allowed, true);
  assert.equal(suppressed.reason, "transactional_exempt");

  const alert = evaluateCommunicationPolicy({
    class: "alert",
    category: "property_watch",
    channel: "email",
    email: "a@b.com",
    emailAlertsEnabled: true,
    entityEmailAlerts: true,
    emailSuppressed: true,
  });
  assert.equal(alert.allowed, false);
  assert.equal(alert.reason, "email_suppressed");

  const marketing = evaluateCommunicationPolicy({
    class: "marketing",
    category: "marketing",
    channel: "email",
    email: "a@b.com",
    emailSuppressed: true,
  });
  assert.equal(marketing.allowed, false);
}

async function testHardBounceAndReplay() {
  const suppression = memoryEmailSuppressionStore();
  const audit = memoryPreferenceAuditStore();
  const event = {
    type: "email.bounced",
    data: {
      email_id: "re_1",
      to: ["buyer@example.com"],
      bounce: { type: "Permanent", subType: "General", message: "550" },
    },
  };
  const first = await applyResendSuppressionEvent({
    event,
    webhookEventId: "svix_1",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_1",
    },
    suppressionStore: suppression,
    auditStore: audit,
  });
  assert.equal(first.suppressed, true);
  assert.equal(first.audited, true);
  assert.equal(suppression.rows.length, 1);

  const replay = await applyResendSuppressionEvent({
    event,
    webhookEventId: "svix_1",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_1",
    },
    suppressionStore: suppression,
    auditStore: audit,
  });
  assert.equal(replay.suppressed, true);
  assert.equal(replay.audited, false);
  assert.equal(audit.rows.length, 1);
}

async function testComplaintAndReplay() {
  const suppression = memoryEmailSuppressionStore();
  const audit = memoryPreferenceAuditStore();
  const event = {
    type: "email.complained",
    data: { email_id: "re_2", to: ["buyer@example.com"] },
  };
  const first = await applyResendSuppressionEvent({
    event,
    webhookEventId: "svix_2",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_2",
    },
    suppressionStore: suppression,
    auditStore: audit,
  });
  const replay = await applyResendSuppressionEvent({
    event,
    webhookEventId: "svix_2",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_2",
    },
    suppressionStore: suppression,
    auditStore: audit,
  });
  assert.equal(first.audited, true);
  assert.equal(replay.audited, false);
  assert.equal(suppression.rows[0]?.reason, "COMPLAINT");
}

function testTransientDoesNotSuppress() {
  assert.deepEqual(
    classifyResendDeliveryEvent({
      type: "email.bounced",
      data: { bounce: { type: "Temporary" } },
    }),
    { action: "ignore", why: "temporary_bounce" },
  );
  assert.deepEqual(
    classifyResendDeliveryEvent({ type: "email.failed" }),
    { action: "ignore", why: "send_failure" },
  );
  assert.deepEqual(
    classifyResendDeliveryEvent({ type: "email.delivery_delayed" }),
    { action: "ignore", why: "delivery_delayed" },
  );
}

async function testWorkspaceIsolationAndEmailChange() {
  const store = memoryEmailSuppressionStore();
  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_1",
    emailNormalized: "buyer@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "re_1",
    leadEmailLogId: "log_1",
    meta: null,
  });
  assert.equal(
    (
      await findActiveEmailSuppression(store, {
        workspaceId: "ws_b",
        email: "buyer@example.com",
      })
    ) == null,
    true,
  );
  assert.equal(
    (
      await findActiveEmailSuppression(store, {
        workspaceId: "ws_a",
        email: "new@example.com",
      })
    ) == null,
    true,
  );
  assert.equal(
    (
      await findActiveEmailSuppression(store, {
        workspaceId: "ws_a",
        email: "Buyer@Example.com",
      })
    )?.emailNormalized,
    "buyer@example.com",
  );
}

async function testWebhookDoesNotLookupByEmail() {
  const db = {
    async findByProviderId() {
      return null;
    },
  };
  const result = await handleResendSuppressionWebhook({
    event: {
      type: "email.bounced",
      data: {
        email_id: "missing",
        to: ["stranger@example.com"],
        bounce: { type: "Permanent" },
      },
    },
    webhookEventId: "svix_missing",
    db,
  });
  assert.equal(result.suppressed, false);
  assert.equal(result.handled, true);
}

async function testAuditPrimitive() {
  const store = memoryPreferenceAuditStore();
  const record = buildPreferenceAuditRecord({
    workspaceId: "ws_a",
    userId: "user_1",
    kind: "preference_change",
    category: "property_watch",
    channel: "email",
    previousState: { enabled: true },
    resultingState: { enabled: false },
    source: "test",
    providerEventId: "evt_1",
  });
  const first = await recordCommunicationPreferenceEvent(store, record);
  const replay = await recordCommunicationPreferenceEvent(store, record);
  assert.equal(first.created, true);
  assert.equal(replay.created, false);
  assert.equal(store.rows.length, 1);
  assert.deepEqual(store.rows[0]?.previousState, { enabled: true });
  assert.deepEqual(store.rows[0]?.resultingState, { enabled: false });
}

function explodingSuppressionStore(): EmailSuppressionStore {
  return {
    async findByIdentity() {
      throw new Error("suppression db unavailable");
    },
    async upsert() {
      throw new Error("suppression db unavailable");
    },
  };
}

async function testSendEnforcementTransactional() {
  const blocked = await evaluateOptionalEmailSuppression({
    to: "a@b.com",
    kind: "password_reset",
    workspaceId: "ws_a",
    store: explodingSuppressionStore(),
  });
  assert.equal(blocked.blocked, false);
  assert.equal(blocked.reason, "transactional_exempt");
  assert.equal(blocked.lookupStatus, "not_applicable");
}

function testClassifierKnownAndUnknown() {
  assert.equal(classifyEmailKind("password_reset").class, "transactional");
  assert.equal(classifyEmailKind("verify_email").class, "transactional");
  assert.equal(classifyEmailKind("verify_email_nudge").class, "transactional");
  assert.equal(classifyEmailKind("price_reduction").class, "alert");
  assert.equal(classifyEmailKind("property_update").class, "alert");
  assert.equal(classifyEmailKind("agent_message").class, "agent");
  assert.equal(classifyEmailKind("shortlist").class, "agent");
  assert.equal(classifyEmailKind("cma_share").class, "agent");
  assert.equal(classifyEmailKind("team_invite").class, "internal");
  assert.equal(classifyEmailKind("staff_contact_updated").class, "internal");
  const unknown = classifyEmailKind("future_customer_kind_xyz");
  assert.equal(unknown.class, "unclassified");
  assert.notEqual(unknown.class, "transactional");
}

async function testUnknownKindLegacySendCompat() {
  const decision = await evaluateOptionalEmailSuppression({
    to: "a@b.com",
    kind: "future_customer_kind_xyz",
    workspaceId: "ws_a",
    store: explodingSuppressionStore(),
  });
  assert.equal(classifyEmailKind("future_customer_kind_xyz").class, "unclassified");
  assert.equal(decision.blocked, false);
  assert.equal(decision.reason, "legacy_unclassified_compat");
  assert.equal(decision.lookupStatus, "not_applicable");

  const policy = evaluateCommunicationPolicy({
    class: "unclassified",
    category: "unclassified",
    channel: "email",
    email: "a@b.com",
  });
  assert.equal(policy.allowed, true);
  assert.equal(policy.reason, "unclassified_legacy");
  assert.notEqual(policy.reason, "transactional_exempt");
}

async function testSharedEmailMailboxVsCustomer() {
  const store = memoryEmailSuppressionStore();
  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "shared@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "re_bounce",
    leadEmailLogId: "log_a",
    meta: { bounce: { type: "Permanent" } },
  });
  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "shared@example.com",
    reason: "GLOBAL_UNSUBSCRIBE",
    source: "preference",
    providerId: null,
    leadEmailLogId: null,
    meta: null,
  });

  const bounceForB = await lookupEmailSuppression(store, {
    workspaceId: "ws_a",
    email: "shared@example.com",
    userId: "user_b",
  });
  assert.equal(bounceForB.status, "suppressed");
  assert.equal(bounceForB.matchedScope, "MAILBOX");
  assert.equal(bounceForB.record?.reason, "HARD_BOUNCE");

  const storePrefsOnly = memoryEmailSuppressionStore();
  await applyEmailSuppression(storePrefsOnly, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "shared@example.com",
    reason: "GLOBAL_UNSUBSCRIBE",
    source: "preference",
    providerId: null,
    leadEmailLogId: null,
    meta: null,
  });
  const a = await lookupEmailSuppression(storePrefsOnly, {
    workspaceId: "ws_a",
    email: "shared@example.com",
    userId: "user_a",
  });
  const b = await lookupEmailSuppression(storePrefsOnly, {
    workspaceId: "ws_a",
    email: "shared@example.com",
    userId: "user_b",
  });
  assert.equal(a.status, "suppressed");
  assert.equal(a.matchedScope, "CUSTOMER");
  assert.equal(b.status, "not_suppressed");
  assert.equal(storePrefsOnly.rows.length, 1);
  assert.equal(storePrefsOnly.rows[0]?.identityKey, "user_a");
}

async function testEmailChangeKeepsHistoricalSuppression() {
  const store = memoryEmailSuppressionStore();
  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_1",
    emailNormalized: "old@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "re_old",
    leadEmailLogId: "log_old",
    meta: null,
  });
  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_1",
    emailNormalized: "old@example.com",
    reason: "GLOBAL_UNSUBSCRIBE",
    source: "preference",
    providerId: null,
    leadEmailLogId: null,
    meta: null,
  });
  assert.equal(store.rows.length, 2);
  assert.equal(
    (
      await findActiveEmailSuppression(store, {
        workspaceId: "ws_a",
        email: "old@example.com",
      })
    )?.reason,
    "HARD_BOUNCE",
  );
  assert.equal(
    await findActiveEmailSuppression(store, {
      workspaceId: "ws_a",
      email: "new@example.com",
    }),
    null,
  );
  const customerAfterChange = await lookupEmailSuppression(store, {
    workspaceId: "ws_a",
    email: "new@example.com",
    userId: "user_1",
  });
  assert.equal(customerAfterChange.status, "suppressed");
  assert.equal(customerAfterChange.matchedScope, "CUSTOMER");
  assert.equal(
    store.rows.find((row) => row.scope === "MAILBOX")?.emailNormalized,
    "old@example.com",
  );
}

async function testSuppressionLookupTriState() {
  const store = memoryEmailSuppressionStore();
  const clear = await lookupEmailSuppression(store, {
    workspaceId: "ws_a",
    email: "clear@example.com",
    userId: "user_1",
  });
  assert.equal(clear.status, "not_suppressed");
  assert.equal(clear.record, null);

  await applyEmailSuppression(store, {
    workspaceId: "ws_a",
    userId: "user_1",
    emailNormalized: "hit@example.com",
    reason: "COMPLAINT",
    source: "resend",
    providerId: "re_c",
    leadEmailLogId: null,
    meta: null,
  });
  const hit = await lookupEmailSuppression(store, {
    workspaceId: "ws_a",
    email: "hit@example.com",
    userId: "user_1",
  });
  assert.equal(hit.status, "suppressed");

  const unavailable = await lookupEmailSuppression(explodingSuppressionStore(), {
    workspaceId: "ws_a",
    email: "x@example.com",
    userId: "user_1",
  });
  assert.equal(unavailable.status, "unavailable");
  assert.ok(unavailable.error);

  const policyUnavailable = evaluateCommunicationPolicy({
    class: "alert",
    category: "property_watch",
    channel: "email",
    email: "x@example.com",
    emailAlertsEnabled: true,
    entityEmailAlerts: true,
    emailSuppressionLookup: "unavailable",
  });
  assert.equal(policyUnavailable.allowed, true);
  assert.equal(policyUnavailable.reason, "suppression_lookup_unavailable");
  assert.equal(policyUnavailable.suppressionLookup, "unavailable");

  const sendUnavailable = await evaluateOptionalEmailSuppression({
    to: "x@example.com",
    kind: "price_reduction",
    workspaceId: "ws_a",
    userId: "user_1",
    store: explodingSuppressionStore(),
  });
  assert.equal(sendUnavailable.blocked, false);
  assert.equal(sendUnavailable.reason, "lookup_failed");
  assert.equal(sendUnavailable.lookupStatus, "unavailable");

  const sendClear = await evaluateOptionalEmailSuppression({
    to: "clear@example.com",
    kind: "price_reduction",
    workspaceId: "ws_a",
    userId: "user_1",
    store,
  });
  assert.equal(sendClear.blocked, false);
  assert.equal(sendClear.lookupStatus, "not_suppressed");
}

async function testSuppressionReasonPrecedence() {
  const store = memoryEmailSuppressionStore();
  const audit = memoryPreferenceAuditStore();
  const bounce = {
    type: "email.bounced",
    data: {
      email_id: "re_prec_1",
      to: ["buyer@example.com"],
      bounce: { type: "Permanent", subType: "General", message: "550" },
    },
  };
  await applyResendSuppressionEvent({
    event: bounce,
    webhookEventId: "svix_prec_1",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_prec_1",
    },
    suppressionStore: store,
    auditStore: audit,
  });
  await applyResendSuppressionEvent({
    event: {
      type: "email.complained",
      data: { email_id: "re_prec_2", to: ["buyer@example.com"] },
    },
    webhookEventId: "svix_prec_2",
    context: {
      workspaceId: "ws_a",
      userId: "user_1",
      leadId: "lead_1",
      emailNormalized: "buyer@example.com",
      leadEmailLogId: "log_prec_2",
    },
    suppressionStore: store,
    auditStore: audit,
  });
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0]?.reason, "HARD_BOUNCE");
  assert.deepEqual(store.rows[0]?.meta?.reasonHistory, [
    "HARD_BOUNCE",
    "COMPLAINT",
  ]);
  assert.equal(audit.rows.length, 2);
  assert.equal(audit.rows[1]?.kind, "suppression_complaint");
  assert.equal(
    (audit.rows[1]?.resultingState as { currentReason?: string } | null)
      ?.currentReason,
    "HARD_BOUNCE",
  );
}

function testPermanentBounceClassification() {
  assert.deepEqual(
    classifyResendDeliveryEvent({
      type: "email.bounced",
      data: {
        email_id: "re_p",
        to: ["buyer@example.com"],
        bounce: { type: "Permanent", subType: "General", message: "550" },
      },
    }),
    { action: "suppress", reason: "HARD_BOUNCE" },
  );
  assert.deepEqual(
    classifyResendDeliveryEvent({
      type: "email.complained",
      data: { email_id: "re_c", to: ["buyer@example.com"] },
    }),
    { action: "suppress", reason: "COMPLAINT" },
  );
}

function testWiringPreservesOpenClickAndDoesNotRewritePush() {
  const webhook = read("src/lib/email/resend-webhook.ts");
  assert.ok(webhook.includes("email.opened"));
  assert.ok(webhook.includes("email.clicked"));
  assert.ok(webhook.includes("verifyCustomerEmailFromLeadEmailOpen"));
  assert.ok(webhook.includes("handleResendSuppressionWebhook"));
  const send = read("src/lib/email/send.ts");
  assert.ok(!send.includes("evaluateOptionalEmailSuppression"));
  const push = read("src/lib/notifications/push.ts");
  assert.ok(push.includes("isPushTypeEnabled"));
  const client = read("src/lib/email/client-send.ts");
  assert.ok(client.includes("evaluateOptionalEmailSuppression"));
}

async function main() {
  testLegacyWatchEquivalence();
  testLegacyAreaWatchEquivalence();
  testLegacyBuyerDigestEquivalence();
  testLegacyCrmEquivalence();
  testPushPrefsUnchanged();
  testMissingCategoryKeepsCurrentBehavior();
  testTransactionalExemption();
  await testHardBounceAndReplay();
  await testComplaintAndReplay();
  testTransientDoesNotSuppress();
  await testWorkspaceIsolationAndEmailChange();
  await testWebhookDoesNotLookupByEmail();
  await testAuditPrimitive();
  await testSendEnforcementTransactional();
  testClassifierKnownAndUnknown();
  await testUnknownKindLegacySendCompat();
  await testSharedEmailMailboxVsCustomer();
  await testEmailChangeKeepsHistoricalSuppression();
  await testSuppressionLookupTriState();
  await testSuppressionReasonPrecedence();
  testPermanentBounceClassification();
  testWiringPreservesOpenClickAndDoesNotRewritePush();
  console.log("communications-phase1-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
