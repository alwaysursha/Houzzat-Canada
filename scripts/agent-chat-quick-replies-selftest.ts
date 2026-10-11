/**
 * Chat V1 Milestone 4N — agent quick-replies CRUD selftest (no DB).
 * Run: pnpm agent-chat-quick-replies:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  AGENT_CHAT_QUICK_REPLY_BODY_MAX,
  AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT,
  AGENT_CHAT_QUICK_REPLY_NAME_MAX,
  createAgentChatQuickReply,
  deleteAgentChatQuickReply,
  isValidQuickReplyId,
  listAgentChatQuickReplies,
  parseQuickReplyCreateBody,
  parseQuickReplyPatchBody,
  resolveQuickReplyOwner,
  updateAgentChatQuickReply,
  type AgentChatQuickReplyDb,
  type AgentChatQuickReplyTx,
} from "../src/lib/conversations/agent-chat-quick-replies";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

function stubCtx(input: {
  userId: string;
  workspaceId: string | null;
  crmAllowed?: boolean;
}): AgentOrgContext {
  return {
    user: {
      id: input.userId,
      email: "a@example.com",
      name: "Agent",
      role: "AGENT",
    },
    organizationId: "org",
    organizationName: "Org",
    organizationIds: ["org"],
    membershipRole: "AGENT",
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId: input.workspaceId,
    workspaceRole: "AGENT",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "WS",
    isWorkspaceMember: Boolean(input.workspaceId),
    isWorkspaceCrmAllowed: input.crmAllowed ?? Boolean(input.workspaceId),
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
  } as unknown as AgentOrgContext;
}

type StoreRow = {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

function createMemoryDb(rows: StoreRow[] = []): AgentChatQuickReplyDb {
  const store = rows;
  let seq = 0;
  const locks = new Map<string, Promise<void>>();

  function delegate(list: StoreRow[]): AgentChatQuickReplyTx["agentChatQuickReply"] {
    return {
      findMany: async (args) => {
        const where = args.where as { workspaceId: string; userId: string };
        const matched = list
          .filter(
            (row) =>
              row.workspaceId === where.workspaceId &&
              row.userId === where.userId,
          )
          .sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
            const created = a.createdAt.getTime() - b.createdAt.getTime();
            if (created !== 0) return created;
            return a.id.localeCompare(b.id);
          });
        return matched.map((row) => ({
          id: row.id,
          name: row.name,
          body: row.body,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }));
      },
      findFirst: async (args) => {
        const where = args.where as {
          id?: string;
          workspaceId: string;
          userId: string;
        };
        let matched = list.filter(
          (row) =>
            row.workspaceId === where.workspaceId &&
            row.userId === where.userId &&
            (where.id == null || row.id === where.id),
        );
        const orderBy = args.orderBy as
          | Array<{ sortOrder?: "desc" | "asc"; id?: "desc" | "asc" }>
          | undefined;
        if (orderBy?.[0]?.sortOrder === "desc") {
          matched = matched.sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return b.sortOrder - a.sortOrder;
            return b.id.localeCompare(a.id);
          });
        }
        const row = matched[0];
        if (!row) return null;
        const select = args.select as Record<string, boolean>;
        if (select.sortOrder && !select.id) {
          return { sortOrder: row.sortOrder };
        }
        return {
          id: row.id,
          name: row.name,
          body: row.body,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      },
      count: async (args) => {
        const where = args.where as { workspaceId: string; userId: string };
        return list.filter(
          (row) =>
            row.workspaceId === where.workspaceId &&
            row.userId === where.userId,
        ).length;
      },
      create: async (args) => {
        const data = args.data as {
          workspaceId: string;
          userId: string;
          name: string;
          body: string;
          sortOrder: number;
        };
        seq += 1;
        const now = new Date(`2026-10-10T12:00:${String(seq).padStart(2, "0")}.000Z`);
        const row: StoreRow = {
          id: `qr_${seq}`,
          workspaceId: data.workspaceId,
          userId: data.userId,
          name: data.name,
          body: data.body,
          sortOrder: data.sortOrder,
          createdAt: now,
          updatedAt: now,
        };
        list.push(row);
        return {
          id: row.id,
          name: row.name,
          body: row.body,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      },
      updateMany: async (args) => {
        const where = args.where as {
          id: string;
          workspaceId: string;
          userId: string;
        };
        const data = args.data as { name?: string; body?: string };
        const row = list.find(
          (item) =>
            item.id === where.id &&
            item.workspaceId === where.workspaceId &&
            item.userId === where.userId,
        );
        if (!row) return { count: 0 };
        if (Object.prototype.hasOwnProperty.call(data, "workspaceId")) {
          throw new Error("ownership reassignment attempted");
        }
        if (Object.prototype.hasOwnProperty.call(data, "userId")) {
          throw new Error("ownership reassignment attempted");
        }
        if (data.name !== undefined) row.name = data.name;
        if (data.body !== undefined) row.body = data.body;
        row.updatedAt = new Date(row.updatedAt.getTime() + 1000);
        return { count: 1 };
      },
      deleteMany: async (args) => {
        const where = args.where as {
          id: string;
          workspaceId: string;
          userId: string;
        };
        const index = list.findIndex(
          (item) =>
            item.id === where.id &&
            item.workspaceId === where.workspaceId &&
            item.userId === where.userId,
        );
        if (index < 0) return { count: 0 };
        list.splice(index, 1);
        return { count: 1 };
      },
    };
  }

  const db: AgentChatQuickReplyDb = {
    agentChatQuickReply: delegate(store),
    $executeRaw: async () => undefined,
    $transaction: async (fn) => {
      // Serialize transactions that take the same advisory lock key.
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const prev = locks.get("global") ?? Promise.resolve();
      locks.set(
        "global",
        prev.then(() => gate),
      );
      await prev;
      try {
        const tx: AgentChatQuickReplyTx = {
          agentChatQuickReply: delegate(store),
          $executeRaw: async () => undefined,
        };
        return await fn(tx);
      } finally {
        release();
      }
    },
  };
  return db;
}

function testValidationAndAuthHelpers() {
  assert.equal(isValidQuickReplyId("abc"), true);
  assert.equal(isValidQuickReplyId(" abc"), false);
  assert.equal(isValidQuickReplyId(""), false);

  assert.deepEqual(parseQuickReplyCreateBody({ name: " Hi ", body: " Body " }), {
    ok: true,
    name: "Hi",
    body: "Body",
  });
  assert.equal(parseQuickReplyCreateBody({ name: "", body: "x" }).ok, false);
  assert.equal(
    parseQuickReplyCreateBody({
      name: "x".repeat(AGENT_CHAT_QUICK_REPLY_NAME_MAX + 1),
      body: "ok",
    }).ok,
    false,
  );
  assert.equal(
    parseQuickReplyCreateBody({
      name: "ok",
      body: "x".repeat(AGENT_CHAT_QUICK_REPLY_BODY_MAX + 1),
    }).ok,
    false,
  );
  assert.equal(
    parseQuickReplyCreateBody({
      name: "ok",
      body: "ok",
      workspaceId: "ws",
    }).ok,
    false,
  );
  assert.equal(
    parseQuickReplyCreateBody({ name: "ok", body: "ok", userId: "u" }).ok,
    false,
  );

  assert.deepEqual(parseQuickReplyPatchBody({ name: " Renamed " }), {
    ok: true,
    name: "Renamed",
    body: undefined,
  });
  assert.equal(parseQuickReplyPatchBody({}).ok, false);
  assert.equal(
    parseQuickReplyPatchBody({ name: "x", userId: "nope" }).ok,
    false,
  );
  assert.equal(
    parseQuickReplyPatchBody({ workspaceId: "ws", name: "x" }).ok,
    false,
  );

  const noWs = resolveQuickReplyOwner(
    stubCtx({ userId: "u1", workspaceId: null }),
  );
  assert.equal(noWs.ok, false);
  if (!noWs.ok) assert.equal(noWs.status, 403);

  const ok = resolveQuickReplyOwner(
    stubCtx({ userId: "u1", workspaceId: "ws1" }),
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.workspaceId, "ws1");
    assert.equal(ok.userId, "u1");
  }
}

async function testIsolationOrderingQuotaAndMutations() {
  const db = createMemoryDb([
    {
      id: "other",
      workspaceId: "ws1",
      userId: "u2",
      name: "Other",
      body: "secret",
      sortOrder: 0,
      createdAt: new Date("2026-10-10T11:00:00.000Z"),
      updatedAt: new Date("2026-10-10T11:00:00.000Z"),
    },
  ]);

  const owner = { workspaceId: "ws1", userId: "u1" };
  const a = await createAgentChatQuickReply(db, owner, {
    name: "A",
    body: "alpha",
  });
  assert.equal(a.ok, true);
  const b = await createAgentChatQuickReply(db, owner, {
    name: "B",
    body: "bravo",
  });
  assert.equal(b.ok, true);

  const listed = await listAgentChatQuickReplies(db, owner);
  assert.equal(listed.length, 2);
  assert.deepEqual(
    listed.map((row) => row.name),
    ["A", "B"],
  );
  assert.ok(listed.every((row) => !("workspaceId" in row) && !("userId" in row)));

  const foreignUpdate = await updateAgentChatQuickReply(
    db,
    owner,
    "other",
    { name: "Hacked" },
  );
  assert.equal(foreignUpdate.ok, false);

  const foreignDelete = await deleteAgentChatQuickReply(db, owner, "other");
  assert.equal(foreignDelete.ok, false);

  if (!a.ok) throw new Error("expected create");
  const patched = await updateAgentChatQuickReply(db, owner, a.reply.id, {
    body: "updated",
  });
  assert.equal(patched.ok, true);
  if (patched.ok) assert.equal(patched.reply.body, "updated");

  const deleted = await deleteAgentChatQuickReply(db, owner, a.reply.id);
  assert.equal(deleted.ok, true);
  assert.equal((await listAgentChatQuickReplies(db, owner)).length, 1);

  // Fill to quota
  const fill = createMemoryDb();
  for (let i = 0; i < AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT; i += 1) {
    const created = await createAgentChatQuickReply(fill, owner, {
      name: `N${i}`,
      body: `B${i}`,
    });
    assert.equal(created.ok, true);
  }
  const over = await createAgentChatQuickReply(fill, owner, {
    name: "Overflow",
    body: "nope",
  });
  assert.equal(over.ok, false);
  if (!over.ok) assert.equal(over.reason, "QUOTA");
  assert.equal(
    (await listAgentChatQuickReplies(fill, owner)).length,
    AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT,
  );
}

async function testConcurrentCreateQuota() {
  const db = createMemoryDb();
  const owner = { workspaceId: "ws1", userId: "u1" };
  for (let i = 0; i < AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT - 1; i += 1) {
    const created = await createAgentChatQuickReply(db, owner, {
      name: `P${i}`,
      body: `B${i}`,
    });
    assert.equal(created.ok, true);
  }

  const [first, second] = await Promise.all([
    createAgentChatQuickReply(db, owner, { name: "Race1", body: "one" }),
    createAgentChatQuickReply(db, owner, { name: "Race2", body: "two" }),
  ]);
  const wins = [first, second].filter((row) => row.ok).length;
  const losses = [first, second].filter((row) => !row.ok).length;
  assert.equal(wins, 1);
  assert.equal(losses, 1);
  assert.equal(
    (await listAgentChatQuickReplies(db, owner)).length,
    AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT,
  );
}

function testRouteSurface() {
  const listRoute = read("src/app/api/agent/quick-replies/route.ts");
  assert.ok(listRoute.includes("requireAgentContextFromRequest"));
  assert.ok(listRoute.includes("isTrustedStaffMutationOriginForRequest"));
  assert.ok(listRoute.includes("resolveQuickReplyOwner"));
  assert.ok(listRoute.includes("createAgentChatQuickReply"));
  assert.ok(listRoute.includes("listAgentChatQuickReplies"));
  assert.ok(!listRoute.includes("console.log"));

  const idRoute = read("src/app/api/agent/quick-replies/[id]/route.ts");
  assert.ok(idRoute.includes("updateAgentChatQuickReply"));
  assert.ok(idRoute.includes("deleteAgentChatQuickReply"));
  assert.ok(idRoute.includes('status: 404'));
  assert.ok(idRoute.includes("isTrustedStaffMutationOriginForRequest"));

  const lib = read("src/lib/conversations/agent-chat-quick-replies.ts");
  assert.ok(lib.includes("pg_advisory_xact_lock"));
  assert.ok(lib.includes("AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT"));
  assert.ok(lib.includes("workspaceId: owner.workspaceId"));
  assert.ok(lib.includes("userId: owner.userId"));
  assert.ok(!lib.includes("SmsQuickText"));

  const schema = read("prisma/schema.prisma");
  assert.ok(schema.includes("model AgentChatQuickReply"));
}

async function main() {
  testValidationAndAuthHelpers();
  await testIsolationOrderingQuotaAndMutations();
  await testConcurrentCreateQuota();
  testRouteSurface();
  console.log("agent-chat-quick-replies-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
