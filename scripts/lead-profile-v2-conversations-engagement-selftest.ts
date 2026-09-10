/**
 * Lead Profile V2 Conversations send → Engagement Overview refresh selftest.
 * Run: node --import tsx scripts/lead-profile-v2-conversations-engagement-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyV2ConversationsEmailSentRefresh,
  v2ConversationsEmailSendMayAffectEngagementOverviewEmails,
  v2ConversationsEmailSendMayAffectEngagementSubsection,
  v2ConversationsEmailSendWritesLeadEmailLog,
  v2ConversationsEmailSentRefreshPlan,
} from "../src/lib/agent/lead-profile-v2/conversations-email-refresh-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/components/agent/LeadEmailForm.tsx",
  "src/app/api/agent/email/route.ts",
  "src/lib/email/client-send.ts",
  "src/lib/email/log.ts",
  "src/lib/agent/lead-profile-panels.ts",
  "src/lib/agent/lead-profile-snapshot.ts",
];

function testLegacyUntouchedByV2Imports() {
  for (const rel of LEGACY_FILES) {
    const src = read(rel);
    assert.equal(
      src.includes("lead-profile-v2"),
      false,
      `${rel} must not import V2`,
    );
    assert.equal(
      src.includes("leads-v2"),
      false,
      `${rel} must not reference V2 routes`,
    );
  }
}

function testLegacyEmailSendReloadsSnapshotStats() {
  const form = read("src/components/agent/LeadEmailForm.tsx");
  assert.ok(form.includes("onUpdated?.()"));
  const profile = read("src/components/agent/CustomerProfile.tsx");
  const onUpdated =
    profile.split("const onUpdated = useCallback")[1]?.split(
      "const refreshProfile",
    )[0] ?? "";
  assert.ok(onUpdated.includes("void reload()"));
  const apply =
    profile.split("const applySnapshot = useCallback")[1]?.split(
      "const reload = useCallback",
    )[0] ?? "";
  assert.ok(apply.includes("setEngagementPanel(null)"));
  assert.ok(apply.includes("/api/agent/leads/${targetLeadId}/summary"));
  assert.ok(profile.includes('["Emails sent", data.stats.emails]'));
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("prisma.leadEmailLog.count({ where: { leadId: input.leadId } })"));
  const panel = read("src/lib/agent/lead-profile-panels.ts");
  const engagementLoader =
    panel.split("export async function loadLeadProfileEngagementPanel")[1] ??
    "";
  assert.equal(engagementLoader.includes("leadEmailLog.count"), false);
  assert.equal(engagementLoader.includes("stats:"), false);
}

function testSendLogsLeadEmailLogBeforeSuccess() {
  const route = read("src/app/api/agent/email/route.ts");
  assert.ok(route.includes("sendAndLogClientEmail"));
  assert.ok(route.includes("sent += 1"));
  const sendBlock =
    route.split("const result = await sendAndLogClientEmail")[1]?.split(
      "sent += 1",
    )[0] ?? "";
  assert.ok(sendBlock.includes("if (!result.ok)"));
  const clientSend = read("src/lib/email/client-send.ts");
  assert.ok(clientSend.includes("logClientEmail"));
  assert.ok(clientSend.includes("if (!result.ok) return result"));
  const log = read("src/lib/email/log.ts");
  assert.ok(log.includes("prisma.leadEmailLog.create"));
  assert.equal(v2ConversationsEmailSendWritesLeadEmailLog(), true);
  assert.equal(
    v2ConversationsEmailSendMayAffectEngagementOverviewEmails(),
    true,
  );
}

function testV2OverviewEmailsSource() {
  const loader = read(
    "src/lib/agent/lead-profile-v2/load-engagement-overview.ts",
  );
  assert.ok(
    loader.includes("prisma.leadEmailLog.count({ where: { leadId: lead.id } })"),
  );
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  const overview =
    types.split("export type LeadProfileV2EngagementOverview")[1]?.split(
      "export type LeadProfileV2SavedSearch",
    )[0] ?? "";
  assert.ok(overview.includes("emails: number"));
}

function testLoadedVsLazyPlan() {
  const loaded = v2ConversationsEmailSentRefreshPlan("engagement");
  assert.equal(loaded.reloadEngagementOverview, true);
  assert.equal(loaded.invalidateEngagementOverview, false);
  assert.equal(loaded.reloadEmails, true);
  assert.equal(loaded.reloadTimeline, true);
  assert.equal(loaded.reloadRail, true);
  assert.equal(loaded.reloadSavedSearches, false);
  assert.equal(loaded.reloadSavedHomes, false);
  assert.equal(loaded.reloadPropertyWatches, false);
  assert.equal(loaded.reloadAreaMonitors, false);
  assert.equal(loaded.reloadRoutePlanner, false);
  assert.equal(loaded.reloadListingNotes, false);
  assert.equal(loaded.reloadAlerts, false);
  assert.equal(loaded.reloadShell, false);

  const lazy = v2ConversationsEmailSentRefreshPlan("conversations");
  assert.equal(lazy.reloadEngagementOverview, false);
  assert.equal(lazy.invalidateEngagementOverview, true);
  assert.equal(lazy.reloadEmails, true);
  assert.equal(lazy.reloadRail, true);

  for (const resource of [
    "saved-searches",
    "saved-homes",
    "property-watches",
    "area-monitors",
    "route-planner",
    "listing-notes",
    "alerts",
  ] as const) {
    assert.equal(
      v2ConversationsEmailSendMayAffectEngagementSubsection(resource),
      false,
    );
  }
}

function testHelpersRefreshShape() {
  const loaded: string[] = [];
  applyV2ConversationsEmailSentRefresh({
    tab: "engagement",
    reloadEmails: () => loaded.push("emails"),
    reloadTimeline: () => loaded.push("timeline"),
    reloadRail: () => loaded.push("rail"),
    reloadEngagementOverview: () => loaded.push("reloadOverview"),
    invalidateEngagementOverview: () => loaded.push("invalidateOverview"),
  });
  assert.deepEqual(loaded, [
    "emails",
    "timeline",
    "rail",
    "reloadOverview",
  ]);

  const lazy: string[] = [];
  applyV2ConversationsEmailSentRefresh({
    tab: "conversations",
    reloadEmails: () => lazy.push("emails"),
    reloadTimeline: () => lazy.push("timeline"),
    reloadRail: () => lazy.push("rail"),
    reloadEngagementOverview: () => lazy.push("reloadOverview"),
    invalidateEngagementOverview: () => lazy.push("invalidateOverview"),
  });
  assert.deepEqual(lazy, [
    "emails",
    "timeline",
    "rail",
    "invalidateOverview",
  ]);
}

function testHostWiring() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const sent =
    host.split("const onEmailSent")[1]?.split("const onMatchboardUpdated")[0] ??
    "";
  assert.ok(sent.includes("applyV2ConversationsEmailSentRefresh"));
  assert.ok(sent.includes("invalidateEngagementOverview"));
  assert.ok(sent.includes("reloadEngagementOverview"));
  assert.ok(sent.includes("reloadEmails"));
  assert.ok(sent.includes("reloadRail"));
  assert.equal(sent.includes("reloadSavedSearches"), false);
  assert.equal(sent.includes("reloadSavedHomes"), false);
  assert.equal(sent.includes("reloadPropertyWatches"), false);
  assert.equal(sent.includes("reloadAreaMonitors"), false);
  assert.equal(sent.includes("reloadRoutePlanner"), false);
  assert.equal(sent.includes("reloadListingNotes"), false);
  assert.equal(sent.includes("reloadAlerts"), false);
  assert.equal(sent.includes("reload()"), false);
  assert.equal(host.includes("/summary"), false);
}

function testInvalidateDoesNotEagerFetchWhenDisabled() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  const invalidate =
    hook.split("const invalidate = useCallback")[1]?.split(
      "const loading =",
    )[0] ?? "";
  assert.ok(invalidate.includes("if (enabledRef.current) fetchPanel()"));
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.ok(
    host.includes("useLeadProfileV2EngagementOverview(\n    session,\n    leadId,\n    tab === \"engagement\""),
  );
}

function testNoRetries() {
  const form = read("src/components/agent/LeadEmailForm.tsx");
  const route = read("src/app/api/agent/email/route.ts");
  const helper = read(
    "src/lib/agent/lead-profile-v2/conversations-email-refresh-query.ts",
  );
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  for (const src of [form, route, helper, hook]) {
    assert.equal(src.includes("for (let attempt"), false);
    assert.equal(src.includes("retries"), false);
  }
}

function testFailureIsolation() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2EngagementOverview.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(hook.includes("setData("), false);
  const sent =
    host.split("const onEmailSent")[1]?.split("const onMatchboardUpdated")[0] ??
    "";
  assert.equal(sent.includes("setError"), false);
}

function main() {
  testLegacyUntouchedByV2Imports();
  testLegacyEmailSendReloadsSnapshotStats();
  testSendLogsLeadEmailLogBeforeSuccess();
  testV2OverviewEmailsSource();
  testLoadedVsLazyPlan();
  testHelpersRefreshShape();
  testHostWiring();
  testInvalidateDoesNotEagerFetchWhenDisabled();
  testNoRetries();
  testFailureIsolation();
  console.log("lead-profile-v2-conversations-engagement-selftest: ok");
}

main();
