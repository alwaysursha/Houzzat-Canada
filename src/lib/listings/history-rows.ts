export type HistoryRow = {
  id: string;
  /** PropTx VOW: ListingContractDate */
  contractDate: string | null;
  /** PropTx VOW: ModificationTimestamp */
  lastUpdate: string | null;
  /** List/close price, or new list price on a Price Change. */
  price: number | null;
  /**
   * Prior list price (Price Change rows only).
   * PropTx VOW: previous ListPrice before the change.
   */
  originalPrice: number | null;
  event: string;
  listingId: string;
  /** When false, guests see blurred / sign-in required cells (VOW). */
  public: boolean;
};

export function isPriceChangeEvent(event: string) {
  return /price\s*change/i.test(event.trim());
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** Most recent of Last Update / Contract Date (ms). */
export function historyRowRecencyMs(row: HistoryRow): number {
  const last = row.lastUpdate ? new Date(row.lastUpdate).getTime() : NaN;
  const contract = row.contractDate
    ? new Date(row.contractDate).getTime()
    : NaN;
  const times = [last, contract].filter((n) => Number.isFinite(n));
  return times.length > 0 ? Math.max(...times) : 0;
}

/** Newest first. */
export function compareHistoryRowsByRecency(a: HistoryRow, b: HistoryRow) {
  return historyRowRecencyMs(b) - historyRowRecencyMs(a);
}

/** Most recent Price Change for this MLS with both original and new prices. */
export function getLatestListPriceChange(
  history: Array<{
    event: string;
    price: number | null;
    originalPrice?: number | null;
    contractDate: Date | string;
    lastUpdatedAt?: Date | string | null;
    externalMls?: string | null;
    visibility?: string | null;
  }>,
  mlsNumber: string,
  options?: { includeRestricted?: boolean },
): { originalPrice: number; newPrice: number; delta: number } | null {
  const includeRestricted = options?.includeRestricted ?? true;
  const candidates = history
    .filter((h) => {
      if (!isPriceChangeEvent(h.event)) return false;
      if (h.price == null || h.originalPrice == null) return false;
      if (h.price === h.originalPrice) return false;
      const id = h.externalMls ?? mlsNumber;
      if (id !== mlsNumber) return false;
      if (!includeRestricted && h.visibility !== "public") return false;
      return true;
    })
    .sort((a, b) => {
      const aLast = a.lastUpdatedAt
        ? new Date(a.lastUpdatedAt).getTime()
        : NaN;
      const aContract = new Date(a.contractDate).getTime();
      const bLast = b.lastUpdatedAt
        ? new Date(b.lastUpdatedAt).getTime()
        : NaN;
      const bContract = new Date(b.contractDate).getTime();
      const aMs = Math.max(
        ...[aLast, aContract].filter((n) => Number.isFinite(n)),
        0,
      );
      const bMs = Math.max(
        ...[bLast, bContract].filter((n) => Number.isFinite(n)),
        0,
      );
      return bMs - aMs;
    });

  const latest = candidates[0];
  if (!latest || latest.price == null || latest.originalPrice == null) {
    return null;
  }
  return {
    originalPrice: latest.originalPrice,
    newPrice: latest.price,
    delta: latest.price - latest.originalPrice,
  };
}

/** Build table rows: current listing + past history, newest first. */
export function buildListingHistoryRows(input: {
  mlsNumber: string;
  listPrice: number;
  listedAt: Date | string;
  /** Current listing last MLS update (PropTx ModificationTimestamp → updatedAtMls). */
  updatedAtMls?: Date | string | null;
  status: string;
  transactionType: string;
  history: Array<{
    id: string;
    event: string;
    price: number | null;
    originalPrice?: number | null;
    contractDate: Date | string;
    lastUpdatedAt?: Date | string | null;
    externalMls?: string | null;
    visibility?: string | null;
    note?: string | null;
  }>;
}): HistoryRow[] {
  const currentEvent =
    input.status === "SOLD"
      ? "Sold"
      : input.status === "LEASED"
        ? "Leased"
        : input.transactionType === "LEASE"
          ? "For Lease"
          : "For Sale";

  const current: HistoryRow = {
    id: `current-${input.mlsNumber}`,
    contractDate: toIso(input.listedAt),
    lastUpdate: toIso(input.updatedAtMls ?? null),
    price: input.listPrice,
    originalPrice: null,
    event: currentEvent,
    listingId: input.mlsNumber,
    public: true,
  };

  const past = input.history
    .filter((h) => {
      if (h.note === "synthetic:empty" || h.event === "Synced") return false;
      return true;
    })
    .map((h) => {
      const eventLower = h.event.toLowerCase();
      const mappedEvent =
        eventLower === "listed"
          ? input.transactionType === "LEASE"
            ? "For Lease"
            : "For Sale"
          : h.event;
      return {
        id: h.id,
        contractDate: toIso(h.contractDate),
        lastUpdate: toIso(h.lastUpdatedAt ?? null),
        price: h.price,
        originalPrice: h.originalPrice ?? null,
        event: mappedEvent,
        listingId: h.externalMls ?? input.mlsNumber,
        public: h.visibility === "public",
      } satisfies HistoryRow;
    });

  const filteredPast = past.filter(
    (row) =>
      !(
        row.listingId === input.mlsNumber &&
        /for sale|for lease|listed/i.test(row.event)
      ),
  );

  // Current listing stays on top; remaining rows newest-first.
  return [
    current,
    ...[...filteredPast].sort(compareHistoryRowsByRecency),
  ];
}
