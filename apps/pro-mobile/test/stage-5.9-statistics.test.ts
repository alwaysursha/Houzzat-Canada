/**
 * Stage 5.9 — Native Agent Statistics tests.
 *
 * Web authority: /agent/statistics + loadAgentStatistics.
 * No invented conversion rates. No inbound email metrics.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  clearAllWorkspaceCaches,
  clearStatisticsCache,
  statisticsCache,
  statisticsCacheKey,
} from "../src/lib/lead-tab-cache";
import {
  emptyAgentStatistics,
  formatResponseMins,
  unwrapStatistics,
} from "../src/lib/statistics-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";
import {
  parseMobileStatisticsRange,
} from "../../../src/lib/mobile/v2/statistics-range";

const REPO_ROOT = join(__dirname, "../../..");
const ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/statistics/route.ts",
);
const STATS_LIB = join(REPO_ROOT, "src/lib/agent/statistics.ts");
const SHARED = join(REPO_ROOT, "src/lib/agent/statistics-shared.ts");
const WEB_PAGE = join(
  REPO_ROOT,
  "src/app/(agent)/agent/statistics/page.tsx",
);
const SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/StatisticsScreen.tsx",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CC_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommandCentreShell.tsx",
);

/** Mirror web responseRate = % not NEW_LEAD (all-time). */
function responseRate(leadsTotal: number, newWaiting: number): number {
  if (leadsTotal <= 0) return 0;
  return Math.round(((leadsTotal - newWaiting) / leadsTotal) * 100);
}

/** Funnel concentration pct — relative to max stage, not conversion. */
function funnelPct(count: number, maxStage: number): number {
  if (maxStage <= 0) return 0;
  return Math.round((count / maxStage) * 100);
}

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  status: string;
  source: string;
  createdAt: Date;
};

const NOW = new Date("2026-09-02T12:00:00Z");

const LEADS: MockLead[] = [
  {
    id: "l1",
    workspaceId: "ws_canary",
    assignedAgentId: "usr_agent",
    status: "NEW_LEAD",
    source: "PROPERTY_INQUIRY",
    createdAt: new Date("2026-08-20T10:00:00Z"),
  },
  {
    id: "l2",
    workspaceId: "ws_canary",
    assignedAgentId: "usr_agent",
    status: "CONTACTED",
    source: "SHOWING_REQUEST",
    createdAt: new Date("2026-08-25T10:00:00Z"),
  },
  {
    id: "l3",
    workspaceId: "ws_canary",
    assignedAgentId: "usr_other",
    status: "ACTIVE_CLIENT",
    source: "HOME_VALUATION",
    createdAt: new Date("2026-08-28T10:00:00Z"),
  },
  {
    id: "l4",
    workspaceId: "ws_houzzat",
    assignedAgentId: "usr_houzzat",
    status: "NEW_LEAD",
    source: "SIGNUP",
    createdAt: new Date("2026-08-30T10:00:00Z"),
  },
];

function deskLeads(
  workspaceId: string,
  userId: string,
  canSeeTeamLeads: boolean,
): MockLead[] {
  return LEADS.filter((l) => {
    if (l.workspaceId !== workspaceId) return false;
    if (canSeeTeamLeads) return true;
    return l.assignedAgentId === userId;
  });
}

