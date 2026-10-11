/**
 * Chat V1 Milestone 4Z — private voice-note playback authorization (no DB).
 * Run: pnpm agent-conversation-voice-auth:selftest
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentOrgContext } from "../src/lib/agent";
import {
  loadAgentLeadVoiceAttachmentAudio,
  sendAgentLeadVoiceNote,
} from "../src/lib/conversations/agent-conversation-voice";
import { handleCustomerConversationVoiceAudioGet } from "../src/lib/conversations/customer-conversation-voice";
import { buildVoiceNoteObjectKey } from "../src/lib/chat/voice-notes/keys";
import {
  putChatMediaObject,
  setChatMediaStorageTestDeps,
} from "../src/lib/chat/voice-notes/storage";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Hostname-bound CRM so workspace membership + CRM flags are enforced. */
process.env.WORKSPACE_READ_SCOPE = "workspace";
process.env.TENANT_DOMAIN_SCOPE = "workspace";

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

const WS = "ws_a";
const OTHER_WS = "ws_b";
const LEAD = "lead_1";
const AGENT = "agent_a";
const OTHER_AGENT = "agent_b";
const FORMER_AGENT = "agent_former";
const CONV = "conv_1";
const MSG = "msg_1";
const ATT = "att_1";

function webmBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes[0] = 0x1a;
  bytes[1] = 0x45;
  bytes[2] = 0xdf;
  bytes[3] = 0xa3;
  return bytes;
}

function stubCtx(
  userId: string,
  opts?: {
    workspaceId?: string | null;
    canSeeTeamLeads?: boolean;
    isWorkspaceCrmAllowed?: boolean;
  },
): AgentOrgContext {
  const workspaceId =
    opts && "workspaceId" in opts ? opts.workspaceId ?? null : WS;
  return {
    user: {
      id: userId,
      email: `${userId}@example.com`,
      name: "Agent",
      role: "AGENT",
    },
    organizationId: "org",
    organizationName: "Org",
    organizationIds: ["org"],
    membershipRole: "AGENT",
    canSeeTeamLeads: Boolean(opts?.canSeeTeamLeads),
    isPlatformAdmin: false,
    workspaceId,
    workspaceRole: "AGENT",
    workspaceMemberStatus: "ACTIVE",
    workspaceStatus: "ACTIVE",
    workspaceName: "WS",
    isWorkspaceMember: Boolean(workspaceId),
    isWorkspaceCrmAllowed:
      opts?.isWorkspaceCrmAllowed ?? Boolean(workspaceId),
    hasAmbiguousWorkspaceMembership: false,
    hasMultipleWorkspaces: false,
    requiresWorkspaceSelection: false,
    canManageWorkspace: false,
    readScope: "workspace",
  } as unknown as AgentOrgContext;
}

type World = {
  assignedAgentId: string | null;
  leadWorkspaceId: string;
  objectKey: string;
};

function createDb(world: World) {
  return {
    lead: {
      findUnique: async (args: {
        where:
          | { workspaceId_id?: { workspaceId: string; id: string } }
          | { id?: string };
      }) => {
        const byWs = (args.where as { workspaceId_id?: { workspaceId: string; id: string } })
          .workspaceId_id;
        if (byWs) {
          if (
            byWs.workspaceId !== world.leadWorkspaceId ||
            byWs.id !== LEAD
          ) {
            return null;
          }
        } else if ((args.where as { id?: string }).id !== LEAD) {
          return null;
        }
        return {
          id: LEAD,
          organizationId: "org",
          workspaceId: world.leadWorkspaceId,
          assignedAgentId: world.assignedAgentId,
        };
      },
    },
    conversation: {
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_leadId?: { workspaceId: string; leadId: string } };
      }) => {
        const key = where.workspaceId_leadId;
        if (
          !key ||
          key.workspaceId !== world.leadWorkspaceId ||
          key.leadId !== LEAD
        ) {
          return null;
        }
        return {
          id: CONV,
          workspaceId: world.leadWorkspaceId,
          leadId: LEAD,
          status: "OPEN",
          lastMessageAt: null,
          createdAt: new Date("2026-10-10T12:00:00.000Z"),
        };
      },
    },
    message: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          workspaceId?: string;
          conversationId?: string;
        };
      }) => {
        if (
          where.id === MSG &&
          where.workspaceId === world.leadWorkspaceId &&
          where.conversationId === CONV
        ) {
          return { id: MSG };
        }
        return null;
      },
      findUnique: async () => null,
      create: async () => {
        throw new Error("upload path not under test");
      },
    },
    messageAttachment: {
      findFirst: async ({
        where,
      }: {
        where: {
          id?: string;
          workspaceId?: string;
          messageId?: string;
          kind?: string;
          revokedAt?: null;
        };
      }) => {
        if (
          where.id === ATT &&
          where.workspaceId === world.leadWorkspaceId &&
          where.messageId === MSG &&
          where.kind === "VOICE_NOTE"
        ) {
          return {
            id: ATT,
            workspaceId: world.leadWorkspaceId,
            messageId: MSG,
            kind: "VOICE_NOTE",
            objectKey: world.objectKey,
            mimeType: "audio/webm",
            byteSize: 64,
            durationMs: 2000,
            sortOrder: 0,
            createdAt: new Date("2026-10-10T12:00:00.000Z"),
            revokedAt: null,
          };
        }
        return null;
      },
      findMany: async () => [],
      findUnique: async () => null,
      create: async () => {
        throw new Error("upload path not under test");
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn({}),
  };
}

