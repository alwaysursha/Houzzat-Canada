import { NextResponse } from "next/server";
import {
  hasTwilioWebhookSigningConfig,
  resolveTwilioWebhookAuthTokens,
} from "@/lib/sms/credentials";
import { applyTwilioStatusCallback } from "@/lib/sms/status-callback";
import {
  parseTwilioFormBody,
  validateTwilioRequestSignatureWithTokens,
} from "@/lib/sms/signature";
import { resolveTwilioStatusCallbackUrl } from "@/lib/sms/transport";

export const runtime = "nodejs";

function logStatus(event: string, fields: Record<string, unknown> = {}) {
  console.info(`[sms:status]`, { event, ...fields });
}

export async function POST(request: Request) {
  if (!hasTwilioWebhookSigningConfig()) {
    logStatus("unconfigured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const rawBody = await request.text();
  const params = parseTwilioFormBody(rawBody);
  const signature = request.headers.get("x-twilio-signature");
  const url = resolveTwilioStatusCallbackUrl();
  const tokens = resolveTwilioWebhookAuthTokens({
    accountSid: params.AccountSid,
    signatureKeySid: request.headers.get("x-twilio-signature-key-sid"),
  });
  if (
    !url ||
    !validateTwilioRequestSignatureWithTokens({
      authTokens: tokens,
      signature,
      url,
      params,
    })
  ) {
    logStatus("invalid_signature");
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const result = await applyTwilioStatusCallback({
    MessageSid: params.MessageSid,
    MessageStatus: params.MessageStatus,
    SmsSid: params.SmsSid,
    SmsStatus: params.SmsStatus,
    NumSegments: params.NumSegments,
  });
  if (result === "unknown") {
    logStatus("unknown_sid");
  } else {
    logStatus(result);
  }
  return NextResponse.json({ ok: true });
}
