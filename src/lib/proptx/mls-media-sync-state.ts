/**
 * Media sync completion state.
 *
 * `mediaSourceTimestamp` is the source photo state for which a Media fetch
 * completed with at least one photo. A count under the Neon cap is complete
 * for that stamp.
 *
 * `mediaSyncedAt` is the wall clock of that completion. It is only a cooldown
 * clock for the 48-hour delayed-upload window. It is not a completeness stamp.
 *
 * `photosChangeTimestamp` is the last PhotosChangeTimestamp observed on a
 * Property upsert, so nightly can see a photo change without another Property
 * read. It is not written by the website gallery.
 */

import { NEON_LISTING_MEDIA_CAP } from "@/lib/listings/gallery-constants";

/** New listings may be retried for delayed uploads only inside this window. */
export const MEDIA_DELAYED_GRACE_MS = 48 * 60 * 60 * 1000;

/**
 * Minimum gap between a successful 1–4 photo sync and the next delayed-upload
 * retry. Hourly Full runs inside this window do not fetch Media again.
 */
export const MEDIA_DELAYED_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const ON_MARKET_MEDIA_STATUSES = ["ACTIVE", "SOLD_CONDITIONAL"] as const;

export type MediaSyncOutcome = "complete" | "empty" | "error";

export type MediaFetchReason =
  | "zero-photos"
  | "new-or-unsynced"
  | "photo-timestamp"
  | "delayed-retry"
  | "complete";

export type MediaSyncSnapshot = {
  mediaCount: number;
  mediaSourceTimestamp: Date | null;
  mediaSyncedAt: Date | null;
  listedAt: Date | null;
  /** Incoming or last-observed PhotosChangeTimestamp. Null means absent, not "cleared". */
  photosChangeTimestamp: Date | null;
  now: Date;
};

export type CappedMediaRow = {
  url: string;
  sortOrder: number;
  isPrimary: boolean;
};

function isNewer(incoming: Date | null, stored: Date | null): boolean {
  if (!incoming) return false;
  if (!stored) return true;
  return incoming.getTime() > stored.getTime();
}

function withinDelayedGrace(listedAt: Date | null, now: Date): boolean {
  if (!listedAt || Number.isNaN(listedAt.getTime())) return false;
  const age = now.getTime() - listedAt.getTime();
  return age >= 0 && age <= MEDIA_DELAYED_GRACE_MS;
}

function cooldownElapsed(mediaSyncedAt: Date | null, now: Date): boolean {
  if (!mediaSyncedAt || Number.isNaN(mediaSyncedAt.getTime())) return true;
  return now.getTime() - mediaSyncedAt.getTime() >= MEDIA_DELAYED_COOLDOWN_MS;
}

/**
 * Whether this listing should call PropTx Media.
 * A stored count under 5 is not itself a reason to fetch.
 */
export function shouldFetchListingMedia(state: MediaSyncSnapshot): {
  fetch: boolean;
  reason: MediaFetchReason;
} {
  if (state.mediaCount <= 0) {
    return { fetch: true, reason: "zero-photos" };
  }

  if (!state.mediaSourceTimestamp) {
    return { fetch: true, reason: "new-or-unsynced" };
  }

  if (isNewer(state.photosChangeTimestamp, state.mediaSourceTimestamp)) {
    return { fetch: true, reason: "photo-timestamp" };
  }

  const partial = state.mediaCount < NEON_LISTING_MEDIA_CAP;
  if (
    partial &&
    withinDelayedGrace(state.listedAt, state.now) &&
    cooldownElapsed(state.mediaSyncedAt, state.now)
  ) {
    return { fetch: true, reason: "delayed-retry" };
  }

  return { fetch: false, reason: "complete" };
}

/**
 * Stamp to persist after a non-empty Media fetch.
 * Prefer the photo timestamp. When PropTx omits it, use the property
 * modification time so a later modification does not look unsynced.
 */
export function completionMediaSourceStamp(input: {
  photosChangeTimestamp: Date | null;
  modificationTimestamp: Date | null;
  fallback: Date;
}): Date {
  return (
    input.photosChangeTimestamp ??
    input.modificationTimestamp ??
    input.fallback
  );
}

export function mediaStampAfterOutcome(
  outcome: MediaSyncOutcome,
  previous: {
    mediaSourceTimestamp: Date | null;
    mediaSyncedAt: Date | null;
  },
  completed: {
    mediaSourceTimestamp: Date;
    mediaSyncedAt: Date;
  },
): {
  mediaSourceTimestamp: Date | null;
  mediaSyncedAt: Date | null;
} {
  if (outcome !== "complete") return previous;
  return completed;
}

/**
 * Capped Neon replace: upsert the new first five, drop URLs that left the set.
 * Reorder and primary changes are upserts. Deletions and replacements are
 * URLs absent from the new set.
 */
export function reconcileCappedMedia(
  existing: CappedMediaRow[],
  selected: CappedMediaRow[],
): { upserts: CappedMediaRow[]; deleteUrls: string[] } {
  const keep = new Set(selected.map((photo) => photo.url));
  return {
    upserts: selected,
    deleteUrls: existing
      .map((photo) => photo.url)
      .filter((url) => !keep.has(url)),
  };
}

const CLOSED_MEDIA_STATUSES = new Set([
  "SOLD",
  "LEASED",
  "TERMINATED",
  "EXPIRED",
  "SUSPENDED",
]);

/**
 * Nightly priority. Null means the row is not in the Media pool.
 * Lower numbers run first. A stamped 1–4 photo listing outside the delayed
 * window, or inside its cooldown, returns null.
 */
export function nightlyMediaBackfillRank(
  row: MediaSyncSnapshot & { status: string },
): number | null {
  const decision = shouldFetchListingMedia(row);
  if (!decision.fetch) return null;

  const onMarket = (ON_MARKET_MEDIA_STATUSES as readonly string[]).includes(
    row.status,
  );
  if (onMarket && row.mediaCount <= 0) return 0;
  if (
    onMarket &&
    !row.mediaSourceTimestamp &&
    row.mediaCount < NEON_LISTING_MEDIA_CAP
  ) {
    return 1;
  }
  if (onMarket && decision.reason === "photo-timestamp") return 2;
  if (onMarket && decision.reason === "delayed-retry") return 3;
  if (onMarket && !row.mediaSourceTimestamp) return 4;
  if (row.status === "SOLD" || row.status === "LEASED") return 5;
  if (CLOSED_MEDIA_STATUSES.has(row.status)) return 6;
  if (!onMarket) return null;
  return 4;
}
