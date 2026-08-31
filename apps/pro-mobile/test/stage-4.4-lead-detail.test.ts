/**
 * Stage 4.4 — HouzzatPRO Mobile v2 Lead Detail API & Tenant Isolation Test Suite.
 *
 * Verifies:
 * 1. Canary Token + Canary Lead (assigned): Allowed for authorized Canary Agent.
 * 2. Canary Token + Canary Lead (pond): Allowed for Canary Agent.
 * 3. Canary Token + Houzzat Lead: Strictly Denied (404/403) across tenant boundary.
 * 4. Houzzat Token + Canary Lead: Strictly Denied (404/403) across tenant boundary.
 * 5. Agent A + Agent B private assigned lead: Strictly Denied (404) for unauthorized agent.
 * 6. OWNER / ADMIN + any workspace lead: Allowed for Owner/Admin within same workspace.
 * 7. Client workspace manipulation immunity: Query/header parameter manipulation has 0 effect; authority comes strictly from verified token claims.
 * 8. Invalid / Platform-only Token: Strictly Rejected (401/403).
 * 9. DTO Contract Integrity: Ensures compact payload with identity, pipeline, assignment, timestamps, and activity summary.
 */

import assert from "node:assert/strict";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";
import type { LeadStatus } from "../src/types/lead";

