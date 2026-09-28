/**
 * Agent call-outcome backend selftest.
 * Run: node --import tsx scripts/call-outcome-selftest.ts
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ATTEMPTED_CONTACT_REMINDER_TITLE,
  CALL_NEW_LEAD_TASK_TITLE,
} from "../src/lib/agent/lead-intake";
import type { AgentOrgContext } from "../src/lib/agent";
import { canAccessLeadForMobileCallOutcome } from "../src/lib/agent/call-outcome-mobile-context";
import {
  CALL_OUTCOME_FOLLOW_UP_TITLE,
  callOutcomeHttpResponse,
  deliverCallOutcomeNotice,
  postAgentCallOutcome,
  type CallOutcomeDb,
} from "../src/lib/agent/call-outcome";
import { canAccessLead } from "../src/lib/crm-read-scope";
import { authenticateMobileRequest } from "../src/lib/mobile/v2/auth-guard";
import {
  createPlatformAccessToken,
  createWorkspaceAccessToken,
  signMobileToken,
} from "../src/lib/mobile/v2/tokens";
import {
  buildCallOutcomeRequest,
  presentCallLeadActivity,
  resolveFollowUpInstant,
} from "../src/lib/agent/call-outcome-presentation";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-09-28T17:00:00.000Z");
const followUpDue = "2026-09-29T15:00:00.000Z";

type UserRow = {
  id: string;
  phone: string;
  phoneE164: string;
  phoneVerifiedAt: Date | null;
  phoneUpdateRequestedAt: Date | null;
};

type TaskRow = {
  id: string;
  leadId: string;
  assigneeId: string;
  createdById: string;
  type: string;
  status: string;
  title: string;
  body: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
};

type NoteRow = {
  id: string;
  leadId: string;
  authorId: string;
  body: string;
  category: string;
  organizationId: string;
  workspaceId?: string;
};

type ActivityRow = {
  id: string;
  leadId: string;
  userId: string;
  type: string;
  body: string;
  meta: Record<string, unknown>;
};

type LeadRow = {
  id: string;
  organizationId: string | null;
  workspaceId: string | null;
  assignedAgentId: string | null;
  customerId: string | null;
  notes: string | null;
  status: string;
  firstRespondedAt: Date | null;
};

type State = {
  leads: LeadRow[];
  users: UserRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  activities: ActivityRow[];
  seq: number;
};

function agent(input: {
  id: string;
  workspaceId: string;
  canSeeTeamLeads?: boolean;
}): AgentOrgContext {
  return {
    user: {
      id: input.id,
      email: `${input.id}@houzzat.test`,
      name: input.id,
      image: null,
      phone: null,
      role: "AGENT",
    },
    organizationId: "org-1",
    organizationName: "Desk",
    organizationIds: ["org-1"],
    membershipRole: "AGENT",
    canSeeTeamLeads: input.canSeeTeamLeads ?? false,
    isPlatformAdmin: false,
    workspaceId: input.workspaceId,
    workspaceRole: "AGENT",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "Workspace",
    isWorkspaceMember: true,
    isWorkspaceCrmAllowed: true,
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
  } as AgentOrgContext;
}

function createDb(seed?: Partial<State>): {
  db: CallOutcomeDb;
  state: State;
  locks: string[];
  userWrites: Array<Record<string, unknown>>;
  failUnverify: { current: boolean };
  failLock: { current: boolean };
} {
  const state: State = {
    leads: seed?.leads ? structuredClone(seed.leads) : [],
    users: seed?.users ? structuredClone(seed.users) : [],
    tasks: seed?.tasks ? structuredClone(seed.tasks) : [],
    notes: [],
    activities: [],
    seq: 1,
  };
  const locks: string[] = [];
  const userWrites: Array<Record<string, unknown>> = [];
  const failUnverify = { current: false };
  const failLock = { current: false };
  const box = { state };

  const tx = {
    async $executeRaw(_query: TemplateStringsArray, ...values: unknown[]) {
      if (failLock.current) throw new Error("lock unavailable");
      locks.push(values.map(String).join(":"));
    },
    lead: {
      async findUnique(args: { where: { id: string } }) {
        return box.state.leads.find((lead) => lead.id === args.where.id) ?? null;
      },
      async update(args: {
        where: { id: string };
        data: { notes: string; organizationId: string; workspaceId?: string };
      }) {
        const lead = box.state.leads.find((row) => row.id === args.where.id);
        if (!lead) throw new Error("missing lead");
        lead.notes = args.data.notes;
        lead.organizationId = args.data.organizationId;
        if (args.data.workspaceId !== undefined) {
          lead.workspaceId = args.data.workspaceId;
        }
      },
      async updateMany(args: {
        where: { id: string; firstRespondedAt: null; status: string };
        data: { firstRespondedAt: Date };
      }) {
        const lead = box.state.leads.find((row) => row.id === args.where.id);
        if (
          lead &&
          lead.firstRespondedAt === null &&
          lead.status === args.where.status
        ) {
          lead.firstRespondedAt = args.data.firstRespondedAt;
        }
      },
    },
    leadNote: {
      async create(args: { data: Omit<NoteRow, "id"> }) {
        const note = { ...args.data, id: `note-${box.state.seq++}` };
        box.state.notes.push(note);
        return { id: note.id };
      },
    },
    leadActivity: {
      async findFirst(args: {
        where: {
          leadId: string;
          type: string;
          meta: { equals: string };
        };
      }) {
        return (
          box.state.activities.find(
            (row) =>
              row.leadId === args.where.leadId &&
              row.type === args.where.type &&
              row.meta.clientRequestId === args.where.meta.equals,
          ) ?? null
        );
      },
      async create(args: { data: Omit<ActivityRow, "id"> }) {
        const activity = { ...args.data, id: `activity-${box.state.seq++}` };
        box.state.activities.push(activity);
        return { id: activity.id };
      },
    },
    agentTask: {
      async create(args: { data: Omit<TaskRow, "id" | "completedAt"> }) {
        const task: TaskRow = {
          ...args.data,
          id: `task-${box.state.seq++}`,
          completedAt: null,
        };
        box.state.tasks.push(task);
        return { id: task.id };
      },
      async updateMany(args: {
        where: { leadId: string; status: string; title: string };
        data: { status: string; completedAt: Date };
      }) {
        for (const task of box.state.tasks) {
          if (
            task.leadId === args.where.leadId &&
            task.status === args.where.status &&
            task.title === args.where.title
          ) {
            task.status = args.data.status;
            task.completedAt = args.data.completedAt;
          }
        }
      },
    },
    user: {
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        userWrites.push(args.data);
        if ("phone" in args.data || "phoneE164" in args.data) {
          throw new Error("phone columns must stay untouched");
        }
        if (failUnverify.current && args.data.phoneVerifiedAt === null) {
          throw new Error("unverify failed");
        }
        const user = box.state.users.find((row) => row.id === args.where.id);
        if (!user) throw new Error("missing user");
        Object.assign(user, args.data);
      },
    },
  };

  const db: CallOutcomeDb = {
    lead: tx.lead,
    async $transaction(fn) {
      const snapshot = structuredClone(box.state);
      try {
        return await fn(tx);
      } catch (error) {
        box.state = snapshot;
        throw error;
      }
    },
  };

  return { db, state: box.state, locks, userWrites, failUnverify, failLock, box };
}

type Harness = ReturnType<typeof createDb> & {
  box: { state: State };
};

function lead(input: Partial<LeadRow> & Pick<LeadRow, "id">): LeadRow {
  return {
    organizationId: "org-1",
    workspaceId: "ws-1",
    assignedAgentId: "agent-a",
    customerId: "cust-1",
    notes: null,
    status: "NEW",
    firstRespondedAt: null,
    ...input,
  };
}

function customer(): UserRow {
  return {
    id: "cust-1",
    phone: "(416) 555-0100",
    phoneE164: "+14165550100",
    phoneVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
    phoneUpdateRequestedAt: null,
  };
}

function openTask(input: Partial<TaskRow> & Pick<TaskRow, "id" | "title">): TaskRow {
  return {
    leadId: "lead-1",
    assigneeId: "agent-a",
    createdById: "system",
    type: "CALL",
    status: "OPEN",
    body: null,
    dueAt: null,
    completedAt: null,
    ...input,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/agent/leads/call-outcome", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function harness(seed?: Partial<State>) {
  const created = createDb(seed);
  return created as Harness;
}

async function save(
  store: Harness,
  body: Record<string, unknown>,
  actor = agent({ id: "agent-a", workspaceId: "ws-1" }),
) {
  return postAgentCallOutcome(request(body), {
    requireAgentContext: async () => actor,
    db: store.db,
    resolveOwnership: async (input) => ({
      organizationId: input.organizationId,
      workspaceId: input.leadWorkspaceId ?? undefined,
    }),
    now: () => now,
  });
}

function calls(store: Harness) {
  return store.box.state.activities.filter((row) => row.type === "CALL");
}

async function withWorkspaceRead<T>(fn: () => Promise<T>): Promise<T> {
  const previousRead = process.env.WORKSPACE_READ_SCOPE;
  const previousDomain = process.env.TENANT_DOMAIN_SCOPE;
  process.env.WORKSPACE_READ_SCOPE = "workspace";
  process.env.TENANT_DOMAIN_SCOPE = "workspace";
  try {
    return await fn();
  } finally {
    if (previousRead === undefined) delete process.env.WORKSPACE_READ_SCOPE;
    else process.env.WORKSPACE_READ_SCOPE = previousRead;
    if (previousDomain === undefined) delete process.env.TENANT_DOMAIN_SCOPE;
    else process.env.TENANT_DOMAIN_SCOPE = previousDomain;
  }
}

async function testOutcomesAndSideEffects() {
  const store = harness({
    leads: [
      lead({ id: "lead-1", notes: "Existing note" }),
      lead({ id: "lead-2", assignedAgentId: "agent-b" }),
      lead({ id: "lead-3", assignedAgentId: null }),
      lead({ id: "lead-4", status: "ATTEMPTED_CONTACT" }),
    ],
    users: [customer()],
    tasks: [
      openTask({ id: "signup-call", title: CALL_NEW_LEAD_TASK_TITLE, leadId: "lead-1" }),
      openTask({
        id: "attempted",
        title: ATTEMPTED_CONTACT_REMINDER_TITLE,
        leadId: "lead-1",
      }),
      openTask({ id: "other-call", title: "Price reduction check", leadId: "lead-1" }),
      openTask({
        id: "email-task",
        title: "Send listing email",
        leadId: "lead-1",
        type: "EMAIL",
      }),
    ],
  });

  const spoke = await save(store, {
    leadId: "lead-1",
    outcome: "SPOKE_TO_LEAD",
    note: "  Buyer wants a south-facing condo.  ",
    followUpDueAt: followUpDue,
    clientRequestId: "req-spoke-0001",
  });
  assert.equal(spoke.ok, true);
  if (!spoke.ok) return;
  const spokeBody = await callOutcomeHttpResponse(spoke.saved).json();
  assert.equal(spokeBody.replayed, false);
  assert.equal(spokeBody.outcome, "SPOKE_TO_LEAD");
  assert.equal(spoke.saved.notice, null);
  const call = calls(store)[0];
  assert.equal(call.type, "CALL");
  assert.equal(call.body, "Spoke to Lead");
  assert.equal(call.userId, "agent-a");
  assert.equal(call.meta.outcome, "SPOKE_TO_LEAD");
  assert.equal(call.meta.clientRequestId, "req-spoke-0001");
  assert.equal(store.box.state.notes.length, 1);
  assert.equal(store.box.state.notes[0].category, "CALL");
  assert.equal(store.box.state.notes[0].body, "Buyer wants a south-facing condo.");
  assert.equal(store.box.state.notes[0].authorId, "agent-a");
  assert.equal(call.meta.noteId, store.box.state.notes[0].id);
  assert.ok(store.box.state.leads[0].notes?.includes("Existing note"));
  assert.ok(store.box.state.leads[0].notes?.includes("[Call]"));
  assert.ok(store.box.state.leads[0].notes?.includes("south-facing condo"));
  const followUp = store.box.state.tasks.find((task) => task.id === spoke.saved.followUpTaskId);
  assert.ok(followUp);
  assert.equal(followUp.type, "CALL");
  assert.equal(followUp.status, "OPEN");
  assert.equal(followUp.title, CALL_OUTCOME_FOLLOW_UP_TITLE);
  assert.notEqual(followUp.title, CALL_NEW_LEAD_TASK_TITLE);
  assert.notEqual(followUp.title, ATTEMPTED_CONTACT_REMINDER_TITLE);
  assert.equal(followUp.assigneeId, "agent-a");
  assert.equal(followUp.createdById, "agent-a");
  assert.equal(followUp.dueAt?.toISOString(), followUpDue);
  assert.equal(
    store.box.state.tasks.find((task) => task.id === "signup-call")?.status,
    "DONE",
  );
  assert.equal(
    store.box.state.tasks.find((task) => task.id === "attempted")?.status,
    "OPEN",
  );
  assert.equal(
    store.box.state.tasks.find((task) => task.id === "other-call")?.status,
    "OPEN",
  );
  assert.equal(
    store.box.state.tasks.find((task) => task.id === "email-task")?.status,
    "OPEN",
  );
  assert.equal(store.box.state.leads[0].assignedAgentId, "agent-a");
  assert.equal(store.box.state.leads[0].status, "NEW");

  const voicemail = await save(
    store,
    {
      leadId: "lead-2",
      outcome: "LEFT_VOICEMAIL",
      followUpDueAt: followUpDue,
      clientRequestId: "req-voicemail-01",
    },
    agent({ id: "agent-a", workspaceId: "ws-1", canSeeTeamLeads: true }),
  );
  assert.equal(voicemail.ok, true);
  if (!voicemail.ok) return;
  const voiceCall = calls(store).find((row) => row.leadId === "lead-2");
  assert.equal(voiceCall?.body, "Left voicemail");
  assert.equal(voiceCall?.meta.noteId, null);
  assert.equal(
    store.box.state.tasks.find((task) => task.id === voicemail.saved.followUpTaskId)
      ?.assigneeId,
    "agent-b",
  );

  const pond = await save(store, {
    leadId: "lead-3",
    outcome: "LEFT_VOICEMAIL",
    note: "No answer, left a message.",
    clientRequestId: "req-pond-00001",
  });
  assert.equal(pond.ok, true);
  if (!pond.ok) return;
  assert.equal(
    store.box.state.tasks.find((task) => task.id === pond.saved.followUpTaskId),
    undefined,
  );
  assert.equal(store.box.state.notes.at(-1)?.category, "CALL");

  const responded = await save(store, {
    leadId: "lead-4",
    outcome: "SPOKE_TO_LEAD",
    clientRequestId: "req-respond-001",
  });
  assert.equal(responded.ok, true);
  assert.equal(
    store.box.state.leads.find((row) => row.id === "lead-4")?.firstRespondedAt?.toISOString(),
    now.toISOString(),
  );
  assert.equal(
    store.box.state.leads.find((row) => row.id === "lead-4")?.status,
    "ATTEMPTED_CONTACT",
  );
}

async function testNumberCorrections() {
  for (const outcome of ["INVALID_NUMBER", "WRONG_NUMBER"] as const) {
    const store = harness({
      leads: [lead({ id: "lead-1" })],
      users: [customer()],
      tasks: [
        openTask({ id: "signup-call", title: CALL_NEW_LEAD_TASK_TITLE }),
        openTask({ id: "attempted", title: ATTEMPTED_CONTACT_REMINDER_TITLE }),
      ],
    });
    const result = await save(store, {
      leadId: "lead-1",
      outcome,
      clientRequestId: `req-${outcome}-01`,
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    const call = calls(store)[0];
    assert.equal(call.type, "CALL");
    assert.equal(
      call.body,
      outcome === "INVALID_NUMBER" ? "Invalid phone number" : "Wrong phone number",
    );
    assert.equal(call.meta.outcome, outcome);
    assert.equal(store.box.state.notes.length, 0);
    assert.equal(
      store.box.state.tasks.some((task) => task.title === CALL_OUTCOME_FOLLOW_UP_TITLE),
      false,
    );
    const user = store.box.state.users[0];
    assert.equal(user.phone, "(416) 555-0100");
    assert.equal(user.phoneE164, "+14165550100");
    assert.equal(user.phoneVerifiedAt, null);
    assert.equal(user.phoneUpdateRequestedAt?.toISOString(), now.toISOString());
    for (const write of store.userWrites) {
      assert.equal("phone" in write, false);
      assert.equal("phoneE164" in write, false);
      for (const key of Object.keys(write)) {
        assert.ok(key === "phoneVerifiedAt" || key === "phoneUpdateRequestedAt", key);
      }
    }
    const requestActivity = store.box.state.activities.find(
      (row) => row.type === "contact_update_request",
    );
    assert.equal(requestActivity?.body, "Agent requested customer to provide the correct phone number");
    assert.equal((requestActivity?.meta as { channel: string }).channel, "phone");
    assert.equal(result.saved.notice?.channel, "phone");
    assert.equal(result.saved.notice?.customerId, "cust-1");
    assert.equal(
      store.box.state.tasks.find((task) => task.id === "signup-call")?.status,
      "DONE",
    );
    assert.equal(
      store.box.state.tasks.find((task) => task.id === "attempted")?.status,
      "OPEN",
    );
    const rejected = await save(store, {
      leadId: "lead-1",
      outcome,
      note: "This number is bad",
      clientRequestId: `req-${outcome}-note`,
    });
    assert.equal(rejected.ok, false);
    if (!rejected.ok) assert.equal(rejected.response.status, 400);
  }
}

async function testAuthorization() {
  const store = harness({
    leads: [
      lead({ id: "mine" }),
      lead({ id: "other-desk", workspaceId: "ws-2" }),
      lead({ id: "other-agent", assignedAgentId: "agent-b" }),
      lead({ id: "pond", assignedAgentId: null }),
    ],
    users: [customer()],
  });
  const denied = await postAgentCallOutcome(
    request({
      leadId: "mine",
      outcome: "SPOKE_TO_LEAD",
      clientRequestId: "req-denied-0001",
    }),
    {
      requireAgentContext: async () => null,
      db: store.db,
      now: () => now,
    },
  );
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.response.status, 401);
  assert.equal(store.box.state.activities.length, 0);

  await withWorkspaceRead(async () => {
    const outsider = await save(
      store,
      {
        leadId: "other-desk",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-cross-ws-01",
      },
      agent({ id: "agent-a", workspaceId: "ws-1", canSeeTeamLeads: true }),
    );
    assert.equal(outsider.ok, false);
    if (!outsider.ok) assert.equal(outsider.response.status, 404);

    const notMine = await save(
      store,
      {
        leadId: "other-agent",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-not-mine-01",
      },
      agent({ id: "agent-a", workspaceId: "ws-1" }),
    );
    assert.equal(notMine.ok, false);
    if (!notMine.ok) assert.equal(notMine.response.status, 404);

    const mine = await save(store, {
      leadId: "mine",
      outcome: "SPOKE_TO_LEAD",
      clientRequestId: "req-mine-000001",
    });
    assert.equal(mine.ok, true);

    const pond = await save(store, {
      leadId: "pond",
      outcome: "SPOKE_TO_LEAD",
      clientRequestId: "req-pond-access",
    });
    assert.equal(pond.ok, true);
  });
  assert.equal(calls(store).length, 2);
}

async function testIdempotencyAndNoticeFailure() {
  const store = harness({
    leads: [lead({ id: "lead-1" })],
    users: [customer()],
    tasks: [openTask({ id: "signup-call", title: CALL_NEW_LEAD_TASK_TITLE })],
  });
  const body = {
    leadId: "lead-1",
    outcome: "INVALID_NUMBER",
    clientRequestId: "req-retry-0001",
  };
  const first = await save(store, body);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  let notices = 0;
  deliverCallOutcomeNotice(first.saved, () => {
    notices += 1;
    throw new Error("email provider down");
  });
  assert.equal(notices, 1);
  assert.equal(store.box.state.users[0].phoneVerifiedAt, null);
  assert.equal(store.box.state.users[0].phoneE164, "+14165550100");

  const second = await save(store, body);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.saved.replayed, true);
  assert.equal(second.saved.activityId, first.saved.activityId);
  assert.equal(second.saved.notice, null);
  deliverCallOutcomeNotice(second.saved, () => {
    notices += 1;
  });
  assert.equal(notices, 1);
  assert.equal(calls(store).length, 1);
  assert.equal(
    store.box.state.activities.filter((row) => row.type === "contact_update_request").length,
    1,
  );
  assert.equal(store.box.state.notes.length, 0);
  assert.equal(
    store.box.state.tasks.filter((task) => task.title === CALL_OUTCOME_FOLLOW_UP_TITLE).length,
    0,
  );
  assert.equal(store.locks[0], "lead-1:req-retry-0001");

  const mobileReplay = await postAgentCallOutcome(request(body), {
    requireAgentContext: async () => agent({ id: "agent-a", workspaceId: "ws-1" }),
    canAccessLead: canAccessLeadForMobileCallOutcome,
    db: store.db,
    resolveOwnership: async (input) => ({
      organizationId: input.organizationId,
      workspaceId: input.leadWorkspaceId ?? undefined,
    }),
    now: () => now,
  });
  assert.equal(mobileReplay.ok, true);
  if (mobileReplay.ok) assert.equal(mobileReplay.saved.replayed, true);
  assert.equal(calls(store).length, 1);

  const mobileBody = { ...body, clientRequestId: "req-mobile-retry" };
  const mobileFirst = await postAgentCallOutcome(request(mobileBody), {
    requireAgentContext: async () => agent({ id: "agent-a", workspaceId: "ws-1" }),
    canAccessLead: canAccessLeadForMobileCallOutcome,
    db: store.db,
    resolveOwnership: async (input) => ({
      organizationId: input.organizationId,
      workspaceId: input.leadWorkspaceId ?? undefined,
    }),
    now: () => now,
  });
  assert.equal(mobileFirst.ok, true);
  const mobileSecond = await postAgentCallOutcome(request(mobileBody), {
    requireAgentContext: async () => agent({ id: "agent-a", workspaceId: "ws-1" }),
    canAccessLead: canAccessLeadForMobileCallOutcome,
    db: store.db,
    resolveOwnership: async (input) => ({
      organizationId: input.organizationId,
      workspaceId: input.leadWorkspaceId ?? undefined,
    }),
    now: () => now,
  });
  assert.equal(mobileSecond.ok, true);
  if (mobileSecond.ok) assert.equal(mobileSecond.saved.replayed, true);
  assert.equal(calls(store).length, 2);
}

async function testRollbackLeavesNoPartialCrm() {
  const store = harness({
    leads: [lead({ id: "lead-1" })],
    users: [customer()],
    tasks: [openTask({ id: "signup-call", title: CALL_NEW_LEAD_TASK_TITLE })],
  });
  store.failUnverify.current = true;
  await assert.rejects(() =>
    save(store, {
      leadId: "lead-1",
      outcome: "WRONG_NUMBER",
      clientRequestId: "req-rollback-01",
    }),
  );
  assert.equal(store.box.state.activities.length, 0);
  assert.equal(store.box.state.users[0].phoneVerifiedAt?.toISOString(), "2026-01-01T00:00:00.000Z");
  assert.equal(store.box.state.users[0].phoneUpdateRequestedAt, null);
  assert.equal(store.box.state.users[0].phone, "(416) 555-0100");
  assert.equal(
    store.box.state.tasks.find((task) => task.id === "signup-call")?.status,
    "OPEN",
  );
}

function restoreEnv(name: string, previous: string | undefined) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

async function withLegacyRead<T>(fn: () => Promise<T>): Promise<T> {
  const previousRead = process.env.WORKSPACE_READ_SCOPE;
  const previousDomain = process.env.TENANT_DOMAIN_SCOPE;
  delete process.env.WORKSPACE_READ_SCOPE;
  delete process.env.TENANT_DOMAIN_SCOPE;
  try {
    return await fn();
  } finally {
    restoreEnv("WORKSPACE_READ_SCOPE", previousRead);
    restoreEnv("TENANT_DOMAIN_SCOPE", previousDomain);
  }
}

function testMobileBearerIsVerified() {
  const minted = createWorkspaceAccessToken({
    userId: "agent-a",
    email: "agent-a@houzzat.test",
    workspaceId: "ws-1",
    role: "AGENT",
  });
  const verified = authenticateMobileRequest(
    new Request("https://app.houzzatpro.com/api/agent/leads/call-outcome", {
      headers: { authorization: `Bearer ${minted.token}` },
    }),
    "mobile_workspace_access",
  );
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.sub, "agent-a");
    assert.equal(verified.payload.wsId, "ws-1");
    assert.equal(verified.payload.type, "mobile_workspace_access");
  }

  const tampered = `${minted.token.slice(0, -4)}xxxx`;
  assert.equal(
    authenticateMobileRequest(
      new Request("https://app.houzzatpro.com/api/agent/leads/call-outcome", {
        headers: { authorization: `Bearer ${tampered}` },
      }),
      "mobile_workspace_access",
    ).ok,
    false,
  );

  const expired = signMobileToken({
    sub: "agent-a",
    email: "agent-a@houzzat.test",
    wsId: "ws-1",
    role: "OWNER",
    type: "mobile_workspace_access",
    jti: "expired-call-outcome",
    iat: 1,
    exp: 2,
  });
  assert.equal(
    authenticateMobileRequest(
      new Request("https://app.houzzatpro.com/api/agent/leads/call-outcome", {
        headers: { authorization: `Bearer ${expired}` },
      }),
      "mobile_workspace_access",
    ).ok,
    false,
  );

  const platform = createPlatformAccessToken({
    id: "agent-a",
    email: "agent-a@houzzat.test",
  });
  assert.equal(
    authenticateMobileRequest(
      new Request("https://app.houzzatpro.com/api/agent/leads/call-outcome", {
        headers: { authorization: `Bearer ${platform.token}` },
      }),
      "mobile_workspace_access",
    ).ok,
    false,
  );

  for (const header of [undefined, "Bearer", "Bearer ", "bearer secret", "Basic abc", "Bearer not-a-jwt"]) {
    const result = authenticateMobileRequest(
      new Request("https://app.houzzatpro.com/api/agent/leads/call-outcome", {
        headers: header ? { authorization: header } : undefined,
      }),
      "mobile_workspace_access",
    );
    assert.equal(result.ok, false, header ?? "missing");
  }
}

async function testMobileTokenLeadIsolation() {
  const owner = agent({ id: "agent-a", workspaceId: "ws-1", canSeeTeamLeads: true });
  const desk = agent({ id: "agent-a", workspaceId: "ws-1" });
  const mine = {
    organizationId: "org-1",
    workspaceId: "ws-1",
    assignedAgentId: "agent-a",
  };
  const peer = {
    organizationId: "org-1",
    workspaceId: "ws-1",
    assignedAgentId: "agent-b",
  };
  const pond = {
    organizationId: "org-1",
    workspaceId: "ws-1",
    assignedAgentId: null,
  };
  const otherDesk = {
    organizationId: "org-1",
    workspaceId: "ws-2",
    assignedAgentId: "agent-b",
  };

  await withLegacyRead(async () => {
    assert.equal(canAccessLead(owner, otherDesk), true);
    assert.equal(canAccessLeadForMobileCallOutcome(owner, otherDesk), false);
    assert.equal(canAccessLeadForMobileCallOutcome(owner, mine), true);
    assert.equal(canAccessLeadForMobileCallOutcome(owner, peer), true);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, mine), true);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, pond), true);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, peer), false);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, otherDesk), false);
  });

  await withWorkspaceRead(async () => {
    assert.equal(canAccessLead(owner, otherDesk), false);
    assert.equal(canAccessLeadForMobileCallOutcome(owner, otherDesk), false);
    assert.equal(canAccessLeadForMobileCallOutcome(owner, peer), true);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, peer), false);
    assert.equal(canAccessLeadForMobileCallOutcome(desk, pond), true);
  });

  const store = harness({
    leads: [
      lead({ id: "mine" }),
      lead({ id: "other-desk", workspaceId: "ws-2", assignedAgentId: "agent-b" }),
      lead({ id: "other-agent", assignedAgentId: "agent-b" }),
      lead({ id: "pond", assignedAgentId: null }),
    ],
    users: [customer()],
  });
  const deps = {
    db: store.db,
    resolveOwnership: async (input: { organizationId: string; leadWorkspaceId: string | null }) => ({
      organizationId: input.organizationId,
      workspaceId: input.leadWorkspaceId ?? undefined,
    }),
    now: () => now,
    canAccessLead: canAccessLeadForMobileCallOutcome,
  };
  await withLegacyRead(async () => {
    const cross = await postAgentCallOutcome(
      request({
        leadId: "other-desk",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-token-cross-01",
      }),
      { ...deps, requireAgentContext: async () => owner },
    );
    assert.equal(cross.ok, false);
    if (!cross.ok) assert.equal(cross.response.status, 404);

    const peerLead = await postAgentCallOutcome(
      request({
        leadId: "other-agent",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-token-peer-01",
      }),
      { ...deps, requireAgentContext: async () => desk },
    );
    assert.equal(peerLead.ok, false);
    if (!peerLead.ok) assert.equal(peerLead.response.status, 404);

    const own = await postAgentCallOutcome(
      request({
        leadId: "mine",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-token-mine-01",
      }),
      { ...deps, requireAgentContext: async () => desk },
    );
    assert.equal(own.ok, true);

    const unassigned = await postAgentCallOutcome(
      request({
        leadId: "pond",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-token-pond-01",
      }),
      { ...deps, requireAgentContext: async () => desk },
    );
    assert.equal(unassigned.ok, true);

    const team = await postAgentCallOutcome(
      request({
        leadId: "other-agent",
        outcome: "SPOKE_TO_LEAD",
        clientRequestId: "req-token-team-01",
      }),
      { ...deps, requireAgentContext: async () => owner },
    );
    assert.equal(team.ok, true);
  });
  assert.equal(calls(store).length, 3);
}

async function testRejectedClientAuthority() {
  const store = harness({
    leads: [lead({ id: "lead-1" })],
    users: [customer()],
  });
  for (const extra of [
    { workspaceId: "ws-2" },
    { assigneeId: "agent-z" },
    { customerId: "someone-else" },
    { phoneVerifiedAt: null },
  ]) {
    const result = await save(store, {
      leadId: "lead-1",
      outcome: "SPOKE_TO_LEAD",
      clientRequestId: "req-extra-0001",
      ...extra,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.response.status, 400);
  }
  const missing = await save(store, {
    leadId: "lead-1",
    outcome: "SPOKE_TO_LEAD",
  });
  assert.equal(missing.ok, false);
  assert.equal(store.box.state.activities.length, 0);
}

function testPresentationAndFollowUp() {
  const spoke = presentCallLeadActivity({
    type: "CALL",
    body: "Spoke to Lead",
    meta: { outcome: "SPOKE_TO_LEAD", noteId: "note-1" },
  });
  assert.equal(spoke?.title, "Spoke to Lead");
  assert.equal(spoke?.body, null);
  const extra = presentCallLeadActivity({
    type: "CALL",
    body: "Asked about parking",
    meta: { outcome: "LEFT_VOICEMAIL", noteId: null },
  });
  assert.equal(extra?.title, "Left voicemail");
  assert.equal(extra?.body, "Asked about parking");
  assert.equal(
    presentCallLeadActivity({
      type: "CALL",
      body: "Invalid phone number",
      meta: { outcome: "INVALID_NUMBER" },
    })?.title,
    "Invalid phone number",
  );
  assert.equal(
    presentCallLeadActivity({
      type: "CALL",
      body: "Wrong phone number",
      meta: { outcome: "WRONG_NUMBER" },
    })?.title,
    "Wrong phone number",
  );
  assert.equal(
    presentCallLeadActivity({
      type: "note",
      body: "Spoke to Lead",
      meta: { outcome: "SPOKE_TO_LEAD" },
    }),
    null,
  );

  const winterMorning = new Date("2026-01-15T15:00:00.000Z");
  assert.equal(
    resolveFollowUpInstant("later_today", winterMorning)?.toISOString(),
    "2026-01-15T22:00:00.000Z",
  );
  assert.equal(
    resolveFollowUpInstant("tomorrow", winterMorning)?.toISOString(),
    "2026-01-16T15:00:00.000Z",
  );
  assert.equal(
    resolveFollowUpInstant("in_2_days", winterMorning)?.toISOString(),
    "2026-01-17T15:00:00.000Z",
  );
  assert.equal(resolveFollowUpInstant("none", winterMorning), null);
  assert.equal(
    resolveFollowUpInstant("custom", winterMorning, "2026-09-29T15:30")?.toISOString(),
    "2026-09-29T19:30:00.000Z",
  );

  const request = buildCallOutcomeRequest({
    leadId: "lead-1",
    outcome: "INVALID_NUMBER",
    note: "do not send",
    followUpDueAt: winterMorning,
    clientRequestId: "req-ui-00001",
  });
  assert.equal(request.note, undefined);
  assert.equal(request.followUpDueAt, undefined);
  assert.equal(request.clientRequestId, "req-ui-00001");
  const spokeRequest = buildCallOutcomeRequest({
    leadId: "lead-1",
    outcome: "SPOKE_TO_LEAD",
    note: "  Parking  ",
    followUpDueAt: winterMorning,
    clientRequestId: "req-ui-00001",
  });
  assert.equal(spokeRequest.note, "Parking");
  assert.equal(spokeRequest.followUpDueAt, winterMorning.toISOString());
  assert.equal(spokeRequest.clientRequestId, "req-ui-00001");
}

function testCallControlDoesNotHijackPhoneLinks() {
  for (const rel of [
    "src/components/agent/CustomerProfile.tsx",
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(src.includes("newCallOutcomeRequestId") || src.includes("onCall"));
    assert.ok(src.includes("href={telHref}"));
    assert.equal(src.includes("CallOutcomeDialog") || src.includes("onCall"), true);
  }
  const mobile = readFileSync(
    join(root, "apps/pro-mobile/src/screens/LeadDetailScreen.tsx"),
    "utf8",
  );
  const handleCall = mobile.slice(
    mobile.indexOf("const handleCall"),
    mobile.indexOf("const handleSms"),
  );
  assert.ok(handleCall.includes("Linking.openURL"));
  assert.equal(handleCall.includes("call-outcome"), false);
  assert.equal(handleCall.includes("fetch("), false);
  assert.ok(mobile.includes("CallOutcomeSheet"));
  assert.equal(mobile.toLowerCase().includes("twilio"), false);
}

function testBoundariesDidNotMove() {
  const files = [
    "src/lib/agent/call-outcome.ts",
    "src/app/api/agent/leads/call-outcome/route.ts",
    "src/lib/agent/contact-update-request.ts",
  ];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.equal(src.toLowerCase().includes("twilio"), false, rel);
    assert.equal(src.includes("sendSms"), false, rel);
    assert.equal(src.includes("conversation"), false, rel);
    assert.equal(src.includes("calls.create"), false, rel);
  }
  const route = readFileSync(
    join(root, "src/app/api/agent/leads/call-outcome/route.ts"),
    "utf8",
  );
  assert.ok(route.includes("requireAgentContextFromRequest"));
  assert.ok(route.includes("const mobile = web ? null : await requireMobileCallOutcomeContext"));
  assert.ok(route.includes("canAccessLeadForMobileCallOutcome"));
  assert.equal(route.includes("x-workspace-id"), false);
  assert.ok(route.includes("scheduleCustomerContactRequestNotice"));
  assert.equal(route.includes("fetch("), false);
  const mobileContext = readFileSync(
    join(root, "src/lib/agent/call-outcome-mobile-context.ts"),
    "utf8",
  );
  assert.ok(mobileContext.includes("authenticateMobileRequest"));
  assert.ok(mobileContext.includes("verifyMobileToken") || mobileContext.includes("authenticateMobileRequest"));
  assert.ok(mobileContext.includes("disabledAt: null"));
  assert.ok(mobileContext.includes("membership.role"));
  assert.equal(mobileContext.includes("payload.role"), false);
  assert.ok(mobileContext.includes("lead.workspaceId !== ctx.workspaceId"));
  const readScope = readFileSync(join(root, "src/lib/crm-read-scope.ts"), "utf8");
  assert.ok(readScope.includes("if (ctx.isPlatformAdmin || ctx.canSeeTeamLeads) return true"));

  for (const rel of [
    "src/components/agent/CustomerProfile.tsx",
    "src/components/agent/lead-profile-v2/LeadProfileV2Rail.tsx",
  ]) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.ok(src.includes("contactTelHref"), rel);
    assert.equal(src.toLowerCase().includes("twilio"), false, rel);
  }
  const mobile = readFileSync(
    join(root, "apps/pro-mobile/src/screens/LeadDetailScreen.tsx"),
    "utf8",
  );
  const handleCall = mobile.slice(
    mobile.indexOf("const handleCall"),
    mobile.indexOf("const handleSms"),
  );
  assert.ok(handleCall.includes("Linking.openURL"));
  assert.equal(handleCall.includes("fetch("), false);
  assert.ok(mobile.includes("contactTelHref"));
  assert.ok(mobile.includes("CallOutcomeSheet"));
  assert.equal(mobile.toLowerCase().includes("twilio"), false);
  const mobileClient = readFileSync(
    join(root, "apps/pro-mobile/src/lib/call-outcome-client.ts"),
    "utf8",
  );
  assert.ok(mobileClient.includes("/api/agent/leads/call-outcome"));
  assert.equal(mobileClient.toLowerCase().includes("twilio"), false);
  assert.equal(mobileClient.includes("sendSms"), false);
  assert.equal(mobileClient.includes("workspaceId"), false);
  const dialog = readFileSync(
    join(root, "src/components/agent/CallOutcomeDialog.tsx"),
    "utf8",
  );
  assert.equal(dialog.toLowerCase().includes("twilio"), false);
  assert.equal(dialog.includes("sendSms"), false);

  const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
  assert.equal(schema.includes("clientRequestId"), false);
  for (const entry of readdirSync(join(root, "prisma/migrations"))) {
    assert.equal(entry.toLowerCase().includes("call_outcome"), false);
    assert.equal(entry.toLowerCase().includes("call-outcome"), false);
  }
  assert.equal(CALL_OUTCOME_FOLLOW_UP_TITLE, "Call follow-up");
}

async function main() {
  await testOutcomesAndSideEffects();
  await testNumberCorrections();
  await testAuthorization();
  testMobileBearerIsVerified();
  await testMobileTokenLeadIsolation();
  await testIdempotencyAndNoticeFailure();
  await testRollbackLeavesNoPartialCrm();
  await testRejectedClientAuthority();
  testPresentationAndFollowUp();
  testCallControlDoesNotHijackPhoneLinks();
  testBoundariesDidNotMove();
  console.log("call-outcome-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
