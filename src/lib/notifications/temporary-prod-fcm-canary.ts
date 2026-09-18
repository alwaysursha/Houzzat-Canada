/**
 * TEMPORARY PRODUCTION FCM CANARY
 *
 * One-shot notification-only diagnostic for Ask #40 follow-up.
 * Remove in the next ask after a successful production invocation.
 *
 * Does not mutate Chat transcript, Lead, assignment, or staff prefs.
 * Allowed effects: FCM HTTP + existing UNREGISTERED token cleanup inside
 * deliverPushToUsersNow.
 */
import { createHash } from "node:crypto";
import { HOUZZAT_WORKSPACE_SLUG } from "@/lib/crm-ownership";
import {
  audienceForPushType,
  isPushTypeEnabled,
  shellForAudience,
} from "@/lib/notifications/catalog";
import {
  deliverPushToUsersNow,
  isFirebaseServiceAccountReady,
  type PushDeliveryResult,
} from "@/lib/notifications/push";
import { prisma } from "@/lib/prisma";
import type { PushPayload } from "@/lib/notifications/push";

export const TEMPORARY_PROD_FCM_CANARY_MARK =
  "TEMPORARY PRODUCTION FCM CANARY";

export const TEMPORARY_PROD_FCM_CANARY_CONFIRM =
  "temporary-prod-fcm-canary";

export const TEMPORARY_PROD_FCM_CANARY_AGENT_EMAIL =
  "agent@houzzat.ca";
export const TEMPORARY_PROD_FCM_CANARY_LEAD_ID =
  "cmsgv826x0008psp7jzcfjk3j";
export const TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID =
  "cmu5yrsiy00070agmmv3hdgv5";
export const TEMPORARY_PROD_FCM_CANARY_EXPECTED_MESSAGE_COUNT = 6;
export const TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY =
  "Production agent push test";

export const TEMPORARY_PROD_FCM_CANARY_PAYLOAD: PushPayload = {
  type: "chat_message",
  title: "HouzzatPRO push test",
  body: "FCM delivery test",
  href: `/agent/chats?lead=${TEMPORARY_PROD_FCM_CANARY_LEAD_ID}`,
};

export const TEMPORARY_PROD_FCM_CANARY_ONESHOT_IDENTIFIER =
  "temporary-prod-fcm-canary:chat_message";

export const TEMPORARY_PROD_FCM_CANARY_ONESHOT_TOKEN = createHash("sha256")
  .update("temporary-prod-fcm-canary:chat_message:consumed")
  .digest("hex");

export const FORBIDDEN_FCM_CANARY_CLIENT_KEYS = [
  "workspaceId",
  "workspace",
  "leadId",
  "conversationId",
  "recipientId",
  "recipient",
  "userId",
  "email",
  "agentEmail",
  "title",
  "body",
  "href",
  "type",
  "shell",
  "deviceToken",
  "token",
  "pushToken",
] as const;

export type TemporaryProdFcmCanaryMode = "dry-run" | "send";

export type TemporaryProdFcmCanaryBody = {
  mode: TemporaryProdFcmCanaryMode;
  confirm: string;
};

export type TemporaryProdFcmCanaryStatus =
  | "dry-run"
  | "sent"
  | "failed"
  | "already_sent"
  | "blocked"
  | "firebase_not_configured";

export type TemporaryProdFcmCanaryResult = {
  ok: boolean;
  status: TemporaryProdFcmCanaryStatus;
  devices: number | null;
  sent: number | null;
  failed: number | null;
  skipped: number | null;
  unregistered: number | null;
  error?: string;
};

export type TemporaryProdFcmCanaryAuthInput = {
  authenticated: boolean;
  role: string | null;
  trustedOrigin: boolean;
};

