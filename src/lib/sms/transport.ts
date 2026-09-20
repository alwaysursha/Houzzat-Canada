import { SITE_URL } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { resolveTwilioSubaccountSendCredentials } from "@/lib/sms/credentials";
import { isE164, normalizeToE164 } from "@/lib/sms/e164";
import { parseTwilioNumSegments } from "@/lib/sms/segments";
import { isTwilioSid } from "@/lib/sms/sids";
import { isPhoneSuppressed } from "@/lib/sms/suppression";
import {
  smsClassHonorsStopSuppression,
  type SendSmsInput,
  type SendSmsResult,
  type SmsSkipReason,
} from "@/lib/sms/types";

export type WorkspaceTwilioSendConfig = {
  subaccountSid: string;
  messagingServiceSid: string;
  phoneE164: string | null;
};

export type WorkspaceTwilioResolveResult =
  | { ok: true; config: WorkspaceTwilioSendConfig }
  | { ok: false; reason: Extract<SmsSkipReason, "missing_workspace" | "missing_subaccount" | "missing_messaging_service"> };

export type SmsTransportDeps = {
  fetchImpl?: typeof fetch;
  getCredentials?: (
    subaccountSid: string,
  ) => { sid: string; token: string } | null;
  resolveWorkspaceTwilio?: (
    workspaceId: string,
  ) => Promise<WorkspaceTwilioResolveResult>;
  isSuppressed?: (
    workspaceId: string,
    phoneE164: string,
  ) => Promise<boolean>;
};

/**
 * StatusCallback target. Endpoint is Phase 2; transport supports the field now.
 * TWILIO_STATUS_CALLBACK_URL overrides the conventional webhook path.
 */
