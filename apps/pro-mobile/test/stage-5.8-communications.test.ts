/**
 * Stage 5.8 — Native Communications Inbox tests.
 *
 * Canonical store: LeadEmailLog (outbound only).
 * Web authority: /agent/inbox.
 * INBOUND EMAIL NOT CURRENTLY CANONICAL.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildCommunicationsQuery,
  unwrapCommunicationDetail,
  unwrapCommunicationsList,
} from "../src/lib/communications-response";
import {
  clearAllWorkspaceCaches,
  clearCommunicationsCache,
  communicationsCache,
  conversationCache,
  invalidateCommunicationsCachesAfterSend,
} from "../src/lib/lead-tab-cache";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";
import {
  buildCommunicationsSearchOr,
  communicationsLeadWhere,
  formatCommunicationRow,
  parseCommunicationsCursor,
  truncateSnippet,
} from "../../../src/lib/mobile/v2/communications";

const REPO_ROOT = join(__dirname, "../../..");
const LIST_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/communications/route.ts",
);
const DETAIL_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/communications/[emailId]/route.ts",
);
const HELPERS = join(
  REPO_ROOT,
  "src/lib/mobile/v2/communications.ts",
);
const SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommunicationsScreen.tsx",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CC_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/CommandCentreShell.tsx",
);
const INBOX_PAGE = join(
  REPO_ROOT,
  "src/app/(agent)/agent/inbox/page.tsx",
);
const SCHEMA = join(REPO_ROOT, "prisma/schema.prisma");

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
};

type MockEmail = {
  id: string;
  leadId: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string;
  createdAt: Date;
  openedAt: Date | null;
  openCount: number;
  clickedAt: Date | null;
  clickCount: number;
  lastClickedUrl: string | null;
  customerName: string | null;
  customerEmail: string | null;
  sentByName: string | null;
};

const LEADS: MockLead[] = [
  {
    id: "lead_mine",
    workspaceId: "ws_canary",
    assignedAgentId: "usr_agent",
  },
  {
    id: "lead_pond",
    workspaceId: "ws_canary",
    assignedAgentId: null,
  },
  {
    id: "lead_other",
    workspaceId: "ws_canary",
    assignedAgentId: "usr_other",
  },
  {
    id: "lead_houzzat",
    workspaceId: "ws_houzzat",
    assignedAgentId: "usr_houzzat",
  },
];

const EMAILS: MockEmail[] = [
  {
    id: "em_1",
    leadId: "lead_mine",
    subject: "Showing Saturday",
    body: "Thanks, Saturday works for me at 123 Main.",
    toEmail: "john@example.com",
    kind: "agent_message",
    createdAt: new Date("2026-09-02T14:42:00Z"),
    openedAt: new Date("2026-09-02T15:00:00Z"),
    openCount: 2,
    clickedAt: null,
    clickCount: 0,
    lastClickedUrl: null,
    customerName: "John Smith",
    customerEmail: "john@example.com",
    sentByName: "Canary Agent",
  },
  {
    id: "em_2",
    leadId: "lead_pond",
    subject: "Home Valuation",
    body: "I've sent you the information package.",
    toEmail: "sarah@example.com",
    kind: "custom",
    createdAt: new Date("2026-09-01T10:00:00Z"),
    openedAt: null,
    openCount: 0,
    clickedAt: null,
    clickCount: 0,
    lastClickedUrl: null,
    customerName: "Sarah Khan",
    customerEmail: "sarah@example.com",
    sentByName: null,
  },
  {
    id: "em_3",
    leadId: "lead_other",
    subject: "Secret other agent",
    body: "Should not be visible to AGENT.",
    toEmail: "other@example.com",
    kind: "custom",
    createdAt: new Date("2026-09-02T12:00:00Z"),
    openedAt: null,
    openCount: 0,
    clickedAt: null,
    clickCount: 0,
    lastClickedUrl: null,
    customerName: "Other Lead",
    customerEmail: "other@example.com",
    sentByName: null,
  },
  {
    id: "em_4",
    leadId: "lead_houzzat",
    subject: "Cross tenant",
    body: "Must never leak.",
    toEmail: "x@houzzat.com",
    kind: "welcome",
    createdAt: new Date("2026-09-02T16:00:00Z"),
    openedAt: null,
    openCount: 0,
    clickedAt: null,
    clickCount: 0,
    lastClickedUrl: null,
    customerName: "Houzzat Lead",
    customerEmail: "x@houzzat.com",
    sentByName: null,
  },
];

/** Mirrors GET /api/mobile/v2/communications scope + search + cursor. */
function executeCommunicationsQuery(
  tokenPayload: {
    type?: string;
    wsId?: string;
    sub?: string;
    role?: string;
  } | null,
  query: { q?: string; cursor?: string; limit?: number; channel?: string },
) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }

  const channel = (query.channel || "all").toLowerCase();
  if (channel !== "all" && channel !== "email") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }

  const role = tokenPayload.role as "AGENT" | "OWNER" | "ADMIN";
  const leadWhere = communicationsLeadWhere(
    tokenPayload.wsId,
    tokenPayload.sub!,
    role,
  );

  let scopedLeads = LEADS.filter((l) => l.workspaceId === tokenPayload.wsId);
  if (role === "AGENT") {
    scopedLeads = scopedLeads.filter(
      (l) =>
        l.assignedAgentId === tokenPayload.sub || l.assignedAgentId === null,
    );
  }
  // Validate helper shape matches mock filter
  assert.equal(leadWhere.workspaceId, tokenPayload.wsId);

  const leadIds = new Set(scopedLeads.map((l) => l.id));
  let rows = EMAILS.filter((e) => leadIds.has(e.leadId));

  if (query.q?.trim()) {
    const q = query.q.trim().toLowerCase();
    rows = rows.filter(
      (e) =>
        e.subject.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.toEmail.toLowerCase().includes(q) ||
        (e.customerName || "").toLowerCase().includes(q) ||
        (e.customerEmail || "").toLowerCase().includes(q),
    );
  }

  const cursor = parseCommunicationsCursor(query.cursor ?? null);
  if (cursor === "invalid") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  if (cursor) {
    rows = rows.filter((e) => e.createdAt < cursor);
  }

  rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const limit = Math.min(query.limit || 30, 30);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    ok: true as const,
    data: {
      communications: page.map((e) =>
        formatCommunicationRow({
          id: e.id,
          subject: e.subject,
          body: e.body,
          toEmail: e.toEmail,
          kind: e.kind,
          openedAt: e.openedAt,
          openCount: e.openCount,
          clickedAt: e.clickedAt,
          clickCount: e.clickCount,
          lastClickedUrl: e.lastClickedUrl,
          createdAt: e.createdAt,
          leadId: e.leadId,
          lead: {
            customer: { name: e.customerName, email: e.customerEmail },
          },
          sentBy: e.sentByName
            ? { name: e.sentByName, email: null }
            : null,
        }),
      ),
      nextCursor: hasMore
        ? page[page.length - 1]!.createdAt.toISOString()
        : null,
      hasMore,
      meta: {
        mode: "outbound_email_activity" as const,
        inboundEmailCanonical: false as const,
        channels: ["email"] as const,
      },
    },
  };
}

