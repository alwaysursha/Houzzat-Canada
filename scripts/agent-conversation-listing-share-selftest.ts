/**
 * Chat V1 Milestone 4V — agent LISTING_SHARE send (no DB).
 * Run: pnpm agent-conversation-listing-share:selftest
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE,
  agentListingShareRequestSchema,
  sendAgentLeadListingShare,
  type AgentListingShareDb,
} from "../src/lib/conversations/agent-conversation-listing-share";
import { createConversationMessage } from "../src/lib/conversations/create-conversation-message";
import {
  LISTING_SHARE_MESSAGE_BODY,
  type ListingSharePayload,
  type ListingShareSourceListing,
} from "../src/lib/conversations/listing-share";
import type { WorkspaceListingEntitlement } from "../src/lib/tenancy/listing-entitlement";
import { buildListingSourceAuthorityKey } from "../src/lib/typesense/listing-document";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

process.env.PROPTX_FEED = "idx";

const TRREB = "cmtrdf23t000091u0cw3a5zu9";
const SAK = buildListingSourceAuthorityKey(TRREB, "proptx")!;
const WS = "ws_a";
const LEAD = "lead_1";
const AGENT = "agent_a";
const OTHER_AGENT = "agent_b";
const NOW = new Date("2026-10-10T12:00:00.000Z");

const entitlement: WorkspaceListingEntitlement = {
  workspaceId: WS,
  authorities: [
    {
      organizationId: TRREB,
      providerKey: "proptx",
      sourceAuthorityKey: SAK,
      capabilities: ["ACTIVE_LISTINGS", "MEDIA", "SOLD"],
    },
  ],
};

function stubCtx(userId: string, workspaceId: string | null = WS): AgentOrgContext {
  return {
    user: { id: userId, email: "a@example.com", name: "Agent A", role: "AGENT" },
    organizationId: "org",
    organizationName: "Org",
    organizationIds: ["org"],
    membershipRole: "AGENT",
    canSeeTeamLeads: false,
    isPlatformAdmin: false,
    workspaceId,
    workspaceRole: "AGENT",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "WS",
    isWorkspaceMember: Boolean(workspaceId),
    isWorkspaceCrmAllowed: Boolean(workspaceId),
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
  } as unknown as AgentOrgContext;
}

function activeListing(
  overrides: Partial<ListingShareSourceListing> = {},
): ListingShareSourceListing & {
  media: Array<{ url: string; isPrimary: boolean; sortOrder: number }>;
} {
  return {
    id: "listing_1",
    mlsNumber: "X1234567",
    status: "ACTIVE",
    transactionType: "SALE",
    propertyType: "DETACHED",
    listPrice: 899_000,
    soldPrice: 9_999_999,
    beds: 3,
    baths: 2,
    addressLine: "123 Main St",
    unitNumber: null,
    city: "Toronto",
    province: "ON",
    postalCode: "M5V 1A1",
    dataSource: "mls",
    organizationId: TRREB,
    providerKey: "proptx",
    media: [
      {
        url: "https://ampre.ca/photo.jpg",
        isPrimary: true,
        sortOrder: 0,
      },
    ],
    ...overrides,
  };
}

type World = {
  lead: {
    id: string;
    workspaceId: string;
    assignedAgentId: string | null;
  };
  conversation: {
    id: string;
    workspaceId: string;
    leadId: string;
    status: "OPEN";
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date | null;
    customerLastReadAt: Date | null;
    agentLastReadAt: Date | null;
    agentLastReadByUserId: string | null;
  } | null;
  messages: Array<Record<string, unknown>>;
  activities: Array<{
    id: string;
    leadId: string;
    userId: string | null;
    type: string;
    body: string | null;
    meta: unknown;
  }>;
  listing: ReturnType<typeof activeListing> | null;
  pushes: Array<{ created: boolean; body: string | null; messageId: string }>;
};

function createWorld(input?: {
  assignedAgentId?: string | null;
  listing?: ReturnType<typeof activeListing> | null;
  workspaceId?: string;
}): { world: World; db: AgentListingShareDb } {
  const workspaceId = input?.workspaceId ?? WS;
  const world: World = {
    lead: {
      id: LEAD,
      workspaceId,
      assignedAgentId:
        input?.assignedAgentId === undefined ? AGENT : input.assignedAgentId,
    },
    conversation: null,
    messages: [],
    activities: [],
    listing: input?.listing === undefined ? activeListing() : input.listing,
    pushes: [],
  };

  let seq = 0;
  const lockQueues = new Map<string, Promise<unknown>>();

  async function withLock(key: string, fn: () => Promise<unknown>) {
    const prev = lockQueues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
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

  function ensureConversation() {
    if (!world.conversation) {
      world.conversation = {
        id: "conv_1",
        workspaceId: world.lead.workspaceId,
        leadId: world.lead.id,
        status: "OPEN",
        createdAt: NOW,
        updatedAt: NOW,
        lastMessageAt: null,
        customerLastReadAt: null,
        agentLastReadAt: null,
        agentLastReadByUserId: null,
      };
    }
    return world.conversation;
  }

  const db = {
    lead: {
      findUnique: async (args: Record<string, unknown>) => {
        const where = args.where as {
          workspaceId_id?: { workspaceId: string; id: string };
          id?: string;
        };
        if (where.workspaceId_id) {
          if (
            where.workspaceId_id.workspaceId !== world.lead.workspaceId ||
            where.workspaceId_id.id !== world.lead.id
          ) {
            return null;
          }
        } else if (where.id && where.id !== world.lead.id) {
          return null;
        }
        return {
          id: world.lead.id,
          organizationId: "org",
          workspaceId: world.lead.workspaceId,
          assignedAgentId: world.lead.assignedAgentId,
        };
      },
    },
    conversation: {
      findUnique: async (args: Record<string, unknown>) => {
        const where = args.where as {
          workspaceId_leadId?: { workspaceId: string; leadId: string };
        };
        const key = where.workspaceId_leadId;
        if (
          !world.conversation ||
          !key ||
          key.workspaceId !== world.conversation.workspaceId ||
          key.leadId !== world.conversation.leadId
        ) {
          return null;
        }
        return { ...world.conversation };
      },
      create: async (args: Record<string, unknown>) => {
        const data = args.data as { workspaceId: string; leadId: string };
        world.conversation = {
          id: "conv_1",
          workspaceId: data.workspaceId,
          leadId: data.leadId,
          status: "OPEN",
          createdAt: NOW,
          updatedAt: NOW,
          lastMessageAt: null,
          customerLastReadAt: null,
          agentLastReadAt: null,
          agentLastReadByUserId: null,
        };
        return { ...world.conversation };
      },
      update: async (args: Record<string, unknown>) => {
        const conv = ensureConversation();
        const data = args.data as { lastMessageAt?: Date };
        if (data.lastMessageAt) conv.lastMessageAt = data.lastMessageAt;
        return { ...conv };
      },
    },
    message: {
      findUnique: async (args: Record<string, unknown>) => {
        const where = args.where as {
          workspaceId_id?: { workspaceId: string; id: string };
          twilioMessageSid?: string;
        };
        if (where.workspaceId_id) {
          const row = world.messages.find(
            (m) =>
              m.id === where.workspaceId_id!.id &&
              m.workspaceId === where.workspaceId_id!.workspaceId,
          );
          return (row as never) ?? null;
        }
        return null;
      },
      findFirst: async () => null,
      create: async (args: Record<string, unknown>) => {
        seq += 1;
        const data = args.data as Record<string, unknown>;
        const row = {
          id: `msg_${seq}`,
          ...data,
          editedAt: null,
          deletedAt: null,
          replyToMessageId: null,
          deliveredAt: null,
          smsSource: null,
          twilioMessageSid: null,
          providerStatus: null,
          smsFrom: null,
          smsTo: null,
        };
        world.messages.push(row);
        return row as never;
      },
      findMany: async () => [],
    },
    listing: {
      findUnique: async (args: Record<string, unknown>) => {
        if (!world.listing) return null;
        const where = args.where as { id?: string; mlsNumber?: string };
        if (where.id && where.id !== world.listing.id) return null;
        if (
          where.mlsNumber &&
          where.mlsNumber !== world.listing.mlsNumber
        ) {
          return null;
        }
        return { ...world.listing };
      },
    },
    leadActivity: {
      findFirst: async (args: Record<string, unknown>) => {
        const where = args.where as {
          leadId: string;
          type: string;
          userId?: string;
          meta?: { path: string[]; equals: string };
        };
        const row = world.activities.find((activity) => {
          if (activity.leadId !== where.leadId) return false;
          if (activity.type !== where.type) return false;
          if (where.userId && activity.userId !== where.userId) return false;
          if (where.meta?.path?.[0] === "idempotencyKey") {
            const meta = activity.meta as { idempotencyKey?: string } | null;
            return meta?.idempotencyKey === where.meta.equals;
          }
          if (where.meta?.path?.[0] === "messageId") {
            const meta = activity.meta as { messageId?: string } | null;
            return meta?.messageId === where.meta.equals;
          }
          return true;
        });
        return row ? { id: row.id, meta: row.meta } : null;
      },
      create: async (args: Record<string, unknown>) => {
        seq += 1;
        const data = args.data as {
          leadId: string;
          userId?: string | null;
          type: string;
          body?: string | null;
          meta?: unknown;
        };
        const row = {
          id: `act_${seq}`,
          leadId: data.leadId,
          userId: data.userId ?? null,
          type: data.type,
          body: data.body ?? null,
          meta: data.meta ?? null,
        };
        world.activities.push(row);
        return { id: row.id };
      },
    },
    $executeRaw: async () => undefined,
    $transaction: async (fn: (tx: never) => Promise<unknown>) => {
      const key = `${world.lead.workspaceId}:conv`;
      return withLock(key, async () => {
        const tx = {
          $executeRaw: async (
            strings: TemplateStringsArray,
            ...values: unknown[]
          ) => {
            const sql = strings.join("?");
            if (sql.includes("pg_advisory_xact_lock")) {
              const lockKey = `${String(values[0])}|${String(values[1])}`;
              // Serialize per advisory key inside the outer txn lock.
              await withLock(`adv:${lockKey}`, async () => undefined);
            }
            return undefined;
          },
          message: db.message,
          conversation: { update: db.conversation.update },
          leadActivity: db.leadActivity,
        };
        return fn(tx as never);
      });
    },
  } as unknown as AgentListingShareDb;

  return { world, db };
}

function testSourceAndSchema() {
  const route = read(
    "src/app/api/agent/leads/[id]/conversation/listing-share/route.ts",
  );
  assert.match(route, /sendAgentLeadListingShare/);
  assert.match(route, /resolveListingEntitlementContextForRequest/);
  assert.match(route, /export const runtime = "nodejs"/);
  assert.doesNotMatch(route, /channel.*SMS/);

  const lib = read(
    "src/lib/conversations/agent-conversation-listing-share.ts",
  );
  assert.match(lib, /LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE/);
  assert.match(lib, /pg_advisory_xact_lock/);
  assert.match(lib, /LISTING_SHARE_MESSAGE_BODY/);
  assert.doesNotMatch(lib, /soldPrice/);

  const create = read("src/lib/conversations/create-conversation-message.ts");
  assert.match(create, /parseListingSharePayload/);

  assert.equal(
    agentListingShareRequestSchema.safeParse({
      mlsNumber: "X1",
      listingId: "l1",
      idempotencyKey: "12345678",
    }).success,
    false,
  );
  assert.equal(
    agentListingShareRequestSchema.safeParse({
      mlsNumber: "X1234567",
      idempotencyKey: "12345678",
    }).success,
    true,
  );
  assert.equal(LISTING_SHARE_MESSAGE_BODY.includes("shared a property"), true);
}

async function testNormalizeAllowsShareRejectsAutomation() {
  const { db } = createWorld();
  const sharePayload: ListingSharePayload = {
    card: "LISTING_SHARE",
    version: 1,
    listingId: "listing_1",
    mlsNumber: "X1234567",
    listPrice: 100,
    status: "ACTIVE",
    transactionType: "SALE",
    propertyType: "DETACHED",
    beds: 1,
    baths: 1,
    addressLine: "1 St",
    unitNumber: null,
    city: "Toronto",
    province: "ON",
    postalCode: null,
    primaryImageUrl: "https://ampre.ca/p.jpg",
    href: "/listing/1-st-toronto/X1234567",
    sharedAt: NOW.toISOString(),
  };
  const ok = await createConversationMessage(db, {
    workspaceId: WS,
    leadId: LEAD,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: AGENT,
    senderName: "Agent",
    body: LISTING_SHARE_MESSAGE_BODY,
    payload: sharePayload,
  });
  assert.equal(ok.ok, true);

  const bad = await createConversationMessage(db, {
    workspaceId: WS,
    leadId: LEAD,
    channel: "CHAT",
    kind: "TEXT",
    senderKind: "AGENT",
    senderUserId: AGENT,
    senderName: "Agent",
    body: "hi",
    payload: { automationKey: "lead.inactive_14_days" },
  });
  assert.equal(bad.ok, false);
}

async function testSendHappyPathAndAuth() {
  const { world, db } = createWorld();
  let pushCount = 0;
  const first = await sendAgentLeadListingShare(
    db,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-01" },
    {
      entitlement,
      now: NOW,
      scheduleCustomerPush: (input) => {
        pushCount += 1;
        world.pushes.push({
          created: input.created,
          body: input.message.body,
          messageId: input.message.id,
        });
      },
    },
  );
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.data.replayed, false);
  assert.equal(first.data.message.body, LISTING_SHARE_MESSAGE_BODY);
  assert.equal(
    (first.data.message.payload as ListingSharePayload).card,
    "LISTING_SHARE",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      first.data.message.payload as object,
      "soldPrice",
    ),
    false,
  );
  assert.equal(pushCount, 1);
  assert.equal(world.pushes[0]?.body, LISTING_SHARE_MESSAGE_BODY);
  assert.ok(
    world.activities.some(
      (a) => a.type === LISTING_SHARE_IDEMPOTENCY_ACTIVITY_TYPE,
    ),
  );

  // Idempotent retry — same message, no second push
  const retry = await sendAgentLeadListingShare(
    db,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-01" },
    {
      entitlement,
      now: NOW,
      scheduleCustomerPush: () => {
        pushCount += 1;
      },
    },
  );
  assert.equal(retry.ok, true);
  if (!retry.ok) return;
  assert.equal(retry.data.replayed, true);
  assert.equal(retry.data.message.id, first.data.message.id);
  assert.equal(pushCount, 1);
  assert.equal(world.messages.length, 1);

  // Same key, different listing → conflict
  world.listing = activeListing({
    id: "listing_2",
    mlsNumber: "Y7654321",
  });
  const conflict = await sendAgentLeadListingShare(
    db,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "Y7654321", idempotencyKey: "idem-key-01" },
    { entitlement, now: NOW },
  );
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.reason, "IDEMPOTENCY_CONFLICT");

  // Not assigned
  const { db: db2 } = createWorld({ assignedAgentId: OTHER_AGENT });
  const forbidden = await sendAgentLeadListingShare(
    db2,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-02" },
    { entitlement, now: NOW },
  );
  assert.equal(forbidden.ok, false);
  // Workspace agents who cannot access the lead get LEAD_NOT_FOUND;
  // viewers who can open but are not assignee get FORBIDDEN.
  if (!forbidden.ok) {
    assert.ok(
      forbidden.reason === "FORBIDDEN" ||
        forbidden.reason === "LEAD_NOT_FOUND",
    );
  }

  // Sold listing rejected
  const { db: db3 } = createWorld({
    listing: activeListing({ status: "SOLD" }),
  });
  const sold = await sendAgentLeadListingShare(
    db3,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-03" },
    { entitlement, now: NOW },
  );
  assert.equal(sold.ok, false);
  if (!sold.ok) assert.equal(sold.reason, "LISTING_FORBIDDEN");

  // Missing listing
  const { db: db4 } = createWorld({ listing: null });
  const missing = await sendAgentLeadListingShare(
    db4,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-04" },
    { entitlement, now: NOW },
  );
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "LISTING_NOT_FOUND");

  // Cross-tenant entitlement workspace mismatch
  const { db: db5 } = createWorld();
  const cross = await sendAgentLeadListingShare(
    db5,
    stubCtx(AGENT),
    LEAD,
    { mlsNumber: "X1234567", idempotencyKey: "idem-key-05" },
    {
      entitlement: { ...entitlement, workspaceId: "ws_other" },
      now: NOW,
    },
  );
  assert.equal(cross.ok, false);
  if (!cross.ok) assert.equal(cross.reason, "LISTING_FORBIDDEN");
}

async function testConcurrentIdempotency() {
  const { world, db } = createWorld();
  let pushes = 0;
  const deps = {
    entitlement,
    now: NOW,
    scheduleCustomerPush: () => {
      pushes += 1;
    },
  };
  const [a, b] = await Promise.all([
    sendAgentLeadListingShare(
      db,
      stubCtx(AGENT),
      LEAD,
      { mlsNumber: "X1234567", idempotencyKey: "idem-concurrent" },
      deps,
    ),
    sendAgentLeadListingShare(
      db,
      stubCtx(AGENT),
      LEAD,
      { mlsNumber: "X1234567", idempotencyKey: "idem-concurrent" },
      deps,
    ),
  ]);
  assert.equal(a.ok && b.ok, true);
  const ids = [a, b]
    .filter((row): row is Extract<typeof row, { ok: true }> => row.ok)
    .map((row) => row.data.message.id);
  assert.equal(new Set(ids).size, 1);
  assert.equal(world.messages.length, 1);
  assert.equal(pushes, 1);
}

async function main() {
  testSourceAndSchema();
  await testNormalizeAllowsShareRejectsAutomation();
  await testSendHappyPathAndAuth();
  await testConcurrentIdempotency();
  console.log("agent-conversation-listing-share-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
