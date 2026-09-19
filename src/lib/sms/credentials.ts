import { normalizeTwilioSid } from "@/lib/sms/sids";

export type TwilioParentCredentials = {
  sid: string;
  token: string;
};

export type TwilioWebhookAuthInput = {
  accountSid?: string | null;
  signatureKeySid?: string | null;
};

/**
 * Parent Twilio account. Authenticates v2010 sends against a workspace
 * subaccount URL. Does not send from the parent and is not used to sign
 * subaccount webhooks.
 */
export function twilioParentCredentials(): TwilioParentCredentials | null {
  const sid = normalizeTwilioSid(process.env.TWILIO_ACCOUNT_SID, "AC");
  const token = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  if (!sid || !token) return null;
  return { sid, token };
}

/**
 * JSON object of subaccount SID → Auth Token. Env-only; never Prisma.
 * Invalid JSON is treated as empty (fail closed for those accounts).
 */
export function parseTwilioSubaccountAuthTokenMap(
  raw: string | null | undefined = process.env.TWILIO_SUBACCOUNT_AUTH_TOKENS,
): Record<string, string> {
  const text = raw?.trim() || "";
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const sid = normalizeTwilioSid(key, "AC");
      const token = typeof value === "string" ? value.trim() : "";
      if (sid && token) out[sid] = token;
    }
    return out;
  } catch {
    console.error("[sms:credentials]", { reason: "invalid_subaccount_token_map" });
    return {};
  }
}

export function twilioWebhookSharedKey(): string | null {
  const key = process.env.TWILIO_WEBHOOK_SHARED_KEY?.trim() || "";
  return key || null;
}

export function hasTwilioWebhookSigningConfig(): boolean {
  if (twilioWebhookSharedKey()) return true;
  if (Object.keys(parseTwilioSubaccountAuthTokenMap()).length > 0) return true;
  return Boolean(process.env.TWILIO_AUTH_TOKEN?.trim());
}

/**
 * Signing secrets for a Twilio webhook. Subaccount traffic is signed with
 * that subaccount's Auth Token (or a SharedKey), not the parent token.
 */
export function resolveTwilioWebhookAuthTokens(
  input: TwilioWebhookAuthInput,
): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const push = (token: string | null | undefined) => {
    const value = token?.trim() || "";
    if (!value || seen.has(value)) return;
    seen.add(value);
    tokens.push(value);
  };

  const shared = twilioWebhookSharedKey();
  const signatureKeySid = input.signatureKeySid?.trim() || "";
  if (signatureKeySid && shared) {
    push(shared);
    return tokens;
  }

  const accountSid = normalizeTwilioSid(input.accountSid, "AC");
  if (accountSid) {
    const mapped = parseTwilioSubaccountAuthTokenMap()[accountSid];
    push(mapped);
    const parent = twilioParentCredentials();
    if (parent && accountSid === parent.sid) {
      push(parent.token);
    }
  }

  if (shared) push(shared);
  return tokens;
}
