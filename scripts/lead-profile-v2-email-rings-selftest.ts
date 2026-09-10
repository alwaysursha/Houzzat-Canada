/**
 * Lead Profile V2 Email Clicks / Opens / Alert Opens rings selftest.
 * Run: node --import tsx scripts/lead-profile-v2-email-rings-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  v2AlertOpenRate,
  v2EmailClickRate,
  v2EmailOpenRate,
  v2EmailRingRates,
} from "../src/lib/agent/lead-profile-v2/rail-query";

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

function testExactClickSemantics() {
  assert.equal(v2EmailClickRate({ views24h: 0, saves: 0 }), 0);
  assert.equal(v2EmailClickRate({ views24h: 2, saves: 1 }), 22);
  assert.equal(v2EmailClickRate({ views24h: 20, saves: 10 }), 100);
  const profile = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(
    profile.includes("Math.round(data.hot.views24h * 6 + data.stats.saves * 10)"),
  );
}

function testExactOpenSemantics() {
  assert.equal(v2EmailOpenRate({ emails: 0, hotness: 80 }), 0);
  assert.equal(v2EmailOpenRate({ emails: 1, hotness: 80 }), 80);
  assert.equal(v2EmailOpenRate({ emails: 12, hotness: 140 }), 100);
  const profile = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(
    profile.includes("data.stats.emails > 0 ? data.hot.hotness : 0"),
  );
}

function testExactAlertOpenSemantics() {
  assert.equal(v2AlertOpenRate({ alerts: 0 }), 0);
  assert.equal(v2AlertOpenRate({ alerts: 1 }), 48);
  assert.equal(v2AlertOpenRate({ alerts: 10 }), 100);
  const profile = read("src/components/agent/CustomerProfile.tsx");
  assert.ok(
    profile.includes("data.stats.alerts > 0 ? 40 + data.stats.alerts * 8 : 0"),
  );
}

function testRepeatOpensClicksDoNotChangeRings() {
  const once = v2EmailRingRates({
    hot: { views24h: 3, hotness: 55 },
    stats: { saves: 2, alerts: 2, emails: 1 },
  });
  const repeats = v2EmailRingRates({
    hot: { views24h: 3, hotness: 55 },
    stats: { saves: 2, alerts: 2, emails: 1 },
  });
  assert.deepEqual(once, repeats);
  const helper = read("src/lib/agent/lead-profile-v2/rail-query.ts");
  assert.equal(helper.includes("openCount"), false);
  assert.equal(helper.includes("clickCount"), false);
  assert.equal(helper.includes("openedAt"), false);
  assert.equal(helper.includes("clickedAt"), false);
  assert.equal(helper.includes("readAt"), false);
}

function testZeroState() {
  assert.deepEqual(v2EmailRingRates(null), {
    clickRate: 0,
    openRate: 0,
    alertRate: 0,
  });
  assert.deepEqual(
    v2EmailRingRates({
      hot: { views24h: 0, hotness: 90 },
      stats: { saves: 0, alerts: 0, emails: 0 },
    }),
    { clickRate: 0, openRate: 0, alertRate: 0 },
  );
}

function testNoEmailOrAlertHydration() {
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  for (const banned of [
    "htmlBody",
    "prisma.leadEmailLog.findMany",
    "prisma.customerAlert.findMany",
    "openCount",
    "clickCount",
    "openedAt",
    "clickedAt",
    "readAt",
  ]) {
    assert.equal(loader.includes(banned), false, `must not hydrate ${banned}`);
  }
}

function testNoNewEndpoint() {
  const types = read("src/lib/agent/lead-profile-v2/types.ts");
  assert.equal(types.includes("engagement-metrics"), false);
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  assert.equal(host.includes("engagement-metrics"), false);
  assert.equal(host.includes("useLeadProfileV2EmailRings"), false);
  assert.ok(host.includes("rail={rail.panel}"));
}

function testPresentationParity() {
  const rail = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  );
  const legacy = read("src/components/agent/CustomerProfile.tsx");
  for (const copy of [
    "Email information",
    "Email Clicks",
    "Email Opens",
    "Alert Opens",
    'className="mt-3 isolate rounded-md bg-[#e0f2fe] px-3 py-4"',
    'className="mb-3 text-center text-[11px] font-bold uppercase tracking-wide text-[#0369a1]"',
    'className="flex items-start justify-between gap-2"',
    'tone="#0ea5e9"',
    'tone="#0284c7"',
    'tone="#0369a1"',
    "conic-gradient",
    "{pct}%",
  ]) {
    assert.ok(rail.includes(copy), `rail missing ${copy}`);
    assert.ok(legacy.includes(copy), `legacy missing ${copy}`);
  }
}

function testConversationsFailureIsolation() {
  const host = read(
    "src/components/agent/lead-profile-v2/LeadProfileV2Host.tsx",
  );
  const conversations =
    host.split('case "conversations":')[1]?.split('case "engagement":')[0] ??
    "";
  assert.ok(conversations.includes("LeadProfileV2ConversationsPanel"));
  assert.equal(conversations.includes("rings"), false);
  const railHook = read(
    "src/components/agent/lead-profile-v2/hooks/useLeadProfileV2Rail.ts",
  );
  assert.equal(railHook.includes("retries"), false);
  assert.equal(railHook.includes("setData("), false);
}

function testForeignWorkspaceStillGatedByRail() {
  const loader = read("src/lib/agent/lead-profile-v2/load-rail.ts");
  assert.ok(loader.includes("if (!lead || !v2CanAccessLead(ctx, lead)) return null"));
  assert.equal(loader.includes("/summary"), false);
}

async function main() {
  testLegacyUntouchedByV2Imports();
  testExactClickSemantics();
  testExactOpenSemantics();
  testExactAlertOpenSemantics();
  testRepeatOpensClicksDoNotChangeRings();
  testZeroState();
  testNoEmailOrAlertHydration();
  testNoNewEndpoint();
  testPresentationParity();
  testConversationsFailureIsolation();
  testForeignWorkspaceStillGatedByRail();
  console.log("lead-profile-v2-email-rings-selftest: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
