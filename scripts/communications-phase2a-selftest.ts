/**
 * Phase 2A — customer communication preference backend + category enforcement.
 * Run: pnpm communications-phase2a:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyEmailKind } from "../src/lib/communications/classification";
import { crmOptionalEmailDenied } from "../src/lib/communications/category-email-gate";
import { getCustomerCommunicationPreferences } from "../src/lib/communications/customer-preferences";
import { evaluateCommunicationPolicy } from "../src/lib/communications/policy";
import { memoryPreferenceAuditStore } from "../src/lib/communications/preference-audit";
import {
  resubscribeOptionalEmail,
  setCategoryEmailPreference,
  setGlobalOptionalEmailPreference,
  unsubscribeAllOptionalEmail,
  type PreferenceCommandContext,
  type PreferenceUserRecord,
  type PreferenceUserStore,
} from "../src/lib/communications/preference-commands";
import { memoryCommunicationPreferenceStore } from "../src/lib/communications/preference-store";
import { evaluateOptionalEmailSuppression } from "../src/lib/communications/send-enforcement";
import {
  applyEmailSuppression,
  lookupEmailSuppression,
  memoryEmailSuppressionStore,
} from "../src/lib/communications/suppression";
import { isPushTypeEnabled } from "../src/lib/notifications/catalog";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function memoryUserStore(
  users: PreferenceUserRecord[],
): PreferenceUserStore & { users: PreferenceUserRecord[] } {
  return {
    users,
    async findById(id) {
      return users.find((user) => user.id === id) ?? null;
    },
    async updateEmailAlertsEnabled(input) {
      const user = users.find((row) => row.id === input.userId);
      if (!user) throw new Error("missing user");
      user.emailAlertsEnabled = input.emailAlertsEnabled;
      if (input.caslConsentAt !== undefined) {
        user.caslConsentAt = input.caslConsentAt ?? null;
      }
      return { ...user };
    },
  };
}

function ctxFor(users: PreferenceUserRecord[]): PreferenceCommandContext & {
  preferenceStore: ReturnType<typeof memoryCommunicationPreferenceStore>;
  suppressionStore: ReturnType<typeof memoryEmailSuppressionStore>;
  auditStore: ReturnType<typeof memoryPreferenceAuditStore>;
} {
  const userStore = memoryUserStore(users);
  const preferenceStore = memoryCommunicationPreferenceStore();
  const suppressionStore = memoryEmailSuppressionStore();
  const auditStore = memoryPreferenceAuditStore();
  return {
    userStore,
    preferenceStore,
    suppressionStore,
    auditStore,
    async runCanonicalTransaction(work) {
      const usersSnap = userStore.users.map((row) => ({ ...row }));
      const suppressionSnap = suppressionStore.rows.map((row) => ({ ...row }));
      const auditSnap = auditStore.rows.map((row) => ({ ...row }));
      try {
        return await work({
          userStore,
          suppressionStore,
          auditStore,
        });
      } catch (error) {
        userStore.users.splice(0, userStore.users.length, ...usersSnap);
        suppressionStore.rows.splice(
          0,
          suppressionStore.rows.length,
          ...suppressionSnap,
        );
        auditStore.rows.splice(0, auditStore.rows.length, ...auditSnap);
        throw error;
      }
    },
  };
}

async function snapshotCanonical(
  ctx: ReturnType<typeof ctxFor>,
  userId: string,
) {
  const user = await ctx.userStore.findById(userId);
  const customer = ctx.suppressionStore.rows.filter(
    (row) =>
      row.scope === "CUSTOMER" &&
      row.identityKey === userId &&
      row.reason === "GLOBAL_UNSUBSCRIBE",
  );
  const mailbox = ctx.suppressionStore.rows.filter(
    (row) => row.scope === "MAILBOX",
  );
  return {
    emailAlertsEnabled: user?.emailAlertsEnabled ?? null,
    caslConsentAt: user?.caslConsentAt?.toISOString() ?? null,
    customerUnsubscribeCount: customer.length,
    mailboxReasons: mailbox.map((row) => row.reason).sort(),
    categoryOff: ctx.preferenceStore.rows
      .filter((row) => !row.enabled)
      .map((row) => row.category)
      .sort(),
    auditKinds: ctx.auditStore.rows.map((row) => row.kind),
  };
}

const userA: PreferenceUserRecord = {
  id: "user_a",
  email: "shared@example.com",
  workspaceId: "ws_a",
  emailAlertsEnabled: true,
  caslConsentAt: new Date(),
};

function watchPolicy(input: {
  category: "property_watch" | "area_watch";
  global: boolean;
  categoryEnabled?: boolean;
  monitor: boolean;
  email?: string | null;
}) {
  return evaluateCommunicationPolicy({
    class: "alert",
    category: input.category,
    channel: "email",
    email: input.email ?? "a@b.com",
    emailAlertsEnabled: input.global,
    entityEmailAlerts: input.monitor,
    categoryEnabled: input.categoryEnabled,
  });
}

function testDefaultsMatchLegacy() {
  const on = watchPolicy({
    category: "property_watch",
    global: true,
    monitor: true,
  });
  assert.equal(on.allowed, true);
  const globalOff = watchPolicy({
    category: "property_watch",
    global: false,
    monitor: true,
  });
  assert.equal(globalOff.allowed, false);
  assert.equal(globalOff.reason, "email_alerts_off");
}

function testPropertyWatchLayers() {
  assert.equal(
    watchPolicy({
      category: "property_watch",
      global: true,
      categoryEnabled: true,
      monitor: true,
    }).allowed,
    true,
  );
  assert.equal(
    watchPolicy({
      category: "property_watch",
      global: true,
      categoryEnabled: false,
      monitor: true,
    }).reason,
    "category_off",
  );
  assert.equal(
    watchPolicy({
      category: "property_watch",
      global: true,
      categoryEnabled: true,
      monitor: false,
    }).reason,
    "entity_alerts_off",
  );
  assert.equal(
    watchPolicy({
      category: "property_watch",
      global: false,
      categoryEnabled: true,
      monitor: true,
    }).reason,
    "email_alerts_off",
  );
}

function testAreaWatchLayers() {
  assert.equal(
    watchPolicy({
      category: "area_watch",
      global: true,
      categoryEnabled: true,
      monitor: true,
    }).allowed,
    true,
  );
  assert.equal(
    watchPolicy({
      category: "area_watch",
      global: true,
      categoryEnabled: false,
      monitor: true,
    }).allowed,
    false,
  );
  const area = read("src/lib/account/monitors.ts");
  assert.ok(area.includes("if (monitor.notifyNew)"));
  assert.ok(area.includes("if (monitor.notifySold)"));
  assert.ok(area.includes('watchCategory: "area_watch"'));
  assert.ok(!area.includes("prisma.areaMonitor.delete"));
}

function testBuyerDigestLayers() {
  const allowed = evaluateCommunicationPolicy({
    class: "alert",
    category: "buyer_digest",
    channel: "email",
    email: "buyer@example.com",
    emailAlertsEnabled: true,
    isBuyer: true,
    disabledAt: null,
    entityEmailAlerts: true,
    categoryEnabled: true,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "buyer_digest",
      channel: "email",
      email: "buyer@example.com",
      emailAlertsEnabled: true,
      isBuyer: true,
      disabledAt: null,
      entityEmailAlerts: true,
      categoryEnabled: false,
    }).reason,
    "category_off",
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "buyer_digest",
      channel: "email",
      email: "buyer@example.com",
      emailAlertsEnabled: true,
      isBuyer: true,
      disabledAt: null,
      entityEmailAlerts: false,
      categoryEnabled: true,
    }).reason,
    "entity_alerts_off",
  );
}

function testSellerReportLayers() {
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "seller_report",
      channel: "email",
      email: "seller@example.com",
      emailAlertsEnabled: true,
      categoryEnabled: false,
    }).reason,
    "category_off",
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "seller_report",
      channel: "email",
      email: "seller@example.com",
      emailAlertsEnabled: true,
    }).allowed,
    true,
  );
  const seller = read("src/lib/email/digests/seller.ts");
  assert.ok(seller.includes('isSeller: true'));
  assert.ok(seller.includes("emailAlertsEnabled: true"));
  assert.ok(seller.includes('loadCategoryEmailEnabled(user.id, "seller_report")'));
}

function testAgentCommunicationLayers() {
  assert.equal(
    evaluateCommunicationPolicy({
      class: "agent",
      category: "agent_communication",
      channel: "email",
      emailAlertsEnabled: true,
      categoryEnabled: true,
      contactConsentAt: new Date(),
      caslConsentAt: null,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "agent",
      category: "agent_communication",
      channel: "email",
      emailAlertsEnabled: true,
      categoryEnabled: false,
      contactConsentAt: new Date(),
    }).reason,
    "category_off",
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "agent",
      category: "agent_communication",
      channel: "email",
      emailAlertsEnabled: true,
      categoryEnabled: true,
      contactConsentAt: null,
      caslConsentAt: null,
    }).reason,
    "consent_required",
  );
  assert.equal(
    crmOptionalEmailDenied({
      contactConsentAt: null,
      caslConsentAt: null,
      emailAlertsEnabled: true,
      categoryEnabled: true,
    }),
    "consent",
  );
}

async function testCategoryMutationAndAudit() {
  const ctx = ctxFor([{ ...userA }]);
  const monitors = [{ id: "mon_1" }];
  const off = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "property_watch",
    channel: "email",
    enabled: false,
    source: "test",
  });
  assert.equal(off.ok, true);
  if (off.ok) {
    const row = off.preferences.categories.find(
      (item) => item.category === "property_watch",
    );
    assert.equal(row?.explicit, true);
    assert.equal(row?.enabled, false);
    assert.equal(row?.effective, false);
    assert.equal(row?.blockedReason, "category_off");
  }
  assert.equal(monitors.length, 1);
  const on = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "property_watch",
    channel: "email",
    enabled: true,
    source: "test",
  });
  assert.equal(on.ok, true);
  assert.equal(ctx.auditStore.rows.length, 2);
  assert.equal(ctx.auditStore.rows[0]?.kind, "preference_category_off");
  assert.equal(ctx.auditStore.rows[1]?.kind, "preference_category_on");
}

async function testIsolation() {
  const ctx = ctxFor([
    { ...userA },
    {
      id: "user_b",
      email: "shared@example.com",
      workspaceId: "ws_b",
      emailAlertsEnabled: true,
      caslConsentAt: new Date(),
    },
  ]);
  const mismatch = await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_b",
    category: "marketing",
    channel: "email",
    enabled: false,
    source: "test",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.error, "workspace_mismatch");

  const other = await setCategoryEmailPreference(ctx, {
    userId: "user_missing",
    workspaceId: "ws_a",
    category: "marketing",
    channel: "email",
    enabled: false,
    source: "test",
  });
  assert.equal(other.ok, false);
  if (!other.ok) assert.equal(other.error, "user_not_found");

  await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "marketing",
    channel: "email",
    enabled: false,
    source: "test",
  });
  const b = await getCustomerCommunicationPreferences({
    userId: "user_b",
    workspaceId: "ws_b",
    email: "shared@example.com",
    emailAlertsEnabled: true,
    preferenceStore: ctx.preferenceStore,
    suppressionStore: ctx.suppressionStore,
  });
  const marketingB = b.categories.find((item) => item.category === "marketing");
  assert.equal(marketingB?.explicit, false);
  assert.equal(marketingB?.enabled, true);
}

async function seedProtectedOptionalState(ctx: ReturnType<typeof ctxFor>) {
  await applyEmailSuppression(ctx.suppressionStore, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "shared@example.com",
    reason: "HARD_BOUNCE",
    source: "resend",
    providerId: "re_1",
    leadEmailLogId: null,
    meta: null,
  });
  await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "buyer_digest",
    channel: "email",
    enabled: false,
    source: "test",
  });
}

async function testAccountSettingsOffOn() {
  const ctx = ctxFor([{ ...userA }]);
  await seedProtectedOptionalState(ctx);

  const off = await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "account_preferences",
  });
  assert.equal(off.ok, true);
  const afterOff = await snapshotCanonical(ctx, "user_a");
  assert.equal(afterOff.emailAlertsEnabled, false);
  assert.equal(afterOff.customerUnsubscribeCount, 1);
  assert.equal(afterOff.mailboxReasons.join(), "HARD_BOUNCE");
  assert.deepEqual(afterOff.categoryOff, ["buyer_digest"]);
  assert.ok(afterOff.auditKinds.includes("preference_global_email_off"));
  const prefsRoute = read("src/app/api/account/preferences/route.ts");
  assert.ok(prefsRoute.includes("setGlobalOptionalEmailPreference"));
  assert.ok(prefsRoute.includes("logLeadActivityForCustomer"));
  assert.ok(prefsRoute.includes("Customer turned off email alerts"));
  assert.ok(prefsRoute.includes("Customer re-enabled email alerts"));
  assert.ok(!prefsRoute.includes("deactivateCustomerGlobalUnsubscribe"));
  const leadBeforeCanonical = prefsRoute.indexOf("setGlobalOptionalEmailPreference");
  const leadAfter = prefsRoute.indexOf("Customer turned off email alerts");
  assert.ok(leadBeforeCanonical < leadAfter);

  const on = await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: true,
    source: "account_preferences",
    caslConsentAt: userA.caslConsentAt,
  });
  assert.equal(on.ok, true);
  const afterOn = await snapshotCanonical(ctx, "user_a");
  assert.equal(afterOn.emailAlertsEnabled, true);
  assert.equal(afterOn.customerUnsubscribeCount, 0);
  assert.equal(afterOn.mailboxReasons.join(), "HARD_BOUNCE");
  assert.deepEqual(afterOn.categoryOff, ["buyer_digest"]);
  assert.ok(afterOn.auditKinds.includes("preference_global_email_off"));
  assert.ok(afterOn.auditKinds.includes("preference_global_email_on"));
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "property_watch",
      channel: "email",
      email: "shared@example.com",
      emailAlertsEnabled: true,
      entityEmailAlerts: false,
      categoryEnabled: true,
    }).reason,
    "entity_alerts_off",
  );
  assert.equal(
    evaluateCommunicationPolicy({
      class: "alert",
      category: "buyer_digest",
      channel: "email",
      email: "shared@example.com",
      emailAlertsEnabled: true,
      entityEmailAlerts: false,
      categoryEnabled: true,
      isBuyer: true,
      disabledAt: null,
    }).reason,
    "entity_alerts_off",
  );
}

async function testHelperMatchesAccountCanonicalState() {
  const account = ctxFor([{ ...userA }]);
  const helper = ctxFor([{ ...userA }]);
  await seedProtectedOptionalState(account);
  await seedProtectedOptionalState(helper);

  await setGlobalOptionalEmailPreference(account, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "account_preferences",
  });
  await unsubscribeAllOptionalEmail(helper, {
    userId: "user_a",
    workspaceId: "ws_a",
    source: "future_preference_center",
  });
  const accountOff = await snapshotCanonical(account, "user_a");
  const helperOff = await snapshotCanonical(helper, "user_a");
  assert.equal(accountOff.emailAlertsEnabled, helperOff.emailAlertsEnabled);
  assert.equal(
    accountOff.customerUnsubscribeCount,
    helperOff.customerUnsubscribeCount,
  );
  assert.deepEqual(accountOff.mailboxReasons, helperOff.mailboxReasons);
  assert.deepEqual(accountOff.categoryOff, helperOff.categoryOff);
  assert.deepEqual(accountOff.auditKinds, helperOff.auditKinds);

  await setGlobalOptionalEmailPreference(account, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: true,
    source: "account_preferences",
    caslConsentAt: userA.caslConsentAt,
  });
  await resubscribeOptionalEmail(helper, {
    userId: "user_a",
    workspaceId: "ws_a",
    source: "future_preference_center",
  });
  const accountOn = await snapshotCanonical(account, "user_a");
  const helperOn = await snapshotCanonical(helper, "user_a");
  assert.equal(accountOn.emailAlertsEnabled, helperOn.emailAlertsEnabled);
  assert.equal(
    accountOn.customerUnsubscribeCount,
    helperOn.customerUnsubscribeCount,
  );
  assert.deepEqual(accountOn.mailboxReasons, helperOn.mailboxReasons);
  assert.deepEqual(accountOn.categoryOff, helperOn.categoryOff);
  assert.deepEqual(accountOn.auditKinds, helperOn.auditKinds);
}

async function testHelperOnDoesNotInventCasl() {
  const ctx = ctxFor([
    {
      ...userA,
      caslConsentAt: null,
    },
  ]);
  await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "future_preference_center",
  });
  await resubscribeOptionalEmail(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    source: "future_preference_center",
  });
  const user = await ctx.userStore.findById("user_a");
  assert.equal(user?.caslConsentAt, null);
  assert.equal(user?.emailAlertsEnabled, true);
}

async function testCanonicalTransactionFailure() {
  const ctx = ctxFor([{ ...userA }]);
  const originalCreate = ctx.auditStore.create.bind(ctx.auditStore);
  const originalUpsert = ctx.suppressionStore.upsert.bind(ctx.suppressionStore);
  const originalDelete = ctx.suppressionStore.deleteByIdentity.bind(
    ctx.suppressionStore,
  );

  ctx.auditStore.create = async () => {
    throw new Error("forced audit failure");
  };
  await assert.rejects(
    () =>
      setGlobalOptionalEmailPreference(ctx, {
        userId: "user_a",
        workspaceId: "ws_a",
        enabled: false,
        source: "test",
      }),
    /forced audit failure/,
  );
  const afterAuditFail = await snapshotCanonical(ctx, "user_a");
  assert.equal(afterAuditFail.emailAlertsEnabled, true);
  assert.equal(afterAuditFail.customerUnsubscribeCount, 0);
  assert.equal(afterAuditFail.auditKinds.length, 0);
  ctx.auditStore.create = originalCreate;

  ctx.suppressionStore.upsert = async () => {
    throw new Error("forced suppression failure");
  };
  await assert.rejects(
    () =>
      setGlobalOptionalEmailPreference(ctx, {
        userId: "user_a",
        workspaceId: "ws_a",
        enabled: false,
        source: "test",
      }),
    /forced suppression failure/,
  );
  const after = await snapshotCanonical(ctx, "user_a");
  assert.equal(after.emailAlertsEnabled, true);
  assert.equal(after.customerUnsubscribeCount, 0);
  assert.equal(after.auditKinds.length, 0);
  ctx.suppressionStore.upsert = originalUpsert;

  await setGlobalOptionalEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "test",
  });
  ctx.suppressionStore.deleteByIdentity = async () => {
    throw new Error("forced delete failure");
  };
  await assert.rejects(
    () =>
      setGlobalOptionalEmailPreference(ctx, {
        userId: "user_a",
        workspaceId: "ws_a",
        enabled: true,
        source: "test",
      }),
    /forced delete failure/,
  );
  const afterOnFail = await snapshotCanonical(ctx, "user_a");
  assert.equal(afterOnFail.emailAlertsEnabled, false);
  assert.equal(afterOnFail.customerUnsubscribeCount, 1);
  ctx.suppressionStore.deleteByIdentity = originalDelete;
}

async function testContradictoryLegacyStateNotMutatedOnGet() {
  const onWithUnsub = ctxFor([{ ...userA }]);
  await applyEmailSuppression(onWithUnsub.suppressionStore, {
    workspaceId: "ws_a",
    userId: "user_a",
    emailNormalized: "shared@example.com",
    reason: "GLOBAL_UNSUBSCRIBE",
    source: "legacy",
    providerId: null,
    leadEmailLogId: null,
    meta: null,
  });
  const beforeOn = JSON.stringify({
    user: await onWithUnsub.userStore.findById("user_a"),
    suppression: onWithUnsub.suppressionStore.rows,
    prefs: onWithUnsub.preferenceStore.rows,
    audit: onWithUnsub.auditStore.rows,
  });
  const readOn = await getCustomerCommunicationPreferences({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "shared@example.com",
    emailAlertsEnabled: true,
    preferenceStore: onWithUnsub.preferenceStore,
    suppressionStore: onWithUnsub.suppressionStore,
  });
  assert.equal(readOn.globalEmailEnabled, true);
  assert.equal(readOn.customerUnsubscribed, true);
  assert.equal(readOn.optionalEmailEffective, false);
  assert.equal(
    readOn.optionalEmailMismatch,
    "global_on_with_customer_unsubscribe",
  );
  assert.equal(
    JSON.stringify({
      user: await onWithUnsub.userStore.findById("user_a"),
      suppression: onWithUnsub.suppressionStore.rows,
      prefs: onWithUnsub.preferenceStore.rows,
      audit: onWithUnsub.auditStore.rows,
    }),
    beforeOn,
  );

  const offNoRow = ctxFor([
    {
      ...userA,
      emailAlertsEnabled: false,
    },
  ]);
  const beforeOff = JSON.stringify({
    user: await offNoRow.userStore.findById("user_a"),
    suppression: offNoRow.suppressionStore.rows,
    prefs: offNoRow.preferenceStore.rows,
    audit: offNoRow.auditStore.rows,
  });
  const readOff = await getCustomerCommunicationPreferences({
    userId: "user_a",
    workspaceId: "ws_a",
    email: "shared@example.com",
    emailAlertsEnabled: false,
    preferenceStore: offNoRow.preferenceStore,
    suppressionStore: offNoRow.suppressionStore,
  });
  assert.equal(readOff.globalEmailEnabled, false);
  assert.equal(readOff.customerUnsubscribed, false);
  assert.equal(readOff.optionalEmailEffective, false);
  assert.equal(
    readOff.optionalEmailMismatch,
    "global_off_without_customer_unsubscribe",
  );
  assert.equal(
    JSON.stringify({
      user: await offNoRow.userStore.findById("user_a"),
      suppression: offNoRow.suppressionStore.rows,
      prefs: offNoRow.preferenceStore.rows,
      audit: offNoRow.auditStore.rows,
    }),
    beforeOff,
  );
}

async function testUnsubscribeResubscribeAndMailbox() {
  const ctx = ctxFor([{ ...userA }]);
  await seedProtectedOptionalState(ctx);

  const unsub = await unsubscribeAllOptionalEmail(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    source: "test",
  });
  assert.equal(unsub.ok, true);
  const user = await ctx.userStore.findById("user_a");
  assert.equal(user?.emailAlertsEnabled, false);
  const customer = await lookupEmailSuppression(ctx.suppressionStore, {
    workspaceId: "ws_a",
    email: "shared@example.com",
    userId: "user_a",
  });
  assert.equal(customer.status, "suppressed");
  assert.equal(customer.matchedScope, "MAILBOX");
  assert.equal(
    ctx.suppressionStore.rows.some(
      (row) => row.scope === "CUSTOMER" && row.reason === "GLOBAL_UNSUBSCRIBE",
    ),
    true,
  );
  assert.equal(ctx.preferenceStore.rows.length, 1);
  assert.equal(
    evaluateCommunicationPolicy({
      class: "transactional",
      category: "account_security",
      channel: "email",
      emailSuppressed: true,
      emailAlertsEnabled: false,
      categoryEnabled: false,
    }).reason,
    "transactional_exempt",
  );
  assert.equal(isPushTypeEnabled(null, "price_drop"), true);

  const resub = await resubscribeOptionalEmail(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    source: "test",
  });
  assert.equal(resub.ok, true);
  if (resub.ok) {
    assert.equal(resub.customerUnsubscribed, false);
    assert.equal(resub.mailboxStillSuppressed, true);
  }
  assert.equal((await ctx.userStore.findById("user_a"))?.emailAlertsEnabled, true);
  assert.equal(
    ctx.suppressionStore.rows.some((row) => row.scope === "CUSTOMER"),
    false,
  );
  assert.equal(
    ctx.suppressionStore.rows.find((row) => row.scope === "MAILBOX")?.reason,
    "HARD_BOUNCE",
  );
  const digest = ctx.preferenceStore.rows.find(
    (row) => row.category === "buyer_digest",
  );
  assert.equal(digest?.enabled, false);
  assert.equal(
    ctx.auditStore.rows.some((row) => row.kind === "preference_global_email_off"),
    true,
  );
  assert.equal(
    ctx.auditStore.rows.some((row) => row.kind === "preference_global_email_on"),
    true,
  );
}

function testPrismaUsesTransaction() {
  const source = read("src/lib/communications/prisma-preference-context.ts");
  assert.ok(source.includes("prisma.$transaction"));
  const commands = read("src/lib/communications/preference-commands.ts");
  assert.ok(commands.includes("runCanonicalTransaction"));
  assert.ok(
    /export async function unsubscribeAllOptionalEmail[\s\S]*setGlobalOptionalEmailPreference\(ctx/.test(
      commands,
    ),
  );
  assert.ok(
    /export async function resubscribeOptionalEmail[\s\S]*setGlobalOptionalEmailPreference\(ctx/.test(
      commands,
    ),
  );
}

async function testTransactionalSendGate() {
  const exploding = memoryEmailSuppressionStore();
  exploding.findByIdentity = async () => {
    throw new Error("should not lookup");
  };
  for (const kind of [
    "password_reset",
    "verify_email",
    "verify_email_nudge",
  ] as const) {
    const decision = await evaluateOptionalEmailSuppression({
      to: "a@b.com",
      kind,
      workspaceId: "ws_a",
      userId: "user_a",
      store: exploding,
    });
    assert.equal(classifyEmailKind(kind).class, "transactional");
    assert.equal(decision.blocked, false);
    assert.equal(decision.reason, "transactional_exempt");
  }
}

async function testCategoryOffBlocksOptionalSend() {
  const ctx = ctxFor([{ ...userA }]);
  await setCategoryEmailPreference(ctx, {
    userId: "user_a",
    workspaceId: "ws_a",
    category: "property_watch",
    channel: "email",
    enabled: false,
    source: "test",
  });
  const blocked = await evaluateOptionalEmailSuppression({
    to: "shared@example.com",
    kind: "price_reduction",
    workspaceId: "ws_a",
    userId: "user_a",
    store: ctx.suppressionStore,
    preferenceStore: ctx.preferenceStore,
  });
  assert.equal(blocked.blocked, true);
  assert.equal(blocked.reason, "category_off");
}

function testPushUnchanged() {
  assert.equal(isPushTypeEnabled({ price_drop: false }, "price_drop"), false);
  assert.equal(isPushTypeEnabled({}, "morning_digest"), true);
  const push = read("src/lib/notifications/push.ts");
  assert.ok(push.includes("isPushTypeEnabled"));
  const prefs = read("src/app/api/account/communication-preferences/route.ts");
  assert.ok(!prefs.includes("pushNotificationPrefs"));
}

function testSavedSearchAndMarketingHonest() {
  const source = read("src/lib/communications/customer-preferences.ts");
  assert.ok(source.includes('savedSearchEmailSender: "none"'));
  assert.ok(source.includes('marketingEmailSender: "none"'));
  assert.ok(!read("src/lib/email/templates.ts").includes("kind: \"saved_search\""));
}

function testNoPhase2bUi() {
  const layout = read("src/lib/email/layout.ts");
  assert.ok(layout.includes("emailLayout"));
  const api = read("src/app/api/account/communication-preferences/route.ts");
  assert.ok(!api.includes("token"));
  assert.ok(!api.includes("List-Unsubscribe"));
}

async function main() {
  testDefaultsMatchLegacy();
  testPropertyWatchLayers();
  testAreaWatchLayers();
  testBuyerDigestLayers();
  testSellerReportLayers();
  testAgentCommunicationLayers();
  await testCategoryMutationAndAudit();
  await testIsolation();
  await testAccountSettingsOffOn();
  await testHelperMatchesAccountCanonicalState();
  await testHelperOnDoesNotInventCasl();
  await testCanonicalTransactionFailure();
  await testContradictoryLegacyStateNotMutatedOnGet();
  await testUnsubscribeResubscribeAndMailbox();
  testPrismaUsesTransaction();
  await testTransactionalSendGate();
  await testCategoryOffBlocksOptionalSend();
  testPushUnchanged();
  testSavedSearchAndMarketingHonest();
  testNoPhase2bUi();
  console.log("communications-phase2a-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
