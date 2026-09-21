/**
 * Owner current-profile writes into canonical User + AgentProfile.
 *
 * User = personal identity/contact (name, email, phone, phoneE164).
 * AgentProfile = professional (first/last, RECO, Agent phone display copy).
 * WorkspaceProfessionalIdentity remains public website identity (brokerage +
 * registered agent display) — it is not a second personal profile model.
 *
 * Historical demo/offer/Stripe snapshots are never read here and must not
 * overwrite newer canonical values.
 */

import type { PrismaClient } from "@prisma/client";
import {
  INVALID_CONTACT_PHONE_MESSAGE,
  parsePhoneColumnsForWrite,
} from "@/lib/sms/e164";
import { OwnerActivationError } from "./errors";

export type OwnerCanonicalProfileInput = {
  /** Licensed/registered agent display name from onboarding. */
  agentRegisteredName?: string | null;
  agentCellPhone?: string | null;
  recoLicenseNumber?: string | null;
  recoLicenseExpiresAt?: string | null;
};

type CanonicalDb = Pick<PrismaClient, "user" | "agentProfile">;

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function splitRegisteredName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

function parseRecoExpiry(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== raw) return null;
  return date;
}

/**
 * Apply an authenticated Owner current-profile save to User + AgentProfile.
 * Empty/omitted fields leave existing canonical values in place (draft-safe).
 * Invalid cell fails closed on explicit save; drafts skip unparseable phone.
 */
export async function applyOwnerCanonicalProfileFromCurrentSave(
  db: CanonicalDb,
  userId: string,
  input: OwnerCanonicalProfileInput,
  opts?: { persistAsDraft?: boolean },
): Promise<void> {
  const persistAsDraft = opts?.persistAsDraft === true;
  const displayName = trimmedOrNull(input.agentRegisteredName);
  const cellPhone = trimmedOrNull(input.agentCellPhone);
  const recoLicenseNumber = trimmedOrNull(input.recoLicenseNumber);
  const recoExpiryRaw = trimmedOrNull(input.recoLicenseExpiresAt);

  let phoneColumns: { phone: string; phoneE164: string } | undefined;
  if (cellPhone) {
    const parsed = parsePhoneColumnsForWrite(cellPhone);
    if (!parsed.ok || !parsed.columns.phone || !parsed.columns.phoneE164) {
      if (!persistAsDraft) {
        throw new OwnerActivationError(
          parsed.ok ? INVALID_CONTACT_PHONE_MESSAGE : parsed.error,
          "INVALID_AGENT_CELL",
          400,
        );
      }
    } else {
      phoneColumns = {
        phone: parsed.columns.phone,
        phoneE164: parsed.columns.phoneE164,
      };
    }
  }

  let recoLicenseExpiresAt: Date | undefined;
  if (recoLicenseNumber || recoExpiryRaw) {
    if (recoLicenseNumber && recoExpiryRaw) {
      const parsedExpiry = parseRecoExpiry(recoExpiryRaw);
      if (!parsedExpiry) {
        if (!persistAsDraft) {
          throw new OwnerActivationError(
            "Enter a valid RECO license expiry date.",
            "INVALID_RECO_EXPIRY",
            400,
          );
        }
      } else {
        recoLicenseExpiresAt = parsedExpiry;
      }
    } else if (!persistAsDraft) {
      throw new OwnerActivationError(
        "RECO license # and expiry date must be provided together.",
        "INVALID_RECO_LICENSE",
        400,
      );
    }
  }

  const nameParts = displayName ? splitRegisteredName(displayName) : null;
  const shouldWriteUser = Boolean(displayName || phoneColumns);
  const shouldWriteProfile = Boolean(
    nameParts || phoneColumns || (recoLicenseNumber && recoLicenseExpiresAt),
  );
  if (!shouldWriteUser && !shouldWriteProfile) return;

  if (shouldWriteUser) {
    await db.user.update({
      where: { id: userId },
      data: {
        ...(displayName ? { name: displayName } : {}),
        ...(phoneColumns
          ? { phone: phoneColumns.phone, phoneE164: phoneColumns.phoneE164 }
          : {}),
      },
    });
  }

  if (!shouldWriteProfile) return;

  await db.agentProfile.upsert({
    where: { userId },
    create: {
      userId,
      active: true,
      ...(nameParts
        ? { firstName: nameParts.firstName, lastName: nameParts.lastName }
        : {}),
      ...(phoneColumns ? { phone: phoneColumns.phone } : {}),
      ...(recoLicenseNumber && recoLicenseExpiresAt
        ? { recoLicenseNumber, recoLicenseExpiresAt }
        : {}),
    },
    update: {
      ...(nameParts
        ? { firstName: nameParts.firstName, lastName: nameParts.lastName }
        : {}),
      ...(phoneColumns ? { phone: phoneColumns.phone } : {}),
      ...(recoLicenseNumber && recoLicenseExpiresAt
        ? { recoLicenseNumber, recoLicenseExpiresAt }
        : {}),
    },
  });
}

/** Provisioning-time seed only. Never used to overwrite an existing User phone. */
export function provisioningPhoneSeedFromProspect(
  raw: string | null | undefined,
): { phone: string; phoneE164: string } | null {
  const parsed = parsePhoneColumnsForWrite(raw ?? undefined);
  if (!parsed.ok || !parsed.columns.phone || !parsed.columns.phoneE164) {
    return null;
  }
  return {
    phone: parsed.columns.phone,
    phoneE164: parsed.columns.phoneE164,
  };
}
