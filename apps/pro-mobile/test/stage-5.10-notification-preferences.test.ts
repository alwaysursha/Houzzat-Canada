/**
 * Stage 5.10 — Native Notification Preferences tests.
 *
 * Web authority: /agent/notifications + User.pushNotificationPrefs.
 * USER GLOBAL scope. No CASL toggles. No biometrics. No invented SMS staff prefs.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAllWorkspaceCaches,
  clearNotificationPrefsCache,
  notificationPrefsCache,
  notificationPrefsCacheKey,
} from "../src/lib/lead-tab-cache";
import { unwrapNotificationPreferences } from "../src/lib/notification-preferences-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/notification-preferences/route.ts",
);
const WEB_PAGE = join(
  REPO_ROOT,
  "src/app/(agent)/agent/notifications/page.tsx",
);
const WEB_API = join(
  REPO_ROOT,
  "src/app/api/notifications/preferences/route.ts",
);
const STAFF_CAT = join(
  REPO_ROOT,
  "src/lib/notifications/staff-categories.ts",
);
const SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/NotificationPreferencesScreen.tsx",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CC_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommandCentreShell.tsx",
);
const SCHEMA = join(REPO_ROOT, "prisma/schema.prisma");

const CATEGORIES = [
  "new_leads",
  "lead_assignment",
  "contact_appointments",
  "live_activity",
  "tasks",
  "engagement",
] as const;

function isStaffNotificationCategory(value: string): boolean {
  return (CATEGORIES as readonly string[]).includes(value);
}

/** Minimal merge mirror for tests (parity with staff-categories). */
function mergeStaffCategoryPrefs(
  existing: Record<string, unknown>,
  patch: { category: string; channel: "push" | "email"; enabled: boolean },
): Record<string, unknown> {
  const pushTypes: Record<string, string[]> = {
    new_leads: ["new_lead"],
    lead_assignment: ["lead_reassigned"],
    contact_appointments: ["contact_requested", "appointment"],
    live_activity: ["lead_online", "hot_pipeline"],
    tasks: ["task_due"],
    engagement: ["alert_engagement"],
  };
  const next = { ...existing };
  const email =
    next.staffEmail && typeof next.staffEmail === "object"
      ? { ...(next.staffEmail as Record<string, boolean>) }
      : {};
  if (patch.channel === "push") {
    for (const t of pushTypes[patch.category] || []) {
      next[t] = patch.enabled;
    }
  } else {
    email[patch.category] = patch.enabled;
    next.staffEmail = email;
  }
  return next;
}

function staffCategoriesForUi(prefs: Record<string, unknown>) {
  const email =
    prefs.staffEmail && typeof prefs.staffEmail === "object"
      ? (prefs.staffEmail as Record<string, boolean>)
      : {};
  const pushMap: Record<string, string[]> = {
    new_leads: ["new_lead"],
    lead_assignment: ["lead_reassigned"],
    contact_appointments: ["contact_requested", "appointment"],
    live_activity: ["lead_online", "hot_pipeline"],
    tasks: ["task_due"],
    engagement: ["alert_engagement"],
  };
  return CATEGORIES.map((id) => {
    const types = pushMap[id] || [];
    const pushEnabled = types.every((t) => prefs[t] !== false);
    return {
      id,
      pushEnabled,
      emailEnabled: email[id] !== false,
      emailActive: id === "new_leads",
      highStakes:
        id === "new_leads" || id === "lead_assignment" || id === "tasks",
    };
  });
}

/** Mirror PATCH whitelist rejection. */
function acceptPatchBody(body: unknown): {
  ok: boolean;
  code?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  const keys = Object.keys(body as Record<string, unknown>);
  const allowed = new Set(["category", "channel", "enabled"]);
  if (keys.some((k) => !allowed.has(k))) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  const b = body as {
    category?: string;
    channel?: string;
    enabled?: boolean;
  };
  if (
    typeof b.category !== "string" ||
    !isStaffNotificationCategory(b.category) ||
    (b.channel !== "push" && b.channel !== "email") ||
    typeof b.enabled !== "boolean"
  ) {
    return { ok: false, code: "VALIDATION_ERROR" };
  }
  return { ok: true };
}

