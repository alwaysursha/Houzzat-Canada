/**
 * Pure CLI planning/dispatch for digests:run.
 * Kept separate from dotenv/main so selftests never touch Production.
 */

import type {
  DigestJobResult,
  DigestRunStats,
} from "../src/lib/email/digests";

export type DigestCliJobsPlan = {
  ok: true;
  mode: "jobs";
  userId?: string;
  dryRun: boolean;
  forceSeller: boolean;
};

export type DigestCliBuyerOnlyPlan = {
  ok: true;
  mode: "buyer-only";
  userId: string;
  dryRun: boolean;
};

export type DigestCliSellerOnlyPlan = {
  ok: true;
  mode: "seller-only";
  userId: string;
  dryRun: boolean;
  /** When true, requireMonday is false (explicit --force-seller only). */
  forceSeller: boolean;
};

export type DigestCliPlan =
  | DigestCliJobsPlan
  | DigestCliBuyerOnlyPlan
  | DigestCliSellerOnlyPlan
  | { ok: false; error: string };

export type DigestCliDeps = {
  runDigestJobs: (opts: {
    userId?: string;
    dryRun?: boolean;
    forceSeller?: boolean;
  }) => Promise<DigestJobResult>;
  runBuyerSavedSearchDigests: (opts: {
    userId?: string;
    dryRun?: boolean;
    since?: Date;
  }) => Promise<DigestRunStats>;
  runSellerNeighborhoodReports: (opts: {
    userId?: string;
    dryRun?: boolean;
    requireMonday?: boolean;
    since?: Date;
  }) => Promise<DigestRunStats>;
};

function parseUserId(args: string[]): string | undefined {
  const userIdArg = args.find((a) => a.startsWith("--userId="));
  if (!userIdArg) return undefined;
  const value = userIdArg.slice("--userId=".length).trim();
  return value || undefined;
}

/**
 * Parse digests:run argv (already sliced past node/script).
 * --buyer-only requires a non-empty --userId= and never plans Seller Digest.
 * --seller-only requires a non-empty --userId= and never plans Buyer Digest.
 * Monday stays required for seller-only unless --force-seller is explicit.
 */
export function parseDigestRunArgs(args: string[]): DigestCliPlan {
  const dryRun = args.includes("--dry-run") || args.includes("--dryRun");
  const buyerOnly =
    args.includes("--buyer-only") || args.includes("--buyerOnly");
  const sellerOnly =
    args.includes("--seller-only") || args.includes("--sellerOnly");
  const forceSellerFlag =
    args.includes("--force-seller") || args.includes("--forceSeller");
  const userId = parseUserId(args);

  if (buyerOnly && sellerOnly) {
    return {
      ok: false,
      error: "Cannot combine --buyer-only and --seller-only",
    };
  }

  if (buyerOnly) {
    if (!userId) {
      return {
        ok: false,
        error: "--buyer-only requires a non-empty --userId=<id>",
      };
    }
    return { ok: true, mode: "buyer-only", userId, dryRun };
  }

  if (sellerOnly) {
    if (!userId) {
      return {
        ok: false,
        error: "--seller-only requires a non-empty --userId=<id>",
      };
    }
    return {
      ok: true,
      mode: "seller-only",
      userId,
      dryRun,
      forceSeller: forceSellerFlag,
    };
  }

  return {
    ok: true,
    mode: "jobs",
    userId,
    dryRun,
    forceSeller: forceSellerFlag || Boolean(userId),
  };
}

export type DigestCliExecutablePlan =
  | DigestCliJobsPlan
  | DigestCliBuyerOnlyPlan
  | DigestCliSellerOnlyPlan;

/** Dispatch a validated plan through injected digest runners. */
export async function executeDigestCliPlan(
  plan: DigestCliExecutablePlan,
  deps: DigestCliDeps,
): Promise<DigestJobResult> {
  if (plan.mode === "buyer-only") {
    const buyer = await deps.runBuyerSavedSearchDigests({
      userId: plan.userId,
      dryRun: plan.dryRun,
    });
    return { buyer, seller: null };
  }

  if (plan.mode === "seller-only") {
    const seller = await deps.runSellerNeighborhoodReports({
      userId: plan.userId,
      dryRun: plan.dryRun,
      // Explicit --force-seller only — never auto-bypass from userId.
      // Do not pass `since` so the six-day cooldown stays enforced.
      requireMonday: !plan.forceSeller,
    });
    return { buyer: null, seller };
  }

  return deps.runDigestJobs({
    userId: plan.userId,
    dryRun: plan.dryRun,
    forceSeller: plan.forceSeller,
  });
}
