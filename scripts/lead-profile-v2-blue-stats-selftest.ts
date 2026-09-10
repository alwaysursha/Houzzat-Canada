/**
 * Lead Profile V2 blue rail stats tiles selftest.
 * Run: node --import tsx scripts/lead-profile-v2-blue-stats-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { HOT_VIEW_WINDOW_MS } from "../src/lib/agent/hotness";
import { v2RailBlueStatTiles } from "../src/lib/agent/lead-profile-v2/rail-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
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

function testExactTileSemantics() {
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("prisma.listingView.count"));
  assert.ok(snapshot.includes("createdAt: { gte: viewSince }"));
  assert.ok(snapshot.includes("prisma.savedListing.count"));
  assert.ok(snapshot.includes("prisma.customerAlert.count"));
  assert.ok(snapshot.includes("prisma.leadEmailLog.count"));
  assert.ok(snapshot.includes("emails: emailCount"));
  assert.ok(snapshot.includes("alerts: alertCount"));
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(legacy.includes('["Views", data.hot.views24h]'));
  assert.ok(legacy.includes('["Saves", data.stats.saves]'));
  assert.ok(legacy.includes('["Alerts", data.stats.alerts]'));
  assert.ok(legacy.includes('["Emails", data.stats.emails]'));
  assert.equal(HOT_VIEW_WINDOW_MS, 24 * 60 * 60 * 1000);

  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  assert.ok(loader.includes("HOT_VIEW_WINDOW_MS"));
  assert.ok(loader.includes("prisma.listingView.count"));
  assert.ok(loader.includes("prisma.savedListing.count"));
  assert.ok(loader.includes("prisma.leadEmailLog.count({ where: { leadId: lead.id } })"));
  assert.ok(loader.includes("prisma.customerAlert.count({ where: { userId: customerId } })"));
  assert.ok(loader.includes('emails: emailCount'));
  assert.ok(loader.includes("alerts: alertCount"));
}

function testCountOnlyNoHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  for (const banned of [
    "htmlBody",
    "prisma.leadEmailLog.findMany",
    "prisma.customerAlert.findMany",
    "prisma.leadEmailLog.findFirst",
    "prisma.customerAlert.findFirst",
    "select: { html",
    "body: true",
  ]) {
    assert.equal(loader.includes(banned), false, `must not hydrate ${banned}`);
  }
  assert.equal(loader.split("prisma.listingView.count").length - 1, 1);
  assert.equal(loader.split("prisma.savedListing.count").length - 1, 1);
}

function testTileOrderAndDegrade() {
  const tiles = v2RailBlueStatTiles({
    hot: { views24h: 4 },
    stats: { saves: 3, alerts: 2, emails: 7 },
  });
  assert.deepEqual(
    tiles.map(([label]) => label),
    ["Views", "Saves", "Alerts", "Emails"],
  );
  assert.deepEqual(
    tiles.map(([, value]) => value),
    [4, 3, 2, 7],
  );
  assert.deepEqual(
    v2RailBlueStatTiles(null).map(([, value]) => value),
    [0, 0, 0, 0],
  );
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    'className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4"',
    'className="text-xl font-bold text-[#0c4a6e]"',
    'className="text-[10px] font-semibold text-[#0284c7]"',
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
  assert.ok(rail.includes("v2RailBlueStatTiles(rail)"));
}

function testNoNewEndpoint() {
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  assert.ok(types.includes("alerts: number"));
  assert.ok(types.includes("emails: number"));
  assert.equal(types.includes('"blue-stats"'), false);
  assert.equal(types.includes('"rail-stats"'), false);
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(host.includes("/blue-stats"), false);
  assert.equal(host.includes("/rail-stats"), false);
}

function testTargetedEmailRefresh() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const helper = read(
    "src/lib/agent/lead-profile-v2/conversations-email-refresh-query.ts",
  );
  const sent =
    host.split("const onEmailSent")[1]?.split("const onMatchboardUpdated")[0] ??
    "";
  assert.ok(sent.includes("applyV2ConversationsEmailSentRefresh"));
  assert.ok(sent.includes("reloadRail"));
  assert.ok(sent.includes("reloadEmails"));
  assert.equal(sent.includes("reload()"), false);
  const applyFn =
    helper.split("export function applyV2ConversationsEmailSentRefresh")[1] ??
    "";
  assert.ok(applyFn.includes("reloadRail()"));
  assert.ok(applyFn.includes("reloadEmails()"));
  const homes = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2EngagementPanel.tsx",
  );
  assert.equal(homes.includes("reloadRail"), false);
}

function testRailFailureDoesNotBreakShell() {
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(hook.includes("setData("), false);
  assert.ok(host.includes("rail={rail.panel}"));
  assert.ok(
    host.includes("nextReminder={nextReminderResource.panel?.nextReminder ?? null}"),
  );
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testExactTileSemantics();
  testCountOnlyNoHydration();
  testTileOrderAndDegrade();
  testPresentationParity();
  testNoNewEndpoint();
  testTargetedEmailRefresh();
  testRailFailureDoesNotBreakShell();
  console.log("lead-profile-v2-blue-stats-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
