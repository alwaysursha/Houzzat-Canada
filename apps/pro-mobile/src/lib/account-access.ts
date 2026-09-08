/**
 * Account email lock status — mirrors src/lib/account-access.ts for native CRM.
 * Keep in sync with web LeadAccountVerifyMenu semantics.
 */

export const EMAIL_VERIFY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type AccountAccessStatus =
  | "verified_unlocked"
  | "unverified_unlocked"
  | "unverified_locked";

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getAccountAccessStatus(user: {
  emailVerified?: Date | string | boolean | null;
  createdAt?: Date | string | null;
}): AccountAccessStatus {
  if (user.emailVerified === true) return "verified_unlocked";
  if (Boolean(asDate(user.emailVerified as Date | string | null))) {
    return "verified_unlocked";
  }
  const created = asDate(user.createdAt ?? null);
  if (created && Date.now() - created.getTime() < EMAIL_VERIFY_GRACE_MS) {
    return "unverified_unlocked";
  }
  return "unverified_locked";
}

export function accountAccessStatusLabel(status: AccountAccessStatus): string {
  switch (status) {
    case "verified_unlocked":
      return "Verified Unlocked";
    case "unverified_unlocked":
      return "Unverified Unlocked";
    case "unverified_locked":
      return "Unverified Locked";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
