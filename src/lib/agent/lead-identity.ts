/**
 * Workspace-scoped person matching for Lead intake.
 * Never dedupes across Workspaces. Fail closed on ambiguity.
 */
import { normalizeToE164 } from "@/lib/sms/e164";

export const LEAD_IDENTITY_SENTINEL_EMAILS = new Set([
  "pending@houzzat.ca",
]);

export class AmbiguousLeadIdentityError extends Error {
  readonly code = "AMBIGUOUS_LEAD_IDENTITY" as const;

  constructor(message = "This contact matches more than one person in this workspace.") {
    super(message);
    this.name = "AmbiguousLeadIdentityError";
  }
}

export function isAmbiguousLeadIdentityError(
  error: unknown,
): error is AmbiguousLeadIdentityError {
  return error instanceof AmbiguousLeadIdentityError;
}

export function normalizeLeadEmail(
  raw: string | null | undefined,
): string | null {
  const email = raw?.trim().toLowerCase() || null;
  if (!email || !email.includes("@")) return null;
  if (LEAD_IDENTITY_SENTINEL_EMAILS.has(email)) return null;
  return email;
}

export function normalizeLeadPhoneE164(
  raw: string | null | undefined,
): string | null {
  return normalizeToE164(raw);
}

export function identityLockKey(input: {
  workspaceId: string;
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
}): string | null {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) return null;
  if (input.customerId?.trim()) {
    return `${workspaceId}:c:${input.customerId.trim()}`;
  }
  const email = normalizeLeadEmail(input.email);
  if (email) return `${workspaceId}:e:${email}`;
  const phone = normalizeLeadPhoneE164(input.phone);
  if (phone) return `${workspaceId}:p:${phone}`;
  return null;
}
