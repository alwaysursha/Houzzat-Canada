import { HIGH_OCTANE_PREVIEW_FIXTURE } from "@/lib/tenancy/templates/high-octane-preview-fixture";
import type { RoyalCollectionPropertyModel } from "@/lib/tenancy/templates/royal-collection-property-model";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import type { RoyalConceptFrame } from "./RoyalCollectionPropertyGallery";
import { RoyalCollectionPropertyView } from "./RoyalCollectionPropertyView";
import styles from "./royal-property.module.css";

/**
 * Development-only property detail demonstration.
 * No listing record, gallery API, registration gate, or lead action is mounted.
 */
const FRAMES: readonly RoyalConceptFrame[] = [
  {
    src: "/images/home-preview/hero-luxury-residence.jpg",
    label: "Arrival",
    alt: "Concept architectural study of a residence. Not a photograph of a listing.",
  },
  {
    src: "/images/home-preview/hero-luxury-home.jpg",
    label: "Light",
    alt: "Concept architectural study of a facade. Not a photograph of a listing.",
  },
  {
    src: "/images/agent-signature-sell-architecture.jpg",
    label: "Garden",
    alt: "Concept architectural study of a garden elevation. Not a photograph of a listing.",
  },
];

const FACTS = [
  ["Address", "No street address"],
  ["City", "Niagara Region"],
  ["Asking", "Not stated"],
  ["Bedrooms", "Not recorded"],
  ["Bathrooms", "Not recorded"],
  ["Type", "Concept"],
  ["Interior", "Not recorded"],
  ["Lot", "Not recorded"],
] as const;

const HIGHLIGHTS = [
  ["Arrival", "A composed approach, drawn as architecture rather than a listing photo."],
  ["Light", "Tall openings suggested by proportion, not by a recorded room."],
  ["Garden", "An outdoor room in the plan, with no claimed lot or address."],
  ["Privacy", "A quiet sequence of rooms for the design study only."],
] as const;

const WITHHELD = [
  ["Rooms", "Not recorded"],
  ["Dimensions", "Not recorded"],
  ["Outdoor", "Not recorded"],
  ["Neighbourhood", "Not recorded"],
  ["Taxes", "Not recorded"],
  ["Parking", "Not recorded"],
] as const;

export function RoyalCollectionPropertyDemonstration() {
  const fixture = HIGH_OCTANE_PREVIEW_FIXTURE;
  const model: RoyalCollectionPropertyModel = {
    kind: "concept",
    kicker: "Design Concept — Not an MLS Listing",
    title: "The residence.",
    place: "Niagara Region · Concept",
    badge: null,
    lede:
      "Illustrative layout only. Address, price, size, and rooms stay blank until an authorized listing is supplied. These studies are not a connected property.",
    frames: FRAMES,
    facts: FACTS.map(([label, value]) => ({ label, value })),
    overview: {
      eyebrow: "Overview",
      title: "Composed for a first impression.",
      paragraphs: [
        "The page is arranged the way a Royal Collection residence would be read: a wide gallery, the place given room to breathe, then the story of the house. Nothing here is taken from a board, a saved search, or a workspace record.",
        "Niagara Region is the market named in this preview. There is no street, no board identifier, and no asking figure.",
      ],
    },
    highlights: {
      eyebrow: "Highlights",
      title: "Studies, not specifications.",
      items: HIGHLIGHTS.map(([title, copy]) => ({ title, copy })),
    },
    rooms: {
      eyebrow: "Rooms and dimensions",
      title: "No rooms are recorded.",
      intro: "A connected listing would list each room and its measure here. This concept does not invent a floor plan.",
      rows: [],
    },
    outdoor: {
      eyebrow: "Outdoor and neighbourhood",
      title: "Place withheld.",
      paragraphs: [
        "No lot, exposure, or outdoor feature is recorded. The preview names Niagara Region and does not place this concept in a neighbourhood.",
      ],
    },
    location: {
      eyebrow: "Location",
      title: "No map pin.",
      label: "Niagara Region",
      detail: "Location withheld",
      note: "No address is available, so this concept does not drop a pin.",
    },
    extras: {
      eyebrow: "Additional details",
      title: "Nothing further is on file.",
      rows: WITHHELD.map(([label, value]) => ({ label, value })),
    },
    related: {
      eyebrow: "Related",
      title: "Other concept studies.",
      cards: fixture.featuredCities.map((city, index) => ({
        imageUrl: FRAMES[index]?.src ?? null,
        kicker: "Concept",
        title: city,
        note: "Not a listing",
      })),
    },
    attribution: {
      eyebrow: "Attribution",
      title: "No listing brokerage.",
      paragraphs: [
        fixture.brokerageName +
          " is the brokerage named for this website. This concept is not that brokerage's listing, and no original listing brokerage is shown because no board listing is connected.",
      ],
    },
    contact: {
      eyebrow: "Private viewing",
      title: "Request a Private Viewing",
      agentName: fixture.agentName,
      role: null,
      brandName: fixture.brandName,
      brokerageName: fixture.brokerageName,
      phone: fixture.phone,
      email: fixture.email,
      photoUrl: null,
    },
  };

  return (
    <RoyalCollectionPropertyView model={model}>
      <button type="button" className={styles.viewing} disabled aria-disabled="true">
        Request a Private Viewing
      </button>
      <p className={styles.note}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>
      <p className={styles.asideFine}>
        This control does not book, save, chat, or send an inquiry.
      </p>
    </RoyalCollectionPropertyView>
  );
}
