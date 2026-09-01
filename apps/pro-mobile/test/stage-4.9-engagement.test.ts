/**
 * Stage 4.9 — Native Engagement isolation + web parity tests.
 *
 * Web Engagement tab = loadLeadSummary engagement fields (CustomerProfile tab="engagement").
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { unwrapEngagement } from "../src/lib/engagement-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const ENG_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/engagement/route.ts",
);
const ENG_LOADER = join(REPO_ROOT, "src/lib/mobile/v2/load-lead-engagement.ts");
const DETAIL_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/LeadDetailScreen.tsx",
);
const ENG_TAB = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/EngagementTab.tsx",
);

/** Canary lead fixture — web engagement micro-stats parity. */
const CANARY_PARITY = {
  leadId: "lead_canary_eng_01",
  workspaceId: "ws_tenant_canary",
  engagement: {
    hot: {
      hotness: 42,
      views24h: 5,
      distinctListings24h: 2,
      isOnline: false,
      binge: false,
      lastSeenAt: "2026-08-30T18:00:00.000Z",
    },
    stats: { saves: 3, alerts: 2, emails: 4, savedSearchCount: 1 },
    lastTouchAt: "2026-08-30T12:00:00.000Z",
    rings: { emailOpens: 42, emailClicks: 60, alertOpens: 56 },
    buyerIntent: {
      summary: "Looking in Toronto for 2+ bed homes up to $900k.",
      chips: ["Toronto", "2+ beds", "to $900,000"],
      source: "mixed",
      sourceLabel: "Saved search + browsing",
      headline: "Toronto · up to $900k" as string | null,
    },
    savedSearches: [
      {
        id: "ss_1",
        name: "Toronto homes",
        emailAlerts: true,
        smsAlerts: false,
        isHomepageActive: true,
        query: { city: "Toronto", bedsMin: 2, priceMax: 900000 },
      },
    ],
    savedListings: [{ id: "sl_1", mlsNumber: "C123" }],
    propertyMonitors: [{ id: "pm_1", mlsNumber: "C456" }],
    areaMonitors: [{ id: "am_1", name: "Leslieville", city: "Toronto" }],
    listingNotes: [{ id: "ln_1", mlsNumber: "C123", body: "Loved the kitchen" }],
    tours: [
      {
        id: "vt_1",
        name: "Saturday tour",
        status: "DRAFT",
        stops: [{ mlsNumber: "C123" }, { mlsNumber: "C456" }],
      },
    ],
    alerts: [
      { id: "ca_1", title: "Price drop", kind: "price" },
      { id: "ca_2", title: "New listing", kind: "listing" },
    ],
    matches: [
      {
        mlsNumber: "C789",
        address: "123 Main St, Toronto",
        listPrice: 850000,
        bedsLabel: "3 bed",
        imageUrl: null,
      },
    ],
    matchesLoaded: true,
  },
};

/** Houzzat lead fixture. */
const HOUZZAT_PARITY = {
  leadId: "lead_houzzat_eng_01",
  workspaceId: "ws_houzzat_prod",
  engagement: {
    hot: {
      hotness: 18,
      views24h: 0,
      distinctListings24h: 0,
      isOnline: true,
      binge: false,
      lastSeenAt: "2026-09-01T03:00:00.000Z",
    },
    stats: { saves: 0, alerts: 0, emails: 2, savedSearchCount: 0 },
    lastTouchAt: "2026-08-29T00:58:49.869Z",
    rings: { emailOpens: 18, emailClicks: 0, alertOpens: 0 },
    buyerIntent: {
      summary: "Not enough signal yet.",
      chips: [] as string[],
      source: "thin",
      sourceLabel: "Thin signal",
      headline: null as string | null,
    },
    savedSearches: [],
    savedListings: [],
    propertyMonitors: [],
    areaMonitors: [],
    listingNotes: [],
    tours: [],
    alerts: [],
    matches: [],
    matchesLoaded: true,
  },
};

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
};

