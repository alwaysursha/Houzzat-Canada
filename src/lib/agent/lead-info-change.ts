/**
 * Material Lead / customer-profile diffs for "Lead Info Updated".
 * Semantic compare only — blanks do not erase canonical values,
 * E.164/normalization no-ops are not changes.
 */
import type { PrismaClient } from "@prisma/client";
import {
  resolveDisplayedLeadClassification,
  type LeadClassificationFields,
} from "@/lib/agent/lead-classification";
import { normalizeLeadEmail } from "@/lib/agent/lead-identity";
import { emailAddressChangeVerificationPatch } from "@/lib/auth/verify-email-nudge";
import {
  normalizeToE164,
  parsePhoneColumnsForWrite,
  type PhoneColumnsForWrite,
} from "@/lib/sms/e164";

export const MATERIAL_LEAD_INFO_FIELDS = [
  "name",
  "email",
  "cellphone",
  "homeAddress",
  "buyer_interest",
  "seller_interest",
] as const;

export type MaterialLeadInfoKind =
  | "name"
  | "email"
  | "cellphone"
  | "homeAddress"
  | "buyer_interest"
  | "seller_interest";

export type MaterialLeadInfoChange = {
  kind: MaterialLeadInfoKind;
  label: string;
};

export type CanonicalCustomerSnapshot = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  phoneE164: string | null;
  homeAddress: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
};

export type CanonicalCustomerIncoming = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  homeAddress?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
};

export type CanonicalCustomerPatch = {
  data: {
    name?: string;
    email?: string;
    emailVerified?: Date | null;
    emailUpdateRequestedAt?: Date | null;
    emailVerifyNudgeDueAt?: Date | null;
    emailVerifyNudgeSentAt?: Date | null;
    phone?: string | null;
    phoneE164?: string | null;
    phoneVerifiedAt?: Date | null;
    phoneUpdateRequestedAt?: Date | null;
    homeAddress?: string;
    homeLat?: number | null;
    homeLng?: number | null;
  };
  changes: MaterialLeadInfoChange[];
  emailConflictCandidate: string | null;
  phoneError: string | null;
};

function collapseText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function semanticTextEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return collapseText(a).toLowerCase() === collapseText(b).toLowerCase();
}

export function composeCustomerDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback?: string | null,
): string {
  const composed = `${firstName ?? ""} ${lastName ?? ""}`
    .replace(/\s+/g, " ")
    .trim();
  if (composed) return composed;
  return collapseText(fallback);
}

