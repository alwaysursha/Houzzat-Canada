/**
 * Phase 3C — customer watch/search/global-email CRM LeadActivity history.
 * Run: pnpm communications-phase3c:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AREA_WATCH_REMOVED,
  logAreaWatchRemovedActivity,
  logGlobalOptionalEmailCrmActivityBestEffort,
  logPropertyWatchRemovedActivity,
  logPropertyWatchRemovedBestEffort,
  logSavedSearchRemovedActivity,
  PROPERTY_WATCH_REMOVED,
  SAVED_SEARCH_REMOVED,
  shouldLogGlobalOptionalEmailCrmActivity,
} from "../src/lib/agent/customer-alert-crm-activity";
import {
  logLeadActivityForCustomer,
  type LeadActivityCustomerDb,
} from "../src/lib/agent/log-contact-activity";
import {
  labelActivity,
  leadActivityDisplayTitle,
} from "../src/lib/agent/activity-display";
import { friendlyActivityTypeLabel } from "../src/lib/agent/activity-filters";
import { setGlobalOptionalEmailPreference } from "../src/lib/communications/preference-commands";
import { memoryPreferenceAuditStore } from "../src/lib/communications/preference-audit";
import { memoryCommunicationPreferenceStore } from "../src/lib/communications/preference-store";
import { memoryEmailSuppressionStore } from "../src/lib/communications/suppression";
import {
  deleteOwnedPropertyMonitor,
  memoryPropertyMonitorSettingsStore,
  type PropertyMonitorSettingsRow,
} from "../src/lib/account/property-monitor-settings";
import {
  deleteOwnedAreaMonitor,
  memoryAreaMonitorSettingsStore,
} from "../src/lib/account/area-monitor-settings";
import {
  briefSavedSearchSummary,
  deleteOwnedSavedSearch,
  memoryOwnedSavedSearchStore,
} from "../src/lib/account/saved-search-ownership";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

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

type ActivityRow = {
  leadId: string;
  type: string;
  body: string;
  meta?: unknown;
};

function memoryCrmDb(seed: {
  users: Array<{ id: string; workspaceId: string | null }>;
  leads: Array<{ id: string; customerId: string; workspaceId: string }>;
}): LeadActivityCustomerDb & { activities: ActivityRow[] } {
  const activities: ActivityRow[] = [];
  return {
    activities,
    user: {
      async findUnique({ where }) {
        return seed.users.find((u) => u.id === where.id) ?? null;
      },
    },
    lead: {
      async findMany({ where }) {
        return seed.leads
          .filter(
            (lead) =>
              lead.customerId === where.customerId &&
              lead.workspaceId === where.workspaceId,
          )
          .map((lead) => ({ id: lead.id }));
      },
    },
    leadActivity: {
      async createMany({ data }) {
        for (const row of data) {
          activities.push({
            leadId: row.leadId,
            type: row.type,
            body: row.body,
            meta: row.meta,
          });
        }
      },
    },
  };
}

function testPolicyConstantsAndLabels() {
  assert.equal(PROPERTY_WATCH_REMOVED, "property_watch_removed");
  assert.equal(AREA_WATCH_REMOVED, "area_watch_removed");
  assert.equal(SAVED_SEARCH_REMOVED, "saved_search_removed");
  assert.equal(labelActivity("property_watch_removed"), "Property Watch stopped");
  assert.equal(labelActivity("area_watch_removed"), "Area Watch stopped");
  assert.equal(labelActivity("saved_search_removed"), "Saved Search deleted");
  assert.equal(
    friendlyActivityTypeLabel("PROPERTY_WATCH_REMOVED"),
    "Property Watch stopped",
  );
  assert.equal(
    friendlyActivityTypeLabel("AREA_WATCH_REMOVED"),
    "Area Watch stopped",
  );
  assert.equal(
    friendlyActivityTypeLabel("SAVED_SEARCH_REMOVED"),
    "Saved Search deleted",
  );
}

async function testPropertyAreaSavedSearchRemovalActivity() {
  const db = memoryCrmDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [
      { id: "lead_a", customerId: "user_a", workspaceId: "ws_a" },
      { id: "lead_b", customerId: "user_a", workspaceId: "ws_b" },
    ],
  });

  const prop = await logPropertyWatchRemovedActivity(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      mlsNumber: "W123",
      source: "account_property_monitors",
    },
    db,
  );
  assert.equal(prop.written, 1);
  assert.equal(db.activities.length, 1);
  assert.equal(db.activities[0]!.type, PROPERTY_WATCH_REMOVED);
  assert.equal(db.activities[0]!.body, "Customer stopped watching a property");
  assert.equal(db.activities[0]!.leadId, "lead_a");
  assert.deepEqual(db.activities[0]!.meta, {
    mlsNumber: "W123",
    source: "account_property_monitors",
    action: "delete",
  });

  const area = await logAreaWatchRemovedActivity(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      areaMonitorId: "am1",
      city: "Toronto",
      community: "Leslieville",
      transactionType: "SALE",
      segment: "RESIDENTIAL",
      name: "Leslieville",
    },
    db,
  );
  assert.equal(area.written, 1);
  assert.equal(db.activities.length, 2);
  assert.equal(db.activities[1]!.type, AREA_WATCH_REMOVED);
  assert.equal(db.activities[1]!.leadId, "lead_a");

  const search = await logSavedSearchRemovedActivity(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      savedSearchId: "ss1",
      name: "East end",
      isPrimary: true,
      summary: "Toronto · SALE",
    },
    db,
  );
  assert.equal(search.written, 1);
  assert.equal(db.activities.length, 3);
  assert.equal(db.activities[2]!.type, SAVED_SEARCH_REMOVED);
  assert.equal(db.activities[2]!.body, "Customer deleted a saved search");

  // Cross-workspace mismatch → zero
  const denied = await logPropertyWatchRemovedActivity(
    {
      customerId: "user_a",
      workspaceId: "ws_b",
      mlsNumber: "W999",
    },
    db,
  );
  assert.equal(denied.written, 0);
  assert.equal(db.activities.length, 3);

  // Same-workspace multi-lead fan-out
  const multi = memoryCrmDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [
      { id: "l1", customerId: "user_a", workspaceId: "ws_a" },
      { id: "l2", customerId: "user_a", workspaceId: "ws_a" },
      { id: "lx", customerId: "user_a", workspaceId: "ws_other" },
    ],
  });
  const fan = await logPropertyWatchRemovedActivity(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      mlsNumber: "W1",
    },
    multi,
  );
  assert.equal(fan.written, 2);
  assert.deepEqual(
    multi.activities.map((a) => a.leadId).sort(),
    ["l1", "l2"],
  );
}

async function testGlobalEmailTransitionsExactlyOnce() {
  assert.equal(
    shouldLogGlobalOptionalEmailCrmActivity({
      previousEnabled: true,
      nextEnabled: false,
    }),
    true,
  );
  assert.equal(
    shouldLogGlobalOptionalEmailCrmActivity({
      previousEnabled: false,
      nextEnabled: true,
    }),
    true,
  );
  assert.equal(
    shouldLogGlobalOptionalEmailCrmActivity({
      previousEnabled: false,
      nextEnabled: false,
    }),
    false,
  );
  assert.equal(
    shouldLogGlobalOptionalEmailCrmActivity({
      previousEnabled: true,
      nextEnabled: true,
    }),
    false,
  );

  const db = memoryCrmDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [{ id: "lead_a", customerId: "user_a", workspaceId: "ws_a" }],
  });

  const off = await logGlobalOptionalEmailCrmActivityBestEffort(
    {
      userId: "user_a",
      workspaceId: "ws_a",
      previousEnabled: true,
      nextEnabled: false,
      source: "one_click_unsubscribe",
    },
    db,
  );
  assert.equal(off.skipped, false);
  assert.equal(off.written, 1);
  assert.equal(db.activities[0]!.type, "unsubscribe");
  assert.equal(db.activities[0]!.body, "Customer turned off email alerts");

  const again = await logGlobalOptionalEmailCrmActivityBestEffort(
    {
      userId: "user_a",
      workspaceId: "ws_a",
      previousEnabled: false,
      nextEnabled: false,
      source: "one_click_unsubscribe",
    },
    db,
  );
  assert.equal(again.skipped, true);
  assert.equal(db.activities.length, 1);

  const on = await logGlobalOptionalEmailCrmActivityBestEffort(
    {
      userId: "user_a",
      workspaceId: "ws_a",
      previousEnabled: false,
      nextEnabled: true,
      source: "preference_center_authenticated",
    },
    db,
  );
  assert.equal(on.written, 1);
  assert.equal(db.activities[1]!.type, "contact_updated_by_customer");
  assert.equal(db.activities[1]!.body, "Customer re-enabled email alerts");
}

async function testCanonicalCommandBehavioralHook() {
  const userA = {
    id: "user_a",
    email: "a@example.com",
    workspaceId: "ws_a",
    emailAlertsEnabled: true,
    caslConsentAt: new Date("2026-01-01"),
  };
  const users = [{ ...userA }];
  const userStore = {
    users,
    async findById(id: string) {
      return users.find((u) => u.id === id) ?? null;
    },
    async applyEmailAlertsEnabled(input: {
      userId: string;
      emailAlertsEnabled: boolean;
      caslConsentAt?: Date | null;
    }) {
      const user = users.find((row) => row.id === input.userId);
      if (!user) throw new Error("missing user");
      const previousEnabled = user.emailAlertsEnabled;
      const changed = previousEnabled !== input.emailAlertsEnabled;
      if (changed) user.emailAlertsEnabled = input.emailAlertsEnabled;
      if (input.caslConsentAt !== undefined) {
        user.caslConsentAt = input.caslConsentAt ?? null;
      }
      return { ...user, previousEnabled, changed };
    },
  };
  const preferenceStore = memoryCommunicationPreferenceStore();
  const suppressionStore = memoryEmailSuppressionStore();
  const auditStore = memoryPreferenceAuditStore();
  const hooks: Array<{
    userId: string;
    workspaceId: string;
    previousEnabled: boolean;
    nextEnabled: boolean;
    source: string;
  }> = [];
  let hookShouldThrow = false;

  const ctx = {
    userStore,
    preferenceStore,
    suppressionStore,
    auditStore,
    async runCanonicalTransaction(work: (stores: {
      userStore: typeof userStore;
      suppressionStore: typeof suppressionStore;
      auditStore: typeof auditStore;
    }) => Promise<unknown>) {
      return work({ userStore, suppressionStore, auditStore });
    },
    async onGlobalOptionalEmailTransition(event: {
      userId: string;
      workspaceId: string;
      previousEnabled: boolean;
      nextEnabled: boolean;
      source: string;
    }) {
      hooks.push(event);
      if (hookShouldThrow) throw new Error("crm boom");
    },
  };

  const off = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "account_preferences",
  });
  assert.equal(off.ok, true);
  if (!off.ok) throw new Error("expected ok");
  assert.equal(off.previousEnabled, true);
  assert.equal(off.nextEnabled, false);
  assert.equal(users[0]!.emailAlertsEnabled, false);
  assert.ok(auditStore.rows.some((r) => r.kind === "preference_global_email_off"));
  assert.equal(hooks.length, 1);
  assert.deepEqual(hooks[0], {
    userId: "user_a",
    workspaceId: "ws_a",
    previousEnabled: true,
    nextEnabled: false,
    source: "account_preferences",
  });

  const offAgain = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "one_click_unsubscribe",
  });
  assert.equal(offAgain.ok, true);
  assert.equal(hooks.length, 1, "OFF→OFF: zero additional CRM hooks");

  const on = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: true,
    source: "preference_center_token",
    caslConsentAt: new Date("2026-01-01"),
  });
  assert.equal(on.ok, true);
  if (!on.ok) throw new Error("expected ok");
  assert.equal(on.previousEnabled, false);
  assert.equal(on.nextEnabled, true);
  assert.equal(hooks.length, 2);
  assert.deepEqual(hooks[1], {
    userId: "user_a",
    workspaceId: "ws_a",
    previousEnabled: false,
    nextEnabled: true,
    source: "preference_center_token",
  });

  const onAgain = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: true,
    source: "preference_center_authenticated",
  });
  assert.equal(onAgain.ok, true);
  assert.equal(hooks.length, 2, "ON→ON: zero additional CRM hooks");

  hookShouldThrow = true;
  const offThrow = await setGlobalOptionalEmailPreference(ctx as never, {
    userId: "user_a",
    workspaceId: "ws_a",
    enabled: false,
    source: "preference_center_authenticated",
  });
  assert.equal(offThrow.ok, true);
  if (!offThrow.ok) throw new Error("expected ok");
  assert.equal(offThrow.nextEnabled, false);
  assert.equal(users[0]!.emailAlertsEnabled, false);
  assert.equal(hooks.length, 3, "throwing hook still invoked once");
}

async function testConcurrentOffOffAndOnOn() {
  const user = {
    id: "user_a",
    email: "a@example.com",
    workspaceId: "ws_a",
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
  const preferenceStore = memoryCommunicationPreferenceStore();
  const suppressionStore = memoryEmailSuppressionStore();
  const auditStore = memoryPreferenceAuditStore();
  const hooks: string[] = [];
  const ctx = {
    userStore,
    preferenceStore,
    suppressionStore,
    auditStore,
    async runCanonicalTransaction(work: (stores: {
      userStore: typeof userStore;
      suppressionStore: typeof suppressionStore;
      auditStore: typeof auditStore;
    }) => Promise<unknown>) {
      return work({ userStore, suppressionStore, auditStore });
    },
    async onGlobalOptionalEmailTransition() {
      hooks.push("off");
    },
  };

  const [a, b] = await Promise.all([
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: "user_a",
      workspaceId: "ws_a",
      enabled: false,
      source: "one_click_unsubscribe",
    }),
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: "user_a",
      workspaceId: "ws_a",
      enabled: false,
      source: "account_preferences",
    }),
  ]);
  assert.equal(a.ok && b.ok, true);
  assert.equal(user.emailAlertsEnabled, false);
  const transitions = [a, b].filter(
    (r) => r.ok && r.previousEnabled !== r.nextEnabled,
  );
  assert.equal(transitions.length, 1);
  assert.equal(hooks.length, 1, "concurrent OFF/OFF: one CRM transition");

  hooks.length = 0;
  const [c, d] = await Promise.all([
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: "user_a",
      workspaceId: "ws_a",
      enabled: true,
      source: "preference_center_token",
      caslConsentAt: new Date("2026-01-01"),
    }),
    setGlobalOptionalEmailPreference(ctx as never, {
      userId: "user_a",
      workspaceId: "ws_a",
      enabled: true,
      source: "preference_center_authenticated",
      caslConsentAt: new Date("2026-01-01"),
    }),
  ]);
  assert.equal(c.ok && d.ok, true);
  assert.equal(user.emailAlertsEnabled, true);
  const onTransitions = [c, d].filter(
    (r) => r.ok && r.previousEnabled !== r.nextEnabled,
  );
  assert.equal(onTransitions.length, 1);
  assert.equal(hooks.length, 1, "concurrent ON/ON: one CRM transition");
}

async function testOwnedDeleteCoresAndCrmFailure() {
  const propRows = [
    propertyRow({ userId: "user_a", mlsNumber: "AONLY1", emailAlerts: true }),
    propertyRow({ userId: "user_b", mlsNumber: "BONLY1", emailAlerts: true }),
  ];
  const propStore = memoryPropertyMonitorSettingsStore(propRows);
  const steal = await deleteOwnedPropertyMonitor(propStore, {
    userId: "user_b",
    mlsNumber: "AONLY1",
  });
  assert.equal(steal.deleted, false);
  assert.equal(propRows.some((r) => r.userId === "user_a"), true);
  const owner = await deleteOwnedPropertyMonitor(propStore, {
    userId: "user_a",
    mlsNumber: "AONLY1",
  });
  assert.equal(owner.deleted, true);
  const again = await deleteOwnedPropertyMonitor(propStore, {
    userId: "user_a",
    mlsNumber: "AONLY1",
  });
  assert.equal(again.deleted, false);

  const db = memoryCrmDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [{ id: "lead_a", customerId: "user_a", workspaceId: "ws_a" }],
  });
  if (owner.deleted) {
    await logPropertyWatchRemovedActivity(
      {
        customerId: "user_a",
        workspaceId: "ws_a",
        mlsNumber: "AONLY1",
      },
      db,
    );
  }
  assert.equal(db.activities.length, 1);
  if (again.deleted) {
    await logPropertyWatchRemovedActivity(
      {
        customerId: "user_a",
        workspaceId: "ws_a",
        mlsNumber: "AONLY1",
      },
      db,
    );
  }
  assert.equal(db.activities.length, 1);

  const areaRows = [
    {
      id: "am_a",
      userId: "user_a",
      emailAlerts: true,
      notifyNew: true,
      notifySold: true,
      city: "Toronto",
      community: "Leslieville",
      transactionType: "SALE",
      segment: "RESIDENTIAL",
      name: "Leslieville",
      lastSeenListingAt: null,
      lastAlertedAt: null,
    },
  ];
  const areaStore = memoryAreaMonitorSettingsStore(areaRows);
  const foreignArea = await deleteOwnedAreaMonitor(areaStore, {
    userId: "user_b",
    id: "am_a",
  });
  assert.equal(foreignArea.deleted, false);
  assert.equal(areaRows.length, 1);
  const ownArea = await deleteOwnedAreaMonitor(areaStore, {
    userId: "user_a",
    id: "am_a",
  });
  assert.equal(ownArea.deleted, true);
  assert.equal(ownArea.snapshot?.city, "Toronto");
  const areaAgain = await deleteOwnedAreaMonitor(areaStore, {
    userId: "user_a",
    id: "am_a",
  });
  assert.equal(areaAgain.deleted, false);

  const searches = [
    {
      id: "ss_a",
      userId: "user_a",
      name: "East",
      emailAlerts: true,
      smsAlerts: false,
      isPrimary: true,
      isHomepageActive: false,
      query: { city: "Toronto", extra: { nested: true }, beds: 3 },
    },
  ];
  const searchStore = memoryOwnedSavedSearchStore(searches);
  const foreignSearch = await deleteOwnedSavedSearch(searchStore, {
    userId: "user_b",
    id: "ss_a",
  });
  assert.equal(foreignSearch.deleted, false);
  const ownSearch = await deleteOwnedSavedSearch(searchStore, {
    userId: "user_a",
    id: "ss_a",
  });
  assert.equal(ownSearch.deleted, true);
  const summary = briefSavedSearchSummary(ownSearch.item?.query);
  assert.equal(summary, "Toronto");
  const meta = {
    savedSearchId: ownSearch.item!.id,
    name: ownSearch.item!.name,
    isPrimary: ownSearch.item!.isPrimary,
    ...(summary ? { summary } : {}),
    source: "saved_searches",
    action: "delete",
  };
  assert.equal("query" in meta, false);
  assert.ok(!JSON.stringify(meta).includes("nested"));
  const searchAgain = await deleteOwnedSavedSearch(searchStore, {
    userId: "user_a",
    id: "ss_a",
  });
  assert.equal(searchAgain.deleted, false);

  const failingDb = memoryCrmDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [{ id: "lead_a", customerId: "user_a", workspaceId: "ws_a" }],
  });
  failingDb.leadActivity.createMany = async () => {
    throw new Error("crm write failed");
  };
  const stillDeleted = await deleteOwnedPropertyMonitor(
    memoryPropertyMonitorSettingsStore([
      propertyRow({ userId: "user_a", mlsNumber: "Z1", emailAlerts: true }),
    ]),
    { userId: "user_a", mlsNumber: "Z1" },
  );
  assert.equal(stillDeleted.deleted, true);
  const crm = await logPropertyWatchRemovedBestEffort(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      mlsNumber: "Z1",
    },
    failingDb,
  );
  assert.equal(crm.written, 0);
  assert.equal(stillDeleted.deleted, true, "entity stays deleted after CRM fail");
}

function testPresentationAndFilters() {
  assert.equal(
    leadActivityDisplayTitle({
      type: "unsubscribe",
      body: "Customer turned off email alerts",
      meta: { channel: "email" },
    }),
    "Email alerts turned off",
  );
  assert.equal(
    leadActivityDisplayTitle({
      type: "unsubscribe",
      body: "Customer turned off SMS alerts",
      meta: { channel: "sms" },
    }),
    "SMS alerts turned off",
  );
  assert.equal(
    leadActivityDisplayTitle({
      type: "unsubscribe",
      body: "Customer unsubscribed",
    }),
    "Notifications turned off",
  );
  assert.equal(
    leadActivityDisplayTitle({
      type: "contact_updated_by_customer",
      body: "Customer re-enabled email alerts",
      meta: { action: "global_optional_email_on" },
    }),
    "Email alerts resumed",
  );
  assert.equal(
    leadActivityDisplayTitle({
      type: "contact_updated_by_customer",
      body: "Customer updated contact: Phone",
    }),
    "Contact updated by customer",
  );

  const filters = read("src/lib/agent/activity-filters.ts");
  const alertsSlice = filters.slice(
    filters.indexOf('id: "property_alerts"'),
    filters.indexOf('id: "text"'),
  );
  assert.ok(alertsSlice.includes("property_watch_removed"));
  assert.ok(alertsSlice.includes("area_watch_removed"));
  const savedSlice = filters.slice(
    filters.indexOf('id: "saved_search"'),
    filters.indexOf('id: "status_history"'),
  );
  assert.ok(savedSlice.includes("saved_search_removed"));
  const unsubSlice = filters.slice(
    filters.indexOf('id: "unsubscribes"'),
    filters.indexOf('id: "unsubscribes"') + 220,
  );
  assert.ok(unsubSlice.includes("unsubscribe"));
}

function testRouteWiringNoNoise() {
  const prop = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(prop.includes("deleteOwnedPropertyMonitor"));
  assert.ok(prop.includes("logPropertyWatchRemovedBestEffort"));
  const patchSlice = prop.slice(
    prop.indexOf("export async function PATCH"),
    prop.indexOf("export async function DELETE"),
  );
  assert.ok(!patchSlice.includes("logPropertyWatchRemoved"));

  const area = read("src/app/api/account/area-monitors/route.ts");
  assert.ok(area.includes("deleteOwnedAreaMonitor"));
  const areaPatch = area.slice(
    area.indexOf("export async function PATCH"),
    area.indexOf("export async function DELETE"),
  );
  assert.ok(!areaPatch.includes("logAreaWatchRemoved"));

  const saved = read("src/app/api/saved-searches/route.ts");
  assert.ok(saved.includes("deleteOwnedSavedSearch"));
  const savedPatch = saved.slice(
    saved.indexOf("export async function PATCH"),
    saved.indexOf("export async function DELETE"),
  );
  assert.ok(!savedPatch.includes("logSavedSearchRemoved"));

  const prefs = read("src/app/api/account/preferences/route.ts");
  assert.ok(prefs.includes("prismaPreferenceCommandContext()"));
  assert.ok(prefs.includes("setGlobalOptionalEmailPreference"));
  assert.ok(!prefs.includes('body: "Customer turned off email alerts"'));
  assert.ok(prefs.includes("Customer turned off SMS alerts"));

  for (const rel of [
    "src/app/api/account/communication-preferences/route.ts",
    "src/app/api/preferences/email/route.ts",
    "src/app/api/preferences/email/one-click/route.ts",
  ]) {
    const src = read(rel);
    assert.ok(src.includes("setGlobalOptionalEmailPreference"));
    assert.ok(src.includes("prismaPreferenceCommandContext()"));
    assert.ok(!src.includes("logLeadActivityForCustomer"));
    assert.ok(
      !src.includes("emailAlertsEnabled:") ||
        src.includes("result.nextEnabled") ||
        src.includes("user.emailAlertsEnabled"),
    );
  }

  const prismaCtx = read("src/lib/communications/prisma-preference-context.ts");
  assert.ok(prismaCtx.includes("onGlobalOptionalEmailTransition"));
  assert.ok(prismaCtx.includes("logGlobalOptionalEmailCrmActivityBestEffort"));

  const userStore = read("src/lib/communications/preference-user-store.ts");
  assert.ok(userStore.includes("applyEmailAlertsEnabled"));
  assert.ok(userStore.includes("updateMany"));

  const crm = read("src/lib/agent/customer-alert-crm-activity.ts");
  assert.ok(!crm.includes("sendPush"));
  assert.ok(!crm.includes("recordActivityEvent"));

  const timeline = read("src/lib/agent/customer-timeline.ts");
  assert.ok(timeline.includes("WATCH_PROPERTY"));
  assert.ok(timeline.includes("propertyMonitor.findMany"));
  const display = read("src/lib/agent/activity-display.ts");
  assert.ok(display.includes("leadActivityDisplayTitle"));
  assert.ok(!display.includes("prisma"));
  const crmTimeline = read("src/components/agent/CrmTimeline.tsx");
  assert.ok(crmTimeline.includes('from "@/lib/agent/activity-display"'));
  assert.ok(
    !crmTimeline.includes('from "@/lib/agent/customer-timeline"') ||
      crmTimeline.includes("import type"),
  );
  assert.ok(
    !crmTimeline.includes("{ leadActivityDisplayTitle } from \"@/lib/agent/customer-timeline\""),
  );
}

function testNoEmailLookup() {
  const helper = read("src/lib/agent/log-contact-activity.ts");
  assert.ok(helper.includes("Never resolve by email"));
  const crm = read("src/lib/agent/customer-alert-crm-activity.ts");
  assert.ok(crm.includes("logLeadActivityForCustomer"));
  assert.ok(!/\bfindUnique\(\s*\{\s*where:\s*\{\s*email/.test(crm));
}

async function testToggleNoiseStaysZero() {
  const monitorsClient = read("src/components/account/MonitorsClient.tsx");
  assert.ok(!monitorsClient.includes("logLeadActivity"));
  const toggle = read(
    "src/components/account/SavedSearchEmailAlertsToggle.tsx",
  );
  assert.ok(!toggle.includes("logLeadActivity"));
  const commands = read("src/lib/communications/preference-commands.ts");
  const categoryFn = commands.slice(
    commands.indexOf("export async function setCategoryEmailPreference"),
    commands.indexOf("export async function setGlobalOptionalEmailPreference"),
  );
  assert.ok(!categoryFn.includes("onGlobalOptionalEmailTransition"));
  assert.ok(!categoryFn.includes("logLeadActivity"));
}

async function main() {
  testPolicyConstantsAndLabels();
  await testPropertyAreaSavedSearchRemovalActivity();
  await testGlobalEmailTransitionsExactlyOnce();
  await testCanonicalCommandBehavioralHook();
  await testConcurrentOffOffAndOnOn();
  await testOwnedDeleteCoresAndCrmFailure();
  testPresentationAndFilters();
  testRouteWiringNoNoise();
  testNoEmailLookup();
  await testToggleNoiseStaysZero();
  const noop = await logLeadActivityForCustomer(
    {
      customerId: "missing",
      workspaceId: "ws_a",
      type: "unsubscribe",
      body: "x",
    },
    memoryCrmDb({ users: [], leads: [] }),
  );
  assert.equal(noop.written, 0);
  console.log("communications-phase3c-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
