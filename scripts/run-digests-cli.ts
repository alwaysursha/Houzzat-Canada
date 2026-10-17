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

export type DigestCliPlan =
  | DigestCliJobsPlan
  | DigestCliBuyerOnlyPlan
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
 */
export function parseDigestRunArgs(args: string[]): DigestCliPlan {
  const dryRun = args.includes("--dry-run") || args.includes("--dryRun");
  const buyerOnly =
    args.includes("--buyer-only") || args.includes("--buyerOnly");
  const forceSellerFlag =
    args.includes("--force-seller") || args.includes("--forceSeller");
  const userId = parseUserId(args);

  if (buyerOnly) {
    if (!userId) {
      return {
        ok: false,
        error: "--buyer-only requires a non-empty --userId=<id>",
      };
    }
    return { ok: true, mode: "buyer-only", userId, dryRun };
  }

  return {
    ok: true,
    mode: "jobs",
    userId,
    dryRun,
    forceSeller: forceSellerFlag || Boolean(userId),
  };
}

/** Dispatch a validated plan through injected digest runners. */
export async function executeDigestCliPlan(
  plan: DigestCliJobsPlan | DigestCliBuyerOnlyPlan,
  deps: DigestCliDeps,
): Promise<DigestJobResult> {
  if (plan.mode === "buyer-only") {
    const buyer = await deps.runBuyerSavedSearchDigests({
      userId: plan.userId,
      dryRun: plan.dryRun,
    });
    return { buyer, seller: null };
  }

  return deps.runDigestJobs({
    userId: plan.userId,
    dryRun: plan.dryRun,
    forceSeller: plan.forceSeller,
  });
}
