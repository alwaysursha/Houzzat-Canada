/**
 * Pure URL sync decisions for useCommittedSearch.
 * Extracted so rapid-commit / Back-Forward races can be unit-tested.
 */

export type UrlSyncDecision =
  | { action: "ack-own" }
  | { action: "ignore-stale" }
  | { action: "hydrate" };

/**
 * Decide whether an incoming App Router searchParams serialization should
 * hydrate committed state.
 *
 * - ack-own: URL caught up to our last replace — clear expecting flag
 * - ignore-stale: intermediate URL from an earlier replace while a newer
 *   write is in flight (rapid commits before router settles)
 * - hydrate: Back/Forward (popstate) or external push (autocomplete)
 */
export function decideUrlHydrate(input: {
  fromUrl: string;
  lastWrittenHref: string | null;
  expectingOwnNavigation: boolean;
  /** True when this searchParams change was caused by browser history traversal. */
  isPopNavigation: boolean;
}): UrlSyncDecision {
  if (
    input.lastWrittenHref != null &&
    input.fromUrl === input.lastWrittenHref
  ) {
    return { action: "ack-own" };
  }
  if (input.isPopNavigation) {
    return { action: "hydrate" };
  }
  if (input.expectingOwnNavigation) {
    return { action: "ignore-stale" };
  }
  return { action: "hydrate" };
}
