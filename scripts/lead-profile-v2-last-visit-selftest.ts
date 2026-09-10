/**
 * Lead Profile V2 Last Visit / Online header selftest.
 * Run: node --import tsx scripts/lead-profile-v2-last-visit-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  formatV2LastVisitHeader,
  formatV2RelativeAgo,
} from "../src/lib/agent/lead-profile-v2/rail-query";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const LEGACY_FILES = [
  "src/components/agent/CustomerProfile.tsx",
  "src/components/agent/LeadQueryPopup.tsx",
  "src/lib/agent/lead-profile-snapshot.ts",
  "src/lib/agent/hotness.ts",
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

function testNoExtraEndpointOrQuery() {
  const railLoader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  assert.ok(railLoader.includes("hotnessFromSignals"));
  assert.ok(railLoader.includes("lastSeenAt"));
  assert.ok(railLoader.includes("isOnline: hot.isOnline"));
  const files = [
    "src/lib/agent/lead-profile-v2/load-rail.ts",
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.equal(src.includes("/last-visit"), false, `${rel} extra route`);
    assert.equal(src.includes("last-visit"), false, `${rel} extra resource`);
  }
  const globHint = read(
    "src/lib/agent/lead-profile-v2/types.ts",
  );
  assert.equal(globHint.includes('"last-visit"'), false);
}

function testRelativeFormatting() {
  assert.equal(formatV2RelativeAgo(null), "—");
  const now = Date.now();
  assert.equal(
    formatV2RelativeAgo(new Date(now - 5 * 60_000).toISOString()),
    "5 Min Ago",
  );
  assert.equal(
    formatV2RelativeAgo(new Date(now - 60_000).toISOString()),
    "1 Min Ago",
  );
  assert.equal(
    formatV2RelativeAgo(new Date(now - 60 * 60_000).toISOString()),
    "1 Hour Ago",
  );
  assert.equal(
    formatV2RelativeAgo(new Date(now - 2 * 60 * 60_000).toISOString()),
    "2 Hours Ago",
  );
  assert.equal(
    formatV2RelativeAgo(new Date(now - 47 * 60 * 60_000).toISOString()),
    "47 Hours Ago",
  );
  assert.equal(
    formatV2RelativeAgo(new Date(now - 72 * 60 * 60_000).toISOString()),
    "3 Days Ago",
  );
}

function testOnlineAndOfflineHeaders() {
  const seen = new Date(Date.now() - 2 * 60_000).toISOString();
  assert.equal(
    formatV2LastVisitHeader({ lastSeenAt: seen, isOnline: true }),
    "2 Min Ago (Last Visit) · Online",
  );
  assert.equal(
    formatV2LastVisitHeader({ lastSeenAt: seen, isOnline: false }),
    "2 Min Ago (Last Visit)",
  );
  assert.equal(
    formatV2LastVisitHeader({ lastSeenAt: null, isOnline: false }),
    "— (Last Visit)",
  );
  assert.equal(
    formatV2LastVisitHeader({ lastSeenAt: null, isOnline: true }),
    "— (Last Visit) · Online",
  );
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const helper = read("src/lib/agent/lead-profile-v2/rail-query.ts");
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    'className="mt-3 rounded-md bg-[#e0f2fe] px-3 py-3"',
    'className="mb-3 flex flex-wrap justify-between gap-2 text-[11px] font-semibold text-[#0369a1]"',
    "(Last Touch)",
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
  assert.ok(helper.includes('(Last Visit)${input.isOnline ? " · Online" : ""}'));
  assert.ok(legacy.includes("(Last Visit)"));
  assert.ok(legacy.includes(" · Online"));
  assert.ok(rail.includes("formatV2LastVisitHeader"));
  assert.ok(rail.includes("rail?.hot.lastSeenAt ?? null"));
  assert.ok(rail.includes("rail?.hot.isOnline ?? false"));
}

function testReusesRailHotNotActivityTab() {
  const snapshot = read("src/lib/agent/lead-profile-snapshot.ts");
  assert.ok(snapshot.includes("hotnessFromSignals"));
  const railUi = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  assert.equal(railUi.includes("prisma.activityEvent"), false);
  assert.equal(railUi.includes("prisma.siteVisitor"), false);
  assert.equal(railUi.includes("prisma.listingView"), false);
  const panel = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2ActivityPanel.tsx",
  );
  assert.equal(panel.includes("Last Visit"), false);
  assert.equal(panel.includes("isOnline"), false);
}

function testRailFailureDoesNotTakeDownActivity() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const activityCase =
    host.split('case "activity":')[1]?.split("case \"reminders\":")[0] ?? "";
  assert.ok(activityCase.includes("LeadProfileV2ActivityPanel"));
  assert.equal(activityCase.includes("rail.error"), false);
  const hook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  assert.equal(hook.includes("setData("), false);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testNoExtraEndpointOrQuery();
  testRelativeFormatting();
  testOnlineAndOfflineHeaders();
  testPresentationParity();
  testReusesRailHotNotActivityTab();
  testRailFailureDoesNotTakeDownActivity();
  console.log("lead-profile-v2-last-visit-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