export type TemporaryProdFcmCanarySnapshot = {
  houzzatWorkspaceId: string;
  houzzatWorkspaceActive: boolean;
  lead: {
    id: string;
    workspaceId: string | null;
    assignedAgentId: string | null;
  } | null;
  conversation: {
    id: string;
    workspaceId: string;
    leadId: string;
  } | null;
  messages: Array<{ id: string; body: string | null; createdAt: Date }>;
  agent: {
    id: string;
    disabledAt: Date | null;
    pushNotificationPrefs: unknown;
    agentProfileActive: boolean | null;
  } | null;
  houzzatproDeviceCount: number;
};

export type TemporaryProdFcmCanaryDeps = {
  isProductionRuntime?: () => boolean;
  isFirebaseReady?: () => boolean;
  loadSnapshot?: () => Promise<TemporaryProdFcmCanarySnapshot>;
  claimOneShot?: () => Promise<"claimed" | "already">;
  deliverPushToUsersNow?: typeof deliverPushToUsersNow;
};

const ID_PREFIX_LEN = 8;

function idPrefix(id: string): string {
  return id.slice(0, ID_PREFIX_LEN);
}

export function isTemporaryProdFcmCanaryProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function authorizeTemporaryProdFcmCanary(
  input: TemporaryProdFcmCanaryAuthInput,
): { ok: true } | { ok: false; status: 401 | 403; reason: string } {
  if (!input.authenticated) {
    return { ok: false, status: 401, reason: "unauthenticated" };
  }
  if (input.role !== "ADMIN") {
    return { ok: false, status: 403, reason: "platform_admin_required" };
  }
  if (!input.trustedOrigin) {
    return { ok: false, status: 403, reason: "untrusted_origin" };
  }
  return { ok: true };
}

export function parseTemporaryProdFcmCanaryBody(
  raw: unknown,
):
  | { ok: true; value: TemporaryProdFcmCanaryBody }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "mode" && key !== "confirm") {
      return { ok: false, error: `Rejected client key: ${key}` };
    }
  }
  for (const key of FORBIDDEN_FCM_CANARY_CLIENT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      return { ok: false, error: `Rejected client targeting key: ${key}` };
    }
  }
  if (record.confirm !== TEMPORARY_PROD_FCM_CANARY_CONFIRM) {
    return {
      ok: false,
      error: `confirm must be "${TEMPORARY_PROD_FCM_CANARY_CONFIRM}"`,
    };
  }
  if (record.mode !== "dry-run" && record.mode !== "send") {
    return { ok: false, error: 'mode must be "dry-run" or "send"' };
  }
  return {
    ok: true,
    value: {
      mode: record.mode,
      confirm: TEMPORARY_PROD_FCM_CANARY_CONFIRM,
    },
  };
}

export function formatTemporaryProdFcmCanaryLog(
  userId: string,
  result: Pick<
    PushDeliveryResult,
    | "status"
    | "deviceCount"
    | "sentCount"
    | "failedCount"
    | "skippedCount"
    | "unregisteredCount"
  >,
): string {
  const prefix = idPrefix(userId);
  if (typeof result.deviceCount !== "number") {
    return `[push:canary] chat_message result userPrefix=${prefix} shell=houzzatpro status=${result.status}`;
  }
  return `[push:canary] chat_message result userPrefix=${prefix} shell=houzzatpro devices=${result.deviceCount} sent=${result.sentCount ?? 0} failed=${result.failedCount ?? 0} skipped=${result.skippedCount ?? 0} unregistered=${result.unregisteredCount ?? 0} status=${result.status}`;
}

function emptyCounts(): Pick<
  TemporaryProdFcmCanaryResult,
  "devices" | "sent" | "failed" | "skipped" | "unregistered"
> {
  return {
    devices: null,
    sent: null,
    failed: null,
    skipped: null,
    unregistered: null,
  };
}

function blocked(
  error: string,
): TemporaryProdFcmCanaryResult {
  return { ok: false, status: "blocked", ...emptyCounts(), error };
}

function countsFromRow(
  row: PushDeliveryResult | undefined,
): Pick<
  TemporaryProdFcmCanaryResult,
  "devices" | "sent" | "failed" | "skipped" | "unregistered"
