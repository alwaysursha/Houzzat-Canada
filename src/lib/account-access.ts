/** Full product access for 7 days after signup without email verification. */
export const EMAIL_VERIFY_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export type AccessUser = {
  id: string;
  emailVerified?: Date | string | null;
  createdAt?: Date | string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function isEmailVerified(user: AccessUser | null | undefined): boolean {
  return Boolean(asDate(user?.emailVerified ?? null));
}

/** Unverified but still inside the post-signup grace window. */
export function hasVerifyGrace(user: AccessUser | null | undefined): boolean {
  if (!user?.id || isEmailVerified(user)) return false;
  const created = asDate(user.createdAt ?? null);
  if (!created) return false;
  return Date.now() - created.getTime() < EMAIL_VERIFY_GRACE_MS;
}

/** Signed-in client with verified email or active grace. */
export function hasFullClientAccess(
  user: AccessUser | null | undefined,
): boolean {
  if (!user?.id) return false;
  return isEmailVerified(user) || hasVerifyGrace(user);
}

/** Signed in but past grace and still unverified — product lock. */
export function needsEmailVerification(
  user: AccessUser | null | undefined,
): boolean {
  return Boolean(user?.id) && !hasFullClientAccess(user);
}

/** CRM / agent badge for account email lock state. */
export type AccountAccessStatus =
  | "verified_unlocked"
  | "unverified_unlocked"
  | "unverified_locked";

export function getAccountAccessStatus(user: {
  emailVerified?: Date | string | null;
  createdAt?: Date | string | null;
}): AccountAccessStatus {
  if (Boolean(asDate(user.emailVerified ?? null))) return "verified_unlocked";
  const created = asDate(user.createdAt ?? null);
  if (created && Date.now() - created.getTime() < EMAIL_VERIFY_GRACE_MS) {
    return "unverified_unlocked";
  }
  return "unverified_locked";
}

export function accountAccessStatusLabel(
  status: AccountAccessStatus,
): string {
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