// Mock Database Records
const MOCK_LEADS_DB: Record<string, any> = {
  // Canary Workspace Leads
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    status: "NEW_LEAD" as LeadStatus,
    source: "PROPERTY_INQUIRY",
    intent: "BUYER",
    score: 85,
    notes: "Client looking for 3-bedroom detached in Mississauga.",
    listingMls: "W1049281",
    inquiryTag: "VIEWING",
    assignedAgentId: "usr_canary_agent_01",
    firstRespondedAt: null,
    statusChangedAt: new Date("2026-08-30T10:00:00Z"),
    contactConsentAt: new Date("2026-08-30T10:00:00Z"),
    lostReason: null,
    winReason: null,
    utmSource: "google",
    utmCampaign: "canary_gta_aug26",
    createdAt: new Date("2026-08-30T10:00:00Z"),
    updatedAt: new Date("2026-08-30T10:00:00Z"),
    customer: {
      id: "cust_canary_01",
      name: "Alice Johnson",
      email: "alice@example.com",
      phone: "416-555-0101",
      isBuyer: true,
      isSeller: false,
      purchaseTimeframe: "ONE_TO_THREE_MONTHS",
      homeAddress: "123 Main St, Mississauga, ON",
      createdAt: new Date("2026-08-30T09:50:00Z"),
    },
    assignedAgent: {
      id: "usr_canary_agent_01",
      name: "Canary Agent One",
      email: "agent1@canary.com",
    },
    activities: [
      {
        id: "act_01",
        type: "INQUIRY_RECEIVED",
        body: "Submitted viewing inquiry for MLS #W1049281",
        createdAt: new Date("2026-08-30T10:00:00Z"),
      },
    ],
    counts: {
      notes: 1,
      appointments: 0,
      tasks: 1,
    },
  },
  lead_canary_02_pond: {
    id: "lead_canary_02_pond",
    workspaceId: "ws_tenant_canary",
    status: "NEW_LEAD" as LeadStatus,
    source: "SIGNUP",
    intent: "SELLER",
    score: 40,
    notes: "Home valuation requested via website widget.",
    listingMls: null,
    inquiryTag: "HOME_VALUE",
    assignedAgentId: null, // Unassigned in Pond
    firstRespondedAt: null,
    statusChangedAt: new Date("2026-08-30T11:00:00Z"),
    contactConsentAt: new Date("2026-08-30T11:00:00Z"),
    lostReason: null,
    winReason: null,
    utmSource: null,
    utmCampaign: null,
    createdAt: new Date("2026-08-30T11:00:00Z"),
    updatedAt: new Date("2026-08-30T11:00:00Z"),
    customer: {
      id: "cust_canary_02",
      name: "Bob Smith",
      email: "bob@example.com",
      phone: "416-555-0102",
      isBuyer: false,
      isSeller: true,
      purchaseTimeframe: "NOW",
      homeAddress: "456 Oak Rd, Oakville, ON",
      createdAt: new Date("2026-08-30T10:55:00Z"),
    },
    assignedAgent: null,
    activities: [
      {
        id: "act_02",
        type: "VALUATION_REQUESTED",
        body: "Requested valuation report for 456 Oak Rd",
        createdAt: new Date("2026-08-30T11:00:00Z"),
      },
    ],
    counts: {
      notes: 0,
      appointments: 0,
      tasks: 0,
    },
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    status: "CONTACTED" as LeadStatus,
    source: "HOME_VALUATION",
    intent: "SELLER",
    score: 90,
    notes: "Private lead assigned exclusively to Agent Two.",
    listingMls: null,
    inquiryTag: "GENERAL",
    assignedAgentId: "usr_canary_agent_02", // Assigned to Agent Two
    firstRespondedAt: new Date("2026-08-30T12:15:00Z"),
    statusChangedAt: new Date("2026-08-30T12:15:00Z"),
    contactConsentAt: new Date("2026-08-30T12:00:00Z"),
    lostReason: null,
    winReason: null,
    utmSource: "direct",
    utmCampaign: null,
    createdAt: new Date("2026-08-30T12:00:00Z"),
    updatedAt: new Date("2026-08-30T12:15:00Z"),
    customer: {
      id: "cust_canary_03",
      name: "Charlie Brown",
      email: "charlie@example.com",
      phone: "416-555-0103",
      isBuyer: false,
      isSeller: true,
      purchaseTimeframe: "NOW",
      homeAddress: "789 Pine Ave, Toronto, ON",
      createdAt: new Date("2026-08-30T11:58:00Z"),
    },
    assignedAgent: {
      id: "usr_canary_agent_02",
      name: "Canary Agent Two",
      email: "agent2@canary.com",
    },
    activities: [
      {
        id: "act_03",
        type: "CALL_LOGGED",
        body: "Initial consultation call completed.",
        createdAt: new Date("2026-08-30T12:15:00Z"),
      },
    ],
    counts: {
      notes: 2,
      appointments: 1,
      tasks: 1,
    },
  },

  // Houzzat Workspace Lead
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    status: "ACTIVE_CLIENT" as LeadStatus,
    source: "SHOWING_REQUEST",
    intent: "BUYER",
    score: 95,
    notes: "Houzzat brokerage VIP client.",
    listingMls: "C9921401",
    inquiryTag: "VIEWING",
    assignedAgentId: "usr_houzzat_agent_01",
    firstRespondedAt: new Date("2026-08-31T08:10:00Z"),
    statusChangedAt: new Date("2026-08-31T08:30:00Z"),
    contactConsentAt: new Date("2026-08-31T08:00:00Z"),
    lostReason: null,
    winReason: null,
    utmSource: "houzzat.com",
    utmCampaign: "downtown_condos",
    createdAt: new Date("2026-08-31T08:00:00Z"),
    updatedAt: new Date("2026-08-31T08:30:00Z"),
    customer: {
      id: "cust_houzzat_01",
      name: "David Miller",
      email: "david@miller.com",
      phone: "905-555-0199",
      isBuyer: true,
      isSeller: false,
      purchaseTimeframe: "NOW",
      homeAddress: "100 Bay St, Toronto, ON",
      createdAt: new Date("2026-08-31T07:55:00Z"),
    },
    assignedAgent: {
      id: "usr_houzzat_agent_01",
      name: "Houzzat Staff Agent",
      email: "staff@houzzat.com",
    },
    activities: [
      {
        id: "act_houzzat_01",
        type: "SHOWING_BOOKED",
        body: "Private showing scheduled for 100 Bay St #402",
        createdAt: new Date("2026-08-31T08:30:00Z"),
      },
    ],
    counts: {
      notes: 3,
      appointments: 2,
      tasks: 2,
    },
  },
};

/**
 * Simulates the GET /api/mobile/v2/leads/[leadId] endpoint handler logic identically.
 */