export function resolveTwilioStatusCallbackUrl(
  explicit?: string | null,
): string | null {
  if (explicit === null) return null;
  if (typeof explicit === "string") {
    const trimmed = explicit.trim();
    return trimmed || null;
  }
  const fromEnv = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (fromEnv) return fromEnv;
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/twilio/status`;
}

/**
 * Canonical inbound webhook URL used for Twilio signature validation.
 * TWILIO_INBOUND_WEBHOOK_URL must match the public URL Twilio POSTs to.
 */
export function resolveTwilioInboundWebhookUrl(
  explicit?: string | null,
): string | null {
  if (explicit === null) return null;
  if (typeof explicit === "string") {
    const trimmed = explicit.trim();
    return trimmed || null;
  }
  const fromEnv = process.env.TWILIO_INBOUND_WEBHOOK_URL?.trim();
  if (fromEnv) return fromEnv;
  const base = SITE_URL.replace(/\/$/, "");
  return `${base}/api/webhooks/twilio/inbound`;
}

export function workspaceTwilioConfigFromRow(row: {
  twilioSubaccountSid: string | null;
  twilioMessagingServiceSid: string | null;
  twilioPhoneE164: string | null;
} | null): WorkspaceTwilioResolveResult {
  if (!row) return { ok: false, reason: "missing_workspace" };
  if (!isTwilioSid(row.twilioSubaccountSid, "AC")) {
    return { ok: false, reason: "missing_subaccount" };
  }
  if (!isTwilioSid(row.twilioMessagingServiceSid, "MG")) {
    return { ok: false, reason: "missing_messaging_service" };
  }
  return {
    ok: true,
    config: {
      subaccountSid: row.twilioSubaccountSid,
      messagingServiceSid: row.twilioMessagingServiceSid,
      phoneE164: isE164(row.twilioPhoneE164) ? row.twilioPhoneE164 : null,
    },
  };
}

export async function resolveWorkspaceTwilio(
  workspaceId: string | null | undefined,
): Promise<WorkspaceTwilioResolveResult> {
  const id = workspaceId?.trim() || "";
  if (!id) return { ok: false, reason: "missing_workspace" };
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    select: {
      twilioSubaccountSid: true,
      twilioMessagingServiceSid: true,
      twilioPhoneE164: true,
    },
  });
  return workspaceTwilioConfigFromRow(workspace);
}

/**
 * Workspace long-code From only. No shared/global From fallback.
 */
export async function resolveWorkspaceFromE164(
  workspaceId: string | null | undefined,
): Promise<string | null> {
  const resolved = await resolveWorkspaceTwilio(workspaceId);
  if (!resolved.ok) return null;
  return resolved.config.phoneE164;
}

function logSms(event: string, fields: Record<string, unknown>) {
  console.info(`[sms:${event}]`, fields);
}

function logSmsError(event: string, fields: Record<string, unknown>) {
  console.error(`[sms:${event}]`, fields);
}

/**
 * Shared Twilio SMS send. Authenticates as the workspace subaccount
 * (SID + TWILIO_SUBACCOUNT_AUTH_TOKENS). No parent-credential fallback.
 * Returns MessageSid on send. Does not log body, phone numbers, auth
 * tokens, or Twilio errors.
 */
export async function sendSms(
  input: SendSmsInput,
  deps: SmsTransportDeps = {},
): Promise<SendSmsResult> {
  const body = input.body.trim();
  if (!body) {
    logSms("skip", { reason: "empty_body", smsClass: input.smsClass });
    return { status: "skipped", reason: "empty_body" };
  }

  const to = normalizeToE164(input.to);
  if (!to) {
    logSms("skip", { reason: "invalid_to", smsClass: input.smsClass });
    return { status: "skipped", reason: "invalid_to" };
  }

  const resolver = deps.resolveWorkspaceTwilio ?? resolveWorkspaceTwilio;
  const workspaceId = input.workspaceId?.trim() || "";
  const resolved = workspaceId
    ? await resolver(workspaceId)
    : ({ ok: false, reason: "missing_workspace" } as const);
  if (!resolved.ok) {
    logSms("skip", { reason: resolved.reason, smsClass: input.smsClass });
    return { status: "skipped", reason: resolved.reason };
  }

  const credentials = (
    deps.getCredentials ?? resolveTwilioSubaccountSendCredentials
  )(resolved.config.subaccountSid);
  if (!credentials) {
    logSms("stub", { reason: "missing_credentials", smsClass: input.smsClass });
    return { status: "skipped", reason: "missing_credentials" };
  }

  const from =
    (input.fromE164 && isE164(input.fromE164) ? input.fromE164 : null) ??
    resolved.config.phoneE164;
  if (input.fromE164 && !from) {
    logSms("skip", { reason: "invalid_from", smsClass: input.smsClass });
    return { status: "skipped", reason: "invalid_from" };
  }

  if (
    input.workspaceId &&
    smsClassHonorsStopSuppression(input.smsClass)
  ) {
    const suppressed = deps.isSuppressed
      ? await deps.isSuppressed(input.workspaceId, to)
      : await isPhoneSuppressed(input.workspaceId, to);
    if (suppressed) {
      logSms("skip", { reason: "suppressed", smsClass: input.smsClass });
      return { status: "skipped", reason: "suppressed" };
    }
  }

  const params = new URLSearchParams({
    To: to,
    Body: body,
    MessagingServiceSid: resolved.config.messagingServiceSid,
  });
  if (from) {
    params.set("From", from);
  }
  const statusCallback = resolveTwilioStatusCallbackUrl(input.statusCallbackUrl);
  if (statusCallback) {
    params.set("StatusCallback", statusCallback);
  }

  try {
    const auth = Buffer.from(
      `${resolved.config.subaccountSid}:${credentials.token}`,
    ).toString("base64");
    const fetchImpl = deps.fetchImpl ?? fetch;
    const res = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${resolved.config.subaccountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );
    if (!res.ok) {
      logSmsError("failed", {
        httpStatus: res.status,
        smsClass: input.smsClass,
      });
      return { status: "failed" };
    }
    let sid = "";
    let providerStatus = "queued";
    let numSegments: number | null = null;
    try {
      const json = (await res.json()) as {
        sid?: unknown;
        status?: unknown;
        num_segments?: unknown;
      };
      sid = typeof json.sid === "string" ? json.sid : "";
      if (typeof json.status === "string" && json.status.trim()) {
        providerStatus = json.status.trim().toLowerCase();
      }
      numSegments = parseTwilioNumSegments(json.num_segments);
    } catch {
      sid = "";
    }
    if (!sid) {
      logSmsError("failed", { reason: "missing_sid", smsClass: input.smsClass });
      return { status: "failed" };
    }
    logSms("sent", { sid, smsClass: input.smsClass });
    return {
      status: "sent",
      sid,
      providerStatus,
      numSegments,
    };
  } catch {
    logSmsError("failed", { smsClass: input.smsClass });
    return { status: "failed" };
  }
}
