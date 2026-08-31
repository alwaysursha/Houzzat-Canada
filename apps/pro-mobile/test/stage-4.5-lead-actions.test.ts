/**
 * Stage 4.5 — Native Lead Actions write isolation + validation tests.
 *
 * Verifies POST notes + PATCH status authorization mirrors Stage 4.3A/4.4
 * lead visibility, plus invalid status rejection and native URL safety helpers.
 */

import assert from "node:assert/strict";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";
import type { LeadStatus } from "../src/types/lead";

const CANONICAL_STATUSES: LeadStatus[] = [
  "NEW_LEAD",
  "ATTEMPTED_CONTACT",
  "CONTACTED",
  "APPT_SET",
  "APPT_MET",
  "ACTIVE_CLIENT",
  "PENDING_CLIENT",
  "PAST_CLIENT",
];

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  status: LeadStatus;
  notes: string | null;
  organizationId: string;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_canary",
  },
  lead_canary_02_pond: {
    id: "lead_canary_02_pond",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: null,
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_canary",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    status: "CONTACTED",
    notes: null,
    organizationId: "org_canary",
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    status: "NEW_LEAD",
    notes: null,
    organizationId: "org_houzzat",
  },
};

type NoteStore = {
  id: string;
  leadId: string;
  workspaceId: string;
  authorId: string;
  body: string;
  category: "GENERAL" | "CALL";
  pinned: boolean;
};

type ActivityStore = {
  id: string;
  leadId: string;
  type: string;
  body: string;
  userId: string;
};

const noteStore: NoteStore[] = [];
const activityStore: ActivityStore[] = [];

function authorizeWrite(tokenPayload: any, leadId: string) {
  if (
    !tokenPayload ||
    tokenPayload.type !== "mobile_workspace_access" ||
    !tokenPayload.wsId
  ) {
    return {
      ok: false as const,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "A valid workspace session token is required",
    };
  }

  const workspaceId = tokenPayload.wsId as string;
  const userId = tokenPayload.sub as string;
  const role = tokenPayload.role as string;
  const lead = MOCK_LEADS[leadId];

  if (!lead || lead.workspaceId !== workspaceId) {
    return {
      ok: false as const,
      status: 404,
      code: "LEAD_NOT_FOUND",
      message: "Lead not found in current workspace",
    };
  }

  if (role === "AGENT") {
    const isAssigned = lead.assignedAgentId === userId;
    const isPond = lead.assignedAgentId === null;
    if (!isAssigned && !isPond) {
      return {
        ok: false as const,
        status: 404,
        code: "LEAD_NOT_FOUND",
        message: "Lead not found or access restricted",
      };
    }
  } else if (role !== "OWNER" && role !== "ADMIN") {
    return {
      ok: false as const,
      status: 403,
      code: "WORKSPACE_FORBIDDEN",
      message: "Unsupported workspace role",
    };
  }

  return {
    ok: true as const,
    userId,
    workspaceId,
    role,
    lead,
  };
}

/** Mirrors POST /api/mobile/v2/leads/[leadId]/notes authorization + validation. */
function executeCreateNote(
  tokenPayload: any,
  leadId: string,
  body: unknown,
  clientWorkspaceHeader?: string,
) {
  // Client-supplied workspace header must never override token.wsId.
  void clientWorkspaceHeader;

  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { body?: unknown }).body !== "string"
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid note payload",
    };
  }

  const noteBody = String((body as { body: string }).body).trim();
  if (!noteBody || noteBody.length > 8000) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Note body is required",
    };
  }

  const categoryRaw = (body as { category?: unknown }).category;
  const category =
    categoryRaw === "CALL" || categoryRaw === "GENERAL" ? categoryRaw : "GENERAL";
  const pinned = Boolean((body as { pinned?: unknown }).pinned);

  const note: NoteStore = {
    id: `note_${noteStore.length + 1}`,
    leadId: access.lead.id,
    workspaceId: access.workspaceId,
    authorId: access.userId,
    body: noteBody,
    category,
    pinned,
  };
  noteStore.push(note);
  activityStore.push({
    id: `act_note_${activityStore.length + 1}`,
    leadId: access.lead.id,
    type: "note",
    body: noteBody.slice(0, 500),
    userId: access.userId,
  });
  access.lead.notes = access.lead.notes
    ? `${access.lead.notes}\n\n${noteBody}`
    : noteBody;

  return {
    ok: true as const,
    status: 200,
    note: {
      id: note.id,
      body: note.body,
      category: note.category,
      pinned: note.pinned,
    },
  };
}