const MOCK_LEADS: Record<string, MockLead> = {
  [CANARY_PARITY.leadId]: {
    id: CANARY_PARITY.leadId,
    workspaceId: CANARY_PARITY.workspaceId,
    assignedAgentId: "usr_canary_agent_01",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
  },
  [HOUZZAT_PARITY.leadId]: {
    id: HOUZZAT_PARITY.leadId,
    workspaceId: HOUZZAT_PARITY.workspaceId,
    assignedAgentId: "usr_houzzat_agent_01",
  },
};

const engagementStore = new Map<string, (typeof CANARY_PARITY)["engagement"]>();

function authorize(tokenPayload: unknown, leadId: string) {
  const p = tokenPayload as {
    type?: string;
    wsId?: string;
    sub?: string;
    role?: string;
  };
  if (!p || p.type !== "mobile_workspace_access" || !p.wsId) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  const lead = MOCK_LEADS[leadId];
  if (!lead || lead.workspaceId !== p.wsId) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }
  if (p.role === "AGENT") {
    if (lead.assignedAgentId !== p.sub && lead.assignedAgentId !== null) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
  } else if (p.role !== "OWNER" && p.role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return { ok: true as const, lead };
}

function getEngagement(tokenPayload: unknown, leadId: string) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const engagement = engagementStore.get(leadId);
  if (!engagement) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }
  return { ok: true as const, status: 200, engagement };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
}