> {
  if (!row || typeof row.deviceCount !== "number") return emptyCounts();
  return {
    devices: row.deviceCount,
    sent: row.sentCount ?? null,
    failed: row.failedCount ?? null,
    skipped: row.skippedCount ?? null,
    unregistered: row.unregisteredCount ?? null,
  };
}

export async function defaultLoadTemporaryProdFcmCanarySnapshot(): Promise<TemporaryProdFcmCanarySnapshot> {
  const [workspace, lead, conversation, agent] = await Promise.all([
    prisma.workspace.findUnique({
      where: { slug: HOUZZAT_WORKSPACE_SLUG },
      select: { id: true, status: true },
    }),
    prisma.lead.findUnique({
      where: { id: TEMPORARY_PROD_FCM_CANARY_LEAD_ID },
      select: {
        id: true,
        workspaceId: true,
        assignedAgentId: true,
      },
    }),
    prisma.conversation.findUnique({
      where: { id: TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID },
      select: { id: true, workspaceId: true, leadId: true },
    }),
    prisma.user.findUnique({
      where: { email: TEMPORARY_PROD_FCM_CANARY_AGENT_EMAIL },
      select: {
        id: true,
        disabledAt: true,
        pushNotificationPrefs: true,
        agentProfile: { select: { active: true } },
      },
    }),
  ]);

  const messages = conversation
    ? await prisma.message.findMany({
        where: { conversationId: conversation.id },
        select: { id: true, body: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const houzzatproDeviceCount = agent
    ? await prisma.pushDevice.count({
        where: { userId: agent.id, shell: "houzzatpro" },
      })
    : 0;

  return {
    houzzatWorkspaceId: workspace?.id ?? "",
    houzzatWorkspaceActive: workspace?.status === "ACTIVE",
    lead,
    conversation,
    messages,
    agent: agent
      ? {
          id: agent.id,
          disabledAt: agent.disabledAt,
          pushNotificationPrefs: agent.pushNotificationPrefs,
          agentProfileActive: agent.agentProfile?.active ?? null,
        }
      : null,
    houzzatproDeviceCount,
  };
}

export async function defaultClaimTemporaryProdFcmCanaryOneShot(): Promise<
  "claimed" | "already"
> {
  const existing = await prisma.verificationToken.findUnique({
    where: { token: TEMPORARY_PROD_FCM_CANARY_ONESHOT_TOKEN },
    select: { identifier: true },
  });
  if (
    existing?.identifier === TEMPORARY_PROD_FCM_CANARY_ONESHOT_IDENTIFIER
  ) {
    return "already";
  }
  try {
    await prisma.verificationToken.create({
      data: {
        identifier: TEMPORARY_PROD_FCM_CANARY_ONESHOT_IDENTIFIER,
        token: TEMPORARY_PROD_FCM_CANARY_ONESHOT_TOKEN,
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    return "claimed";
  } catch {
    return "already";
  }
}

export function evaluateTemporaryProdFcmCanaryBaseline(
  snapshot: TemporaryProdFcmCanarySnapshot,
): { ok: true; agentId: string } | { ok: false; error: string } {
  if (!snapshot.houzzatWorkspaceId || !snapshot.houzzatWorkspaceActive) {
    return { ok: false, error: "workspace_mismatch" };
  }
  const lead = snapshot.lead;
  if (!lead || lead.id !== TEMPORARY_PROD_FCM_CANARY_LEAD_ID) {
    return { ok: false, error: "lead_mismatch" };
  }
  if (lead.workspaceId !== snapshot.houzzatWorkspaceId) {
    return { ok: false, error: "workspace_mismatch" };
  }
  const conversation = snapshot.conversation;
  if (
    !conversation ||
    conversation.id !== TEMPORARY_PROD_FCM_CANARY_CONVERSATION_ID ||
    conversation.leadId !== TEMPORARY_PROD_FCM_CANARY_LEAD_ID ||
    conversation.workspaceId !== snapshot.houzzatWorkspaceId
  ) {
    return { ok: false, error: "conversation_mismatch" };
  }
  if (
    snapshot.messages.length !== TEMPORARY_PROD_FCM_CANARY_EXPECTED_MESSAGE_COUNT
  ) {
    return { ok: false, error: "message_count_mismatch" };
  }
  const expectedBodyCount = snapshot.messages.filter(
    (row) => row.body === TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY,
  ).length;
  if (expectedBodyCount !== 1) {
    return { ok: false, error: "expected_body_count_mismatch" };
  }
  const latest = snapshot.messages[0];
  if (latest?.body !== TEMPORARY_PROD_FCM_CANARY_EXPECTED_LATEST_BODY) {
    return { ok: false, error: "latest_message_mismatch" };
  }
  const agent = snapshot.agent;
  if (!agent) {
    return { ok: false, error: "assignment_mismatch" };
  }
  if (lead.assignedAgentId !== agent.id) {
    return { ok: false, error: "assignment_mismatch" };
  }
  if (agent.disabledAt || agent.agentProfileActive === false) {
    return { ok: false, error: "agent_disabled" };
  }
  if (!isPushTypeEnabled(agent.pushNotificationPrefs, "chat_message")) {
    return { ok: false, error: "pref_off" };
  }
  if (snapshot.houzzatproDeviceCount < 1) {
    return { ok: false, error: "no_device" };
  }
  const audience = audienceForPushType("chat_message");
  const shell = shellForAudience(audience);
  if (audience !== "staff" || shell !== "houzzatpro") {
    return { ok: false, error: "shell_mismatch" };
  }
  return { ok: true, agentId: agent.id };
}

export async function runTemporaryProdFcmCanary(
  input: TemporaryProdFcmCanaryBody,
  deps: TemporaryProdFcmCanaryDeps = {},
): Promise<TemporaryProdFcmCanaryResult> {
  const isProduction =
    deps.isProductionRuntime ?? isTemporaryProdFcmCanaryProductionRuntime;
  const firebaseReady = deps.isFirebaseReady ?? isFirebaseServiceAccountReady;
  const loadSnapshot =
    deps.loadSnapshot ?? defaultLoadTemporaryProdFcmCanarySnapshot;
  const claimOneShot =
    deps.claimOneShot ?? defaultClaimTemporaryProdFcmCanaryOneShot;
  const deliver = deps.deliverPushToUsersNow ?? deliverPushToUsersNow;

  if (input.mode === "send" && !isProduction()) {
    return blocked("not_production");
  }

  const snapshot = await loadSnapshot();
  const baseline = evaluateTemporaryProdFcmCanaryBaseline(snapshot);
  if (!baseline.ok) {
    return blocked(baseline.error);
  }

  if (!firebaseReady()) {
    return {
      ok: false,
      status: "firebase_not_configured",
      ...emptyCounts(),
      error: "firebase_not_configured",
    };
  }

  if (input.mode === "dry-run") {
    return {
      ok: true,
      status: "dry-run",
      devices: snapshot.houzzatproDeviceCount,
      sent: null,
      failed: null,
      skipped: null,
      unregistered: null,
    };
  }

  const claimed = await claimOneShot();
  if (claimed === "already") {
    return {
      ok: true,
      status: "already_sent",
      ...emptyCounts(),
      error: "already_sent",
    };
  }

  try {
    const results = await deliver(
      [baseline.agentId],
      TEMPORARY_PROD_FCM_CANARY_PAYLOAD,
    );
    const row = results[0];
    if (row) {
      console.info(formatTemporaryProdFcmCanaryLog(baseline.agentId, row));
    }
    const counts = countsFromRow(row);
    const status = row?.status === "sent" ? "sent" : "failed";
    return {
      ok: status === "sent",
      status,
      ...counts,
    };
  } catch {
    console.info(
      `[push:canary] chat_message result userPrefix=${idPrefix(baseline.agentId)} shell=houzzatpro status=failed`,
    );
    return {
      ok: false,
      status: "failed",
      ...emptyCounts(),
      error: "delivery_threw",
    };
  }
}