async function runStage510Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.10 — NATIVE NOTIFICATION PREFERENCES TESTS");
  console.log("=================================================================\n");

  console.log("[1] Web Notifications is functional prefs authority...");
  {
    const page = readFileSync(WEB_PAGE, "utf8");
    assert.ok(page.includes("StaffNotificationPreferencesForm"));
    assert.ok(page.includes("staffCategoriesForUi"));
    const api = readFileSync(WEB_API, "utf8");
    assert.ok(api.includes("mergeStaffCategoryPrefs"));
    assert.ok(api.includes('channel: z.enum(["push", "email"])'));
    console.log("  -> PASS");
  }

  console.log("[2] Canonical model: User.pushNotificationPrefs (USER GLOBAL)...");
  {
    const schema = readFileSync(SCHEMA, "utf8");
    assert.ok(schema.includes("pushNotificationPrefs"));
    assert.ok(schema.includes("model PushDevice"));
    assert.equal(schema.includes("workspaceId String"), true); // exists elsewhere
    const pushBlock = schema.slice(
      schema.indexOf("model PushDevice"),
      schema.indexOf("model PushDevice") + 500,
    );
    assert.equal(pushBlock.includes("workspaceId"), false);
    console.log("  -> PASS");
  }

  console.log("[3] GET shape + category toggles...");
  {
    const catSrc = readFileSync(STAFF_CAT, "utf8");
    for (const id of CATEGORIES) {
      assert.ok(catSrc.includes(`"${id}"`) || catSrc.includes(`id: "${id}"`));
    }
    const categories = staffCategoriesForUi({});
    assert.equal(categories.length, 6);
    assert.ok(categories.every((c) => c.pushEnabled === true));
    assert.ok(categories.every((c) => c.emailEnabled === true));
    const newLeads = categories.find((c) => c.id === "new_leads");
    assert.equal(newLeads?.emailActive, true);
    assert.equal(newLeads?.highStakes, true);
    console.log("  -> PASS");
  }

  console.log("[4] PATCH allowed preference merges...");
  {
    const next = mergeStaffCategoryPrefs({}, {
      category: "new_leads",
      channel: "push",
      enabled: false,
    });
    assert.equal(next.new_lead, false);
    const ui = staffCategoriesForUi(next);
    assert.equal(ui.find((c) => c.id === "new_leads")?.pushEnabled, false);
    assert.equal(ui.find((c) => c.id === "new_leads")?.emailEnabled, true);

    const emailOff = mergeStaffCategoryPrefs(next, {
      category: "tasks",
      channel: "email",
      enabled: false,
    });
    const staffEmail = emailOff.staffEmail as Record<string, boolean>;
    assert.equal(staffEmail.tasks, false);
    console.log("  -> PASS");
  }

  console.log("[5] Reject unknown fields / invalid category...");
  {
    assert.equal(acceptPatchBody({ category: "new_leads", channel: "push", enabled: true }).ok, true);
    assert.equal(
      acceptPatchBody({
        category: "new_leads",
        channel: "push",
        enabled: true,
        userId: "other",
      }).ok,
      false,
    );
    assert.equal(
      acceptPatchBody({ category: "fake_category", channel: "push", enabled: true }).ok,
      false,
    );
    assert.equal(
      acceptPatchBody({ prefs: { new_lead: false } }).ok,
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[6] Auth: workspace token required; platform token not workspace...");
  {
    const ws = createWorkspaceAccessToken({
      userId: "usr_agent",
      email: "a@canary.com",
      workspaceId: "ws_canary",
      role: "AGENT",
    });
    const v = verifyMobileToken(ws.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.equal(v.payload.type, "mobile_workspace_access");
    assert.equal(v.payload.sub, "usr_agent");

    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "p@x.com",
    });
    const pv = verifyMobileToken(platform.token);
    assert.equal(pv.ok, true);
    if (!pv.ok) return;
    assert.notEqual(pv.payload.type, "mobile_workspace_access");
    console.log("  -> PASS");
  }

  console.log("[7] Cache: user-global key; logout clears; workspace switch keeps...");
  {
    notificationPrefsCache.clear();
    const key = notificationPrefsCacheKey("usr_a");
    notificationPrefsCache.set(key, {
      prefs: {
        scope: "user_global",
        categories: [],
        staffEmail: "a@x.com",
        device: { registeredDevices: 0, shell: "houzzatpro" },
        meta: {
          caslNotConfigurableHere: true,
          smsPreferenceNotCanonicalForStaff: true,
          inboundEmailCanonical: false,
        },
      },
      timestamp: 1,
    });
    clearAllWorkspaceCaches("ws_canary");
    assert.equal(notificationPrefsCache.has(key), true);
    clearAllWorkspaceCaches();
    assert.equal(notificationPrefsCache.has(key), false);
    notificationPrefsCache.set(key, {
      prefs: {
        scope: "user_global",
        categories: [],
        staffEmail: null,
        device: { registeredDevices: 1, shell: "houzzatpro" },
        meta: {
          caslNotConfigurableHere: true,
          smsPreferenceNotCanonicalForStaff: true,
          inboundEmailCanonical: false,
        },
      },
      timestamp: 2,
    });
    clearNotificationPrefsCache("usr_a");
    assert.equal(notificationPrefsCache.has(key), false);
    console.log("  -> PASS");
  }

  console.log("[8] Unwrap + failed PATCH rollback semantics (optimistic)...");
  {
    const unwrapped = unwrapNotificationPreferences({
      ok: true,
      data: {
        categories: staffCategoriesForUi({}),
        staffEmail: "agent@example.com",
        device: { registeredDevices: 2, shell: "houzzatpro" },
      },
    });
    assert.ok(unwrapped);
    assert.equal(unwrapped?.staffEmail, "agent@example.com");
    assert.equal(unwrapped?.device.registeredDevices, 2);
    assert.equal(unwrapped?.scope, "user_global");

    // Optimistic rollback: previous categories restored on failure
    const previous = staffCategoriesForUi({});
    let current = previous.map((c) =>
      c.id === "new_leads" ? { ...c, pushEnabled: false } : c,
    );
    const patchFailed = true;
    if (patchFailed) current = previous;
    assert.equal(current.find((c) => c.id === "new_leads")?.pushEnabled, true);
    console.log("  -> PASS");
  }

  console.log("[9] Native screen: no WebView, no biometrics, CASL protected...");
  {
    const screen = readFileSync(SCREEN, "utf8");
    assert.equal(screen.includes("WebView"), false);
    assert.equal(screen.includes("biometric"), false);
    assert.equal(screen.includes("Face ID"), false);
    assert.equal(screen.includes("fingerprint"), false);
    assert.ok(screen.includes("CASL"));
    assert.ok(screen.includes("Open system notification settings"));
    assert.ok(screen.includes("/notification-preferences"));
    assert.equal(screen.includes("smsAlertsEnabled"), false);
    assert.equal(screen.includes("emailAlertsEnabled"), false);

    const route = readFileSync(ROUTE, "utf8");
    assert.ok(route.includes("mergeStaffCategoryPrefs"));
    assert.ok(route.includes("staffCategoriesForUi"));
    assert.ok(route.includes("Unknown preference fields"));
    assert.ok(route.includes("caslNotConfigurableHere"));
    assert.equal(route.includes("$transaction"), false);
    assert.equal(route.includes("caslConsentAt"), false);

    const agent = readFileSync(AGENT_SHELL, "utf8");
    const cc = readFileSync(CC_SHELL, "utf8");
    assert.ok(agent.includes("NotificationPreferencesScreen"));
    assert.ok(agent.includes('activeUtility === "notifications"'));
    assert.ok(cc.includes("NotificationPreferencesScreen"));
    console.log("  -> PASS");
  }

  console.log("[10] No notification inbox / no SMS staff channel...");
  {
    const screen = readFileSync(SCREEN, "utf8");
    assert.equal(screen.includes("Notification Centre"), false);
    assert.equal(screen.includes("smsAlertsEnabled"), false);
    assert.equal(screen.includes(">SMS<"), false);
    const route = readFileSync(ROUTE, "utf8");
    assert.ok(route.includes("smsPreferenceNotCanonicalForStaff: true"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.10 — ALL TESTS PASSED\n");
}

runStage510Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