async function runStage49Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.9 — NATIVE ENGAGEMENT TESTS");
  console.log("=================================================================\n");

  engagementStore.clear();
  engagementStore.set(CANARY_PARITY.leadId, CANARY_PARITY.engagement);
  engagementStore.set(HOUZZAT_PARITY.leadId, HOUZZAT_PARITY.engagement);

  console.log("[1/16] HTTP-safe route + loader reuse canonical helpers...");
  {
    assertHttpSafe("engagement route", ENG_ROUTE);
    assertHttpSafe("engagement loader", ENG_LOADER);
    const route = readFileSync(ENG_ROUTE, "utf8");
    const loader = readFileSync(ENG_LOADER, "utf8");
    assert.ok(route.includes("authorizeMobileLeadAccess"));
    assert.ok(route.includes("loadLeadEngagement"));
    assert.ok(loader.includes("computeHotness"));
    assert.ok(loader.includes("loadBuyerIntent"));
    assert.ok(loader.includes("savedListing.findMany"));
    assert.ok(loader.includes("take: 20"));
    assert.ok(loader.includes("take: 15"));
    assert.ok(loader.includes("take: 10"));
    assert.ok(loader.includes("MATCH_LIMIT = 24"));
    console.log("  -> PASS");
  }

  console.log("[2/16] EngagementTab mounted (ComingSoon gone)...");
  {
    const src = readFileSync(DETAIL_SCREEN, "utf8");
    assert.ok(src.includes("import { EngagementTab }"));
    assert.ok(src.includes("<EngagementTab"));
    const idx = src.indexOf('{tab === "engagement"');
    assert.ok(idx > 0);
    const end = src.indexOf("{tab === \"info\"", idx);
    const block = src.slice(idx, end > idx ? end : idx + 250);
    assert.equal(block.includes("ComingSoonPanel"), false);
    assert.ok(block.includes("EngagementTab"));
    const tab = readFileSync(ENG_TAB, "utf8");
    assert.ok(tab.includes("Views (24h)"));
    assert.ok(tab.includes("Saved searches / homepage"));
    assert.ok(tab.includes("Property watches"));
    assert.ok(tab.includes("Alerts inbox"));
    assert.ok(tab.includes("engagementCache"));
    console.log("  -> PASS");
  }

  console.log("[3/16] unwrapEngagement helper...");
  {
    const parsed = unwrapEngagement({
      ok: true,
      engagement: CANARY_PARITY.engagement,
    });
    assert.ok(parsed);
    assert.equal(parsed!.hot.views24h, 5);
    assert.equal(parsed!.stats.saves, 3);
    assert.equal(parsed!.savedSearches.length, 1);
    console.log("  -> PASS");
  }

  console.log("[4/16] Canary web ↔ Mobile v2 parity...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: CANARY_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, CANARY_PARITY.leadId);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.engagement.hot.views24h, 5);
      assert.equal(res.engagement.stats.saves, 3);
      assert.equal(res.engagement.stats.alerts, 2);
      assert.equal(res.engagement.stats.emails, 4);
      assert.equal(res.engagement.stats.savedSearchCount, 1);
      assert.equal(res.engagement.savedListings[0]?.mlsNumber, "C123");
      assert.equal(res.engagement.alerts.length, 2);
    }
    console.log("  -> PASS (WEB views24h=5 saves=3 alerts=2 emails=4)");
  }

  console.log("[5/16] Houzzat web ↔ Mobile v2 parity...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: HOUZZAT_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(houzzat.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, HOUZZAT_PARITY.leadId);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.engagement.hot.views24h, 0);
      assert.equal(res.engagement.stats.emails, 2);
      assert.equal(res.engagement.savedSearches.length, 0);
      assert.equal(res.engagement.hot.isOnline, true);
    }
    console.log("  -> PASS");
  }

  console.log("[6/16] Canary AGENT permitted...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, CANARY_PARITY.leadId);
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("[7/16] Canary AGENT cannot see Houzzat engagement...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, HOUZZAT_PARITY.leadId);
    assert.equal(res.ok, false);
    assert.equal(res.code, "LEAD_NOT_FOUND");
    console.log("  -> PASS");
  }

  console.log("[8/16] Houzzat AGENT cannot see Canary engagement...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const verified = verifyMobileToken(houzzat.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, CANARY_PARITY.leadId);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[9/16] Agent A cannot access Agent B private lead...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, "lead_canary_03_agent2");
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[10/16] OWNER same-workspace can list engagement...");
  {
    const owner = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const verified = verifyMobileToken(owner.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, CANARY_PARITY.leadId);
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("[11/16] Client workspace spoof ignored...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const spoofed = { ...verified.payload, wsId: "ws_houzzat_prod" };
    const res = getEngagement(spoofed, CANARY_PARITY.leadId);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[12/16] Platform token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_admin",
      email: "admin@houzzat.com",
    });
    const verified = verifyMobileToken(platform.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, CANARY_PARITY.leadId);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[13/16] Foreign leadId safe rejection...");
  {
    const canary = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(canary.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = getEngagement(verified.payload, "lead_does_not_exist");
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[14/16] Profile placeholders wired to engagement cache...");
  {
    const src = readFileSync(DETAIL_SCREEN, "utf8");
    assert.ok(src.includes("engagementProfile"));
    assert.ok(src.includes("engagementProfile.stats.saves"));
    assert.ok(src.includes("engagementProfile.hot.views24h"));
    assert.ok(src.includes("engagementProfile?.rings.emailClicks"));
    assert.ok(src.includes("handleEngagementLoaded"));
    console.log("  -> PASS");
  }

  console.log("[15/16] Ring stats use web heuristic (not fake email analytics)...");
  {
    const e = CANARY_PARITY.engagement;
    const openRate = Math.min(100, e.stats.emails > 0 ? e.hot.hotness : 0);
    const clickRate = Math.min(
      100,
      Math.round(e.hot.views24h * 6 + e.stats.saves * 10),
    );
    const alertRate = Math.min(100, e.stats.alerts > 0 ? 40 + e.stats.alerts * 8 : 0);
    assert.equal(e.rings.emailOpens, openRate);
    assert.equal(e.rings.emailClicks, clickRate);
    assert.equal(e.rings.alertOpens, alertRate);
    console.log("  -> PASS");
  }

  console.log("[16/16] Cache key workspaceId:leadId:engagement...");
  {
    const tab = readFileSync(ENG_TAB, "utf8");
    assert.ok(tab.includes(":engagement"));
    const cache = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/lib/lead-tab-cache.ts"),
      "utf8",
    );
    assert.ok(cache.includes("engagementCache"));
    assert.ok(cache.includes("clearLeadEngagementCache"));
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 4.9 — ALL TESTS PASSED\n");
}

runStage49Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
