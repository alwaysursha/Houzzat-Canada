/**
 * Chat V1 Milestone 4R — agent unread-reminder eligibility + claim (no DB).
 * Run: pnpm agent-unread-reminder:selftest
 *
 * Code-level tests with an in-memory Db. Does not prove Postgres FOR UPDATE /
 * advisory-lock behavior under a real database (integration risk noted in report).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_UNREAD_REMINDER_DELAY_MS,
  claimAgentUnreadReminder,
  evaluateAgentUnreadReminderEligibility,
  isAgentUnreadReminderStreakClaimed,
  isLikelyAgentUnreadReminderCandidate,
  resolveAgentCustomerUnreadStreak,
  type AgentUnreadReminderConversationRow,
  type AgentUnreadReminderDb,
  type AgentUnreadReminderLeadRow,
  type AgentUnreadReminderTx,
} from "../src/lib/conversations/agent-unread-reminder";
import {
  resolveAgentCutoff,
  type ConversationReadMessage,
} from "../src/lib/conversations/read-state";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const NOW = new Date("2026-10-10T12:00:00.000Z");
const WS = "ws_a";
const WS_OTHER = "ws_b";
const LEAD = "lead_1";
const CONV = "conv_1";
const AGENT_A = "agent_a";
const AGENT_B = "agent_b";

function minutesAgo(mins: number, base: Date = NOW): Date {
  return new Date(base.getTime() - mins * 60_000);
}

function msg(input: {
  id: string;
  createdAt: Date;
  senderKind: ConversationReadMessage["senderKind"];
  senderUserId?: string | null;
  deletedAt?: Date | null;
  kind?: ConversationReadMessage["kind"];
  payload?: ConversationReadMessage["payload"];
}): ConversationReadMessage {
  return {
    id: input.id,
    createdAt: input.createdAt,
    senderKind: input.senderKind,
    senderUserId: input.senderUserId ?? null,
    deletedAt: input.deletedAt ?? null,
    kind: input.kind ?? "TEXT",
    payload: input.payload ?? null,
    providerStatus: null,
    deliveredAt: null,
    twilioMessageSid: null,
    channel: "CHAT",
  };
}

type Store = {
  conversation: AgentUnreadReminderConversationRow;
  lead: AgentUnreadReminderLeadRow;
  messages: ConversationReadMessage[];
  activities: Array<{ id: string; leadId: string; type: string; createdAt: Date }>;
  users: Map<
    string,
    { id: string; disabledAt: Date | null; pushNotificationPrefs: unknown }
  >;
  workspace: { id: string; status: string };
  members: Array<{ id: string; workspaceId: string; userId: string; status: string }>;
};

function baseConversation(
  overrides: Partial<AgentUnreadReminderConversationRow> = {},
): AgentUnreadReminderConversationRow {
  return {
    id: CONV,
    workspaceId: WS,
    leadId: LEAD,
    status: "OPEN",
    agentLastReadAt: null,
    agentLastReadByUserId: null,
    agentUnreadReminderMessageId: null,
    agentUnreadReminderAgentId: null,
    agentUnreadRemindedAt: null,
    lastMessageAt: minutesAgo(20),
    createdAt: minutesAgo(60),
    ...overrides,
  };
}

function baseStore(overrides: Partial<Store> = {}): Store {
  return {
    conversation: baseConversation(),
    lead: { id: LEAD, workspaceId: WS, assignedAgentId: AGENT_A },
    messages: [
      msg({
        id: "m_cust_1",
        createdAt: minutesAgo(20),
        senderKind: "CUSTOMER",
      }),
    ],
    activities: [],
    users: new Map([
      [
        AGENT_A,
        { id: AGENT_A, disabledAt: null, pushNotificationPrefs: {} },
      ],
      [
        AGENT_B,
        { id: AGENT_B, disabledAt: null, pushNotificationPrefs: {} },
      ],
    ]),
    workspace: { id: WS, status: "ACTIVE" },
    members: [
      { id: "mem_a", workspaceId: WS, userId: AGENT_A, status: "ACTIVE" },
      { id: "mem_b", workspaceId: WS, userId: AGENT_B, status: "ACTIVE" },
    ],
    ...overrides,
  };
}

function createMemoryDb(store: Store): AgentUnreadReminderDb {
  const lockQueues = new Map<string, Promise<unknown>>();

  async function withLockKey<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = lockQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockQueues.set(
      key,
      prev.then(() => gate).catch(() => gate),
    );
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
    }
  }

  function buildTx(): AgentUnreadReminderTx {
    let heldLockKey: string | null = null;

    return {
      conversation: {
        findUnique: async (args) => {
          const where = args.where as {
            workspaceId_id?: { workspaceId: string; id: string };
          };
          const key = where.workspaceId_id;
          if (
            !key ||
            key.workspaceId !== store.conversation.workspaceId ||
            key.id !== store.conversation.id
          ) {
            return null;
          }
          return { ...store.conversation };
        },
      },
      lead: {
        findUnique: async (args) => {
          const where = args.where as {
            workspaceId_id?: { workspaceId: string; id: string };
          };
          const key = where.workspaceId_id;
          if (
            !key ||
            key.workspaceId !== store.lead.workspaceId ||
            key.id !== store.lead.id
          ) {
            return null;
          }
          return { ...store.lead };
        },
      },
      message: {
        findMany: async (args) => {
          const where = args.where as {
            workspaceId: string;
            conversationId: string;
          };
          if (
            where.workspaceId !== store.conversation.workspaceId ||
            where.conversationId !== store.conversation.id
          ) {
            return [];
          }
          return [...store.messages].sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
          );
        },
        findFirst: async () => store.messages[0] ?? null,
      },
      leadActivity: {
        findFirst: async (args) => {
          const where = args.where as {
            leadId: string;
            type: { in: string[] };
          };
          const matched = store.activities
            .filter(
              (row) =>
                row.leadId === where.leadId &&
                where.type.in.includes(row.type),
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
          const row = matched[0];
          return row ? { id: row.id, createdAt: row.createdAt } : null;
        },
      },
      user: {
        findUnique: async (args) => {
          const where = args.where as { id: string };
          return store.users.get(where.id) ?? null;
        },
      },
      workspace: {
        findUnique: async (args) => {
          const where = args.where as { id: string };
          if (where.id !== store.workspace.id) return null;
          return { ...store.workspace };
        },
      },
      workspaceMember: {
        findFirst: async (args) => {
          const where = args.where as {
            workspaceId: string;
            userId: string;
            status: string;
          };
          const row = store.members.find(
            (member) =>
              member.workspaceId === where.workspaceId &&
              member.userId === where.userId &&
              member.status === where.status,
          );
          return row ? { id: row.id } : null;
        },
      },
      $executeRaw: async (strings, ...values) => {
        const sql = strings.join("?");
        if (sql.includes("pg_advisory_xact_lock")) {
          heldLockKey = String(values[0]);
          return undefined;
        }
        return undefined;
      },
      $queryRaw: async (strings, ...values) => {
        const sql = strings.join("?");
        if (sql.includes("FOR UPDATE OF c, l")) {
          const workspaceId = String(values[0]);
          const conversationId = String(values[1]);
          if (
            store.conversation.workspaceId !== workspaceId ||
            store.conversation.id !== conversationId
          ) {
            return [];
          }
          if (store.lead.workspaceId !== workspaceId) return [];
          if (store.lead.id !== store.conversation.leadId) return [];
          return [
            {
              ...store.conversation,
              assignedAgentId: store.lead.assignedAgentId,
            },
          ];
        }
        if (sql.includes('UPDATE "Conversation"')) {
          const streakMessageId = String(values[0]);
          const assignedAgentId = String(values[1]);
          const remindedAt = values[2] as Date;
          const workspaceId = String(values[3]);
          const conversationId = String(values[4]);
          const leadId = String(values[5]);
          const expectedAssigned = String(values[6]);
          const expectedReadAt = values[7] as Date | null;
          const expectedReadBy = values[8] as string | null;

          const c = store.conversation;
          const l = store.lead;
          const readAtOk =
            (c.agentLastReadAt?.getTime() ?? null) ===
            (expectedReadAt?.getTime() ?? null);
          const readByOk = c.agentLastReadByUserId === expectedReadBy;
          const already =
            c.agentUnreadReminderMessageId === streakMessageId &&
            c.agentUnreadReminderAgentId === assignedAgentId;
          if (
            c.workspaceId !== workspaceId ||
            c.id !== conversationId ||
            c.status !== "OPEN" ||
            l.workspaceId !== workspaceId ||
            l.id !== c.leadId ||
            l.id !== leadId ||
            l.assignedAgentId !== expectedAssigned ||
            l.assignedAgentId !== assignedAgentId ||
            !readAtOk ||
            !readByOk ||
            already
          ) {
            return [];
          }
          c.agentUnreadReminderMessageId = streakMessageId;
          c.agentUnreadReminderAgentId = assignedAgentId;
          c.agentUnreadRemindedAt = remindedAt;
          return [{ id: c.id }];
        }
        return [];
      },
    };
  }

  return {
    ...buildTx(),
    $transaction: async (fn) => {
      // Serialize claims for the same conversation key (simulates xact advisory lock).
      const key = `agent-unread-reminder:${store.conversation.workspaceId}:${store.conversation.id}`;
      return withLockKey(key, async () => fn(buildTx()));
    },
  };
}

function testPureStreakAndAge() {
  const cutoff = resolveAgentCutoff(
    {
      id: CONV,
      workspaceId: WS,
      leadId: LEAD,
      status: "OPEN",
      createdAt: minutesAgo(60),
      updatedAt: minutesAgo(60),
      lastMessageAt: minutesAgo(5),
      customerLastReadAt: null,
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    },
    AGENT_A,
    [],
    null,
  );
  assert.equal(cutoff.mode, "matching");

  const first = msg({
    id: "m1",
    createdAt: minutesAgo(20),
    senderKind: "CUSTOMER",
  });
  const second = msg({
    id: "m2",
    createdAt: minutesAgo(5),
    senderKind: "CUSTOMER",
  });
  const streak = resolveAgentCustomerUnreadStreak(
    [first, second],
    AGENT_A,
    cutoff,
  );
  assert.ok(streak);
  assert.equal(streak!.streakMessageId, "m1");
  assert.equal(streak!.unreadCustomerCount, 2);

  assert.equal(
    isAgentUnreadReminderStreakClaimed(
      {
        agentUnreadReminderMessageId: "m1",
        agentUnreadReminderAgentId: AGENT_A,
      },
      { streakMessageId: "m1", assignedAgentId: AGENT_A },
    ),
    true,
  );
  assert.equal(
    isLikelyAgentUnreadReminderCandidate(
      {
        status: "OPEN",
        lastMessageAt: minutesAgo(20),
        agentUnreadReminderMessageId: null,
        agentUnreadReminderAgentId: null,
      },
      NOW,
    ),
    true,
  );
  assert.equal(
    isLikelyAgentUnreadReminderCandidate(
      {
        status: "OPEN",
        lastMessageAt: minutesAgo(5),
        agentUnreadReminderMessageId: null,
        agentUnreadReminderAgentId: null,
      },
      NOW,
    ),
    false,
  );
  assert.ok(AGENT_UNREAD_REMINDER_DELAY_MS === 15 * 60 * 1000);
}

function testEvaluateCases() {
  const eligibleMessages = [
    msg({
      id: "m_cust_1",
      createdAt: minutesAgo(20),
      senderKind: "CUSTOMER",
    }),
  ];
  const base = {
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
    lead: { id: LEAD, workspaceId: WS, assignedAgentId: AGENT_A },
    trustedWorkspaceId: WS,
    workspaceStatus: "ACTIVE",
    agentDisabledAt: null as Date | null,
    agentIsActiveMember: true,
    pushNotificationPrefs: {} as unknown,
    messages: eligibleMessages,
    latestAssignmentActivity: null,
    now: NOW,
  };

  assert.equal(evaluateAgentUnreadReminderEligibility(base).ok, true);

  assert.equal(
    evaluateAgentUnreadReminderEligibility({
      ...base,
      messages: [],
    }).ok,
    false,
  );
  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        messages: [],
      }) as { reason: string }
    ).reason,
    "NO_UNREAD_CUSTOMER",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        messages: [
          msg({
            id: "m_recent",
            createdAt: minutesAgo(5),
            senderKind: "CUSTOMER",
          }),
        ],
        conversation: {
          ...base.conversation,
          lastMessageAt: minutesAgo(5),
        },
      }) as { reason: string }
    ).reason,
    "TOO_RECENT",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        conversation: {
          ...base.conversation,
          agentUnreadReminderMessageId: "m_cust_1",
          agentUnreadReminderAgentId: AGENT_A,
        },
      }) as { reason: string }
    ).reason,
    "ALREADY_CLAIMED",
  );

  // Additional messages in same streak: still claimed for m_cust_1
  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        conversation: {
          ...base.conversation,
          agentUnreadReminderMessageId: "m_cust_1",
          agentUnreadReminderAgentId: AGENT_A,
          lastMessageAt: minutesAgo(2),
        },
        messages: [
          ...eligibleMessages,
          msg({
            id: "m_cust_2",
            createdAt: minutesAgo(2),
            senderKind: "CUSTOMER",
          }),
        ],
      }) as { reason: string }
    ).reason,
    "ALREADY_CLAIMED",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        lead: { ...base.lead, assignedAgentId: null },
      }) as { reason: string }
    ).reason,
    "UNASSIGNED",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        agentDisabledAt: NOW,
      }) as { reason: string }
    ).reason,
    "AGENT_INELIGIBLE",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        agentIsActiveMember: false,
      }) as { reason: string }
    ).reason,
    "AGENT_INELIGIBLE",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        pushNotificationPrefs: { chat_message: false },
      }) as { reason: string }
    ).reason,
    "PREFERENCE_OFF",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        conversation: { ...base.conversation, status: "BLOCKED" },
      }) as { reason: string }
    ).reason,
    "CONVERSATION_BLOCKED",
  );

  assert.equal(
    (
      evaluateAgentUnreadReminderEligibility({
        ...base,
        trustedWorkspaceId: WS_OTHER,
      }) as { reason: string }
    ).reason,
    "WORKSPACE_MISMATCH",
  );

  // Mark-read then new streak: old claim does not block new divider
  const afterRead = evaluateAgentUnreadReminderEligibility({
    ...base,
    conversation: {
      ...base.conversation,
      // Read watermark after m_old, before m_new_streak.
      agentLastReadAt: minutesAgo(25),
      agentLastReadByUserId: AGENT_A,
      agentUnreadReminderMessageId: "m_old",
      agentUnreadReminderAgentId: AGENT_A,
      lastMessageAt: minutesAgo(20),
    },
    messages: [
      msg({
        id: "m_old",
        createdAt: minutesAgo(30),
        senderKind: "CUSTOMER",
      }),
      msg({
        id: "m_new_streak",
        createdAt: minutesAgo(20),
        senderKind: "CUSTOMER",
      }),
    ],
  });
  assert.equal(afterRead.ok, true);
  if (afterRead.ok) {
    assert.equal(afterRead.streak.streakMessageId, "m_new_streak");
  }

  // Reassignment: prior agent claim does not satisfy new assignee streak pair
  const reassigned = evaluateAgentUnreadReminderEligibility({
    ...base,
    lead: { ...base.lead, assignedAgentId: AGENT_B },
    conversation: {
      ...base.conversation,
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
      agentUnreadReminderMessageId: "m_cust_1",
      agentUnreadReminderAgentId: AGENT_A,
    },
    messages: [
      msg({
        id: "card",
        createdAt: minutesAgo(25),
        senderKind: "SYSTEM",
        kind: "SYSTEM_CARD",
        payload: { card: "REASSIGNED" },
      }),
      msg({
        id: "m_cust_1",
        createdAt: minutesAgo(20),
        senderKind: "CUSTOMER",
      }),
    ],
  });
  assert.equal(reassigned.ok, true);
  if (reassigned.ok) {
    assert.equal(reassigned.streak.assignedAgentId, AGENT_B);
    assert.equal(reassigned.streak.streakMessageId, "m_cust_1");
  }
}

async function testClaimHappyPathAndConcurrent() {
  const store = baseStore({
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
  });
  const db = createMemoryDb(store);

  const first = await claimAgentUnreadReminder(db, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.claim.streakMessageId, "m_cust_1");
    assert.equal(first.claim.assignedAgentId, AGENT_A);
  }
  assert.equal(store.conversation.agentUnreadReminderMessageId, "m_cust_1");
  assert.equal(store.conversation.agentUnreadReminderAgentId, AGENT_A);

  const second = await claimAgentUnreadReminder(db, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "ALREADY_CLAIMED");

  // Concurrent claims: only one wins
  const store2 = baseStore({
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
  });
  const db2 = createMemoryDb(store2);
  const [a, b] = await Promise.all([
    claimAgentUnreadReminder(db2, {
      workspaceId: WS,
      conversationId: CONV,
      now: NOW,
    }),
    claimAgentUnreadReminder(db2, {
      workspaceId: WS,
      conversationId: CONV,
      now: NOW,
    }),
  ]);
  const wins = [a, b].filter((row) => row.ok);
  const losses = [a, b].filter((row) => !row.ok);
  assert.equal(wins.length, 1);
  assert.equal(losses.length, 1);
  if (!losses[0]!.ok) {
    assert.ok(
      losses[0]!.reason === "ALREADY_CLAIMED" ||
        losses[0]!.reason === "CLAIM_LOST",
    );
  }
}

async function testClaimRaceAssignmentAndCursor() {
  const store = baseStore({
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
  });
  const db = createMemoryDb(store);

  // Mid-claim reassignment: mutate after lock select by wrapping transaction
  const originalTx = db.$transaction.bind(db);
  db.$transaction = async (fn) =>
    originalTx(async (tx) => {
      const result = await fn({
        ...tx,
        $queryRaw: async (strings, ...values) => {
          const sql = strings.join("?");
          const out = await tx.$queryRaw(strings, ...values);
          if (sql.includes("FOR UPDATE OF c, l")) {
            // After lock read, reassignment lands before eligibility write.
            store.lead.assignedAgentId = AGENT_B;
          }
          return out;
        },
      });
      return result;
    });

  const raced = await claimAgentUnreadReminder(db, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  // Eligibility under lock may still see AGENT_A from locked row snapshot;
  // the UPDATE join requires current Lead.assignedAgentId match → CLAIM_LOST
  // or ASSIGNMENT_CHANGED.
  assert.equal(raced.ok, false);
  if (!raced.ok) {
    assert.ok(
      raced.reason === "CLAIM_LOST" ||
        raced.reason === "ASSIGNMENT_CHANGED" ||
        raced.reason === "AGENT_INELIGIBLE",
    );
  }
  // Must not have claimed for the old agent after reassignment write path
  assert.notEqual(
    store.conversation.agentUnreadReminderAgentId === AGENT_A &&
      store.conversation.agentUnreadReminderMessageId === "m_cust_1",
    true,
  );

  // Cursor change during claim
  const storeCursor = baseStore({
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
  });
  const dbCursor = createMemoryDb(storeCursor);
  const origCursorTx = dbCursor.$transaction.bind(dbCursor);
  dbCursor.$transaction = async (fn) =>
    origCursorTx(async (tx) =>
      fn({
        ...tx,
        $queryRaw: async (strings, ...values) => {
          const sql = strings.join("?");
          const out = await tx.$queryRaw(strings, ...values);
          if (sql.includes("FOR UPDATE OF c, l")) {
            storeCursor.conversation.agentLastReadAt = NOW;
            storeCursor.conversation.agentLastReadByUserId = AGENT_A;
          }
          return out;
        },
      }),
    );

  const cursorRace = await claimAgentUnreadReminder(dbCursor, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(cursorRace.ok, false);
  if (!cursorRace.ok) {
    assert.ok(
      cursorRace.reason === "CURSOR_CHANGED" ||
        cursorRace.reason === "CLAIM_LOST" ||
        cursorRace.reason === "NO_UNREAD_CUSTOMER",
    );
  }
}

async function testClaimWorkspaceIsolationAndOptOut() {
  const store = baseStore({
    conversation: baseConversation({
      agentLastReadAt: minutesAgo(40),
      agentLastReadByUserId: AGENT_A,
    }),
  });
  const db = createMemoryDb(store);
  const wrongWs = await claimAgentUnreadReminder(db, {
    workspaceId: WS_OTHER,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(wrongWs.ok, false);
  if (!wrongWs.ok) {
    assert.ok(
      wrongWs.reason === "CONVERSATION_NOT_FOUND" ||
        wrongWs.reason === "WORKSPACE_MISMATCH",
    );
  }

  store.users.set(AGENT_A, {
    id: AGENT_A,
    disabledAt: null,
    pushNotificationPrefs: { chat_message: false },
  });
  const prefOff = await claimAgentUnreadReminder(db, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(prefOff.ok, false);
  if (!prefOff.ok) assert.equal(prefOff.reason, "PREFERENCE_OFF");

  store.users.set(AGENT_A, {
    id: AGENT_A,
    disabledAt: null,
    pushNotificationPrefs: {},
  });
  store.lead.assignedAgentId = null;
  const pond = await claimAgentUnreadReminder(db, {
    workspaceId: WS,
    conversationId: CONV,
    now: NOW,
  });
  assert.equal(pond.ok, false);
  if (!pond.ok) assert.equal(pond.reason, "UNASSIGNED");
}

function testSourceGuards() {
  const lib = read("src/lib/conversations/agent-unread-reminder.ts");
  assert.match(lib, /AGENT_UNREAD_REMINDER_DELAY_MS/);
  assert.match(lib, /pg_advisory_xact_lock/);
  assert.match(lib, /FOR UPDATE OF c, l/);
  assert.match(lib, /claimAgentUnreadReminder/);
  assert.match(lib, /CUSTOMER_CHAT_PUSH_TYPE/);
  assert.doesNotMatch(lib, /deliverPushToUsersNow/);
  assert.doesNotMatch(lib, /scheduleWorkerSideEffect/);
  assert.doesNotMatch(lib, /api\/cron/);
  assert.match(lib, /agentUnreadReminderMessageId/);
  // Presence must not gate reminders
  assert.doesNotMatch(lib, /presenceUntil/);
  assert.doesNotMatch(lib, /availabilityPreference/);
}

async function main() {
  testSourceGuards();
  testPureStreakAndAge();
  testEvaluateCases();
  await testClaimHappyPathAndConcurrent();
  await testClaimRaceAssignmentAndCursor();
  await testClaimWorkspaceIsolationAndOptOut();
  console.log("agent-unread-reminder-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
