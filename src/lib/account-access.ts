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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days left in the post-signup grace window; null when verified or past grace. */
export function getVerifyGraceDaysRemaining(
  user: AccessUser | null | undefined,
): number | null {
  if (!hasVerifyGrace(user)) return null;
  const created = asDate(user?.createdAt ?? null);
  if (!created) return null;
  const remaining = EMAIL_VERIFY_GRACE_MS - (Date.now() - created.getTime());
  if (remaining <= 0) return null;
  return Math.max(1, Math.ceil(remaining / DAY_MS));
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

/**
 * Product access kind for marketing / search / listing gates.
 * Keep visitor “Sign in required” separate from locked “Email verification required”.
 */
export type ClientAccessKind =
  | "visitor"
  | "unverified_unlocked"
  | "unverified_locked"
  | "verified_unlocked";

export type ResolvedClientAccess = {
  kind: ClientAccessKind;
  /** Has a customer session (any of the three signed-in kinds). */
  isSignedIn: boolean;
  /** May view VOW / sold / full client data. */
  hasClientAccess: boolean;
  /** Signed in, past grace, still unverified — show verify gates only. */
  needsEmailVerification: boolean;
};

export function resolveClientAccess(
  user: AccessUser | null | undefined,
): ResolvedClientAccess {
  if (!user?.id) {
    return {
      kind: "visitor",
      isSignedIn: false,
      hasClientAccess: false,
      needsEmailVerification: false,
    };
  }
  if (isEmailVerified(user)) {
    return {
      kind: "verified_unlocked",
      isSignedIn: true,
      hasClientAccess: true,
      needsEmailVerification: false,
    };
  }
  if (hasVerifyGrace(user)) {
    return {
      kind: "unverified_unlocked",
      isSignedIn: true,
      hasClientAccess: true,
      needsEmailVerification: false,
    };
  }
  return {
    kind: "unverified_locked",
    isSignedIn: true,
    hasClientAccess: false,
    needsEmailVerification: true,
  };
}

export type AccessGateSurface =
  | "sold"
  | "details"
  | "insights"
  | "photos"
  | "history"
  | "search"
  | "generic";

export type AccessGateCopy = {
  /** Short title for overlays / chips */
  title: string;
  body: string;
  /** Locked CTA intent — never mix visitor with verify. */
  cta: "sign-in" | "verify";
  /** Short chip / button label */
  ctaLabel: string;
};

/** Site-wide gate copy. Visitor ≠ unverified locked. */
export function accessGateCopy(
  kind: ClientAccessKind | ResolvedClientAccess,
  surface: AccessGateSurface = "generic",
): AccessGateCopy {
  const resolved = typeof kind === "string" ? kind : kind.kind;

  if (resolved === "unverified_locked") {
    const bodies: Record<AccessGateSurface, string> = {
      sold: "Verify your email to unlock sold and leased prices.",
      details: "Verify your email to unlock full listing details.",
      insights: "Verify your email to unlock market insights and estimates.",
      photos: "Verify your email to unlock the full photo gallery.",
      history: "Verify your email to unlock listing history.",
      search: "Verify your email to unlock sold and restricted search results.",
      generic: "Verify your email to restore full client access.",
    };
    return {
      title: "Email verification required",
      body: bodies[surface],
      cta: "verify",
      ctaLabel: "Verify email",
    };
  }

  // Visitor (and any non-client fallback that isn't verify-locked)
  const bodies: Record<AccessGateSurface, string> = {
    sold: "Sign in as a Houzzat client to view sold and leased prices.",
    details: "Sign in as a Houzzat client to view full listing details.",
    insights: "Sign in as a Houzzat client to unlock market insights.",
    photos: "Sign in as a Houzzat client to view the full gallery.",
    history: "Sign in as a Houzzat client to view listing history.",
    search: "Sign in as a Houzzat client to view sold and restricted results.",
    generic: "Sign in as a Houzzat client to unlock this information.",
  };
  return {
    title: "Sign in required",
    body: bodies[surface],
    cta: "sign-in",
    ctaLabel: "Sign in",
  };
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
