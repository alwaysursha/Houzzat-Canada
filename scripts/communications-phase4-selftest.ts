/**
 * Phase 4 — assigned-agent awareness (hermetic).
 * Run: pnpm communications-phase4:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  deleteOwnedAreaMonitor,
  memoryAreaMonitorSettingsStore,
} from "../src/lib/account/area-monitor-settings";
import {
  deleteOwnedPropertyMonitor,
  memoryPropertyMonitorSettingsStore,
  type PropertyMonitorSettingsRow,
} from "../src/lib/account/property-monitor-settings";
import {
  deleteOwnedSavedSearch,
  memoryOwnedSavedSearchStore,
} from "../src/lib/account/saved-search-ownership";
import { memoryPreferenceAuditStore } from "../src/lib/communications/preference-audit";
import { setGlobalOptionalEmailPreference } from "../src/lib/communications/preference-commands";
import { memoryCommunicationPreferenceStore } from "../src/lib/communications/preference-store";
import { memoryEmailSuppressionStore } from "../src/lib/communications/suppression";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "../src/lib/notifications/catalog";
import {
  isStaffCategoryPushEnabled,
  isStaffEmailCategoryEnabled,
  mergeStaffCategoryPrefs,
  STAFF_CATEGORY_CATALOG,
  staffCategoriesForUi,
} from "../src/lib/notifications/staff-categories";
import {
  areaWatchAwarenessLabel,
  buildAssignedAgentAwarenessPushPayload,
  CUSTOMER_ALERT_CHANGE_PUSH_TYPE,
  CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY,
  firstNameForAwareness,
  isGlobalEmailOffAwarenessTransition,
  notifyAssignedAgentAwareness,
  scheduleAssignedAgentAwareness,
  type AssignedAgentAwarenessAssignee,
  type AssignedAgentAwarenessCustomer,
  type AssignedAgentAwarenessDeps,
  type AssignedAgentAwarenessInput,
  type AssignedAgentAwarenessLead,
} from "../src/lib/notifications/assigned-agent-awareness";
import type { PushDeliveryResult, PushPayload } from "../src/lib/notifications/push";
import { classifyEmailKind } from "../src/lib/communications/classification";
import { optionalEmailEligibleForPreferenceChrome } from "../src/lib/communications/preference-email-chrome";
import { renderCustomerAlertOffStaffEmail } from "../src/lib/email/templates";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_tenant_a";
const WS_B = "ws_tenant_b";
const CUSTOMER = "user_customer_a";
const AGENT = "user_agent_a";
const AGENT_B = "user_agent_b";
const LEAD = "lead_a";

function propertyRow(
  overrides: Partial<PropertyMonitorSettingsRow> &
    Pick<PropertyMonitorSettingsRow, "userId" | "mlsNumber">,
): PropertyMonitorSettingsRow {
  return {
    id: overrides.id ?? `pm_${overrides.userId}_${overrides.mlsNumber}`,
    userId: overrides.userId,
    mlsNumber: overrides.mlsNumber,
    emailAlerts: overrides.emailAlerts ?? true,
    lastKnownPrice: overrides.lastKnownPrice ?? 800_000,
    lastKnownStatus: overrides.lastKnownStatus ?? "ACTIVE",
    lastKnownOwnerStatus: overrides.lastKnownOwnerStatus ?? null,
    lastAlertedAt: overrides.lastAlertedAt ?? null,
  };
}

function customer(
  overrides: Partial<AssignedAgentAwarenessCustomer> = {},
): AssignedAgentAwarenessCustomer {
  return {
    id: CUSTOMER,
    workspaceId: WS,
    name: "Omer Ali",
    ...overrides,
  };
}

function lead(
  overrides: Partial<AssignedAgentAwarenessLead> = {},
): AssignedAgentAwarenessLead {
  return {
    id: LEAD,
    workspaceId: WS,
    customerId: CUSTOMER,
    assignedAgentId: AGENT,
    ...overrides,
  };
}

function assignee(
  overrides: Partial<AssignedAgentAwarenessAssignee> = {},
): AssignedAgentAwarenessAssignee {
  return {
    id: AGENT,
    email: "agent@desk.example",
    disabledAt: null,
    role: "AGENT",
    pushNotificationPrefs: null,
    agentProfile: { active: true },
    ...overrides,
  };
}

function mockDeps(seed: {
  customer?: AssignedAgentAwarenessCustomer | null;
  lead?: AssignedAgentAwarenessLead | null;
  assignee?: AssignedAgentAwarenessAssignee | null;
  assignees?: Record<string, AssignedAgentAwarenessAssignee | null>;
  member?: boolean;
  authorize?: boolean;
  pushes?: Array<{ userId: string; payload: PushPayload }>;
  emails?: Array<{ toEmail?: string | null; subject: string }>;
  pushError?: Error;
  emailError?: Error;
}): AssignedAgentAwarenessDeps & {
  pushes: Array<{ userId: string; payload: PushPayload }>;
  emails: Array<{ toEmail?: string | null; subject: string }>;
  scheduled: number;
} {
  const pushes = seed.pushes ?? [];
  const emails = seed.emails ?? [];
  const scheduled = { n: 0 };
  return {
    pushes,
    emails,
    get scheduled() {
      return scheduled.n;
    },
    async loadCustomer() {
      return seed.customer === undefined ? customer() : seed.customer;
    },
    async loadLead() {
      return seed.lead === undefined ? lead() : seed.lead;
    },
    async loadAssignee(userId) {
      if (seed.assignees) return seed.assignees[userId] ?? null;
      return seed.assignee === undefined ? assignee() : seed.assignee;
    },
    async recipientInWorkspace() {
      return seed.member !== false;
    },
    async authorizeStaffRecipientForLead() {
      return seed.authorize !== false;
    },
    async deliverPushToUsersNow(userIds, payload) {
      if (seed.pushError) throw seed.pushError;
      const results: PushDeliveryResult[] = [];
      for (const id of userIds) {
        if (!id) continue;
        pushes.push({ userId: id, payload });
        results.push({ userId: id, status: "sent" });
      }
      return results;
    },
    async sendNotification(input) {
      if (seed.emailError) throw seed.emailError;
      emails.push({ toEmail: input.toEmail, subject: input.subject });
      return { email: "sent" as const, sms: "skipped" as const, whatsapp: "skipped" as const };
    },
    scheduleWorkerSideEffect(work) {
      scheduled.n += 1;
      void Promise.resolve(work).catch(() => undefined);
    },
  };
}

async function testCatalogAndCopy() {
  assert.equal(audienceForPushType("customer_alert_change"), "staff");
  assert.equal(shellForAudience("staff"), "houzzatpro");
  assert.equal(isPushTypeEnabled(null, CUSTOMER_ALERT_CHANGE_PUSH_TYPE), true);
  assert.equal(
    isStaffEmailCategoryEnabled(null, CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY),
    true,
  );
  assert.equal(
    isStaffCategoryPushEnabled(null, CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY),
    true,
  );
  const row = STAFF_CATEGORY_CATALOG.find(
    (item) => item.id === "customer_alert_changes",
  );
  assert.ok(row);
  assert.deepEqual(row.pushTypes, ["customer_alert_change"]);
  assert.equal(row.emailActive, true);
  const ui = staffCategoriesForUi(null);
  assert.ok(ui.some((item) => item.id === "customer_alert_changes"));

  assert.equal(firstNameForAwareness("Omer Ali"), "Omer");
  assert.equal(firstNameForAwareness("omer@example.com"), "A client");
  assert.equal(firstNameForAwareness(null), "A client");
  assert.equal(
    areaWatchAwarenessLabel({ city: "Kitchener", community: null }),
    "Kitchener",
  );

  const property = buildAssignedAgentAwarenessPushPayload({
    event: "property_watch_removed",
    firstName: "Omer",
    leadId: LEAD,
  });
  assert.equal(property.title, "Omer stopped watching a property");
  assert.ok(!property.title.includes("@"));
  assert.ok(property.href?.includes("/agent/open-lead/"));
  assert.equal(property.type, CUSTOMER_ALERT_CHANGE_PUSH_TYPE);

  const area = buildAssignedAgentAwarenessPushPayload({
    event: "area_watch_removed",
    firstName: "Omer",
    leadId: LEAD,
    areaLabel: "Kitchener",
  });
  assert.equal(area.title, "Omer stopped watching Kitchener");

  const search = buildAssignedAgentAwarenessPushPayload({
    event: "saved_search_removed",
    firstName: "Omer",
    leadId: LEAD,
    savedSearchName: "Guelph under 800k",
  });
  assert.equal(search.title, "Omer deleted a saved search");
  assert.equal(search.body, "Guelph under 800k");

  const off = buildAssignedAgentAwarenessPushPayload({
    event: "global_email_off",
    firstName: "Omer",
    leadId: LEAD,
  });
  assert.equal(off.title, "Omer turned off email alerts");
  assert.ok(!off.body.toLowerCase().includes("email@"));

  const email = renderCustomerAlertOffStaffEmail({
    clientLabel: "Omer",
    leadUrl: "https://example.test/agent/open-lead/lead_a",
  });
  assert.equal(email.subject, "Customer turned off email alerts");
  assert.ok(email.text.includes("Omer"));
  assert.ok(!email.html.includes("unsubscribe"));
  assert.ok(!email.text.includes("bearer"));
  assert.equal(classifyEmailKind("notify").class, "unclassified");
  assert.equal(optionalEmailEligibleForPreferenceChrome("notify"), false);
}

async function testRecipientResolution() {
  const happy = mockDeps({});
  const ok = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    happy,
  );
  assert.equal(ok.skipped, undefined);
  assert.equal(ok.recipientUserId, AGENT);
  assert.equal(ok.leadId, LEAD);
  assert.equal(happy.pushes.length, 1);
  assert.equal(happy.emails.length, 0);

  const noLead = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ lead: null }),
  );
  assert.equal(noLead.skipped, "no_lead");
  assert.equal(noLead.attempted.push, false);

  const pond = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ lead: lead({ assignedAgentId: null }) }),
  );
  assert.equal(pond.skipped, "unassigned");

  const foreignCustomer = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ customer: customer({ workspaceId: WS_B }) }),
  );
  assert.equal(foreignCustomer.skipped, "workspace_mismatch");

  const foreignLead = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ lead: lead({ workspaceId: WS_B }) }),
  );
  assert.equal(foreignLead.skipped, "no_lead");

  const disabled = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ assignee: assignee({ disabledAt: new Date() }) }),
  );
  assert.equal(disabled.skipped, "disabled_agent");

  const inactive = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ assignee: assignee({ agentProfile: { active: false } }) }),
  );
  assert.equal(inactive.skipped, "inactive_agent");

  const unauthorized = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ member: false, authorize: true }),
  );
  assert.equal(unauthorized.skipped, "unauthorized");

  const src = read("src/lib/notifications/assigned-agent-awareness.ts");
  assert.ok(!src.includes("assignedAgentId?:"));
  assert.ok(src.includes("Never accepts a recipient agent id from the browser"));
  assert.ok(src.includes("isPushTypeEnabled"));
  assert.ok(src.includes("isStaffEmailCategoryEnabled"));
  assert.ok(!src.includes("highStakes"));
}

async function testOwnedDeletesOnePushNoEmail() {
  const store = memoryPropertyMonitorSettingsStore([
    propertyRow({ userId: CUSTOMER, mlsNumber: "X1" }),
  ]);
  const first = await deleteOwnedPropertyMonitor(store, {
    userId: CUSTOMER,
    mlsNumber: "X1",
  });
  assert.equal(first.deleted, true);
  const deps = mockDeps({});
  const once = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    deps,
  );
  assert.equal(once.attempted.push, true);
  assert.equal(once.attempted.email, false);
  assert.equal(deps.emails.length, 0);

  const repeat = await deleteOwnedPropertyMonitor(store, {
    userId: CUSTOMER,
    mlsNumber: "X1",
  });
  assert.equal(repeat.deleted, false);

  const areaStore = memoryAreaMonitorSettingsStore([
    {
      id: "am1",
      userId: CUSTOMER,
      city: "Kitchener",
      community: null,
      transactionType: "SALE",
      segment: null,
      name: null,
      emailAlerts: true,
      notifyNew: true,
      notifySold: false,
      lastSeenListingAt: null,
      lastAlertedAt: null,
    },
  ]);
  const areaDeleted = await deleteOwnedAreaMonitor(areaStore, {
    userId: CUSTOMER,
    id: "am1",
  });
  assert.equal(areaDeleted.deleted, true);
  const areaDeps = mockDeps({});
  const areaNotify = await notifyAssignedAgentAwareness(
    {
      customerId: CUSTOMER,
      workspaceId: WS,
      event: "area_watch_removed",
      areaLabel: areaWatchAwarenessLabel({
        city: areaDeleted.snapshot!.city,
        community: areaDeleted.snapshot!.community,
      }),
    },
    areaDeps,
  );
  assert.equal(areaNotify.attempted.push, true);
  assert.equal(areaDeps.emails.length, 0);
  const areaRepeat = await deleteOwnedAreaMonitor(areaStore, {
    userId: CUSTOMER,
    id: "am1",
  });
  assert.equal(areaRepeat.deleted, false);

  const searchStore = memoryOwnedSavedSearchStore([
    {
      id: "ss1",
      userId: CUSTOMER,
      name: "Guelph",
      query: {},
      isPrimary: false,
      isHomepageActive: false,
      emailAlerts: true,
      smsAlerts: false,
    },
  ]);
  const searchDeleted = await deleteOwnedSavedSearch(searchStore, {
    id: "ss1",
    userId: CUSTOMER,
  });
  assert.equal(searchDeleted.deleted, true);
  const searchDeps = mockDeps({});
  const searchNotify = await notifyAssignedAgentAwareness(
    {
      customerId: CUSTOMER,
      workspaceId: WS,
      event: "saved_search_removed",
      savedSearchName: searchDeleted.item!.name,
    },
    searchDeps,
  );
  assert.equal(searchNotify.attempted.push, true);
  assert.equal(searchDeps.emails.length, 0);
  const searchRepeat = await deleteOwnedSavedSearch(searchStore, {
    id: "ss1",
    userId: CUSTOMER,
  });
  assert.equal(searchRepeat.deleted, false);
}

async function testChannelIndependenceMatrix() {
  const watchEvents = [
    "property_watch_removed",
    "area_watch_removed",
    "saved_search_removed",
  ] as const;

  function prefsFor(push: boolean, email: boolean): unknown {
    let prefs: unknown = {};
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "customer_alert_changes",
      channel: "push",
      enabled: push,
    });
    prefs = mergeStaffCategoryPrefs(prefs, {
      category: "customer_alert_changes",
      channel: "email",
      enabled: email,
    });
    assert.equal(
      isPushTypeEnabled(prefs, CUSTOMER_ALERT_CHANGE_PUSH_TYPE),
      push,
    );
    assert.equal(
      isStaffEmailCategoryEnabled(prefs, CUSTOMER_ALERT_CHANGES_EMAIL_CATEGORY),
      email,
    );
    return prefs;
  }

  for (const event of watchEvents) {
    const pushOff = mockDeps({
      assignee: assignee({ pushNotificationPrefs: prefsFor(false, true) }),
    });
    const pushOffResult = await notifyAssignedAgentAwareness(
      { customerId: CUSTOMER, workspaceId: WS, event },
      pushOff,
    );
    assert.equal(pushOffResult.attempted.push, false, `${event} push OFF`);
    assert.equal(pushOffResult.attempted.email, false, `${event} no email`);
    assert.equal(pushOff.emails.length, 0);

    const emailOff = mockDeps({
      assignee: assignee({ pushNotificationPrefs: prefsFor(true, false) }),
    });
    const emailOffResult = await notifyAssignedAgentAwareness(
      { customerId: CUSTOMER, workspaceId: WS, event },
      emailOff,
    );
    assert.equal(emailOffResult.attempted.push, true, `${event} push ON`);
    assert.equal(emailOffResult.attempted.email, false, `${event} email OFF`);
    assert.equal(emailOff.emails.length, 0);

    const bothOff = mockDeps({
      assignee: assignee({ pushNotificationPrefs: prefsFor(false, false) }),
    });
    const bothOffResult = await notifyAssignedAgentAwareness(
      { customerId: CUSTOMER, workspaceId: WS, event },
      bothOff,
    );
    assert.equal(bothOffResult.attempted.push, false);
    assert.equal(bothOffResult.attempted.email, false);

    const defaults = mockDeps({ assignee: assignee({ pushNotificationPrefs: null }) });
    const defaultResult = await notifyAssignedAgentAwareness(
      { customerId: CUSTOMER, workspaceId: WS, event },
      defaults,
    );
    assert.equal(defaultResult.attempted.push, true);
    assert.equal(defaultResult.attempted.email, false);
  }

  const globalPushOff = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefsFor(false, true) }),
  });
  const globalPushOffResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    globalPushOff,
  );
  assert.equal(globalPushOffResult.attempted.push, false);
  assert.equal(globalPushOffResult.attempted.email, true);

  const globalEmailOff = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefsFor(true, false) }),
  });
  const globalEmailOffResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    globalEmailOff,
  );
  assert.equal(globalEmailOffResult.attempted.push, true);
  assert.equal(globalEmailOffResult.attempted.email, false);

  const globalBothOff = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefsFor(false, false) }),
  });
  const globalBothOffResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    globalBothOff,
  );
  assert.equal(globalBothOffResult.attempted.push, false);
  assert.equal(globalBothOffResult.attempted.email, false);

  const globalDefault = mockDeps({
    assignee: assignee({ pushNotificationPrefs: null }),
  });
  const globalDefaultResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    globalDefault,
  );
  assert.equal(globalDefaultResult.attempted.push, true);
  assert.equal(globalDefaultResult.attempted.email, true);
}

async function testReassignmentAtDispatch() {
  let assignedAgentId: string | null = AGENT;
  const deps = mockDeps({
    assignees: {
      [AGENT]: assignee({ id: AGENT, email: "a@desk.example" }),
      [AGENT_B]: assignee({ id: AGENT_B, email: "b@desk.example" }),
    },
  });
  deps.loadLead = async () => lead({ assignedAgentId });

  assignedAgentId = AGENT_B;
  const result = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    deps,
  );
  assert.equal(result.recipientUserId, AGENT_B);
  assert.equal(deps.pushes.length, 1);
  assert.equal(deps.pushes[0]?.userId, AGENT_B);
  assert.equal(
    deps.pushes.some((row) => row.userId === AGENT),
    false,
  );
}

async function testWorkspaceAttackCases() {
  const crossLead = mockDeps({
    customer: customer({ workspaceId: WS }),
    lead: lead({
      workspaceId: WS_B,
      assignedAgentId: AGENT_B,
    }),
    assignees: {
      [AGENT_B]: assignee({ id: AGENT_B }),
    },
    member: true,
    authorize: true,
  });
  const crossLeadResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    crossLead,
  );
  assert.equal(crossLeadResult.skipped, "no_lead");
  assert.equal(crossLead.pushes.length, 0);
  assert.equal(crossLead.emails.length, 0);

  const foreignMember = mockDeps({
    lead: lead({ assignedAgentId: AGENT_B }),
    assignees: {
      [AGENT_B]: assignee({ id: AGENT_B }),
    },
    member: false,
    authorize: true,
  });
  const foreignMemberResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    foreignMember,
  );
  assert.equal(foreignMemberResult.skipped, "unauthorized");
  assert.equal(foreignMember.pushes.length, 0);
}

async function testGlobalEmailChannelsAndIdempotency() {
  assert.equal(
    isGlobalEmailOffAwarenessTransition({
      previousEnabled: true,
      nextEnabled: false,
    }),
    true,
  );
  assert.equal(
    isGlobalEmailOffAwarenessTransition({
      previousEnabled: false,
      nextEnabled: false,
    }),
    false,
  );
  assert.equal(
    isGlobalEmailOffAwarenessTransition({
      previousEnabled: false,
      nextEnabled: true,
    }),
    false,
  );

  const both = mockDeps({});
  const off = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    both,
  );
  assert.equal(off.attempted.push, true);
  assert.equal(off.attempted.email, true);
  assert.equal(both.pushes.length, 1);
  assert.equal(both.emails.length, 1);
  assert.equal(both.emails[0]?.subject, "Customer turned off email alerts");

  let prefs: unknown = {};
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "customer_alert_changes",
    channel: "push",
    enabled: false,
  });
  const emailOnly = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefs }),
  });
  const emailOnlyResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    emailOnly,
  );
  assert.equal(emailOnlyResult.attempted.push, false);
  assert.equal(emailOnlyResult.attempted.email, true);

  prefs = mergeStaffCategoryPrefs(
    {},
    { category: "customer_alert_changes", channel: "email", enabled: false },
  );
  const pushOnly = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefs }),
  });
  const pushOnlyResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    pushOnly,
  );
  assert.equal(pushOnlyResult.attempted.push, true);
  assert.equal(pushOnlyResult.attempted.email, false);

  prefs = mergeStaffCategoryPrefs(
    {},
    { category: "customer_alert_changes", channel: "push", enabled: false },
  );
  prefs = mergeStaffCategoryPrefs(prefs, {
    category: "customer_alert_changes",
    channel: "email",
    enabled: false,
  });
  const neither = mockDeps({
    assignee: assignee({ pushNotificationPrefs: prefs }),
  });
  const neitherResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    neither,
  );
  assert.equal(neitherResult.attempted.push, false);
  assert.equal(neitherResult.attempted.email, false);

  const user = {
    id: CUSTOMER,
    email: "a@example.com",
    workspaceId: WS,
    emailAlertsEnabled: true,
    caslConsentAt: new Date("2026-01-01"),
  };
  let lock: Promise<unknown> = Promise.resolve();
  const userStore = {
    async findById() {
      return { ...user };
    },
    async applyEmailAlertsEnabled(input: {
      userId: string;
      emailAlertsEnabled: boolean;
    }) {
      const run = lock.then(async () => {
        const previousEnabled = user.emailAlertsEnabled;
        if (previousEnabled === input.emailAlertsEnabled) {
          return { ...user, previousEnabled, changed: false };
        }
        user.emailAlertsEnabled = input.emailAlertsEnabled;
        return { ...user, previousEnabled, changed: true };
      });
      lock = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  const awareness: string[] = [];
  const ctx = {
    userStore,
    preferenceStore: memoryCommunicationPreferenceStore(),
    suppressionStore: memoryEmailSuppressionStore(),
    auditStore: memoryPreferenceAuditStore(),
    async runCanonicalTransaction(
      work: (stores: {
        userStore: typeof userStore;
        suppressionStore: ReturnType<typeof memoryEmailSuppressionStore>;
        auditStore: ReturnType<typeof memoryPreferenceAuditStore>;
      }) => Promise<unknown>,
    ) {
      return work({
        userStore,
        suppressionStore: ctx.suppressionStore,
        auditStore: ctx.auditStore,
      });
    },
    async onAssignedAgentAwareness(event: {
      previousEnabled: boolean;
      nextEnabled: boolean;
    }) {
      if (
        isGlobalEmailOffAwarenessTransition({
          previousEnabled: event.previousEnabled,
          nextEnabled: event.nextEnabled,
        })
      ) {
        awareness.push("off");
      }
    },
  };

  const [a, b] = await Promise.all([
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: CUSTOMER,
      workspaceId: WS,
      enabled: false,
      source: "one_click_unsubscribe",
    }),
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: CUSTOMER,
      workspaceId: WS,
      enabled: false,
      source: "account_preferences",
    }),
  ]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(awareness.length, 1);

  awareness.length = 0;
  const alreadyOff = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: CUSTOMER,
    workspaceId: WS,
    enabled: false,
    source: "account_preferences",
  });
  assert.equal(alreadyOff.ok, true);
  assert.equal(awareness.length, 0);

  const resume = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: CUSTOMER,
    workspaceId: WS,
    enabled: true,
    source: "account_preferences",
  });
  assert.equal(resume.ok, true);
  assert.equal(awareness.length, 0);
}

async function testFailureIsolation() {
  const pushFail = mockDeps({ pushError: new Error("fcm boom") });
  const pushResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    pushFail,
  );
  assert.equal(pushResult.attempted.push, true);

  const emailFail = mockDeps({ emailError: new Error("resend boom") });
  const emailResult = await notifyAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "global_email_off" },
    emailFail,
  );
  assert.equal(emailResult.attempted.email, true);
  assert.equal(emailResult.attempted.push, true);

  const store = memoryPropertyMonitorSettingsStore([
    propertyRow({ userId: CUSTOMER, mlsNumber: "Y9" }),
  ]);
  const deleted = await deleteOwnedPropertyMonitor(store, {
    userId: CUSTOMER,
    mlsNumber: "Y9",
  });
  assert.equal(deleted.deleted, true);
  scheduleAssignedAgentAwareness(
    { customerId: CUSTOMER, workspaceId: WS, event: "property_watch_removed" },
    mockDeps({ pushError: new Error("fcm boom") }),
  );
}

function testNoiseAndWiring() {
  const property = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(property.includes("scheduleAssignedAgentAwareness"));
  assert.ok(property.includes('event: "property_watch_removed"'));
  const propertyPatch = property.slice(
    property.indexOf("export async function PATCH"),
    property.indexOf("export async function DELETE"),
  );
  assert.ok(!propertyPatch.includes("scheduleAssignedAgentAwareness"));

  const area = read("src/app/api/account/area-monitors/route.ts");
  assert.ok(area.includes("scheduleAssignedAgentAwareness"));
  const areaPatch = area.slice(
    area.indexOf("export async function PATCH"),
    area.indexOf("export async function DELETE"),
  );
  assert.ok(!areaPatch.includes("scheduleAssignedAgentAwareness"));

  const searches = read("src/app/api/saved-searches/route.ts");
  assert.ok(searches.includes("scheduleAssignedAgentAwareness"));
  const searchPatch = searches.includes("export async function PATCH")
    ? searches.slice(
        searches.indexOf("export async function PATCH"),
        searches.indexOf("export async function DELETE"),
      )
    : searches;
  if (searches.includes("export async function PATCH")) {
    assert.ok(!searchPatch.includes("scheduleAssignedAgentAwareness"));
  }

  const prefs = read("src/lib/communications/prisma-preference-context.ts");
  assert.ok(prefs.includes("onAssignedAgentAwareness"));
  assert.ok(prefs.includes("isGlobalEmailOffAwarenessTransition"));
  assert.ok(!prefs.includes("global_email_on"));

  const commands = read("src/lib/communications/preference-commands.ts");
  const categoryFn = commands.slice(
    commands.indexOf("export async function setCategoryEmailPreference"),
    commands.indexOf("export async function setGlobalOptionalEmailPreference"),
  );
  assert.ok(!categoryFn.includes("onAssignedAgentAwareness"));

  const awareness = read(
    "src/lib/notifications/assigned-agent-awareness.ts",
  );
  assert.ok(!awareness.includes("sendAndLogClientEmail"));
  assert.ok(!awareness.includes("emailAlertsEnabled"));
  assert.ok(!awareness.includes("EmailSuppression"));
  assert.ok(awareness.includes("sendNotification"));
  assert.ok(!awareness.includes("deskUserIds"));
  assert.ok(!awareness.includes("resolveLeadDeskNotifiers"));
  assert.ok(!awareness.includes("resolveWorkspaceDeskRecipients"));
  assert.ok(!awareness.includes("notifyNewLeadCapturedToStaff"));
  assert.ok(!awareness.includes("includeDesk"));

  const noInbox = read("src/app/(agent)/agent/notifications/page.tsx");
  assert.ok(noInbox.includes("StaffNotificationPreferencesForm"));
  assert.ok(!awareness.includes("mark read"));
}

async function main() {
  await testCatalogAndCopy();
  await testRecipientResolution();
  await testOwnedDeletesOnePushNoEmail();
  await testChannelIndependenceMatrix();
  await testReassignmentAtDispatch();
  await testWorkspaceAttackCases();
  await testGlobalEmailChannelsAndIdempotency();
  await testFailureIsolation();
  testNoiseAndWiring();
  const unused: AssignedAgentAwarenessInput = {
    customerId: CUSTOMER,
    workspaceId: WS,
    event: "property_watch_removed",
  };
  assert.equal("assignedAgentId" in unused, false);
  console.log("communications-phase4-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
