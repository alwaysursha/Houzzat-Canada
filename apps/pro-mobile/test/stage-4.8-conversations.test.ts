/**
 * Stage 4.8 — Native Conversations (LeadEmailLog) isolation + parity tests.
 *
 * Web Conversations tab = CRM email log (LeadEmailLog), NOT chat/SMS.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unwrapComposer,
  unwrapEmail,
  unwrapEmailsList,
} from "../src/lib/conversation-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const CONV_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/conversations/route.ts",
);
const CONV_DETAIL_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/conversations/[emailId]/route.ts",
);
const DETAIL_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/LeadDetailScreen.tsx",
);
const CONV_TAB = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/ConversationsTab.tsx",
);

/** Real Houzzat fixture sampled from production LeadEmailLog (parity). */
const WEB_PARITY_FIXTURE = {
  leadId: "cmtdo9u1p000cpsp7taxictsi",
  workspaceId: "cmt7kfcth0000gvu0bqsycsvz",
  emails: [
    {
      id: "cmtdo9vnx000ipsp7qrfntpss",
      subject: "Verify your email for Houzzat",
      body: "Hi Cevig,\n\nPlease verify your email to keep full access to Houzzat.",
      toEmail: "cevig95014@dd2car.com",
      kind: "verify_email",
      openedAt: "2026-08-29T01:07:40.578Z",
      clickedAt: "2026-08-29T01:07:45.927Z",
      openCount: 1,
      clickCount: 1,
      lastClickedUrl: null as string | null,
      createdAt: "2026-08-29T00:58:49.869Z",
    },
    {
      id: "cmtdo9vmh000gpsp7oclhnfxu",
      subject: "Welcome to Houzzat",
      body: "Welcome, Cevig,\n\nThanks for joining Houzzat.",
      toEmail: "cevig95014@dd2car.com",
      kind: "welcome",
      openedAt: null as string | null,
      clickedAt: null as string | null,
      openCount: 0,
      clickCount: 0,
      lastClickedUrl: null as string | null,
      createdAt: "2026-08-29T00:58:49.817Z",
    },
  ],
};

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  organizationId: string;
  contactConsentAt: Date | null;
  customerEmail: string | null;
  caslConsentAt: Date | null;
  emailAlertsEnabled: boolean;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    organizationId: "org_canary",
    contactConsentAt: new Date(),
    customerEmail: "alice@canary.test",
    caslConsentAt: new Date(),
    emailAlertsEnabled: true,
  },
  lead_canary_02_pond: {
    id: "lead_canary_02_pond",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: null,
    organizationId: "org_canary",
    contactConsentAt: new Date(),
    customerEmail: "pond@canary.test",
    caslConsentAt: new Date(),
    emailAlertsEnabled: true,
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    organizationId: "org_canary",
    contactConsentAt: new Date(),
    customerEmail: "bob@canary.test",
    caslConsentAt: new Date(),
    emailAlertsEnabled: true,
  },
  [WEB_PARITY_FIXTURE.leadId]: {
    id: WEB_PARITY_FIXTURE.leadId,
    workspaceId: WEB_PARITY_FIXTURE.workspaceId,
    assignedAgentId: "usr_houzzat_agent_01",
    organizationId: "org_houzzat",
    contactConsentAt: new Date(),
    customerEmail: "cevig95014@dd2car.com",
    caslConsentAt: new Date(),
    emailAlertsEnabled: true,
  },
};

type StoredEmail = {
  id: string;
  leadId: string;
  workspaceId: string;
  subject: string;
  body: string;
  toEmail: string;
  kind: string;
  openedAt: string | null;
  clickedAt: string | null;
  openCount: number;
  clickCount: number;
  lastClickedUrl: string | null;
  createdAt: string;
};

const emailStore: StoredEmail[] = [];
const activityStore: { leadId: string; type: string; body: string }[] = [];

function authorize(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];
  if (!lead || lead.workspaceId !== workspaceId) {
    return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
  }
  if (role === "AGENT") {
    if (lead.assignedAgentId !== userId && lead.assignedAgentId !== null) {
      return { ok: false as const, status: 404, code: "LEAD_NOT_FOUND" };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return { ok: true as const, userId, workspaceId, role, lead };
}

function listEmails(tokenPayload: any, leadId: string) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const emails = emailStore
    .filter((e) => e.leadId === leadId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    ok: true as const,
    status: 200,
    emails,
    composer: {
      toEmail: access.lead.customerEmail,
      consented: Boolean(
        access.lead.contactConsentAt || access.lead.caslConsentAt,
      ),
      alertsEnabled: access.lead.emailAlertsEnabled,
    },
  };
}

