export type RoyalListingGalleryLayout =
  | "none"
  | "one"
  | "two"
  | "three"
  | "four"
  | "five";

/** How many real photographs the listing mosaic shows. Extra photos stay in the fullscreen gallery. */
export function royalListingGalleryLayout(count: number): RoyalListingGalleryLayout {
  if (count <= 0) return "none";
  if (count === 1) return "one";
  if (count === 2) return "two";
  if (count === 3) return "three";
  if (count === 4) return "four";
  return "five";
}

export function royalListingGalleryTileCount(count: number): number {
  const layout = royalListingGalleryLayout(count);
  switch (layout) {
    case "none":
      return 0;
    case "one":
      return 1;
    case "two":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "five":
      return Math.min(5, count);
    default: {
      const unexpected: never = layout;
      return unexpected;
    }
  }
}
