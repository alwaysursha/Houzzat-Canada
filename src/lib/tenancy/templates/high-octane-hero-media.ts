/**
 * Licensed hero footage for the genuine HIGH OCTANE workspace only.
 * Downloaded from the official Pexels download endpoint on 22 Oct 2026.
 * Pexels License (https://www.pexels.com/license/): free to use, including
 * commercial use. On-page creator credits are omitted; terms of use will
 * carry the attribution. These clips are stock film, not HIGH OCTANE listings.
 */
import type { RoyalCollectionScene } from "@/lib/tenancy/templates/royal-collection-media";

const MEDIA = "/media/royal-collection/high-octane";
const CUT = "?v=2";

export const HIGH_OCTANE_HERO_FOOTAGE = [
  {
    id: "niagara-falls",
    creator: "CityXcape",
    sourceUrl: "https://www.pexels.com/video/a-breathtaking-view-of-niagara-falls-6419194/",
    pexelsId: "6419194",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    trimStartSeconds: 4,
    deliveredDurationSeconds: 13.51,
  },
  {
    id: "luxury-exterior",
    creator: "Mark Embry",
    sourceUrl: "https://www.pexels.com/video/aerial-view-of-a-beautiful-house-8263308/",
    pexelsId: "8263308",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    trimStartSeconds: 0,
    deliveredDurationSeconds: 9.5,
  },
  {
    id: "luxury-interior",
    creator: "Ethan Raven",
    sourceUrl:
      "https://www.pexels.com/video/modern-open-concept-luxury-living-room-and-kitchen-design-31617700/",
    pexelsId: "31617700",
    license: "Pexels License",
    licenseUrl: "https://www.pexels.com/license/",
    trimStartSeconds: 0,
    deliveredDurationSeconds: 13.51,
  },
] as const;

export const HIGH_OCTANE_HERO_SCENES: readonly RoyalCollectionScene[] = [
  {
    id: "niagara-falls",
    title: "The Falls",
    caption: "Niagara Falls",
    src: `${MEDIA}/niagara-falls-desktop.mp4${CUT}`,
    srcMobile: `${MEDIA}/niagara-falls-mobile.mp4${CUT}`,
    poster: `${MEDIA}/niagara-falls-poster.jpg${CUT}`,
    durationMs: 13510,
  },
  {
    id: "luxury-exterior",
    title: "Exteriors",
    caption: "Stock aerial of modern homes",
    src: `${MEDIA}/luxury-exterior-desktop.mp4${CUT}`,
    srcMobile: `${MEDIA}/luxury-exterior-mobile.mp4${CUT}`,
    poster: `${MEDIA}/luxury-exterior-poster.jpg${CUT}`,
    durationMs: 9500,
  },
  {
    id: "luxury-interior",
    title: "Interiors",
    caption: "Stock interior walkthrough",
    src: `${MEDIA}/luxury-interior-desktop.mp4${CUT}`,
    srcMobile: `${MEDIA}/luxury-interior-mobile.mp4${CUT}`,
    poster: `${MEDIA}/luxury-interior-poster.jpg${CUT}`,
    durationMs: 13510,
  },
];
