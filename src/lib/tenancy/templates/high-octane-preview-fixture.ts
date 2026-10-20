/**
 * Display-only Royal Collection preview for the first subscriber.
 * Not a theme default, not a workspace record, and not used in production.
 */
import { homesForSalePath } from "@/lib/geo/area-paths";
import type { RoyalCollectionScene } from "@/lib/tenancy/templates/royal-collection-media";

export const HIGH_OCTANE_PREVIEW_FIXTURE_ID = "high-octane" as const;

export const HIGH_OCTANE_MEDIA_REQUIREMENTS = [
  "Niagara Falls — licensed aerial film, muted, 16:9 or taller, with a still poster.",
  "Niagara-on-the-Lake — licensed film of estates, vineyards, or village streets, with a still poster.",
  "Niagara Region waterfront — licensed film of the shoreline or residential communities, with a still poster.",
  "A headshot of Saad Qureshi supplied by the subscriber.",
  "An approved HIGH OCTANE logo, if one exists. The on-screen wordmark is provisional.",
  "Concept stills in this preview are remote references from the approved HTML prototype. They are not ingested files and are not cleared for commercial production.",
] as const;

/** Remote concept stills from the approved prototype. Not licensed production files. */
const CONCEPT_STILLS = {
  falls:
    "https://images.unsplash.com/photo-1694617711278-03862103e39f?auto=format&fit=crop&w=2200&q=85",
  vines:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Grapevines_in_Niagara-on-the-Lake.jpg?width=1900",
  lighthouse:
    "https://commons.wikimedia.org/wiki/Special:FilePath/Port_Dalhousie_Outer_Range_Lighthouse.jpg?width=1800",
} as const;

const SCENES: readonly RoyalCollectionScene[] = [
  {
    id: "niagara-falls",
    title: "Niagara Falls",
    caption: "A dramatic aerial introduction",
    src: "",
    poster: null,
    conceptStill: CONCEPT_STILLS.falls,
  },
  {
    id: "niagara-on-the-lake",
    title: "Niagara-on-the-Lake",
    caption: "Estates, vineyards, and village life",
    src: "",
    poster: null,
    conceptStill: CONCEPT_STILLS.vines,
  },
  {
    id: "niagara-waterfront",
    title: "Niagara Region",
    caption: "Waterfront and residential communities",
    src: "",
    poster: null,
    conceptStill: CONCEPT_STILLS.lighthouse,
  },
];

export const HIGH_OCTANE_PREVIEW_FIXTURE = {
  id: HIGH_OCTANE_PREVIEW_FIXTURE_ID,
  brandName: "HIGH OCTANE Real Estate",
  agentName: "Saad Qureshi",
  firstName: "Saad",
  phone: "289-501-7755",
  email: "saad@highoctaneniagara.ca",
  brokerageName: "Right at Home Realty Brokerage",
  marketLabel: "Niagara Region",
  tagline:
    "More than a home. A sense of place. Discover Niagara real estate through a more considered, more personal lens.",
  wordmarkSub: "REAL ESTATE · NIAGARA",
  searchHeading: "Find a Niagara home",
  valuationHeading: "Discover your Niagara home's value",
  featuredCities: ["Niagara Falls", "Niagara-on-the-Lake", "St. Catharines"],
  scenes: SCENES,
  editorialCommunities: [
    { name: "Niagara Falls", city: "Niagara Falls" },
    { name: "Niagara-on-the-Lake", city: "Niagara-on-the-Lake" },
    { name: "St. Catharines", city: "St. Catharines" },
  ].map((place) => ({
    ...place,
    href: homesForSalePath({ city: place.city }),
  })),
  navCommunities: [
    { name: "Niagara-on-the-Lake", city: "Niagara-on-the-Lake" },
    { name: "St. Catharines", city: "St. Catharines" },
    { name: "Fonthill / Pelham", city: "Pelham" },
    { name: "Welland", city: "Welland" },
    { name: "Fort Erie", city: "Fort Erie" },
    { name: "Grimsby", city: "Grimsby" },
    { name: "Lincoln", city: "Lincoln" },
    { name: "Thorold", city: "Thorold" },
  ].map((place) => ({
    ...place,
    href: homesForSalePath({ city: place.city }),
  })),
  collectionCards: [
    {
      name: "Niagara Falls",
      city: "Niagara Falls",
      kicker: "01  /  Iconic landscapes",
      caption: "A powerful sense of place.",
      imageUrl: CONCEPT_STILLS.falls,
    },
    {
      name: "Niagara-on-the-Lake",
      city: "Niagara-on-the-Lake",
      kicker: "02  /  Wine country",
      caption: "Heritage, vineyards, elegance.",
      imageUrl: CONCEPT_STILLS.vines,
    },
    {
      name: "Port Dalhousie",
      city: "St. Catharines",
      kicker: "03  /  Lakeside living",
      caption: "Waterfront, charm, possibility.",
      imageUrl: CONCEPT_STILLS.lighthouse,
    },
  ].map((place) => ({
    name: place.name,
    href: homesForSalePath({ city: place.city }),
    kicker: place.kicker,
    caption: place.caption,
    imageUrl: place.imageUrl,
  })),
} as const;
