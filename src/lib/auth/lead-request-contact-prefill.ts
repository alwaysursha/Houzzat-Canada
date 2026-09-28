import type { LeadRequestKind } from "@/lib/auth/lead-request-intent";

/**
 * Phone the visitor already typed, kept only so the restored request form
 * can show it again. Not a capture intent, not identity, and not verified.
 */
export const LEAD_REQUEST_CONTACT_PREFILL_KEY =
  "houzzat:lead-request-contact-prefill";

export type LeadRequestPhonePrefill = {
  mlsNumber: string;
  kind: LeadRequestKind;
  phone: string;
};

const KINDS: readonly LeadRequestKind[] = [
  "inquiry",
  "showing",
  "virtual_viewing",
];

function isKind(value: unknown): value is LeadRequestKind {
  return typeof value === "string" && KINDS.includes(value as LeadRequestKind);
}

export function leadRequestPhonePrefillRecord(input: {
  mlsNumber: string;
  kind: LeadRequestKind;
  phone: string;
}): LeadRequestPhonePrefill | null {
  const phone = input.phone.trim();
  const mlsNumber = input.mlsNumber.trim();
  if (!phone || !mlsNumber || !isKind(input.kind)) return null;
  return { mlsNumber, kind: input.kind, phone };
}

/** Extra keys make the record unusable so this store cannot carry authority. */
export function phoneFromLeadRequestPrefill(
  raw: string | null,
  mlsNumber: string,
  kind: LeadRequestKind,
): string | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 3 ||
    !keys.includes("mlsNumber") ||
    !keys.includes("kind") ||
    !keys.includes("phone")
  ) {
    return null;
  }
  if (typeof record.mlsNumber !== "string" || typeof record.phone !== "string") {
    return null;
  }
  if (!isKind(record.kind) || record.kind !== kind) return null;
  if (record.mlsNumber.trim().toUpperCase() !== mlsNumber.trim().toUpperCase()) {
    return null;
  }
  const phone = record.phone.trim();
  return phone || null;
}

export function rememberLeadRequestContactPrefill(
  value: {
    mlsNumber: string;
    kind: LeadRequestKind;
    phone: string;
  } | null,
): void {
  if (typeof window === "undefined") return;
  if (!value) {
    sessionStorage.removeItem(LEAD_REQUEST_CONTACT_PREFILL_KEY);
    return;
  }
  const record = leadRequestPhonePrefillRecord(value);
  if (!record) {
    sessionStorage.removeItem(LEAD_REQUEST_CONTACT_PREFILL_KEY);
    return;
  }
  sessionStorage.setItem(
    LEAD_REQUEST_CONTACT_PREFILL_KEY,
    JSON.stringify(record),
  );
}

export function peekLeadRequestContactPrefill(
  mlsNumber: string,
  kind: LeadRequestKind,
): string | null {
  if (typeof window === "undefined") return null;
  return phoneFromLeadRequestPrefill(
    sessionStorage.getItem(LEAD_REQUEST_CONTACT_PREFILL_KEY),
    mlsNumber,
    kind,
  );
}

export function clearLeadRequestContactPrefill(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LEAD_REQUEST_CONTACT_PREFILL_KEY);
}
