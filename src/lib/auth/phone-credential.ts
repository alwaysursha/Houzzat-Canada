/**
 * CINC-style initial credential: bcrypt(hash) of canonical E.164.
 * Never store plaintext phone in User.password.
 * Legacy accounts keep PasswordCredentialKind.LEGACY and arbitrary passwords.
 */

import bcrypt from "bcryptjs";
import { normalizeToE164 } from "@/lib/sms/e164";

export type PasswordCredentialKindValue = "LEGACY" | "PHONE_E164";

/** Deterministic credential material from a phone — always canonical E.164. */
export function phoneCredentialMaterial(
  phoneRaw: string | null | undefined,
): string | null {
  return normalizeToE164(phoneRaw);
}

export async function hashPhoneCredential(
  phoneRaw: string | null | undefined,
): Promise<{ ok: true; hash: string; phoneE164: string } | { ok: false; error: string }> {
  const phoneE164 = phoneCredentialMaterial(phoneRaw);
  if (!phoneE164) {
    return { ok: false, error: "Enter a valid mobile number." };
  }
  const hash = await bcrypt.hash(phoneE164, 10);
  return { ok: true, hash, phoneE164 };
}

/**
 * Compare a submitted login password against the stored hash.
 * For PHONE_E164 accounts, try canonical E.164 of the input first, then raw.
 * For LEGACY accounts, compare the raw password only (never phone-normalize).
 */
export async function verifyPasswordCredential(input: {
  kind: PasswordCredentialKindValue | null | undefined;
  submitted: string;
  storedHash: string;
}): Promise<boolean> {
  const submitted = input.submitted ?? "";
  if (!submitted || !input.storedHash) return false;

  const kind = input.kind ?? "LEGACY";
  if (kind === "PHONE_E164") {
    const e164 = phoneCredentialMaterial(submitted);
    if (e164 && (await bcrypt.compare(e164, input.storedHash))) return true;
    // Allow typing the already-canonical E.164 or digits that normalize to it.
    return false;
  }

  return bcrypt.compare(submitted, input.storedHash);
}

export async function rehashPhoneCredentialForEdit(
  newPhoneRaw: string | null | undefined,
): Promise<{ ok: true; hash: string; phoneE164: string } | { ok: false; error: string }> {
  return hashPhoneCredential(newPhoneRaw);
}
