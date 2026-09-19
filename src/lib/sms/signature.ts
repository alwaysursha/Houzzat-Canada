import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio request signature (SHA-1 HMAC, Base64).
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function validateTwilioRequestSignature(input: {
  authToken: string;
  signature: string | null | undefined;
  url: string;
  params: Record<string, string>;
}): boolean {
  const authToken = input.authToken.trim();
  const signature = input.signature?.trim() ?? "";
  const url = input.url.trim();
  if (!authToken || !signature || !url) return false;

  const data = Object.keys(input.params)
    .sort()
    .reduce((acc, key) => acc + key + (input.params[key] ?? ""), url);
  const expected = createHmac("sha1", authToken)
    .update(data, "utf8")
    .digest("base64");

  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function validateTwilioRequestSignatureWithTokens(input: {
  authTokens: string[];
  signature: string | null | undefined;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (input.authTokens.length === 0) return false;
  return input.authTokens.some((authToken) =>
    validateTwilioRequestSignature({
      authToken,
      signature: input.signature,
      url: input.url,
      params: input.params,
    }),
  );
}

export function parseTwilioFormBody(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  const search = new URLSearchParams(raw);
  search.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}