/** Mirrors PATCH /api/mobile/v2/leads/[leadId]/status authorization + validation. */
function executePatchStatus(
  tokenPayload: any,
  leadId: string,
  body: unknown,
  clientWorkspaceHeader?: string,
) {
  void clientWorkspaceHeader;

  const access = authorizeWrite(tokenPayload, leadId);
  if (!access.ok) {
    return {
      ok: false as const,
      status: access.status,
      code: access.code,
      message: access.message,
    };
  }

  const nextStatus =
    body && typeof body === "object"
      ? (body as { status?: unknown }).status
      : undefined;

  if (
    typeof nextStatus !== "string" ||
    !(CANONICAL_STATUSES as string[]).includes(nextStatus)
  ) {
    return {
      ok: false as const,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Invalid or unsupported LeadStatus value",
    };
  }

  const prev = access.lead.status;
  if (nextStatus === prev) {
    return {
      ok: true as const,
      status: 200,
      lead: {
        id: access.lead.id,
        status: prev,
        unchanged: true,
      },
    };
  }

  access.lead.status = nextStatus as LeadStatus;
  activityStore.push({
    id: `act_status_${activityStore.length + 1}`,
    leadId: access.lead.id,
    type: "status_change",
    body: nextStatus,
    userId: access.userId,
  });

  return {
    ok: true as const,
    status: 200,
    lead: {
      id: access.lead.id,
      status: access.lead.status,
      unchanged: false,
    },
  };
}

/** Native composer URL builders used by LeadDetailScreen. */
function buildCallUrl(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  return trimmed ? `tel:${trimmed}` : null;
}

function buildSmsUrl(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  return trimmed ? `sms:${trimmed}` : null;
}

function buildMailtoUrl(email: string | null | undefined): string | null {
  const trimmed = email?.trim();
  return trimmed ? `mailto:${encodeURIComponent(trimmed)}` : null;
}

