/**
 * Configurable hero media for Royal Collection — Signature One.
 * Empty src/poster means the slot is reserved. Do not fill it with unlicensed media.
 */
export type RoyalCollectionScene = {
  id: string;
  title: string;
  caption: string;
  src: string;
  poster: string | null;
  /**
   * Remote still from the approved design concept. Not an ingested or
   * licensed production asset. Video `src` stays empty until a clip is supplied.
   */
  conceptStill?: string | null;
  /** Smaller encode for narrow viewports. Absent scenes use `src`. */
  srcMobile?: string | null;
  /** Time on this scene before the hero advances. Falls back to the hero default. */
  durationMs?: number;
};

/**
 * Reserved local still. Rights are not confirmed for Royal Collection, so the
 * live template does not render it. Do not point production scenes at this file.
 */
export const ROYAL_COLLECTION_HERO_POSTER = "/images/hero-canadian-homes.jpg";

export const ROYAL_COLLECTION_HERO_VIDEOS: readonly RoyalCollectionScene[] = [];
