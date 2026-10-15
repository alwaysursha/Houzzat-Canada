/**
 * Shared historical / backtest injection options for V1 baseline and V2 engines.
 * Production API callers omit these fields — behavior unchanged.
 */

/** Minimal sold row shape for historical filtering (engine-specific candidates extend this). */
export type HistoricalSoldRow = {
  soldAt: Date;
  soldPrice: number;
  mlsNumber?: string | null;
  addressLine?: string | null;
  unitNumber?: string | null;
  city: string;
  lat?: number;
  lng?: number;
  listingKey?: string | null;
};

export type HomeValueHistoricalInjection<TCandidate = HistoricalSoldRow> = {
  /**
   * Valuation clock. Sold window is [asOf − 12 months, asOf).
   * Defaults to Date.now() in production.
   */
  now?: Date;
  /**
   * When set, only comps with soldAt strictly before this instant are used
   * (blocks future-sale and same-instant subject leakage).
   */
  soldAtBefore?: Date;
  /** Exclude MLS numbers (subject listing). */
  excludeMlsNumbers?: string[];
  /** Exclude civic identity keys (subject + known duplicates). */
  excludeIdentityKeys?: string[];
  /**
   * Test/backtest only: skip Prisma and score this inventory instead.
   * Must already be entitlement-filtered by the caller.
   */
  inventoryOverride?: TCandidate[];
};

/** Filter candidates for historical replay / leakage guards. Pure. */
export function filterHistoricalCandidates<T extends HistoricalSoldRow>(
  rows: T[],
  opts: {
    soldAtBefore?: Date;
    excludeMlsNumbers?: string[];
    excludeIdentityKeys?: string[];
    identityKey: (row: T) => string;
    soldSince: Date;
  },
): {
  kept: T[];
  rejectedFuture: number;
  rejectedSubject: number;
  rejectedOutsideWindow: number;
} {
  const excludeMls = new Set(
    (opts.excludeMlsNumbers ?? []).map((m) => m.trim().toUpperCase()),
  );
  const excludeIds = new Set(opts.excludeIdentityKeys ?? []);
  let rejectedFuture = 0;
  let rejectedSubject = 0;
  let rejectedOutsideWindow = 0;
  const kept: T[] = [];

  for (const row of rows) {
    if (!(row.soldAt instanceof Date) || Number.isNaN(row.soldAt.getTime())) {
      rejectedOutsideWindow += 1;
      continue;
    }
    if (row.soldAt.getTime() < opts.soldSince.getTime()) {
      rejectedOutsideWindow += 1;
      continue;
    }
    if (opts.soldAtBefore && row.soldAt.getTime() >= opts.soldAtBefore.getTime()) {
      rejectedFuture += 1;
      continue;
    }
    const mls = row.mlsNumber?.trim().toUpperCase();
    if (mls && excludeMls.has(mls)) {
      rejectedSubject += 1;
      continue;
    }
    const id = opts.identityKey(row);
    if (excludeIds.has(id)) {
      rejectedSubject += 1;
      continue;
    }
    kept.push(row);
  }

  return { kept, rejectedFuture, rejectedSubject, rejectedOutsideWindow };
}

export type AbsolutePctError = {
  ape: number;
  mid: number;
  actual: number;
};

export function absolutePercentageError(
  mid: number,
  actual: number,
): AbsolutePctError | null {
  if (!(actual > 0) || !(mid > 0)) return null;
  return {
    ape: (Math.abs(mid - actual) / actual) * 100,
    mid,
    actual,
  };
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type AccuracyBucketStats = {
  nValid: number;
  nInsufficient: number;
  insufficientRate: number;
  mdape: number | null;
  mape: number | null;
  within5: number | null;
  within10: number | null;
  within15: number | null;
};

export function summarizeAccuracy(apes: number[], nInsufficient: number): AccuracyBucketStats {
  const nValid = apes.length;
  const total = nValid + nInsufficient;
  const pctWithin = (threshold: number) =>
    nValid === 0
      ? null
      : (apes.filter((a) => a <= threshold).length / nValid) * 100;
  return {
    nValid,
    nInsufficient,
    insufficientRate: total === 0 ? 0 : nInsufficient / total,
    mdape: median(apes),
    mape: mean(apes),
    within5: pctWithin(5),
    within10: pctWithin(10),
    within15: pctWithin(15),
  };
}