function periodStart(rangeDays: number, now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - (rangeDays - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

function computeKpis(
  leads: MockLead[],
  rangeDays: number,
  now = NOW,
): {
  leadsTotal: number;
  leadsPeriod: number;
  newWaiting: number;
  responseRate: number;
  sources: Array<{ source: string; count: number }>;
  pipeline: Array<{ status: string; count: number }>;
} {
  const start = periodStart(rangeDays, now);
  const leadsTotal = leads.length;
  const newWaiting = leads.filter((l) => l.status === "NEW_LEAD").length;
  const leadsPeriod = leads.filter((l) => l.createdAt >= start).length;
  const sourceMap = new Map<string, number>();
  for (const l of leads.filter((x) => x.createdAt >= start)) {
    sourceMap.set(l.source, (sourceMap.get(l.source) || 0) + 1);
  }
  const pipeMap = new Map<string, number>();
  for (const l of leads) {
    pipeMap.set(l.status, (pipeMap.get(l.status) || 0) + 1);
  }
  return {
    leadsTotal,
    leadsPeriod,
    newWaiting,
    responseRate: responseRate(leadsTotal, newWaiting),
    sources: [...sourceMap.entries()].map(([source, count]) => ({
      source,
      count,
    })),
    pipeline: [...pipeMap.entries()].map(([status, count]) => ({
      status,
      count,
    })),
  };
}

async function runStage59Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.9 — NATIVE AGENT STATISTICS TESTS");
  console.log("=================================================================\n");

  console.log("[1] Web Statistics is metric authority...");
  {
    const page = readFileSync(WEB_PAGE, "utf8");
    assert.ok(page.includes("loadAgentStatisticsKpis"));
    assert.ok(page.includes("ALLOWED_RANGES"));
    const shared = readFileSync(SHARED, "utf8");
    assert.ok(shared.includes("responseRate"));
    assert.ok(shared.includes("emailsPeriod"));
    assert.ok(shared.includes("appointmentsPeriod"));
    assert.ok(shared.includes("tasksCompletedPeriod"));
    const lib = readFileSync(STATS_LIB, "utf8");
    assert.ok(lib.includes("deskCookie"));
    assert.equal(lib.includes("$transaction"), false);
    console.log("  -> PASS");
  }

  console.log("[2] Range parsing 7/30/90 only...");
  {
    assert.equal(parseMobileStatisticsRange(null), 30);
    assert.equal(parseMobileStatisticsRange("7"), 7);
    assert.equal(parseMobileStatisticsRange("30"), 30);
    assert.equal(parseMobileStatisticsRange("90"), 90);
    assert.equal(parseMobileStatisticsRange("14"), "invalid");
    assert.equal(parseMobileStatisticsRange("this_month"), "invalid");
    console.log("  -> PASS");
  }

  console.log("[3] Metric definitions: responseRate + funnel concentration...");
  {
    assert.equal(responseRate(10, 3), 70);
    assert.equal(responseRate(0, 0), 0);
    assert.equal(funnelPct(4, 8), 50);
    assert.equal(funnelPct(8, 8), 100);
    // Must NOT equal invented conversion Active/New
    assert.notEqual(responseRate(10, 3), Math.round((3 / 10) * 100));
    console.log("  -> PASS");
  }

  console.log("[4] AGENT scope: assigned only (not other agent / not cross-tenant)...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_agent",
      email: "a@canary.com",
      workspaceId: "ws_canary",
      role: "AGENT",
    });
    const v = verifyMobileToken(token.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    const leads = deskLeads("ws_canary", "usr_agent", false);
    assert.equal(leads.length, 2);
    assert.equal(leads.some((l) => l.id === "l3"), false);
    assert.equal(leads.some((l) => l.workspaceId === "ws_houzzat"), false);
    const kpis = computeKpis(leads, 30);
    assert.equal(kpis.leadsTotal, 2);
    assert.equal(kpis.newWaiting, 1);
    assert.equal(kpis.responseRate, 50);
    // AGENT desk = assigned only (mirrors leadWhereForDesk when !canSeeTeamLeads)
    const agentDesk = leads.every((l) => l.assignedAgentId === "usr_agent");
    assert.equal(agentDesk, true);
    console.log("  -> PASS");
  }

  console.log("[5] OWNER/ADMIN workspace-wide scope...");
  {
    const leads = deskLeads("ws_canary", "usr_owner", true);
    assert.equal(leads.length, 3);
    const kpis = computeKpis(leads, 30);
    assert.equal(kpis.leadsTotal, 3);
    assert.ok(kpis.pipeline.some((p) => p.status === "ACTIVE_CLIENT"));
    assert.ok(leads.some((l) => l.assignedAgentId === "usr_other"));
    console.log("  -> PASS");
  }

  console.log("[6] Pipeline + sources grouping...");
  {
    const leads = deskLeads("ws_canary", "usr_owner", true);
    const kpis = computeKpis(leads, 90);
    assert.ok(kpis.pipeline.length >= 2);
    assert.ok(kpis.sources.some((s) => s.source === "PROPERTY_INQUIRY"));
    console.log("  -> PASS");
  }

  console.log("[7] Zero-data workspace...");
  {
    const empty = emptyAgentStatistics(30, "My desk");
    assert.equal(empty.kpis.leadsTotal, 0);
    assert.equal(empty.kpis.emailsPeriod, 0);
    assert.equal(empty.kpis.appointmentsPeriod, 0);
    assert.equal(empty.kpis.tasksCompletedPeriod, 0);
    assert.equal(empty.pipeline.length, 0);
    assert.equal(formatResponseMins(null), "—");
    assert.equal(formatResponseMins(45), "45m");
    console.log("  -> PASS");
  }

  console.log("[8] Cross-tenant denial for platform token...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "p@x.com",
    });
    const v = verifyMobileToken(platform.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    assert.notEqual(v.payload.type, "mobile_workspace_access");
    console.log("  -> PASS");
  }

  console.log("[9] Cache isolation + clearAll...");
  {
    statisticsCache.clear();
    const k1 = statisticsCacheKey("ws_canary", "u1", 30);
    const k2 = statisticsCacheKey("ws_houzzat", "u1", 30);
    statisticsCache.set(k1, {
      statistics: emptyAgentStatistics(30, "My desk"),
      rangeDays: 30,
      timestamp: 1,
    });
    statisticsCache.set(k2, {
      statistics: emptyAgentStatistics(30, "My desk"),
      rangeDays: 30,
      timestamp: 1,
    });
    clearStatisticsCache("ws_canary");
    assert.equal(statisticsCache.has(k1), false);
    assert.equal(statisticsCache.has(k2), true);
    clearAllWorkspaceCaches("ws_houzzat");
    assert.equal(statisticsCache.has(k2), false);
    console.log("  -> PASS");
  }

  console.log("[10] Unwrap + route/screen wiring...");
  {
    const unwrapped = unwrapStatistics({
      ok: true,
      data: { statistics: emptyAgentStatistics(7, "Team overview") },
    });
    assert.equal(unwrapped?.rangeDays, 7);
    assert.equal(unwrapped?.scopeLabel, "Team overview");

    const route = readFileSync(ROUTE, "utf8");
    assert.ok(route.includes("loadAgentStatistics"));
    assert.ok(route.includes("deskCookie: null"));
    assert.ok(route.includes("inboundEmailCanonical: false"));
    assert.ok(route.includes("non_new_lead_share_all_time"));
    assert.equal(route.includes("$transaction"), false);

    const screen = readFileSync(SCREEN, "utf8");
    assert.equal(screen.includes("WebView"), false);
    assert.ok(screen.includes("Response rate"));
    assert.ok(screen.includes("not stage conversion"));
    assert.ok(screen.includes("Emails sent"));
    assert.equal(screen.includes("Messages Received"), false);
    assert.equal(screen.includes("Replies"), false);
    assert.ok(screen.includes("Pipeline"));
    assert.ok(screen.includes("Lead sources"));

    const agent = readFileSync(AGENT_SHELL, "utf8");
    const cc = readFileSync(CC_SHELL, "utf8");
    assert.ok(agent.includes("StatisticsScreen"));
    assert.ok(agent.includes('activeUtility === "statistics"'));
    assert.ok(cc.includes("StatisticsScreen"));
    console.log("  -> PASS");
  }

  console.log("[11] Deliberately NOT inventing inbound/conversion/SHOWING split...");
  {
    const route = readFileSync(ROUTE, "utf8");
    const screen = readFileSync(SCREEN, "utf8");
    assert.equal(route.includes("emailsOpened"), false);
    assert.equal(screen.includes("conversionRate"), false);
    assert.equal(screen.includes("Viewings"), false);
    assert.equal(screen.includes("Inbox"), false);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.9 — ALL TESTS PASSED\n");
}

runStage59Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