async function withStorage(
  run: (objectKey: string) => Promise<void>,
): Promise<void> {
  const localRoot = mkdtempSync(join(tmpdir(), "voice-auth-"));
  const memory = new Map<string, Uint8Array>();
  setChatMediaStorageTestDeps({
    isProduction: () => false,
    localRoot,
    getBucket: async () => ({
      async put(key: string, value: ArrayBuffer | ArrayBufferView | string) {
        const bytes =
          value instanceof ArrayBuffer
            ? new Uint8Array(value)
            : typeof value === "string"
              ? new TextEncoder().encode(value)
              : new Uint8Array(
                  (value as ArrayBufferView).buffer,
                  (value as ArrayBufferView).byteOffset,
                  (value as ArrayBufferView).byteLength,
                );
        memory.set(key, bytes);
      },
      async get(key: string) {
        const bytes = memory.get(key);
        if (!bytes) return null;
        return {
          arrayBuffer: async () =>
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ),
          httpMetadata: { contentType: "audio/webm" },
        };
      },
      async delete(key: string | string[]) {
        for (const k of Array.isArray(key) ? key : [key]) memory.delete(k);
      },
    }),
  });

  const objectKey = buildVoiceNoteObjectKey({
    workspaceId: WS,
    conversationId: CONV,
    userId: AGENT,
    uploadId: "uploadauth01",
    ext: "webm",
  });
  await putChatMediaObject({
    objectKey,
    bytes: webmBytes(),
    contentType: "audio/webm",
  });
  await run(objectKey);
}

function testSourcePolicy() {
  const agentVoice = read("src/lib/conversations/agent-conversation-voice.ts");
  assert.match(agentVoice, /assignedAgentId !== ctx\.user\.id/);
  assert.match(agentVoice, /Forbidden/);
  // Upload still assignee-gated
  const uploadBlock = agentVoice.split("export async function sendAgentLeadVoiceNote")[1]
    ?.split("export async function loadAgentLeadVoiceAttachmentAudio")[0];
  assert.ok(uploadBlock?.includes("assignedAgentId"));
  assert.ok(uploadBlock?.includes("403"));

  const route = read(
    "src/app/api/agent/leads/[id]/conversation/messages/[messageId]/attachments/[attachmentId]/audio/route.ts",
  );
  assert.match(route, /requireAgentContextFromRequest/);
  assert.match(route, /loadAgentLeadVoiceAttachmentAudio/);

  const agentCtx = read("src/lib/agent.ts");
  assert.match(agentCtx, /disabledAt: null/);

  const customerVoice = read(
    "src/lib/conversations/customer-conversation-voice.ts",
  );
  assert.match(customerVoice, /resolveCustomerChatLead/);
  assert.match(customerVoice, /isConsumerRole/);
}

async function testAgentPlaybackAuth() {
  await withStorage(async (objectKey) => {
    const world: World = {
      assignedAgentId: AGENT,
      leadWorkspaceId: WS,
      objectKey,
    };
    const db = createDb(world) as never;

    const allowed = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(AGENT),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get("Content-Type"), "audio/webm");
    assert.equal(allowed.headers.get("Cache-Control"), "private, no-store");

    // Team viewer canAccessLead but is not assignee → Forbidden
    const teamViewer = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(OTHER_AGENT, { canSeeTeamLeads: true }),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(teamViewer.status, 403);
    assert.deepEqual(await teamViewer.json(), { error: "Forbidden" });

    // Former assignee after reassignment → Forbidden (even with team scope)
    world.assignedAgentId = OTHER_AGENT;
    const former = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(FORMER_AGENT, { canSeeTeamLeads: true }),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(former.status, 403);

    // Cross-workspace membership → Not found (access gate)
    world.assignedAgentId = AGENT;
    world.leadWorkspaceId = OTHER_WS;
    const crossWs = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(AGENT, { workspaceId: WS, canSeeTeamLeads: true }),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(crossWs.status, 404);

    // Unassigned lead → Forbidden for team viewer
    world.leadWorkspaceId = WS;
    world.assignedAgentId = null;
    const unassigned = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(OTHER_AGENT, { canSeeTeamLeads: true }),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(unassigned.status, 403);

    // CRM not allowed → Not found
    world.assignedAgentId = AGENT;
    const noCrm = await loadAgentLeadVoiceAttachmentAudio(
      db,
      stubCtx(AGENT, {
        workspaceId: WS,
        isWorkspaceCrmAllowed: false,
        canSeeTeamLeads: true,
      }),
      LEAD,
      MSG,
      ATT,
    );
    assert.equal(noCrm.status, 404);
  });
}

