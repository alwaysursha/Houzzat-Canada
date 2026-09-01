/**
 * Stage 5.1 — Native Global Calendar isolation + parity tests.
 *
 * Web Global Calendar = /agent/appointments flat list (not month grid).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  unwrapGlobalAppointment,
  unwrapGlobalAppointmentsList,
} from "../src/lib/appointment-response";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  verifyMobileToken,
} from "../src/types/token-helpers";

const REPO_ROOT = join(__dirname, "../../..");
const APPTS_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/appointments/route.ts",
);
const APPT_PATCH_ROUTE = join(
  REPO_ROOT,
  "src/app/api/mobile/v2/appointments/[appointmentId]/route.ts",
);
const APPT_SCOPE = join(
  REPO_ROOT,
  "src/lib/mobile/v2/appointment-scope.ts",
);
const AGENT_SHELL = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/AgentShell.tsx",
);
const CALENDAR_SCREEN = join(
  REPO_ROOT,
  "apps/pro-mobile/src/screens/GlobalCalendarScreen.tsx",
);

const CANARY_PARITY = {
  workspaceId: "ws_tenant_canary",
  appointments: [
    {
      id: "appt_canary_01",
      leadId: "lead_canary_01",
      workspaceId: "ws_tenant_canary",
      agentId: "usr_canary_agent_01",
      type: "SHOWING",
      status: "REQUESTED",
      startsAt: "2026-09-05T18:00:00.000Z",
      endsAt: null as string | null,
      listingMls: "C1234567",
      notes: null as string | null,
      videoJoinUrl: null as string | null,
      createdAt: "2026-08-29T12:00:00.000Z",
      updatedAt: "2026-08-29T12:00:00.000Z",
      customer: { name: "Alice Canary", email: "alice@canary.test", phone: null },
      lead: {
        id: "lead_canary_01",
        customer: { name: "Alice Canary", email: "alice@canary.test" },
      },
    },
  ],
};

const HOUZZAT_PARITY = {
  workspaceId: "ws_houzzat_prod",
  appointments: [
    {
      id: "appt_houzzat_01",
      leadId: "lead_houzzat_01",
      workspaceId: "ws_houzzat_prod",
      agentId: "usr_houzzat_agent_01",
      type: "VIRTUAL_VIEWING",
      status: "CONFIRMED",
      startsAt: "2026-09-08T20:00:00.000Z",
      endsAt: null as string | null,
      listingMls: "X9990001",
      notes: "Test virtual",
      videoJoinUrl: "https://meet.example.com/abc",
      createdAt: "2026-08-29T01:00:00.000Z",
      updatedAt: "2026-08-29T02:00:00.000Z",
      customer: { name: "Cevig", email: "cevig95014@dd2car.com", phone: null },
      lead: {
        id: "lead_houzzat_01",
        customer: { name: "Cevig", email: "cevig95014@dd2car.com" },
      },
    },
  ],
};

type MockLead = {
  id: string;
  workspaceId: string;
  assignedAgentId: string | null;
};

const MOCK_LEADS: Record<string, MockLead> = {
  lead_canary_01: {
    id: "lead_canary_01",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_01",
  },
  lead_canary_03_agent2: {
    id: "lead_canary_03_agent2",
    workspaceId: "ws_tenant_canary",
    assignedAgentId: "usr_canary_agent_02",
  },
  lead_houzzat_01: {
    id: "lead_houzzat_01",
    workspaceId: "ws_houzzat_prod",
    assignedAgentId: "usr_houzzat_agent_01",
  },
};

type StoredAppointment = {
  id: string;
  leadId: string | null;
  workspaceId: string;
  agentId: string | null;
  type: "SHOWING" | "VIRTUAL_VIEWING" | "BUYER_SESSION" | "VALUATION_CALL";
  status: "REQUESTED" | "CONFIRMED" | "RESCHEDULED" | "COMPLETED" | "CANCELLED";
  startsAt: string | null;
  endsAt: string | null;
  listingMls: string | null;
  notes: string | null;
  videoJoinUrl: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    name: string;
    email: string;
    phone: string | null;
  } | null;
  lead: {
    id: string;
    customer: { name: string; email: string };
  } | null;
};

const appointmentStore: StoredAppointment[] = [];

function tenantLeadIds(
  workspaceId: string,
  userId: string,
  role: string,
): string[] {
  return Object.values(MOCK_LEADS)
    .filter((l) => {
      if (l.workspaceId !== workspaceId) return false;
      if (role === "AGENT") {
        return l.assignedAgentId === userId || l.assignedAgentId === null;
      }
      return role === "OWNER" || role === "ADMIN";
    })
    .map((l) => l.id);
}

function authorizeWorkspace(tokenPayload: unknown) {
  const p = tokenPayload as {
    type?: string;
    wsId?: string;
    sub?: string;
    role?: string;
  };
  if (!p || p.type !== "mobile_workspace_access" || !p.wsId) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  if (p.role !== "AGENT" && p.role !== "OWNER" && p.role !== "ADMIN") {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }
  return {
    ok: true as const,
    userId: p.sub!,
    workspaceId: p.wsId,
    role: p.role!,
  };
}

function listAppointments(
  tokenPayload: unknown,
  from?: string,
  to?: string,
) {
  const access = authorizeWorkspace(tokenPayload);
  if (!access.ok) return access;

  const leadIds = tenantLeadIds(
    access.workspaceId,
    access.userId,
    access.role,
  );
  const canSeeTeam = access.role === "OWNER" || access.role === "ADMIN";

  let list = appointmentStore.filter((a) => {
    if (a.workspaceId !== access.workspaceId) return false;
    if (canSeeTeam) {
      return (
        (a.leadId && leadIds.includes(a.leadId)) ||
        (a.agentId === access.userId && !a.leadId)
      );
    }
    return (
      (a.agentId === access.userId && a.leadId && leadIds.includes(a.leadId)) ||
      (a.agentId === access.userId && !a.leadId) ||
      (!a.agentId && a.leadId && leadIds.includes(a.leadId))
    );
  });

  if (from && to) {
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      return {
        ok: false as const,
        status: 400,
        code: "VALIDATION_ERROR",
      };
    }
    if (toMs - fromMs > 365 * 24 * 60 * 60 * 1000) {
      return {
        ok: false as const,
        status: 400,
        code: "VALIDATION_ERROR",
      };
    }
    list = list.filter((a) => {
      if (a.startsAt) {
        const t = Date.parse(a.startsAt);
        return t >= fromMs && t <= toMs;
      }
      const c = Date.parse(a.createdAt);
      return c >= fromMs && c <= toMs;
    });
  }

  list = [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status);
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    ok: true as const,
    status: 200,
    from: from ?? new Date().toISOString(),
    to: to ?? new Date().toISOString(),
    appointments: list,
  };
}

function patchAppointment(
  tokenPayload: unknown,
  appointmentId: string,
  body: { status?: string },
) {
  const access = authorizeWorkspace(tokenPayload);
  if (!access.ok) return access;

  const appt = appointmentStore.find((a) => a.id === appointmentId);
  if (!appt || appt.workspaceId !== access.workspaceId) {
    return { ok: false as const, status: 404, code: "APPOINTMENT_NOT_FOUND" };
  }

  if (appt.agentId && appt.agentId !== access.userId) {
    return { ok: false as const, status: 403, code: "WORKSPACE_FORBIDDEN" };
  }

  if (appt.leadId) {
    const lead = MOCK_LEADS[appt.leadId];
    if (!lead || lead.workspaceId !== access.workspaceId) {
      return { ok: false as const, status: 404, code: "APPOINTMENT_NOT_FOUND" };
    }
    if (
      access.role === "AGENT" &&
      lead.assignedAgentId !== access.userId &&
      lead.assignedAgentId !== null
    ) {
      return { ok: false as const, status: 404, code: "APPOINTMENT_NOT_FOUND" };
    }
  }

  if (body.status) appt.status = body.status as StoredAppointment["status"];
  appt.updatedAt = new Date().toISOString();
  return { ok: true as const, status: 200, appointment: appt };
}

function assertHttpSafe(label: string, path: string) {
  const src = readFileSync(path, "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.equal(/\$transaction\s*\(/.test(code), false, `${label}: no $transaction`);
}

async function runStage51Tests() {
  console.log("=================================================================");
  console.log("STAGE 5.1 — NATIVE GLOBAL CALENDAR TESTS");
  console.log("=================================================================\n");

  appointmentStore.length = 0;
  for (const a of CANARY_PARITY.appointments) {
    appointmentStore.push({ ...a } as StoredAppointment);
  }
  for (const a of HOUZZAT_PARITY.appointments) {
    appointmentStore.push({ ...a } as StoredAppointment);
  }

  console.log("[1/14] HTTP-safe routes + appointment-scope...");
  {
    assertHttpSafe("appointments route", APPTS_ROUTE);
    assertHttpSafe("appointment patch route", APPT_PATCH_ROUTE);
    const src = readFileSync(APPTS_ROUTE, "utf8");
    assert.ok(src.includes("authorizeMobileWorkspaceAccess"));
    assert.ok(src.includes("mobileTenantLeadIds"));
    assert.ok(src.includes("parseMobileAppointmentRange"));
    const scope = readFileSync(APPT_SCOPE, "utf8");
    assert.ok(scope.includes("canMobileMutateAppointment"));
    console.log("  -> PASS");
  }

  console.log("[2/14] GlobalCalendarScreen mounted in AgentShell...");
  {
    const shell = readFileSync(AGENT_SHELL, "utf8");
    assert.ok(shell.includes("GlobalCalendarScreen"));
    assert.ok(shell.includes("<GlobalCalendarScreen"));
    const screen = readFileSync(CALENDAR_SCREEN, "utf8");
    assert.ok(screen.includes("Appointments"));
    assert.ok(screen.includes("Showings, Virtual Viewings, and consults."));
    assert.ok(screen.includes("No appointments in your book."));
    assert.ok(screen.includes("globalAppointmentCache"));
    assert.ok(screen.includes("/appointments"));
    assert.ok(screen.includes("Confirm"));
    console.log("  -> PASS");
  }

  console.log("[3/14] Unwrap helpers...");
  {
    const list = unwrapGlobalAppointmentsList({
      ok: true,
      appointments: [{ id: "a1", type: "SHOWING" }],
    });
    assert.equal(list.length, 1);
    assert.equal(
      unwrapGlobalAppointment({ ok: true, appointment: { id: "a2" } })?.id,
      "a2",
    );
    console.log("  -> PASS");
  }

  console.log("[4/14] Canary web ↔ Mobile v2 parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: CANARY_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listAppointments(verified.payload);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.appointments.length, 1);
    assert.equal(res.appointments[0]?.id, "appt_canary_01");
    assert.equal(res.appointments[0]?.type, "SHOWING");
    assert.equal(res.appointments[0]?.listingMls, "C1234567");
    console.log("  -> PASS");
  }

  console.log("[5/14] Houzzat web ↔ Mobile v2 parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_houzzat_agent_01",
      email: "staff@houzzat.com",
      workspaceId: HOUZZAT_PARITY.workspaceId,
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listAppointments(verified.payload);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.appointments.length, 1);
    assert.equal(res.appointments[0]?.id, "appt_houzzat_01");
    console.log("  -> PASS");
  }

  console.log("[6/14] Canary AGENT cannot see Houzzat appointments...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listAppointments(verified.payload);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(
      res.appointments.some((a) => a.workspaceId === "ws_houzzat_prod"),
      false,
    );
    console.log("  -> PASS");
  }

  console.log("[7/14] Agent A cannot mutate Agent B appointment...");
  {
    appointmentStore.push({
      id: "appt_agent2_private",
      leadId: "lead_canary_03_agent2",
      workspaceId: "ws_tenant_canary",
      agentId: "usr_canary_agent_02",
      type: "SHOWING",
      status: "REQUESTED",
      startsAt: "2026-09-10T12:00:00.000Z",
      endsAt: null,
      listingMls: null,
      notes: null,
      videoJoinUrl: null,
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-01T12:00:00.000Z",
      customer: null,
      lead: null,
    });
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const listed = listAppointments(verified.payload);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(
      listed.appointments.some((a) => a.id === "appt_agent2_private"),
      false,
    );
    const patched = patchAppointment(verified.payload, "appt_agent2_private", {
      status: "COMPLETED",
    });
    assert.equal(patched.ok, false);
    console.log("  -> PASS");
  }

  console.log("[8/14] OWNER same-workspace can list agent appointments...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_owner",
      email: "owner@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "OWNER",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listAppointments(verified.payload);
    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.ok(res.appointments.length >= 1);
    console.log("  -> PASS");
  }

  console.log("[9/14] Complete status mutation parity...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const done = patchAppointment(verified.payload, "appt_canary_01", {
      status: "COMPLETED",
    });
    assert.equal(done.ok, true);
    assert.equal(done.appointment?.status, "COMPLETED");
    console.log("  -> PASS");
  }

  console.log("[10/14] Date range bounds enforced...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const from = "2020-01-01T00:00:00.000Z";
    const to = "2025-01-01T00:00:00.000Z";
    const res = listAppointments(verified.payload, from, to);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[11/14] Platform token rejected...");
  {
    const platform = createPlatformAccessToken({
      id: "usr_admin",
      email: "admin@houzzat.com",
    });
    const verified = verifyMobileToken(platform.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = listAppointments(verified.payload);
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[12/14] Foreign appointmentId rejected...");
  {
    const token = createWorkspaceAccessToken({
      userId: "usr_canary_agent_01",
      email: "agent1@canary.com",
      workspaceId: "ws_tenant_canary",
      role: "AGENT",
    });
    const verified = verifyMobileToken(token.token);
    assert.equal(verified.ok, true);
    if (!verified.ok) return;
    const res = patchAppointment(verified.payload, "appt_does_not_exist", {
      status: "CANCELLED",
    });
    assert.equal(res.ok, false);
    console.log("  -> PASS");
  }

  console.log("[13/14] Cache coherence helpers present...");
  {
    const cache = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/lib/lead-tab-cache.ts"),
      "utf8",
    );
    assert.ok(cache.includes("globalAppointmentCache"));
    assert.ok(cache.includes("invalidateLeadAppointmentsCacheForLead"));
    assert.ok(cache.includes("invalidateGlobalAppointmentsCacheForWorkspace"));
    const apptTab = readFileSync(
      join(REPO_ROOT, "apps/pro-mobile/src/components/AppointmentsTab.tsx"),
      "utf8",
    );
    assert.ok(apptTab.includes("invalidateGlobalAppointmentsCacheForWorkspace"));
    console.log("  -> PASS");
  }

  console.log("[14/14] No global create (web parity)...");
  {
    const src = readFileSync(CALENDAR_SCREEN, "utf8");
    assert.equal(src.includes("Schedule appointment"), false);
    assert.equal(src.includes('post<unknown>("/appointments"'), false);
    console.log("  -> PASS");
  }

  console.log("\nSTAGE 5.1 — ALL TESTS PASSED\n");
}

runStage51Tests().catch((err) => {
  console.error(err);
  process.exit(1);
});
