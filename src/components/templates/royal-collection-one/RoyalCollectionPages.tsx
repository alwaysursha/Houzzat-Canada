import { notFound } from "next/navigation";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionAbout } from "./RoyalCollectionAbout";
import { RoyalCollectionCommunities } from "./RoyalCollectionCommunities";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import styles from "./royal-collection.module.css";

export function royalCollectionPlaceSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PLACE_NOTES: Record<string, string> = {
  "Niagara Falls": "The falls, the gorge, and the neighbourhoods that sit beside them.",
  "Niagara-on-the-Lake": "Heritage streets, vineyards, and the shore of Lake Ontario.",
  "St. Catharines": "The urban centre of Niagara, with Port Dalhousie on the lake.",
};

type PlaceCard = {
  name: string;
  href: string;
  imageUrl: string | null;
  caption: string;
};

function placesFor(view: RoyalCollectionView): PlaceCard[] {
  if (view.collectionCards) {
    return view.collectionCards.map((card) => ({
      name: card.name,
      href: card.href,
      imageUrl: card.imageUrl,
      caption: card.caption || PLACE_NOTES[card.name] || "",
    }));
  }
  return view.navCommunities.map((place) => ({
    name: place.name,
    href: place.href,
    imageUrl: null,
    caption: PLACE_NOTES[place.name] || "",
  }));
}

export function RoyalCollectionAboutPage({ view }: { view: RoyalCollectionView }) {
  return (
    <div className={styles.page}>
      <p className={styles.pageKicker}>{view.brandName}</p>
      <RoyalCollectionAbout view={view} />
    </div>
  );
}

export function RoyalCollectionCommunitiesPage({ view }: { view: RoyalCollectionView }) {
  return (
    <div className={styles.page}>
      <p className={styles.pageKicker}>{view.markets[0] || view.brandName}</p>
      <h1>
        Places, <em>considered.</em>
      </h1>
      <p className={styles.pageLead}>
        A closer look at the communities this practice serves. Licensed photography appears only
        for this workspace. Each place continues into the existing home search.
      </p>
      <RoyalCollectionCommunities view={view} />
    </div>
  );
}

export function RoyalCollectionCommunityPage({
  view,
  slug,
}: {
  view: RoyalCollectionView;
  slug: string;
}) {
  const place = placesFor(view).find((entry) => royalCollectionPlaceSlug(entry.name) === slug);
  if (!place) notFound();

  return (
    <div className={styles.page}>
      <p className={styles.pageKicker}>{view.brandName}</p>
      <h1>{place.name}</h1>
      {place.caption ? <p className={styles.pageLead}>{place.caption}</p> : null}
      <div
        className={styles.placeFrame}
        style={place.imageUrl ? { backgroundImage: `url(${place.imageUrl})` } : undefined}
        role={place.imageUrl ? "img" : undefined}
        aria-label={place.imageUrl ? place.name : undefined}
      />
      <div className={styles.placeActions}>
        <RoyalCollectionPreviewLink
          className={`${styles.button} ${styles.buttonGold}`}
          href={place.href}
          disabled={view.actionsDisabled}
        >
          Explore homes ↗
        </RoyalCollectionPreviewLink>
        <RoyalCollectionPreviewLink
          className={`${styles.button} ${styles.buttonEmerald}`}
          href="/communities"
          disabled={view.actionsDisabled}
        >
          All communities
        </RoyalCollectionPreviewLink>
      </div>
    </div>
  );
}

export function RoyalCollectionContactPage({ view }: { view: RoyalCollectionView }) {
  const name = view.agentName || view.brandName;
  return (
    <div className={styles.page}>
      <p className={styles.pageKicker}>Contact</p>
      <h1>
        Let&apos;s make your
        <br />
        next move <em>matter.</em>
      </h1>
      <div className={styles.contactGrid}>
        <div className={styles.contactPanel}>
          <p>
            <strong>{name}</strong>
            {view.title ? (
              <>
                <br />
                {view.title}
              </>
            ) : null}
            {view.brokerage.name ? (
              <>
                <br />
                {view.brokerage.name}
              </>
            ) : null}
            {view.markets[0] ? (
              <>
                <br />
                {view.markets[0]}
              </>
            ) : null}
          </p>
          <p>
            {view.phone ? (
              <>
                <a href={`tel:${view.phone}`}>{view.phone}</a>
                <br />
              </>
            ) : null}
            {view.email ? <a href={`mailto:${view.email}`}>{view.email}</a> : null}
          </p>
          <RoyalCollectionPreviewLink
            className={`${styles.button} ${styles.buttonGold}`}
            href="/home-valuation"
            disabled={view.actionsDisabled}
          >
            Request a home value ↗
          </RoyalCollectionPreviewLink>
        </div>
        <div className={styles.contactPanel}>
          <p>
            A home value request opens the existing estimate. That is how a new conversation
            begins, with the same lead capture used across HouzzatPRO.
          </p>
          <RoyalCollectionPreviewLink
            className={`${styles.button} ${styles.buttonEmerald}`}
            href="/search"
            disabled={view.actionsDisabled}
          >
            Explore homes ↗
          </RoyalCollectionPreviewLink>
        </div>
      </div>
    </div>
  );
}