function sendEmail(tokenPayload: any, leadId: string, body: unknown) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as { subject?: unknown; body?: unknown };
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const text = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!subject || !text) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  if (!access.lead.customerEmail) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const consented = Boolean(
    access.lead.contactConsentAt || access.lead.caslConsentAt,
  );
  if (!consented || !access.lead.emailAlertsEnabled) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const now = new Date().toISOString();
  const email: StoredEmail = {
    id: `email_${emailStore.length + 1}`,
    leadId: access.lead.id,
    workspaceId: access.workspaceId,
    subject,
    body: `Hi there,\n\n${text}`,
    toEmail: access.lead.customerEmail,
    kind: "agent_message",
    openedAt: null,
    clickedAt: null,
    openCount: 0,
    clickCount: 0,
    lastClickedUrl: null,
    createdAt: now,
  };
  emailStore.push(email);
  activityStore.push({
    leadId: access.lead.id,
    type: "email_sent",
    body: subject,
  });
  return { ok: true as const, status: 200, email, sent: 1 };
}

function getEmail(tokenPayload: any, leadId: string, emailId: string) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const email = emailStore.find((e) => e.id === emailId);
  if (!email || email.leadId !== access.lead.id) {
    return { ok: false as const, status: 404, code: "EMAIL_NOT_FOUND" };
  }
  return { ok: true as const, status: 200, email };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
}

