import {
  runBuyerSavedSearchDigests,
  type DigestRunStats,
} from "@/lib/email/digests/buyer";
import { runSellerNeighborhoodReports } from "@/lib/email/digests/seller";
import { notifyOpenTasksDue } from "@/lib/notifications/staff-events";

export type DigestJobResult = {
  /** Null when a seller-only CLI path skipped Buyer Digest entirely. */
  buyer: DigestRunStats | null;
  /** Null when a buyer-only CLI path skipped Seller Digest entirely. */
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

  if (!opts?.dryRun && !opts?.userId) {
    await notifyOpenTasksDue();
  }

  return { buyer, seller };
}

export { runBuyerSavedSearchDigests, runSellerNeighborhoodReports };
export type { DigestRunStats };
