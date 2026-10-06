/**
 * Phase 3A — individual watch email controls, sold-alert category, workspace CRM helper.
 * Run: pnpm communications-phase3a:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AreaMonitor } from "@prisma/client";
import { createOrReuseAreaMonitor } from "../src/lib/account/area-monitor-create";
import {
  areaMonitorSettingsPatchSchema,
  memoryAreaMonitorSettingsStore,
  patchAreaMonitorSettings,
  type AreaMonitorSettingsRow,
} from "../src/lib/account/area-monitor-settings";
import {
  memoryPropertyMonitorSettingsStore,
  patchPropertyMonitorEmailAlerts,
  propertyMonitorEmailPatchSchema,
  resolvePropertyMonitorEmailAlertsOnUpsert,
  type PropertyMonitorSettingsRow,
} from "../src/lib/account/property-monitor-settings";
import {
  memoryOwnedSavedSearchStore,
  patchOwnedSavedSearchEmailAlerts,
} from "../src/lib/account/saved-search-ownership";
import {
  logLeadActivityForCustomer,
  resolveCustomerActivityWorkspace,
  type LeadActivityCustomerDb,
} from "../src/lib/agent/log-contact-activity";
import { classifyEmailKind } from "../src/lib/communications/classification";
import { memoryCommunicationPreferenceStore } from "../src/lib/communications/preference-store";
import {
  evaluateOptionalEmailSuppression,
  resolveOptionalEmailCategory,
} from "../src/lib/communications/send-enforcement";
import { memoryEmailSuppressionStore } from "../src/lib/communications/suppression";

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

function areaRow(
  overrides: Partial<AreaMonitorSettingsRow> &
    Pick<AreaMonitorSettingsRow, "id" | "userId">,
): AreaMonitorSettingsRow {
  return {
    id: overrides.id,
    userId: overrides.userId,
    emailAlerts: overrides.emailAlerts ?? true,
    notifyNew: overrides.notifyNew ?? true,
    notifySold: overrides.notifySold ?? true,
    city: overrides.city ?? "Toronto",
    community: overrides.community ?? null,
    lastSeenListingAt: overrides.lastSeenListingAt ?? new Date("2026-01-01"),
    lastAlertedAt: overrides.lastAlertedAt ?? null,
  };
}

async function testPropertyUpsertPreserveAndPatch() {
  assert.equal(
    resolvePropertyMonitorEmailAlertsOnUpsert({ existingEmailAlerts: null }),
    true,
  );
  assert.equal(
    resolvePropertyMonitorEmailAlertsOnUpsert({
      existingEmailAlerts: false,
    }),
    false,
  );
  assert.equal(
    resolvePropertyMonitorEmailAlertsOnUpsert({
      existingEmailAlerts: false,
      supplied: true,
    }),
    true,
  );

  const rows = [
    propertyRow({
      userId: "user_a",
      mlsNumber: "AONLY1",
      emailAlerts: true,
      lastKnownPrice: 500_000,
      lastAlertedAt: new Date("2026-03-01"),
    }),
    propertyRow({ userId: "user_b", mlsNumber: "BONLY1", emailAlerts: true }),
  ];
  const store = memoryPropertyMonitorSettingsStore(rows);

  const missing = await patchPropertyMonitorEmailAlerts(store, {
    userId: "user_a",
    mlsNumber: "MISSING",
    emailAlerts: false,
  });
  assert.equal(missing.ok, false);

  const denied = await patchPropertyMonitorEmailAlerts(store, {
    userId: "user_b",
    mlsNumber: "AONLY1",
    emailAlerts: false,
  });
  assert.equal(denied.ok, false);
  assert.equal(rows[0]!.emailAlerts, true);
  assert.equal(rows[0]!.lastKnownPrice, 500_000);
  assert.equal(rows[0]!.lastAlertedAt?.toISOString(), "2026-03-01T00:00:00.000Z");

  const muted = await patchPropertyMonitorEmailAlerts(store, {
    userId: "user_a",
    mlsNumber: "AONLY1",
    emailAlerts: false,
  });
  assert.equal(muted.ok, true);
  if (!muted.ok) throw new Error("expected ok");
  assert.equal(muted.item.emailAlerts, false);
  assert.equal(rows[0]!.lastKnownPrice, 500_000, "PATCH must not change price");
  assert.equal(rows[0]!.lastKnownStatus, "ACTIVE");
  assert.equal(
    rows[0]!.lastAlertedAt?.toISOString(),
    "2026-03-01T00:00:00.000Z",
    "PATCH must not reset lastAlertedAt",
  );
  assert.equal(rows[1]!.emailAlerts, true, "Customer B untouched");

  const same = await patchPropertyMonitorEmailAlerts(store, {
    userId: "user_a",
    mlsNumber: "AONLY1",
    emailAlerts: false,
  });
  assert.equal(same.ok, true);
  assert.equal(rows[0]!.emailAlerts, false);

  assert.equal(
    propertyMonitorEmailPatchSchema.safeParse({
      mlsNumber: "X",
      emailAlerts: true,
      lastKnownPrice: 1,
    }).success,
    false,
    "unsupported fields rejected",
  );
  assert.equal(
    propertyMonitorEmailPatchSchema.safeParse({ mlsNumber: "X" }).success,
    false,
  );
}

async function testAreaPartialPatchAndOwnership() {
  const rows = [
    areaRow({
      id: "area_a",
      userId: "user_a",
      emailAlerts: true,
      notifyNew: true,
      notifySold: true,
      lastSeenListingAt: new Date("2026-01-15"),
      lastAlertedAt: new Date("2026-01-20"),
    }),
    areaRow({
      id: "area_b",
      userId: "user_b",
      emailAlerts: true,
      notifyNew: true,
      notifySold: true,
    }),
  ];
  const store = memoryAreaMonitorSettingsStore(rows);

  const foreign = await patchAreaMonitorSettings(store, {
    userId: "user_a",
    id: "area_b",
    emailAlerts: false,
  });
  assert.equal(foreign.ok, false);
  assert.equal(rows[1]!.emailAlerts, true);

  const notifyOnly = await patchAreaMonitorSettings(store, {
    userId: "user_a",
    id: "area_a",
    notifyNew: false,
  });
  assert.equal(notifyOnly.ok, true);
  assert.equal(rows[0]!.notifyNew, false);
  assert.equal(rows[0]!.emailAlerts, true, "notifyNew PATCH preserves emailAlerts");
  assert.equal(rows[0]!.notifySold, true, "notifyNew PATCH preserves notifySold");
  assert.equal(
    rows[0]!.lastSeenListingAt?.toISOString(),
    "2026-01-15T00:00:00.000Z",
  );
  assert.equal(
    rows[0]!.lastAlertedAt?.toISOString(),
    "2026-01-20T00:00:00.000Z",
  );

  const emailOnly = await patchAreaMonitorSettings(store, {
    userId: "user_a",
    id: "area_a",
    emailAlerts: false,
  });
  assert.equal(emailOnly.ok, true);
  assert.equal(rows[0]!.emailAlerts, false);
  assert.equal(rows[0]!.notifyNew, false, "email PATCH preserves notifyNew");
  assert.equal(rows[0]!.notifySold, true, "email PATCH preserves notifySold");

  const soldOnly = await patchAreaMonitorSettings(store, {
    userId: "user_a",
    id: "area_a",
    notifySold: false,
  });
  assert.equal(soldOnly.ok, true);
  assert.equal(rows[0]!.notifySold, false);
  assert.equal(rows[0]!.emailAlerts, false);
  assert.equal(rows[0]!.notifyNew, false);

  const idempotent = await patchAreaMonitorSettings(store, {
    userId: "user_a",
    id: "area_a",
    emailAlerts: false,
  });
  assert.equal(idempotent.ok, true);
  assert.deepEqual(
    {
      emailAlerts: rows[0]!.emailAlerts,
      notifyNew: rows[0]!.notifyNew,
      notifySold: rows[0]!.notifySold,
    },
    { emailAlerts: false, notifyNew: false, notifySold: false },
  );

  assert.equal(
    areaMonitorSettingsPatchSchema.safeParse({ id: "area_a" }).success,
    false,
    "empty Area PATCH rejected",
  );
  assert.equal(
    areaMonitorSettingsPatchSchema.safeParse({
      id: "area_a",
      emailAlerts: false,
      city: "Ottawa",
    }).success,
    false,
    "unsupported Area fields rejected",
  );
  assert.equal(
    areaMonitorSettingsPatchSchema.safeParse({
      id: "area_a",
      notifyNew: true,
      notifySold: false,
    }).success,
    true,
  );

  // Reuse preserves customized settings
  const createRows: AreaMonitor[] = [];
  const createStore = {
    async findEquivalent(criteria: {
      userId: string;
      city: string;
      community: string | null;
      transactionType: AreaMonitor["transactionType"];
      segment: NonNullable<AreaMonitor["segment"]>;
    }) {
      return (
        createRows.find(
          (row) =>
            row.userId === criteria.userId &&
            row.city === criteria.city &&
            (row.community ?? null) === criteria.community &&
            row.transactionType === criteria.transactionType &&
            (row.segment ?? "RESIDENTIAL") === criteria.segment,
        ) ?? null
      );
    },
    async create(data: {
      userId: string;
      city: string;
      community: string | null;
      transactionType: AreaMonitor["transactionType"];
      segment: NonNullable<AreaMonitor["segment"]>;
      emailAlerts: boolean;
      notifyNew: boolean;
      notifySold: boolean;
      lastSeenListingAt: Date;
    }) {
      const row = {
        id: `area_${createRows.length + 1}`,
        name: data.city,
        ...data,
        lastAlertedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AreaMonitor;
      createRows.push(row);
      return row;
    },
  };
  const created = await createOrReuseAreaMonitor(createStore, {
    userId: "user_a",
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    emailAlerts: true,
    notifyNew: true,
    notifySold: true,
    lastSeenListingAt: new Date(),
  });
  created.item.emailAlerts = false;
  created.item.notifyNew = false;
  const reused = await createOrReuseAreaMonitor(createStore, {
    userId: "user_a",
    city: "Toronto",
    community: null,
    transactionType: "SALE",
    segment: "RESIDENTIAL",
    emailAlerts: true,
    notifyNew: true,
    notifySold: true,
    lastSeenListingAt: new Date(),
  });
  assert.equal(reused.alreadyWatching, true);
  assert.equal(reused.item.emailAlerts, false);
  assert.equal(reused.item.notifyNew, false);
  assert.equal(reused.item.notifySold, true);
}

async function testSavedSearchOwnership() {
  const rows = [
    {
      id: "ss_a",
      userId: "user_a",
      name: "Toronto",
      emailAlerts: true,
      smsAlerts: false,
      isPrimary: true,
      isHomepageActive: false,
    },
    {
      id: "ss_b",
      userId: "user_b",
      name: "Ottawa",
      emailAlerts: true,
      smsAlerts: false,
      isPrimary: true,
      isHomepageActive: false,
    },
  ];
  const store = memoryOwnedSavedSearchStore(rows);

  const denied = await patchOwnedSavedSearchEmailAlerts(store, {
    userId: "user_a",
    id: "ss_b",
    emailAlerts: false,
  });
  assert.equal(denied.ok, false);
  assert.equal(rows[1]!.emailAlerts, true);

  const ok = await patchOwnedSavedSearchEmailAlerts(store, {
    userId: "user_a",
    id: "ss_a",
    emailAlerts: false,
  });
  assert.equal(ok.ok, true);
  assert.equal(rows[0]!.emailAlerts, false);
  assert.equal(rows[0]!.isPrimary, true);
  assert.equal(rows[0]!.name, "Toronto");

  const route = read("src/app/api/saved-searches/route.ts");
  assert.ok(route.includes("prismaOwnedSavedSearchStore().findOwned"));
}

async function testSoldAlertFourWay() {
  assert.equal(classifyEmailKind("sold_alert").category, "area_watch");
  assert.equal(
    resolveOptionalEmailCategory({
      kind: "sold_alert",
      category: "property_watch",
    }),
    "property_watch",
  );

  async function decide(input: {
    userId: string;
    category: "property_watch" | "area_watch" | undefined;
    propertyOn: boolean;
    areaOn: boolean;
  }) {
    const preferenceStore = memoryCommunicationPreferenceStore();
    await preferenceStore.upsert({
      userId: input.userId,
      workspaceId: "ws_a",
      category: "property_watch",
      channel: "email",
      enabled: input.propertyOn,
    });
    await preferenceStore.upsert({
      userId: input.userId,
      workspaceId: "ws_a",
      category: "area_watch",
      channel: "email",
      enabled: input.areaOn,
    });
    return evaluateOptionalEmailSuppression({
      to: `${input.userId}@example.com`,
      kind: "sold_alert",
      workspaceId: "ws_a",
      userId: input.userId,
      category: input.category,
      store: memoryEmailSuppressionStore(),
      preferenceStore,
    });
  }

  const propertyAllowed = await decide({
    userId: "u1",
    category: "property_watch",
    propertyOn: true,
    areaOn: false,
  });
  assert.equal(propertyAllowed.blocked, false);

  const areaAllowed = await decide({
    userId: "u2",
    category: "area_watch",
    propertyOn: false,
    areaOn: true,
  });
  assert.equal(areaAllowed.blocked, false);

  const propertyDenied = await decide({
    userId: "u3",
    category: "property_watch",
    propertyOn: false,
    areaOn: true,
  });
  assert.equal(propertyDenied.blocked, true);

  const areaDenied = await decide({
    userId: "u4",
    category: "area_watch",
    propertyOn: true,
    areaOn: false,
  });
  assert.equal(areaDenied.blocked, true);

  const legacy = await decide({
    userId: "u5",
    category: undefined,
    propertyOn: true,
    areaOn: false,
  });
  assert.equal(
    legacy.blocked,
    true,
    "no override still uses kind→area_watch classification",
  );

  const monitors = read("src/lib/account/monitors.ts");
  assert.ok(monitors.includes("communicationCategory: input.watchCategory"));
}

function memoryLeadActivityDb(seed: {
  users: Array<{ id: string; workspaceId: string | null }>;
  leads: Array<{ id: string; customerId: string; workspaceId: string }>;
}): LeadActivityCustomerDb & {
  activities: Array<{ leadId: string; type: string; body: string }>;
} {
  const activities: Array<{ leadId: string; type: string; body: string }> = [];
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
          });
        }
      },
    },
  };
}

async function testLeadActivityWorkspaceIsolation() {
  assert.deepEqual(
    resolveCustomerActivityWorkspace({
      userWorkspaceId: "ws_a",
      requestedWorkspaceId: "ws_b",
    }),
    { ok: false, workspaceId: "ws_a" },
  );

  const db = memoryLeadActivityDb({
    users: [{ id: "user_a", workspaceId: "ws_a" }],
    leads: [
      { id: "lead_a1", customerId: "user_a", workspaceId: "ws_a" },
      { id: "lead_a2", customerId: "user_a", workspaceId: "ws_a" },
      { id: "lead_b", customerId: "user_a", workspaceId: "ws_b" },
    ],
  });

  const written = await logLeadActivityForCustomer(
    {
      customerId: "user_a",
      workspaceId: "ws_a",
      type: "unsubscribe",
      body: "off",
      actorUserId: "user_a",
    },
    db,
  );
  assert.equal(written.written, 2, "same-workspace multi-lead fan-out preserved");
  assert.deepEqual(
    db.activities.map((a) => a.leadId).sort(),
    ["lead_a1", "lead_a2"],
  );

  const mismatch = await logLeadActivityForCustomer(
    {
      customerId: "user_a",
      workspaceId: "ws_b",
      type: "unsubscribe",
      body: "nope",
    },
    db,
  );
  assert.equal(mismatch.written, 0);

  const derived = await logLeadActivityForCustomer(
    {
      customerId: "user_a",
      type: "contact_updated_by_customer",
      body: "derived",
    },
    db,
  );
  assert.equal(derived.written, 2);

  const helperSrc = read("src/lib/agent/log-contact-activity.ts");
  assert.ok(!/\bemail\s*:/.test(helperSrc.split("export async function")[0] ?? ""));
  assert.ok(helperSrc.includes("workspaceId"));
  assert.ok(helperSrc.includes("customerId"));
}

async function testWatchPropertyTelemetryUnchanged() {
  // Evidence: HEAD recorded WATCH_PROPERTY on every successful POST (not only create).
  const head = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(head.includes('type: "WATCH_PROPERTY"'));
  assert.ok(head.includes("void recordActivityEvent"));
  // Must not be gated on !existing
  const postStart = head.indexOf("export async function POST");
  const patchStart = head.indexOf("export async function PATCH");
  const postFn = head.slice(postStart, patchStart);
  assert.ok(postFn.includes("recordActivityEvent"));
  assert.ok(
    !postFn.includes("if (!existing)") ||
      !postFn
        .slice(postFn.indexOf("recordActivityEvent") - 40)
        .startsWith("if (!existing)"),
  );
  // Stronger: recordActivityEvent appears after upsert unconditionally
  const upsertIdx = postFn.indexOf("propertyMonitor.upsert");
  const recordIdx = postFn.indexOf("recordActivityEvent");
  assert.ok(upsertIdx > 0 && recordIdx > upsertIdx);
  assert.ok(!postFn.includes("if (!existing) {\n    void recordActivityEvent"));
}

async function testRouteWiringAndScope() {
  const prop = read("src/app/api/account/property-monitors/route.ts");
  assert.ok(prop.includes("patchPropertyMonitorEmailAlerts"));
  assert.ok(prop.includes("propertyMonitorEmailPatchSchema"));
  assert.ok(!prop.includes("LeadActivity") && !prop.includes("leadActivity"));

  const area = read("src/app/api/account/area-monitors/route.ts");
  assert.ok(area.includes("patchAreaMonitorSettings"));
  assert.ok(area.includes("areaMonitorSettingsPatchSchema"));

  const prefs = read("src/app/api/account/preferences/route.ts");
  const contact = read("src/app/api/account/contact/route.ts");
  const commute = read("src/app/api/account/commute/route.ts");
  assert.ok(prefs.includes("workspaceId: user.workspaceId"));
  assert.ok(contact.includes("workspaceId: user.workspaceId"));
  assert.ok(commute.includes("workspaceId: user.workspaceId"));

  const monitors = read("src/lib/account/monitors.ts");
  const pushIdx = monitors.indexOf("void sendPushToUser");
  const emailGateIdx = monitors.indexOf("!input.emailAlertsEnabled");
  assert.ok(pushIdx > 0 && emailGateIdx > pushIdx);
}

async function testLeadActivityCallerInventory() {
  // All production callers must pass workspaceId from the authenticated user.
  const callers = [
    "src/app/api/account/preferences/route.ts",
    "src/app/api/account/contact/route.ts",
    "src/app/api/account/commute/route.ts",
  ];
  for (const rel of callers) {
    const src = read(rel);
    assert.ok(
      src.includes("workspaceId: user.workspaceId"),
      `${rel} must pass workspaceId`,
    );
  }
}

async function main() {
  await testPropertyUpsertPreserveAndPatch();
  await testAreaPartialPatchAndOwnership();
  await testSavedSearchOwnership();
  await testSoldAlertFourWay();
  await testLeadActivityWorkspaceIsolation();
  await testWatchPropertyTelemetryUnchanged();
  await testRouteWiringAndScope();
  await testLeadActivityCallerInventory();
  console.log("communications-phase3a-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