async function testCustomerPlaybackAuth() {
  await withStorage(async (objectKey) => {
    const attachmentRow = {
      id: ATT,
      workspaceId: WS,
      messageId: MSG,
      kind: "VOICE_NOTE" as const,
      objectKey,
      mimeType: "audio/webm",
      byteSize: 64,
      durationMs: 2000,
      sortOrder: 0,
      createdAt: new Date("2026-10-10T12:00:00.000Z"),
      revokedAt: null,
    };

    const db = {
      conversation: {
        findUnique: async () => ({
          id: CONV,
          workspaceId: WS,
          leadId: LEAD,
          status: "OPEN",
          lastMessageAt: null,
          createdAt: new Date("2026-10-10T12:00:00.000Z"),
        }),
      },
      message: {
        findFirst: async () => ({ id: MSG }),
      },
      messageAttachment: {
        findFirst: async () => attachmentRow,
        findMany: async () => [attachmentRow],
      },
    };

    const ownerLead = {
      ok: true as const,
      workspaceId: WS,
      workspaceSlug: "houzzat",
      customerUserId: "cust_1",
      customerDisplayName: "Customer",
      customerEmail: "c@example.com",
      leadId: LEAD,
      assignedAgentId: AGENT,
      assignmentState: "ASSIGNED" as const,
      assignedAgentEligible: true,
      leadExisted: true,
      leadCreated: false,
      canSend: true,
    };

    const ownerOk = await handleCustomerConversationVoiceAudioGet(
      new Request("http://localhost/audio"),
      MSG,
      ATT,
      {
        db: db as never,
        requireSendAccess: async () =>
          ({
            ok: true as const,
            user: {
              id: "cust_1",
              email: "c@example.com",
              name: "Customer",
              role: "BUYER",
            },
          }) as never,
        resolveCustomerChatLead: async () => ownerLead,
      },
    );
    assert.equal(ownerOk.status, 200);

    const unrelated = await handleCustomerConversationVoiceAudioGet(
      new Request("http://localhost/audio"),
      MSG,
      ATT,
      {
        db: db as never,
        requireSendAccess: async () =>
          ({
            ok: true as const,
            user: {
              id: "cust_other",
              email: "other@example.com",
              name: "Other",
              role: "BUYER",
            },
          }) as never,
        resolveCustomerChatLead: async () => ({
          ok: false as const,
          reason: "LEAD_NOT_FOUND" as const,
        }),
      },
    );
    assert.equal(unrelated.status, 404);

    const nonConsumer = await handleCustomerConversationVoiceAudioGet(
      new Request("http://localhost/audio"),
      MSG,
      ATT,
      {
        db: db as never,
        requireSendAccess: async () =>
          ({
            ok: true as const,
            user: {
              id: "agent_x",
              email: "a@example.com",
              name: "Agent",
              role: "AGENT",
            },
          }) as never,
        resolveCustomerChatLead: async () => ownerLead,
      },
    );
    assert.equal(nonConsumer.status, 404);
  });
}

function testUploadStillAssigneeGated() {
  const src = read("src/lib/conversations/agent-conversation-voice.ts");
  const upload = src.slice(
    src.indexOf("export async function sendAgentLeadVoiceNote"),
    src.indexOf("export async function loadAgentLeadVoiceAttachmentAudio"),
  );
  assert.ok(upload.includes("lead.assignedAgentId !== ctx.user.id"));
  assert.ok(upload.includes("status: 403"));
  // Ensure we did not remove the upload function symbol used by routes
  assert.equal(typeof sendAgentLeadVoiceNote, "function");
}

async function main() {
  testSourcePolicy();
  testUploadStillAssigneeGated();
  await testAgentPlaybackAuth();
  await testCustomerPlaybackAuth();
  console.log("agent-conversation-voice-auth-selftest: ok");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
