/**
 * Stage 4.7 — Native Appointments isolation + HTTP-safety tests.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unwrapAppointment,
  unwrapAppointmentsList,
} from "../src/lib/appointment-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const APPTS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/appointments/route.ts",
);
const APPT_PATCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/leads/[leadId]/appointments/[appointmentId]/route.ts",
);
const DETAIL_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/LeadDetailScreen.tsx",
);
const APPTS_TAB = join(
  REPO_ROOT,
  "apps/pro-mobile/src/components/AppointmentsTab.tsx",
);

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
  organizationId: string;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
    organizationId: "org_canary",
  },
  lead_canary_02_pond: {
    id: "lead_canary_02_pond",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: null,
    organizationId: "org_canary",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
    organizationId: "org_canary",
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
    organizationId: "org_houzzat",
  },
};

type StoredAppointment = {
  id: string;
  leadId: string;
  workspaceId: string;
  agentId: string | null;
  type: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  listingMls: string | null;
  notes: string | null;
  videoJoinUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

const appointmentStore: StoredAppointment[] = [];

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

function listAppointments(tokenPayload: any, leadId: string) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  // Canonical web: by leadId after lead auth (no extra workspaceId on Appointment).
  const appointments = appointmentStore.filter((a) => a.leadId === leadId);
  return { ok: true as const, status: 200, appointments };
}

function createAppointment(
  tokenPayload: any,
  leadId: string,
  body: unknown,
) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as {
    type?: unknown;
    startsAt?: unknown;
    notes?: unknown;
    videoJoinUrl?: unknown;
  };
  const types = [
    "SHOWING",
    "VIRTUAL_VIEWING",
    "BUYER_SESSION",
    "VALUATION_CALL",
  ];
  if (typeof raw.type !== "string" || !types.includes(raw.type)) {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  let startsAt: string | null = null;
  if (raw.startsAt != null && raw.startsAt !== "") {
    if (
      typeof raw.startsAt !== "string" ||
      Number.isNaN(Date.parse(raw.startsAt))
    ) {
      return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
    }
    startsAt = new Date(raw.startsAt).toISOString();
  }
  const now = new Date().toISOString();
  const appt: StoredAppointment = {
    id: `appt_${appointmentStore.length + 1}`,
    leadId: access.lead.id,
    workspaceId: access.workspaceId,
    agentId: access.userId,
    type: raw.type,
    status: "REQUESTED",
    startsAt,
    endsAt: null,
    listingMls: null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    videoJoinUrl:
      typeof raw.videoJoinUrl === "string" ? raw.videoJoinUrl : null,
    createdAt: now,
    updatedAt: now,
  };
  appointmentStore.push(appt);
  return { ok: true as const, status: 200, appointment: appt };
}

function patchAppointment(
  tokenPayload: any,
  leadId: string,
  appointmentId: string,
  body: unknown,
) {
  const access = authorize(tokenPayload, leadId);
  if (!access.ok) return access;
  const appt = appointmentStore.find((a) => a.id === appointmentId);
  if (!appt || appt.leadId !== access.lead.id) {
    return { ok: false as const, status: 404, code: "APPOINTMENT_NOT_FOUND" };
  }
  // Web canMutateAppointment agentId rule
  if (appt.agentId && appt.agentId !== access.userId) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  if (!body || typeof body !== "object") {
    return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
  }
  const raw = body as { status?: unknown; startsAt?: unknown; notes?: unknown };
  if (raw.status !== undefined) {
    const statuses = [
      "REQUESTED",
      "CONFIRMED",
      "RESCHEDULED",
      "COMPLETED",
      "CANCELLED",
    ];
    if (typeof raw.status !== "string" || !statuses.includes(raw.status)) {
      return { ok: false as const, status: 400, code: "VALIDATION_ERROR" };
    }
    appt.status = raw.status;
  }
  if (typeof raw.startsAt === "string" && !Number.isNaN(Date.parse(raw.startsAt))) {
    appt.startsAt = new Date(raw.startsAt).toISOString();
  }
  if (typeof raw.notes === "string") {
    appt.notes = raw.notes;
  }
  appt.updatedAt = new Date().toISOString();
  return { ok: true as const, status: 200, appointment: { ...appt } };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
  assert.equal(/\.updateMany\s*\(/.test(code), false, `${label}: no updateMany`);
}

async function runStage47Tests() {
  console.log("=================================================================");
  console.log("STAGE 4.7 — NATIVE APPOINTMENTS TESTS");
  console.log("=================================================================\n");

  appointmentStore.length = 0;

  console.log("[1/14] HTTP-safe source (appointments GET/POST + PATCH)...");
  {
    assertHttpSafe("appointments route", APPTS_ROUTE);
    assertHttpSafe("appointment patch route", APPT_PATCH_ROUTE);
    const getSrc = readFileSync(APPTS_ROUTE, "utf8");
    assert.ok(getSrc.includes("authorizeMobileLeadAccess"));
    assert.ok(getSrc.includes('where: { leadId: access.lead.id }'));
    console.log("  -> PASS");
  }

  console.log("[2/14] AppointmentsTab mounted (ComingSoon gone)...");
  {
    const src = readFileSync(DETAIL_SCREEN, "utf8");
    assert.ok(src.includes('import { AppointmentsTab }'));
    assert.ok(src.includes("<AppointmentsTab"));
    const apptIdx = src.indexOf('tab === "appointments"');
    assert.ok(apptIdx > 0);
    const block = src.slice(apptIdx, apptIdx + 600);
    assert.equal(block.includes("ComingSoonPanel"), false);
    assert.ok(block.includes("AppointmentsTab"));
    const tabSrc = readFileSync(APPTS_TAB, "utf8");
    assert.ok(tabSrc.includes("Schedule appointment"));
    assert.ok(tabSrc.includes("No appointments."));
    assert.ok(tabSrc.includes("Confirm"));
    assert.ok(tabSrc.includes("Mark complete"));
    assert.ok(tabSrc.includes("Cancel"));
    console.log("  -> PASS");
  }

  console.log("[3/14] Response unwrap helpers...");
  {
    const list = unwrapAppointmentsList({
      ok: true,
      appointments: [{ id: "a1", type: "SHOWING", status: "REQUESTED" }],
    });
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, "a1");
    assert.equal(
      unwrapAppointment({ ok: true, appointment: { id: "a2" } })?.id,
      "a2",
    );
    assert.deepEqual(unwrapAppointmentsList(null), []);
    console.log("  -> PASS");
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

  console.log("[4/14] Canary AGENT can create + list Canary appointments...");
  {
    const created = createAppointment(ca.payload, "lead_canary_01", {
      type: "SHOWING",
      startsAt: "2026-09-15T15:00:00.000Z",
      notes: "Canary showing",
    });
    assert.equal(created.ok, true);
    assert.equal(created.appointment?.status, "REQUESTED");
    assert.equal(created.appointment?.type, "SHOWING");
    assert.equal(created.appointment?.startsAt, "2026-09-15T15:00:00.000Z");

    const listed = listAppointments(ca.payload, "lead_canary_01");
    assert.equal(listed.ok, true);
    assert.equal(listed.appointments?.length, 1);
    console.log("  -> PASS");
  }

  console.log("[5/14] Confirm / Complete / Cancel...");
  {
    const id = appointmentStore[0]!.id;
    const confirmed = patchAppointment(ca.payload, "lead_canary_01", id, {
      status: "CONFIRMED",
      startsAt: "2026-09-15T16:00:00.000Z",
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.appointment?.status, "CONFIRMED");
    assert.equal(confirmed.appointment?.startsAt, "2026-09-15T16:00:00.000Z");

    const completed = patchAppointment(ca.payload, "lead_canary_01", id, {
      status: "COMPLETED",
    });
    assert.equal(completed.ok, true);
    assert.equal(completed.appointment?.status, "COMPLETED");

    const cancelled = createAppointment(ca.payload, "lead_canary_01", {
      type: "VALUATION_CALL",
    });
    assert.equal(cancelled.ok, true);
    const cancel = patchAppointment(
      ca.payload,
      "lead_canary_01",
      cancelled.appointment!.id,
      { status: "CANCELLED" },
    );
    assert.equal(cancel.ok, true);
    assert.equal(cancel.appointment?.status, "CANCELLED");
    console.log("  -> PASS");
  }

  console.log("[6/14] Canary AGENT cannot access Houzzat appointments...");
  {
    assert.equal(listAppointments(ca.payload, "lead_houzzat_01").status, 404);
    assert.equal(
      createAppointment(ca.payload, "lead_houzzat_01", {
        type: "SHOWING",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[7/14] Houzzat AGENT cannot access Canary appointments...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    assert.equal(listAppointments(h.payload, "lead_canary_01").status, 404);
    assert.equal(
      createAppointment(h.payload, "lead_canary_01", {
        type: "SHOWING",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[8/14] Agent A cannot access Agent B private lead appointments...");
  {
    assert.equal(
      listAppointments(ca.payload, "lead_canary_03_agent2").status,
      404,
    );
    assert.equal(
      createAppointment(ca.payload, "lead_canary_03_agent2", {
        type: "SHOWING",
      }).status,
      404,
    );
    console.log("  -> PASS");
  }

  console.log("[9/14] Pond lead create allowed for AGENT...");
  {
    const res = createAppointment(ca.payload, "lead_canary_02_pond", {
      type: "BUYER_SESSION",
      notes: "Pond consult",
    });
    assert.equal(res.ok, true);
    console.log("  -> PASS");
  }

  console.log("[10/14] OWNER same-workspace can list Agent B lead appointments...");
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
    const created = createAppointment(o.payload, "lead_canary_03_agent2", {
      type: "VIRTUAL_VIEWING",
    });
    assert.equal(created.ok, true);
    const listed = listAppointments(o.payload, "lead_canary_03_agent2");
    assert.equal(listed.ok, true);
    assert.ok((listed.appointments?.length ?? 0) >= 1);
    console.log("  -> PASS");
  }

  console.log("[11/14] Client workspace spoof ignored...");
  {
    assert.equal(listAppointments(ca.payload, "lead_houzzat_01").status, 404);
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
    assert.equal(listAppointments(p.payload, "lead_canary_01").status, 403);
    assert.equal(
      createAppointment(p.payload, "lead_canary_01", {
        type: "SHOWING",
      }).status,
      403,
    );
    console.log("  -> PASS");
  }

  console.log("[13/14] Appointment ID from another workspace rejected...");
  {
    const houzzat = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: "ws_houzzat_prod",
      role: "AGENT",
    });
    const h = verifyMobileToken(houzzat.token);
    assert.equal(h.ok, true);
    if (!h.ok) return;
    const foreign = createAppointment(h.payload, "lead_houzzat_01", {
      type: "SHOWING",
    });
    assert.equal(foreign.ok, true);
    const crossPatch = patchAppointment(
      ca.payload,
      "lead_canary_01",
      foreign.appointment!.id,
      { status: "CANCELLED" },
    );
    assert.equal(crossPatch.status, 404);
    console.log("  -> PASS");
  }

  console.log("[14/14] Invalid lead/appointment combo + invalid type rejected...");
  {
    assert.equal(
      createAppointment(ca.payload, "lead_canary_01", {
        type: "NOT_A_TYPE",
      }).status,
      400,
    );
    const crossLead = patchAppointment(
      ca.payload,
      "lead_canary_02_pond",
      appointmentStore[0]!.id,
      { status: "CANCELLED" },
    );
    assert.equal(crossLead.status, 404);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 4.7 — ALL TESTS PASSED\n");
}

runStage47Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
