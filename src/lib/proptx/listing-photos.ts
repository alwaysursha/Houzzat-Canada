import { listingPhotoSrc } from "@/lib/listings/photo-src";
import {
  getPropTxIdxConfig,
  getPropTxSyncConfig,
  type PropTxConfig,
} from "@/lib/proptx/config";
import { proptxPages } from "@/lib/proptx/client";
import {
  mapMediaRow,
  type PropTxProperty,
} from "@/lib/proptx/map-listing";

export type PropTxListingPhoto = {
  id: string;
  url: string;
  sortOrder: number;
  isPrimary: boolean;
};

function odataStringLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sizeScore(row: PropTxProperty): number {
  const size = String(row.ImageSizeDescription ?? "").toLowerCase();
  if (size === "large") return 40;
  if (size === "largest") return 30;
  if (size === "medium") return 20;
  if (size === "thumbnail" || size === "small") return 5;
  return 10;
}

/** Dedupe AMPRE size variants; prefer Large; optional cap. */
export function preferListingPhotos(
  rows: PropTxProperty[],
  max?: number,
): PropTxListingPhoto[] {
  const preferred = new Map<
    string,
    {
      score: number;
      mapped: NonNullable<ReturnType<typeof mapMediaRow>>;
    }
  >();

  for (const row of rows) {
    const mapped = mapMediaRow(row);
    if (!mapped) continue;
    const objectId =
      (typeof row.MediaObjectID === "string" && row.MediaObjectID.trim()) ||
      (typeof row.SourceSystemMediaKey === "string" &&
        row.SourceSystemMediaKey.trim()) ||
      (typeof row.MediaKey === "string" && row.MediaKey.trim()) ||
      mapped.url;
    const score = sizeScore(row);
    const prev = preferred.get(objectId);
    if (!prev || score > prev.score) {
      preferred.set(objectId, { score, mapped });
    }
  }

  let selected = [...preferred.values()]
    .map(({ mapped }) => mapped)
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

  if (max != null && max > 0) {
    selected = selected.slice(0, max);
  }

  // Raw MediaURL for DB sync; callers apply listingPhotoSrc for display.
  return selected.map((mapped, index) => ({
    id: `proptx-${index}-${mapped.sortOrder}`,
    url: mapped.url,
    sortOrder: mapped.sortOrder,
    isPrimary: mapped.isPrimary || index === 0,
  }));
}

/** Fetch Property Media rows for a ListingKey (Large → Largest → any). */
export async function fetchRawPropertyMedia(
  listingKey: string,
  config: PropTxConfig,
): Promise<PropTxProperty[]> {
  const keyLit = odataStringLiteral(listingKey);
  const attempts = [
    `ResourceRecordKey eq ${keyLit} and ImageSizeDescription eq 'Large'`,
    `ResourceRecordKey eq ${keyLit} and ImageSizeDescription eq 'Largest'`,
    `ResourceRecordKey eq ${keyLit}`,
  ];

  let best: PropTxProperty[] = [];
  for (const filter of attempts) {
    const path = `Media?$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent("Order,MediaKey")}&$top=100`;
    const rows: PropTxProperty[] = [];
    for await (const page of proptxPages<PropTxProperty>(path, {
      maxPages: 2,
      config,
    })) {
      rows.push(...page);
    }
    if (rows.length === 0) continue;
    // Prefer the attempt that yields more distinct gallery photos. Some
    // listings only expose one "Large" row even when more sizes exist.
    if (preferListingPhotos(rows).length > preferListingPhotos(best).length) {
      best = rows;
    }
    // Enough for a full gallery — stop early.
    if (preferListingPhotos(best).length >= 8) break;
  }
  return best;
}

/**
 * Live PropTx gallery for a listing detail page (all sizes deduped).
 * Falls back across VOW → IDX configs. Returns [] on miss/error.
 */
export async function fetchListingPhotosFromPropTx(
  listingKey: string,
  options?: { max?: number; timeoutMs?: number },
): Promise<PropTxListingPhoto[]> {
  const key = listingKey.trim();
  if (!key) return [];

  const configs = [getPropTxSyncConfig(), getPropTxIdxConfig()].filter(
    (c, i, arr): c is PropTxConfig =>
      Boolean(c) && arr.findIndex((x) => x?.tokenId === c?.tokenId) === i,
  );
  if (configs.length === 0) return [];

  // PropTx Media can take several seconds on cold/edge; 4.5s often fell back
  // to the single cover photo stored in Neon.
  const timeoutMs = options?.timeoutMs ?? 12_000;

  const work = async (): Promise<PropTxListingPhoto[]> => {
    for (const config of configs) {
      try {
        const rows = await fetchRawPropertyMedia(key, config);
        if (rows.length === 0) continue;
        return preferListingPhotos(rows, options?.max).map((photo) => ({
          ...photo,
          url: listingPhotoSrc(photo.url) ?? photo.url,
        }));
      } catch {
        // try next credential set
      }
    }
    return [];
  };

  try {
    return await Promise.race([
      work(),
      new Promise<PropTxListingPhoto[]>((resolve) =>
        setTimeout(() => resolve([]), timeoutMs),
      ),
    ]);
  } catch {
    return [];
  }
}