export function splitCustomerDisplayName(name: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = collapseText(name);
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(" ");
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export function phonesSemanticallyEqual(
  current: { phone?: string | null; phoneE164?: string | null },
  incoming: string | null | undefined,
): boolean {
  const nextRaw = collapseText(incoming);
  if (!nextRaw) return true;
  const nextE164 = normalizeToE164(nextRaw);
  const currentE164 =
    current.phoneE164?.trim() || normalizeToE164(current.phone);
  if (nextE164 && currentE164) return nextE164 === currentE164;
  return semanticTextEqual(current.phone, nextRaw);
}

export function incomingCustomerName(
  incoming: CanonicalCustomerIncoming,
): string | null {
  const composed = composeCustomerDisplayName(
    incoming.firstName,
    incoming.lastName,
    incoming.name,
  );
  return composed || null;
}

export function diffLeadClassificationChanges(
  before: LeadClassificationFields,
  after: LeadClassificationFields,
): MaterialLeadInfoChange[] {
  const prev = resolveDisplayedLeadClassification(before);
  const next = resolveDisplayedLeadClassification(after);
  const changes: MaterialLeadInfoChange[] = [];
  if (!prev.isSeller && next.isSeller) {
    changes.push({ kind: "seller_interest", label: "Seller interest added" });
  }
  if (!prev.isBuyer && next.isBuyer) {
    changes.push({ kind: "buyer_interest", label: "Buyer interest added" });
  }
  return changes;
}

export function dedupeLeadInfoChanges(
  changes: MaterialLeadInfoChange[],
): MaterialLeadInfoChange[] {
  const seen = new Set<MaterialLeadInfoKind>();
  const out: MaterialLeadInfoChange[] = [];
  for (const change of changes) {
    if (seen.has(change.kind)) continue;
    seen.add(change.kind);
    out.push(change);
  }
  return out;
}

export function formatLeadInfoUpdatedSummary(
  clientLabel: string,
  changeLabels: string[],
): string {
  const who = collapseText(clientLabel) || "A client";
  const what = changeLabels.filter(Boolean).join(", ");
  if (!what) return `${who} updated their lead information.`;
  return `${who} updated their lead information: ${what}.`;
}

export function leadInfoChangeLabels(
  changes: MaterialLeadInfoChange[],
): string[] {
  return dedupeLeadInfoChanges(changes).map((row) => row.label);
}

/**
 * Build a Prisma User patch that never overwrites good values with blanks
 * and ignores semantic no-ops (case, whitespace, E.164 equivalent phones).
 */
export function buildCanonicalCustomerPatch(
  current: CanonicalCustomerSnapshot,
  incoming: CanonicalCustomerIncoming,
): CanonicalCustomerPatch {
  const data: CanonicalCustomerPatch["data"] = {};
  const changes: MaterialLeadInfoChange[] = [];
  let emailConflictCandidate: string | null = null;
  let phoneError: string | null = null;

  const nextName = incomingCustomerName(incoming);
  if (nextName && !semanticTextEqual(current.name, nextName)) {
    data.name = nextName;
    changes.push({ kind: "name", label: "Name updated" });
  }

  const nextEmail = normalizeLeadEmail(incoming.email);
  if (nextEmail && nextEmail !== current.email.trim().toLowerCase()) {
    emailConflictCandidate = nextEmail;
    data.email = nextEmail;
    data.emailUpdateRequestedAt = null;
    Object.assign(data, emailAddressChangeVerificationPatch(new Date()));
    changes.push({
      kind: "email",
      label: current.email?.trim() ? "Email updated" : "Email added",
    });
  }

  if (incoming.phone !== undefined) {
    const nextPhone = collapseText(incoming.phone);
    if (nextPhone) {
      if (!phonesSemanticallyEqual(current, nextPhone)) {
        const parsed = parsePhoneColumnsForWrite(nextPhone);
        if (!parsed.ok) {
          phoneError = parsed.error;
        } else {
          Object.assign(data, parsed.columns as PhoneColumnsForWrite);
          data.phoneUpdateRequestedAt = null;
          data.phoneVerifiedAt = null;
          changes.push({
            kind: "cellphone",
            label: current.phone?.trim()
              ? "Cellphone updated"
              : "Cellphone added",
          });
        }
      }
    }
  }

  const nextAddress = collapseText(incoming.homeAddress);
  if (nextAddress && !semanticTextEqual(current.homeAddress, nextAddress)) {
    data.homeAddress = nextAddress;
    changes.push({
      kind: "homeAddress",
      label: current.homeAddress?.trim()
        ? "Home address updated"
        : "Home address added",
    });
  }

  if (incoming.homeLat != null && incoming.homeLng != null) {
    const latChanged = current.homeLat !== incoming.homeLat;
    const lngChanged = current.homeLng !== incoming.homeLng;
    if (latChanged || lngChanged) {
      data.homeLat = incoming.homeLat;
      data.homeLng = incoming.homeLng;
    }
  }

  return {
    data,
    changes: dedupeLeadInfoChanges(changes),
    emailConflictCandidate,
    phoneError,
  };
}

export type ApplyCanonicalCustomerContactResult =
  | { ok: true; changes: MaterialLeadInfoChange[]; applied: boolean }
  | { ok: false; error: string; status: 400 | 409 };

export async function applyCanonicalCustomerContact(
  db: Pick<PrismaClient, "user">,
  userId: string,
  incoming: CanonicalCustomerIncoming,
): Promise<ApplyCanonicalCustomerContactResult> {
  const current = await db.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      phoneE164: true,
      homeAddress: true,
      homeLat: true,
      homeLng: true,
      workspaceId: true,
    },
  });
  if (!current) {
    return { ok: false, error: "Not found", status: 409 };
  }

  const patch = buildCanonicalCustomerPatch(current, incoming);
  if (patch.phoneError) {
    return { ok: false, error: patch.phoneError, status: 400 };
  }

  if (
    patch.emailConflictCandidate &&
    patch.emailConflictCandidate !== current.email.trim().toLowerCase()
  ) {
    const taken = await db.user.findFirst({
      where: {
        email: patch.emailConflictCandidate,
        workspaceId: current.workspaceId,
      },
      select: { id: true },
    });
    if (taken && taken.id !== userId) {
      return {
        ok: false,
        error: "That email is already in use.",
        status: 409,
      };
    }
  }

  if (Object.keys(patch.data).length === 0) {
    return { ok: true, changes: [], applied: false };
  }

  await db.user.update({
    where: { id: userId },
    data: patch.data,
  });

  return { ok: true, changes: patch.changes, applied: true };
}
