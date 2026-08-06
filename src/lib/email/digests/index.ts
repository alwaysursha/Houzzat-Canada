import {
  runBuyerSavedSearchDigests,
  type DigestRunStats,
} from "@/lib/email/digests/buyer";
import { runSellerNeighborhoodReports } from "@/lib/email/digests/seller";

export type DigestJobResult = {
  buyer: DigestRunStats;
  seller: DigestRunStats | null;
};

/**
 * Cron entrypoint: buyers every day; sellers only Monday America/Toronto
 * unless `forceSeller` (manual / userId smoke tests).
 */
export async function runDigestJobs(opts?: {
  userId?: string;
  dryRun?: boolean;
  /** Run seller weekly regardless of weekday. */
  forceSeller?: boolean;
}): Promise<DigestJobResult> {
  const buyer = await runBuyerSavedSearchDigests({
    userId: opts?.userId,
    dryRun: opts?.dryRun,
  });

  const forceSeller = Boolean(opts?.forceSeller || opts?.userId);
  const seller = await runSellerNeighborhoodReports({
    userId: opts?.userId,
    dryRun: opts?.dryRun,
    requireMonday: !forceSeller,
  });

  return { buyer, seller };
}

export { runBuyerSavedSearchDigests, runSellerNeighborhoodReports };
export type { DigestRunStats };