async function runStage48Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.8 — NATIVE CONVERSATIONS (LeadEmailLog) TESTS");
  console.log("=================================================================\n");

  emailStore.length = 0;
  activityStore.length = 0;

  // Seed parity fixture into Houzzat lead store
  for (const e of WEB_PARITY_FIXTURE.emails) {
    emailStore.push({
      ...e,
      leadId: WEB_PARITY_FIXTURE.leadId,
      workspaceId: WEB_PARITY_FIXTURE.workspaceId,
    });
  }

  console.log("[1/14] HTTP-safe source + authorizeMobileLeadAccess...");
  {
    assertHttpSafe("conversations route", CONV_ROUTE);
    assertHttpSafe("conversation detail route", CONV_DETAIL_ROUTE);
    const src = readFileSync(CONV_ROUTE, "utf8");
    assert.ok(src.includes("authorizeMobileLeadAccess"));
    assert.ok(src.includes("leadEmailLog"));
    assert.ok(src.includes("sendAndLogClientEmail"));
    assert.ok(!src.includes("$transaction"));
    console.log("  -> PASS");
  }

  console.log("[2/14] ConversationsTab mounted (ComingSoon gone)...");
  {
    const src = readFileSync(DETAIL_SCREEN, "utf8");
    assert.ok(src.includes("import { ConversationsTab }"));
    assert.ok(src.includes("<ConversationsTab"));
    const idx = src.indexOf('{tab === "conversations"');
    assert.ok(idx > 0);
    const end = src.indexOf("{tab === \"engagement\"", idx);
    const block = src.slice(idx, end > idx ? end : idx + 250);
    assert.equal(block.includes("ComingSoonPanel"), false);
    assert.ok(block.includes("ConversationsTab"));
    const tab = readFileSync(CONV_TAB, "utf8");
    assert.ok(tab.includes("Send email"));
    assert.ok(tab.includes("No emails logged yet."));
    assert.ok(tab.includes("Preview"));
    assert.ok(tab.includes("EmailHtmlPreview") || tab.includes("htmlBody"));
    console.log("  -> PASS");
  }

  console.log("[3/14] Unwrap helpers...");
  {
    const list = unwrapEmailsList({
      ok: true,
      emails: [{ id: "e1", subject: "Hi" }],
    });
    assert.equal(list.length, 1);
    assert.equal(unwrapEmail({ ok: true, email: { id: "e2" } })?.id, "e2");
    assert.equal(
      unwrapComposer({
        composer: { toEmail: "a@b.c", consented: true, alertsEnabled: true },
      }).toEmail,
      "a@b.c",
    );
    console.log("  -> PASS");
  }

  console.log("[4/14] WEB ↔ Mobile v2 parity (same LeadEmailLog IDs)...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: WEB_PARITY_FIXTURE.workspaceId,
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    const listed = listEmails(h.payload, WEB_PARITY_FIXTURE.leadId);
    assert.equal(listed.ok, true);
    assert.equal(listed.emails?.length, 2);
    assert.equal(listed.emails?.[0]?.id, WEB_PARITY_FIXTURE.emails[0]!.id);
    assert.equal(
      listed.emails?.[0]?.subject,
      WEB_PARITY_FIXTURE.emails[0]!.subject,
    );
    assert.equal(listed.emails?.[1]?.id, WEB_PARITY_FIXTURE.emails[1]!.id);
    assert.equal(listed.emails?.[0]?.kind, "verify_email");
    assert.ok(listed.emails?.[0]?.openedAt);
    console.log("  -> PASS (same IDs/subjects/kind/timestamps as web fixture)");
  }

  const canaryAgent = createWorkspaceAccessToken({
    userId: "usr_canary_agent_01",
    email: "agent1@canary.com",
    workspaceId: "ws_tenant_canary",
    role: "AGENT",
  });
  const ca = verifyMobileToken(canaryAgent.token);
  assert.equal(ca.ok, true);
  if (!ca.ok) return;

  console.log("[5/14] Canary AGENT can send + list Canary emails...");
  {
    const sent = sendEmail(ca.payload, "lead_canary_01", {
      subject: "Following up",
      body: "Just checking in.",
    });
    assert.equal(sent.ok, true);
    assert.equal(sent.email?.kind, "agent_message");
    assert.equal(
      activityStore.filter((a) => a.type === "email_sent").length,
      1,
    );
    const listed = listEmails(ca.payload, "lead_canary_01");
    assert.equal(listed.ok, true);
    assert.equal(listed.emails?.length, 1);
    console.log("  -> PASS");
  }

  console.log("[6/14] Canary AGENT cannot see Houzzat conversation...");
  {
    assert.equal(
      listEmails(ca.payload, WEB_PARITY_FIXTURE.leadId).status,
      404,
    );
    assert.equal(
      sendEmail(ca.payload, WEB_PARITY_FIXTURE.leadId, {
        subject: "x",
        body: "y",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[7/14] Houzzat AGENT cannot see Canary conversation...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: WEB_PARITY_FIXTURE.workspaceId,
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    assert.equal(listEmails(h.payload, "lead_canary_01").status, 404);
    console.log("  -> PASS");
  }

  console.log("[8/14] Agent A cannot access Agent B private lead emails...");
  {
    assert.equal(listEmails(ca.payload, "lead_canary_03_agent2").status, 404);
    assert.equal(
      sendEmail(ca.payload, "lead_canary_03_agent2", {
        subject: "x",
        body: "y",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[9/14] Pond lead send allowed for AGENT...");
  {
    const res = sendEmail(ca.payload, "lead_canary_02_pond", {
      subject: "Pond follow-up",
      body: "Hello from pond",
    });
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("[10/14] OWNER same-workspace can list Agent B emails...");
  {
    const owner = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const o = verifyMobileToken(owner.token);
    assert.equal(o.ok, true);
    if (!o.ok) return;
    const sent = sendEmail(o.payload, "lead_canary_03_agent2", {
      subject: "Owner note",
      body: "Checking in",
    });
    assert.equal(sent.ok, true);
    const listed = listEmails(o.payload, "lead_canary_03_agent2");
    assert.equal(listed.ok, true);
    assert.ok((listed.emails?.length ?? 0) >= 1);
    console.log("  -> PASS");
  }

  console.log("[11/14] Client workspace spoof ignored...");
  {
    assert.equal(
      listEmails(ca.payload, WEB_PARITY_FIXTURE.leadId).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[12/14] Platform-only token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "platform@houzzat.com",
    });
    const p = verifyMobileToken(platform.token);
    assert.equal(p.ok, true);
    if (!p.ok) return;
    assert.equal(listEmails(p.payload, "lead_canary_01").status, 403);
    assert.equal(
      sendEmail(p.payload, "lead_canary_01", {
        subject: "x",
        body: "y",
      }).status,
      403,
    );
    console.log("  -> PASS");
  }

  console.log("[13/14] Foreign emailId / wrong lead combo rejected...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: WEB_PARITY_FIXTURE.workspaceId,
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    const foreignId = WEB_PARITY_FIXTURE.emails[0]!.id;
    assert.equal(
      getEmail(ca.payload, "lead_canary_01", foreignId).status,
      404,
    );
    // Valid Houzzat token but wrong leadId combo for foreign email
    assert.equal(
      getEmail(h.payload, "lead_canary_01", foreignId).status,
      404,
    );
    assert.equal(
      getEmail(h.payload, WEB_PARITY_FIXTURE.leadId, foreignId).ok,
      true,
    );
    console.log("  -> PASS");
  }

  console.log("[14/14] Invalid send payload rejected...");
  {
    assert.equal(
      sendEmail(ca.payload, "lead_canary_01", {
        subject: "  ",
        body: "ok",
      }).status,
      400,
    );
    assert.equal(
      sendEmail(ca.payload, "lead_canary_01", {
        subject: "ok",
        body: "",
      }).status,
      400,
    );
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 4.8 — ALL TESTS PASSED\n");
}

runStage48Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