function executeDetail(
  tokenPayload: {
    type?: string;
    wsId?: string;
    sub?: string;
    role?: string;
  } | null,
  emailId: string,
) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return { ok: false as const, status: 403 };
  }
  const email = EMAILS.find((e) => e.id === emailId);
  if (!email) return { ok: false as const, status: 404 };
  const lead = LEADS.find((l) => l.id === email.leadId);
  if (!lead || lead.workspaceId !== tokenPayload.wsId) {
    return { ok: false as const, status: 404 };
  }
  if (tokenPayload.role === "AGENT") {
    if (
      lead.assignedAgentId !== tokenPayload.sub &&
      lead.assignedAgentId !== null
    ) {
      return { ok: false as const, status: 404 };
    }
  }
  return {
    ok: true as const,
    communication: {
      id: email.id,
      channel: "email" as const,
      direction: "outbound" as const,
      leadId: email.leadId,
      subject: email.subject,
      body: email.body,
    },
  };
}

async function runStage58Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.8 — NATIVE COMMUNICATIONS INBOX TESTS");
  console.log("=================================================================\n");

  console.log("[1] Audit: inbound email NOT canonical (schema + inbox copy)...");
  {
    const schema = readFileSync(SCHEMA, "utf8");
    const leadEmailBlock = schema.slice(
      schema.indexOf("model LeadEmailLog"),
      schema.indexOf("model LeadActivity"),
    );
    assert.equal(leadEmailBlock.includes("direction"), false);
    assert.equal(leadEmailBlock.includes("inbound"), false);
    assert.ok(leadEmailBlock.includes("toEmail"));
    assert.ok(leadEmailBlock.includes("openedAt"));
    assert.ok(leadEmailBlock.includes("openCount"));
    assert.ok(leadEmailBlock.includes("clickedAt"));
    const inbox = readFileSync(INBOX_PAGE, "utf8");
    assert.ok(inbox.includes("Outbound email log"));
    assert.ok(inbox.includes("inbound replies come in Phase 3.5"));
    // Conversation/Message powers agent↔customer Chat (Chats tab), not this email log.
    assert.ok(schema.includes("model Conversation"));
    assert.ok(schema.includes("model Message"));
    assert.equal(schema.includes("model SmsMessage"), false);
    console.log("  -> PASS (INBOUND EMAIL NOT CURRENTLY CANONICAL)");
  }

  console.log("[2] Helpers: snippet, cursor, search OR, lead scope...");
  {
    assert.ok(truncateSnippet("a".repeat(200)).endsWith("…"));
    assert.equal(parseCommunicationsCursor("not-a-date"), "invalid");
    assert.ok(parseCommunicationsCursor("2026-09-01T00:00:00.000Z") instanceof Date);
    const ors = buildCommunicationsSearchOr("smith");
    assert.ok(ors.length >= 4);
    const agentWhere = communicationsLeadWhere("ws_a", "u1", "AGENT");
    assert.ok(Array.isArray((agentWhere as { OR?: unknown }).OR));
    const ownerWhere = communicationsLeadWhere("ws_a", "u1", "OWNER");
    assert.equal((ownerWhere as { OR?: unknown }).OR, undefined);
    console.log("  -> PASS");
  }

  console.log("[3] AGENT scope: mine + pond only...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_agent",
      email: "a@canary.com",
      workspaceId: "ws_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;
    const res = executeCommunicationsQuery(verify.payload, {});
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const ids = res.data.communications.map((c) => c.id);
    assert.ok(ids.includes("em_1"));
    assert.ok(ids.includes("em_2"));
    assert.equal(ids.includes("em_3"), false);
    assert.equal(ids.includes("em_4"), false);
    assert.equal(res.data.meta.inboundEmailCanonical, false);
    assert.equal(res.data.communications[0]?.direction, "outbound");
    console.log("  -> PASS");
  }

  console.log("[4] OWNER workspace-wide; cross-tenant denial...");
  {
    const owner = createWorkspaceAccessToken({
      userId: "usr_owner",
      email: "o@canary.com",
      workspaceId: "ws_canary",
      role: "OWNER",
    });
    const v = verifyMobileToken(owner.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    const res = executeCommunicationsQuery(v.payload, {});
    assert.equal(res.ok, true);
    if (!res.ok) return;
    const ids = res.data.communications.map((c) => c.id);
    assert.ok(ids.includes("em_3"));
    assert.equal(ids.includes("em_4"), false);

    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "p@x.com",
    });
    const pv = verifyMobileToken(platform.token);
    assert.equal(pv.ok, true);
    if (!pv.ok) return;
    const denied = executeCommunicationsQuery(pv.payload, {});
    assert.equal(denied.ok, false);
    console.log("  -> PASS");
  }

  console.log("[5] Pagination cursor + search...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_owner",
      email: "o@canary.com",
      workspaceId: "ws_canary",
      role: "OWNER",
    });
    const v = verifyMobileToken(token.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    const page1 = executeCommunicationsQuery(v.payload, { limit: 1 });
    assert.equal(page1.ok, true);
    if (!page1.ok) return;
    assert.equal(page1.data.communications.length, 1);
    assert.equal(page1.data.hasMore, true);
    assert.ok(page1.data.nextCursor);
    const page2 = executeCommunicationsQuery(v.payload, {
      limit: 1,
      cursor: page1.data.nextCursor!,
    });
    assert.equal(page2.ok, true);
    if (!page2.ok) return;
    assert.notEqual(
      page2.data.communications[0]?.id,
      page1.data.communications[0]?.id,
    );

    const search = executeCommunicationsQuery(v.payload, { q: "Sarah" });
    assert.equal(search.ok, true);
    if (!search.ok) return;
    assert.equal(search.data.communications.length, 1);
    assert.equal(search.data.communications[0]?.id, "em_2");
    console.log("  -> PASS");
  }

  console.log("[6] Detail + Open Lead identity + other-agent denial...");
  {
    const agent = createWorkspaceAccessToken({
      userId: "usr_agent",
      email: "a@canary.com",
      workspaceId: "ws_canary",
      role: "AGENT",
    });
    const v = verifyMobileToken(agent.token);
    assert.equal(v.ok, true);
    if (!v.ok) return;
    const ok = executeDetail(v.payload, "em_1");
    assert.equal(ok.ok, true);
    if (!ok.ok) return;
    assert.equal(ok.communication.leadId, "lead_mine");
    assert.equal(ok.communication.direction, "outbound");
    const denied = executeDetail(v.payload, "em_3");
    assert.equal(denied.ok, false);
    const cross = executeDetail(v.payload, "em_4");
    assert.equal(cross.ok, false);
    console.log("  -> PASS");
  }

  console.log("[7] Response unwrap + query builder...");
  {
    const list = unwrapCommunicationsList({
      ok: true,
      data: {
        communications: [{ id: "x", channel: "email", direction: "outbound" }],
        nextCursor: "c1",
        hasMore: true,
      },
    });
    assert.equal(list.items.length, 1);
    assert.equal(list.nextCursor, "c1");
    const detail = unwrapCommunicationDetail({
      data: {
        communication: { id: "e1", body: "hi" },
        composer: { toEmail: "a@b.com", consented: true, alertsEnabled: true },
      },
    });
    assert.equal(detail.communication?.id, "e1");
    assert.equal(detail.composer.toEmail, "a@b.com");
    const qs = buildCommunicationsQuery({
      q: "smith",
      cursor: "2026-01-01T00:00:00.000Z",
      channel: "email",
      limit: 30,
    });
    assert.ok(qs.includes("q=smith"));
    assert.ok(qs.includes("channel=email"));
    console.log("  -> PASS");
  }

  console.log("[8] Cache invalidation + workspace isolation...");
  {
    communicationsCache.clear();
    conversationCache.clear();
    communicationsCache.set("ws_canary:communications", {
      items: [],
      nextCursor: null,
      queryKey: "q=",
      timestamp: 1,
    });
    communicationsCache.set("ws_houzzat:communications", {
      items: [],
      nextCursor: null,
      queryKey: "q=",
      timestamp: 1,
    });
    conversationCache.set("ws_canary:lead_mine:conversations", {
      emails: [],
      nextCursor: null,
      composer: { toEmail: null, consented: false, alertsEnabled: true },
      timestamp: 1,
    });
    invalidateCommunicationsCachesAfterSend("ws_canary", "lead_mine");
    assert.equal(communicationsCache.has("ws_canary:communications"), false);
    assert.equal(
      conversationCache.has("ws_canary:lead_mine:conversations"),
      false,
    );
    assert.equal(communicationsCache.has("ws_houzzat:communications"), true);

    communicationsCache.set("ws_canary:communications", {
      items: [],
      nextCursor: null,
      queryKey: "q=",
      timestamp: 2,
    });
    clearAllWorkspaceCaches("ws_canary");
    assert.equal(communicationsCache.has("ws_canary:communications"), false);
    assert.equal(communicationsCache.has("ws_houzzat:communications"), true);
    clearCommunicationsCache();
    assert.equal(communicationsCache.size, 0);
    console.log("  -> PASS");
  }

  console.log("[9] Native screen: no WebView; honest outbound copy; Send Email...");
  {
    const screen = readFileSync(SCREEN, "utf8");
    assert.equal(screen.includes("WebView"), false);
    assert.ok(screen.includes("inbound not available"));
    assert.ok(screen.includes("No emails sent yet"));
    assert.ok(screen.includes("Send Email"));
    assert.equal(screen.includes(">Reply<"), false);
    assert.ok(screen.includes("Open Lead"));
    assert.ok(screen.includes("/conversations"));
    assert.ok(screen.includes("Opened"));
    console.log("  -> PASS");
  }

  console.log("[10] Shells wire inbox → CommunicationsScreen...");
  {
    const agent = readFileSync(AGENT_SHELL, "utf8");
    const cc = readFileSync(CC_SHELL, "utf8");
    assert.ok(agent.includes("CommunicationsScreen"));
    assert.ok(agent.includes('activeUtility === "inbox"'));
    assert.ok(cc.includes("CommunicationsScreen"));
    assert.ok(cc.includes('activeUtility === "inbox"'));
    assert.equal(agent.includes("WebView"), false);
    const listRoute = readFileSync(LIST_ROUTE, "utf8");
    const detailRoute = readFileSync(DETAIL_ROUTE, "utf8");
    const helpers = readFileSync(HELPERS, "utf8");
    assert.ok(listRoute.includes("inboundEmailCanonical: false"));
    assert.ok(detailRoute.includes("authorizeMobileLeadAccess"));
    assert.ok(helpers.includes("INBOUND EMAIL IS NOT CANONICAL"));
    assert.equal(listRoute.includes("$transaction"), false);
    assert.equal(detailRoute.includes("$transaction"), false);
    console.log("  -> PASS");
  }

  console.log("[11] Fake SMS/chat channel rejected...");
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
    const bad = executeCommunicationsQuery(v.payload, { channel: "sms" });
    assert.equal(bad.ok, false);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.8 — ALL TESTS PASSED\n");
}

runStage58Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