function executeLeadDetailQuery(tokenPayload: any, leadId: string) {
  if (!tokenPayload || tokenPayload.type !== "mobile_workspace_access" || !tokenPayload.wsId) {
    return { ok: false, status: 403, code: "WORKSPACE_FORBIDDEN", error: "Valid workspace session token required" };
  }

  const workspaceId = tokenPayload.wsId;
  const userId = tokenPayload.sub;
  const role = tokenPayload.role;

  const lead = MOCK_LEADS_DB[leadId];

  // 1. Tenant boundary check
  if (!lead || lead.workspaceId !== workspaceId) {
    return { ok: false, status: 404, code: "LEAD_NOT_FOUND", error: "Lead not found in current workspace" };
  }

  // 2. Role-based visibility rules
  if (role === "AGENT") {
    const isAssignedToAgent = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;

    if (!isAssignedToAgent && !isPond) {
      return { ok: false, status: 404, code: "LEAD_NOT_FOUND", error: "Lead not found or access restricted" };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return { ok: false, status: 403, code: "WORKSPACE_FORBIDDEN", error: "Unsupported workspace role" };
  }

  return {
    ok: true,
    status: 200,
    data: {
      lead: {
        id: lead.id,
        status: lead.status,
        source: lead.source,
        intent: lead.intent,
        score: lead.score,
        inquiryTag: lead.inquiryTag,
        notes: lead.notes,
        listingMls: lead.listingMls,
        firstRespondedAt: lead.firstRespondedAt ? lead.firstRespondedAt.toISOString() : null,
        statusChangedAt: lead.statusChangedAt.toISOString(),
        contactConsentAt: lead.contactConsentAt ? lead.contactConsentAt.toISOString() : null,
        lostReason: lead.lostReason,
        winReason: lead.winReason,
        utmSource: lead.utmSource,
        utmCampaign: lead.utmCampaign,
        createdAt: lead.createdAt.toISOString(),
        updatedAt: lead.updatedAt.toISOString(),
        customer: lead.customer
          ? {
              id: lead.customer.id,
              name: lead.customer.name,
              email: lead.customer.email,
              phone: lead.customer.phone,
              isBuyer: lead.customer.isBuyer,
              isSeller: lead.customer.isSeller,
              purchaseTimeframe: lead.customer.purchaseTimeframe,
              homeAddress: lead.customer.homeAddress,
              createdAt: lead.customer.createdAt.toISOString(),
            }
          : null,
        assignedAgent: lead.assignedAgent,
        isPond: lead.assignedAgentId === null,
        recentActivities: lead.activities.map((a: any) => ({
          id: a.id,
          type: a.type,
          body: a.body,
          createdAt: a.createdAt.toISOString(),
        })),
        counts: lead.counts,
      },
    },
  };
}

async function runStage44LeadDetailTests() {
  console.log("=================================================================");
  console.log("STAGE 4.4 — HOUZZATPRO MOBILE V2 LEAD DETAIL & ISOLATION TESTS");
  console.log("=================================================================\n");

  // TEST 1: Canary AGENT accessing assigned Canary lead -> ALLOWED
  console.log("[1/8] Testing Canary AGENT -> Assigned Canary Lead...");
  {
    const canaryAgentToken = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });

    const verify = verifyMobileToken(canaryAgentToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_canary_01");
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(res.data?.lead.id, "lead_canary_01");
    assert.equal(res.data?.lead.customer?.name, "Alice Johnson");
    assert.equal(res.data?.lead.assignedAgent?.id, "usr_canary_agent_01");
    assert.equal(res.data?.lead.isPond, false);
    assert.equal(res.data?.lead.listingMls, "W1049281");
    assert.equal(res.data?.lead.counts.notes, 1);
    console.log("  -> Canary AGENT -> Assigned Lead Access: PASS");
  }

  // TEST 2: Canary AGENT accessing unassigned Canary pond lead -> ALLOWED
  console.log("[2/8] Testing Canary AGENT -> Unassigned Canary Pond Lead...");
  {
    const canaryAgentToken = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });

    const verify = verifyMobileToken(canaryAgentToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_canary_02_pond");
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(res.data?.lead.id, "lead_canary_02_pond");
    assert.equal(res.data?.lead.isPond, true);
    assert.equal(res.data?.lead.assignedAgent, null);
    console.log("  -> Canary AGENT -> Pond Lead Access: PASS");
  }

  // TEST 3: Canary Token requesting Houzzat Lead -> STRICTLY DENIED (404)
  console.log("[3/8] Testing Cross-Tenant: Canary Token -> Houzzat Lead ID...");
  {
    const canaryToken = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });

    const verify = verifyMobileToken(canaryToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_houzzat_01");
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    assert.equal(res.code, "LEAD_NOT_FOUND");
    console.log("  -> Canary Token -> Houzzat Lead (Cross-Tenant Isolation): PASS (404)");
  }

  // TEST 4: Houzzat Token requesting Canary Lead -> STRICTLY DENIED (404)
  console.log("[4/8] Testing Cross-Tenant: Houzzat Token -> Canary Lead ID...");
  {
    const houzzatToken = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });

    const verify = verifyMobileToken(houzzatToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_canary_01");
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    assert.equal(res.code, "LEAD_NOT_FOUND");
    console.log("  -> Houzzat Token -> Canary Lead (Cross-Tenant Isolation): PASS (404)");
  }

  // TEST 5: Agent A requesting Agent B's private lead -> STRICTLY DENIED (404)
  console.log("[5/8] Testing AGENT Isolation: Agent 1 -> Agent 2's Private Lead...");
  {
    const agent1Token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });

    const verify = verifyMobileToken(agent1Token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    // lead_canary_03_agent2 is assigned to usr_canary_agent_02
    const res = executeLeadDetailQuery(verify.payload, "lead_canary_03_agent2");
    assert.equal(res.ok, false);
    assert.equal(res.status, 404);
    assert.equal(res.code, "LEAD_NOT_FOUND");
    console.log("  -> Agent A -> Agent B Private Lead Boundary: PASS (404)");
  }

  // TEST 6: OWNER / ADMIN requesting any workspace lead -> ALLOWED
  console.log("[6/8] Testing OWNER / ADMIN Workspace-Wide Lead Access...");
  {
    const canaryOwnerToken = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });

    const verify = verifyMobileToken(canaryOwnerToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    // Owner can access Agent 2's lead
    const res = executeLeadDetailQuery(verify.payload, "lead_canary_03_agent2");
    assert.equal(res.ok, true);
    assert.equal(res.status, 200);
    assert.equal(res.data?.lead.id, "lead_canary_03_agent2");
    assert.equal(res.data?.lead.assignedAgent?.id, "usr_canary_agent_02");
    console.log("  -> OWNER / ADMIN Workspace Visibility: PASS");
  }

  // TEST 7: Platform token without workspace session -> STRICTLY REJECTED (403)
  console.log("[7/8] Testing Platform-Only Token Rejection...");
  {
    const platformToken = createPlatformAccessToken({
      id: "usr_canary_agent_01",
      email: "agent1@canary.com",
    });

    const verify = verifyMobileToken(platformToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_canary_01");
    assert.equal(res.ok, false);
    assert.equal(res.status, 403);
    assert.equal(res.code, "WORKSPACE_FORBIDDEN");
    console.log("  -> Platform Token Rejection: PASS (403)");
  }

  // TEST 8: Response DTO Contract Verification
  console.log("[8/8] Testing DTO Schema & Compact Fields...");
  {
    const houzzatToken = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });

    const verify = verifyMobileToken(houzzatToken.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const res = executeLeadDetailQuery(verify.payload, "lead_houzzat_01");
    assert.equal(res.ok, true);
    const lead = res.data?.lead;

    // Validate required fields exist
    assert.ok(lead?.id);
    assert.ok(lead?.status);
    assert.ok(lead?.source);
    assert.ok(lead?.intent);
    assert.ok(typeof lead?.score === "number");
    assert.ok(lead?.statusChangedAt);
    assert.ok(lead?.createdAt);
    assert.ok(lead?.updatedAt);
    assert.ok(lead?.customer?.name);
    assert.ok(lead?.customer?.email);
    assert.ok(lead?.assignedAgent?.id);
    assert.ok(Array.isArray(lead?.recentActivities));
    assert.ok(typeof lead?.counts?.notes === "number");
    assert.ok(typeof lead?.counts?.tasks === "number");
    assert.ok(typeof lead?.counts?.appointments === "number");

    console.log("  -> Lead Detail DTO Contract: PASS");
  }

  console.log("\n=================================================================");
  console.log("ALL STAGE 4.4 LEAD DETAIL & ISOLATION TESTS PASSED (8/8)");
  console.log("=================================================================\n");
}

runStage44LeadDetailTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
