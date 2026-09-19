import { NextResponse } from "next/server";
import {
  hasTwilioWebhookSigningConfig,
  resolveTwilioWebhookAuthTokens,
} from "@/lib/sms/credentials";
import { handleInboundTwilioSms } from "@/lib/sms/inbound";
import { emptyTwiml } from "@/lib/sms/keywords";
import {
  parseTwilioFormBody,
  validateTwilioRequestSignatureWithTokens,
} from "@/lib/sms/signature";
import { resolveTwilioInboundWebhookUrl } from "@/lib/sms/transport";

export const runtime = "nodejs";

function logInbound(event: string) {
  console.info(`[sms:inbound]`, { event });
}

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
    },
  });
}

export async function POST(request: Request) {
  if (!hasTwilioWebhookSigningConfig()) {
    logInbound("unconfigured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const rawBody = await request.text();
  const params = parseTwilioFormBody(rawBody);
  const signature = request.headers.get("x-twilio-signature");
  const url = resolveTwilioInboundWebhookUrl();
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
    logInbound("invalid_signature");
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const result = await handleInboundTwilioSms({
    MessageSid: params.MessageSid,
    SmsSid: params.SmsSid,
    AccountSid: params.AccountSid,
    From: params.From,
    To: params.To,
    Body: params.Body,
  });
  logInbound(result.outcome);
  return twimlResponse(result.twiml || emptyTwiml());
}
