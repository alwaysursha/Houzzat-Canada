import {
  hasFullClientAccess,
  type AccessUser,
} from "@/lib/account-access";

export const VOW_VERSION = "2026-07-1";

export const VOW_SUMMARY =
  "Registering with Houzzat makes you a Houzzat client. Clients may view sold and leased prices and listing history under Virtual Office Website (VOW) terms. Your registration is recorded for board compliance.";

/** Short public note for sold locks — plain language, not full legal text. */
export const VOW_PUBLIC_NOTE =
  "Sold and leased prices and listing history are restricted under TRREB Virtual Office Website (VOW) rules. Canadian privacy law and board policy require this information to be shown only to registered brokerage clients — not to guests browsing the public site.";

/**
 * Registered Houzzat clients with verified email (or within the 7-day grace)
 * may view sold prices and listing history. Guests and locked accounts see
 * IDX-level public fields only.
 */
export function hasClientAccess(user: AccessUser | null | undefined): boolean {
  return hasFullClientAccess(user);
}

/** @deprecated Prefer hasClientAccess — kept as alias during migration. */
export function hasVowAccess(
  user:
    | (AccessUser & {
        vowAcceptedAt?: Date | null;
        vowVersion?: string | null;
      })
    | null
    | undefined,
) {
  return hasClientAccess(user);
}