async function runStage45Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.5 — NATIVE LEAD ACTIONS WRITE ISOLATION TESTS");
  console.log("=================================================================\n");

  noteStore.length = 0;
  activityStore.length = 0;
  MOCK_LEADS.lead_canary_01!.status = "NEW_LEAD";
  MOCK_LEADS.lead_canary_02_pond!.status = "NEW_LEAD";
  MOCK_LEADS.lead_houzzat_01!.status = "NEW_LEAD";

  // 1. Canary AGENT can note + status on assigned Canary lead
  console.log("[1/12] Canary AGENT → note + status on assigned Canary lead...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_01", {
      body: "Stage 4.5 canary note",
      category: "GENERAL",
      pinned: false,
    });
    assert.equal(noteRes.ok, true);
    assert.equal(noteRes.status, 200);
    assert.equal(noteRes.note?.body, "Stage 4.5 canary note");

    const statusRes = executePatchStatus(verify.payload, "lead_canary_01", {
      status: "ATTEMPTED_CONTACT",
    });
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.lead?.status, "ATTEMPTED_CONTACT");
    assert.equal(MOCK_LEADS.lead_canary_01!.status, "ATTEMPTED_CONTACT");
    console.log("  -> PASS");
  }

  // 2. Canary AGENT cannot mutate Houzzat lead
  console.log("[2/12] Canary AGENT → cannot mutate Houzzat lead...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_houzzat_01", {
      body: "cross-tenant note",
    });
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 404);

    const statusRes = executePatchStatus(verify.payload, "lead_houzzat_01", {
      status: "CONTACTED",
    });
    assert.equal(statusRes.ok, false);
    assert.equal(statusRes.status, 404);
    assert.equal(MOCK_LEADS.lead_houzzat_01!.status, "NEW_LEAD");
    console.log("  -> PASS (404)");
  }

  // 3. Houzzat AGENT cannot mutate Canary lead
  console.log("[3/12] Houzzat AGENT → cannot mutate Canary lead...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_01", {
      body: "cross-tenant note",
    });
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 404);

    const statusRes = executePatchStatus(verify.payload, "lead_canary_01", {
      status: "CONTACTED",
    });
    assert.equal(statusRes.ok, false);
    assert.equal(statusRes.status, 404);
    console.log("  -> PASS (404)");
  }

  // 4. Agent A cannot mutate Agent B private lead
  console.log("[4/12] Agent A → cannot mutate Agent B private lead...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_03_agent2", {
      body: "private lead note",
    });
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 404);

    const statusRes = executePatchStatus(verify.payload, "lead_canary_03_agent2", {
      status: "APPT_SET",
    });
    assert.equal(statusRes.ok, false);
    assert.equal(statusRes.status, 404);
    console.log("  -> PASS (404)");
  }

  // 5. AGENT pond lead write allowed (matches CRM scope)
  console.log("[5/12] Canary AGENT → pond lead note + status allowed...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_02_pond", {
      body: "Pond follow-up",
      category: "CALL",
      pinned: true,
    });
    assert.equal(noteRes.ok, true);
    assert.equal(noteRes.note?.category, "CALL");
    assert.equal(noteRes.note?.pinned, true);

    const statusRes = executePatchStatus(verify.payload, "lead_canary_02_pond", {
      status: "CONTACTED",
    });
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.lead?.status, "CONTACTED");
    console.log("  -> PASS");
  }

  // 6. OWNER same-workspace write allowed
  console.log("[6/12] Canary OWNER → Agent B lead status allowed...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const statusRes = executePatchStatus(verify.payload, "lead_canary_03_agent2", {
      status: "APPT_SET",
    });
    assert.equal(statusRes.ok, true);
    assert.equal(statusRes.lead?.status, "APPT_SET");

    const noteRes = executeCreateNote(verify.payload, "lead_canary_03_agent2", {
      body: "Owner note on agent B lead",
    });
    assert.equal(noteRes.ok, true);
    console.log("  -> PASS");
  }

  // 7. Client-supplied workspaceId manipulation has no effect
  console.log("[7/12] Client workspace header manipulation → ignored...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    // Spoofed Houzzat header must not unlock Houzzat lead.
    const noteRes = executeCreateNote(
      verify.payload,
      "lead_houzzat_01",
      { body: "spoof" },
      "ws_houzzat_prod",
    );
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 404);

    // Spoofed Canary header must not unlock cross-tenant either.
    const statusRes = executePatchStatus(
      verify.payload,
      "lead_houzzat_01",
      { status: "CONTACTED" },
      "ws_tenant_canary",
    );
    assert.equal(statusRes.ok, false);
    assert.equal(statusRes.status, 404);
    console.log("  -> PASS");
  }

  // 8. Platform-only token rejected
  console.log("[8/12] Platform-only token → rejected for writes...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_platform",
      email: "platform@houzzat.com",
    });
    const verify = verifyMobileToken(platform.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_01", {
      body: "platform note",
    });
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 403);

    const statusRes = executePatchStatus(verify.payload, "lead_canary_01", {
      status: "CONTACTED",
    });
    assert.equal(statusRes.ok, false);
    assert.equal(statusRes.status, 403);
    console.log("  -> PASS (403)");
  }

  // 9. Invalid status rejected
  console.log("[9/12] Invalid status string → rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    for (const bad of ["HACKED", "closed", "", "NEW", null, 42]) {
      const statusRes = executePatchStatus(verify.payload, "lead_canary_01", {
        status: bad as any,
      });
      assert.equal(statusRes.ok, false);
      assert.equal(statusRes.status, 400);
      assert.equal(statusRes.code, "VALIDATION_ERROR");
    }
    console.log("  -> PASS");
  }

  // 10. Empty note body rejected
  console.log("[10/12] Empty note body → rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    const noteRes = executeCreateNote(verify.payload, "lead_canary_01", {
      body: "   ",
    });
    assert.equal(noteRes.ok, false);
    assert.equal(noteRes.status, 400);
    console.log("  -> PASS");
  }

  // 11. Activity created for note + status (canonical side effect)
  console.log("[11/12] Note + status create activity entries...");
  {
    const before = activityStore.length;
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verify = verifyMobileToken(token.token);
    assert.equal(verify.ok, true);
    if (!verify.ok) return;

    executeCreateNote(verify.payload, "lead_canary_01", {
      body: "Activity check note",
    });
    executePatchStatus(verify.payload, "lead_canary_01", {
      status: "ACTIVE_CLIENT",
    });

    const created = activityStore.slice(before);
    assert.ok(created.some((a) => a.type === "note" && a.body === "Activity check note"));
    assert.ok(created.some((a) => a.type === "status_change" && a.body === "ACTIVE_CLIENT"));
    console.log("  -> PASS");
  }

  // 12. Native Call / SMS / Email URL builders (no auto-send)
  console.log("[12/12] Native composer URL builders...");
  {
    assert.equal(buildCallUrl("416-555-0101"), "tel:416-555-0101");
    assert.equal(buildCallUrl(null), null);
    assert.equal(buildCallUrl("  "), null);

    assert.equal(buildSmsUrl("416-555-0101"), "sms:416-555-0101");
    assert.equal(buildSmsUrl(""), null);

    assert.equal(
      buildMailtoUrl("alice@example.com"),
      `mailto:${encodeURIComponent("alice@example.com")}`,
    );
    assert.equal(buildMailtoUrl(null), null);

    // URLs must not encode send-side payloads / auto-body.
    assert.equal(buildSmsUrl("416-555-0101")?.includes("body="), false);
    assert.equal(buildMailtoUrl("a@b.com")?.includes("subject="), false);
    console.log("  -> PASS");
  }

  console.log("\n=================================================================");
  console.log("STAGE 4.5 WRITE ISOLATION TESTS: ALL PASSED");
  console.log("=================================================================");
}

runStage45Tests().catch((err) => {
  console.error("STAGE 4.5 TESTS FAILED:", err);
  process.exit(1);
});
