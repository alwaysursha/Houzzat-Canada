/**
 * Agent-owned native CHAT quick replies (Chat V1).
 * Ownership is always workspaceId + userId from auth context — never the client.
 * Narrow Db surface so this compiles before prisma generate for AgentChatQuickReply.
 */

import type { AgentOrgContext } from "@/lib/agent";

export const AGENT_CHAT_QUICK_REPLY_NAME_MAX = 80;
export const AGENT_CHAT_QUICK_REPLY_BODY_MAX = 4000;
export const AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT = 50;
/** Reject oversized raw JSON before parse (name + body + JSON overhead). */
export const AGENT_CHAT_QUICK_REPLY_REQUEST_MAX_CHARS = 12_000;

export type AgentChatQuickReplyView = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type PresentedRow = {
  id: string;
  name: string;
  body: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AgentChatQuickReplyTx = {
  agentChatQuickReply: {
    findMany: (args: Record<string, unknown>) => Promise<PresentedRow[]>;
    findFirst: (args: Record<string, unknown>) => Promise<PresentedRow | { sortOrder: number } | null>;
    count: (args: Record<string, unknown>) => Promise<number>;
    create: (args: Record<string, unknown>) => Promise<PresentedRow>;
    updateMany: (args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    deleteMany: (args: {
      where: Record<string, unknown>;
    }) => Promise<{ count: number }>;
  };
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<unknown>;
};

export type AgentChatQuickReplyDb = AgentChatQuickReplyTx & {
  $transaction: <T>(fn: (tx: AgentChatQuickReplyTx) => Promise<T>) => Promise<T>;
};

function present(row: PresentedRow): AgentChatQuickReplyView {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function resolveQuickReplyOwner(
  ctx: AgentOrgContext,
):
  | { ok: true; workspaceId: string; userId: string }
  | { ok: false; status: number; body: unknown } {
  const workspaceId = ctx.workspaceId?.trim() || null;
  if (!workspaceId || !ctx.isWorkspaceCrmAllowed) {
    return {
      ok: false,
      status: 403,
      body: { error: "Workspace required" },
    };
  }
  const userId = ctx.user.id?.trim() || "";
  if (!userId) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }
  return { ok: true, workspaceId, userId };
}

export function isValidQuickReplyId(id: string): boolean {
  const trimmed = id.trim();
  return trimmed.length >= 1 && trimmed.length <= 64 && trimmed === id;
}

export function parseQuickReplyCreateBody(
  raw: unknown,
):
  | { ok: true; name: string; body: string }
  | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 2) return { ok: false };
  if (!keys.includes("name") || !keys.includes("body")) return { ok: false };
  if (typeof obj.name !== "string" || typeof obj.body !== "string") {
    return { ok: false };
  }
  const name = obj.name.trim();
  const body = obj.body.trim();
  if (!name || name.length > AGENT_CHAT_QUICK_REPLY_NAME_MAX) return { ok: false };
  if (!body || body.length > AGENT_CHAT_QUICK_REPLY_BODY_MAX) return { ok: false };
  return { ok: true, name, body };
}

export function parseQuickReplyPatchBody(
  raw: unknown,
):
  | { ok: true; name?: string; body?: string }
  | { ok: false } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false };
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0 || keys.length > 2) return { ok: false };
  let name: string | undefined;
  let body: string | undefined;
  for (const key of keys) {
    if (key === "name") {
      if (typeof obj.name !== "string") return { ok: false };
      name = obj.name.trim();
      if (!name || name.length > AGENT_CHAT_QUICK_REPLY_NAME_MAX) return { ok: false };
      continue;
    }
    if (key === "body") {
      if (typeof obj.body !== "string") return { ok: false };
      body = obj.body.trim();
      if (!body || body.length > AGENT_CHAT_QUICK_REPLY_BODY_MAX) return { ok: false };
      continue;
    }
    return { ok: false };
  }
  if (name === undefined && body === undefined) return { ok: false };
  return { ok: true, name, body };
}

async function lockOwnerQuota(
  tx: AgentChatQuickReplyTx,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const lockKey = `agent-chat-qr:${workspaceId}:${userId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

export async function listAgentChatQuickReplies(
  db: AgentChatQuickReplyDb,
  owner: { workspaceId: string; userId: string },
): Promise<AgentChatQuickReplyView[]> {
  const rows = await db.agentChatQuickReply.findMany({
    where: {
      workspaceId: owner.workspaceId,
      userId: owner.userId,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      body: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map(present);
}

export async function createAgentChatQuickReply(
  db: AgentChatQuickReplyDb,
  owner: { workspaceId: string; userId: string },
  input: { name: string; body: string },
): Promise<
  | { ok: true; reply: AgentChatQuickReplyView }
  | { ok: false; reason: "QUOTA" }
> {
  return db.$transaction(async (tx) => {
    await lockOwnerQuota(tx, owner.workspaceId, owner.userId);
    const count = await tx.agentChatQuickReply.count({
      where: {
        workspaceId: owner.workspaceId,
        userId: owner.userId,
      },
    });
    if (count >= AGENT_CHAT_QUICK_REPLY_MAX_PER_AGENT) {
      return { ok: false as const, reason: "QUOTA" as const };
    }
    const last = (await tx.agentChatQuickReply.findFirst({
      where: {
        workspaceId: owner.workspaceId,
        userId: owner.userId,
      },
      orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
      select: { sortOrder: true },
    })) as { sortOrder: number } | null;
    const created = await tx.agentChatQuickReply.create({
      data: {
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        name: input.name,
        body: input.body,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      select: {
        id: true,
        name: true,
        body: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { ok: true as const, reply: present(created) };
  });
}

export async function updateAgentChatQuickReply(
  db: AgentChatQuickReplyDb,
  owner: { workspaceId: string; userId: string },
  id: string,
  input: { name?: string; body?: string },
): Promise<
  | { ok: true; reply: AgentChatQuickReplyView }
  | { ok: false; reason: "NOT_FOUND" }
> {
  const data: Record<string, string> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.body !== undefined) data.body = input.body;

  const updated = await db.agentChatQuickReply.updateMany({
    where: {
      id,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
    },
    data,
  });
  if (updated.count === 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const row = (await db.agentChatQuickReply.findFirst({
    where: {
      id,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
    },
    select: {
      id: true,
      name: true,
      body: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
    },
  })) as PresentedRow | null;

  if (!row) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  return { ok: true, reply: present(row) };
}

export async function deleteAgentChatQuickReply(
  db: AgentChatQuickReplyDb,
  owner: { workspaceId: string; userId: string },
  id: string,
): Promise<{ ok: true } | { ok: false; reason: "NOT_FOUND" }> {
  const deleted = await db.agentChatQuickReply.deleteMany({
    where: {
      id,
      workspaceId: owner.workspaceId,
      userId: owner.userId,
    },
  });
  if (deleted.count === 0) {
    return { ok: false, reason: "NOT_FOUND" };
  }
  return { ok: true };
}

export async function readRequestJsonLimited(
  request: Request,
  maxChars: number = AGENT_CHAT_QUICK_REPLY_REQUEST_MAX_CHARS,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; status: number; body: unknown }
> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
  if (text.length > maxChars) {
    return { ok: false, status: 413, body: { error: "Payload too large" } };
  }
  if (!text.trim()) {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, body: { error: "Invalid payload" } };
  }
}
