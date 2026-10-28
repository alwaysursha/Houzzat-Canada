import { notFound } from "next/navigation";
import {
  HIGH_OCTANE_COMMUNITY_GUIDES,
  highOctaneCommunityGuideBySlug,
  type HighOctaneCommunityGuide,
} from "@/lib/tenancy/templates/high-octane-community-guides";
import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionAbout } from "./RoyalCollectionAbout";
import { RoyalCollectionBrokerageMark } from "./RoyalCollectionBrokerageMark";
import { RoyalCollectionCommunities } from "./RoyalCollectionCommunities";
import { RoyalCollectionCommunityListings } from "./RoyalCollectionCommunityListings";
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
  Grimsby: "Escarpment neighbourhoods above the lake.",
};

type PlaceCard = {
  name: string;
  href: string;
  imageUrl: string | null;
  caption: string;
};

function placesFor(view: RoyalCollectionView): PlaceCard[] {
  const seen = new Set<string>();
  const cards: PlaceCard[] = [];
  for (const card of [...(view.collectionCards ?? []), ...(view.mobileCommunityCards ?? [])]) {
    const key = card.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({
      name: card.name,
      href: card.href,
      imageUrl: card.imageUrl,
      caption: card.caption || PLACE_NOTES[card.name] || "",
    });
  }
  if (cards.length > 0) return cards;
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
        {view.communityGuides
          ? "A guide to the communities this practice serves, with the homes currently published in each one."
          : "A closer look at the communities this practice serves. Licensed photography appears only for this workspace. Each place continues into the existing home search."}
      </p>
      {view.communityGuides ? (
        <CommunityGuideDirectory />
      ) : (
        <RoyalCollectionCommunities view={view} />
      )}
    </div>
  );
}

function CommunityGuideDirectory() {
  return (
    <div className={styles.guideDirectory}>
      {HIGH_OCTANE_COMMUNITY_GUIDES.map((guide) => (
        <RoyalCollectionPreviewLink
          key={guide.slug}
          href={`/communities/${guide.slug}`}
          className={styles.guideDirectoryCard}
          disabled={false}
        >
          <div
            className={styles.guideDirectoryMedia}
            style={guide.imageUrl ? { backgroundImage: `url(${guide.imageUrl})` } : undefined}
          />
          <div className={styles.guideDirectoryCopy}>
            <h2>{guide.name}</h2>
            <p>{guide.summary}</p>
          </div>
        </RoyalCollectionPreviewLink>
      ))}
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
  const guide = view.communityGuides ? highOctaneCommunityGuideBySlug(slug) : null;
  if (guide) return <CommunityGuidePage view={view} guide={guide} />;

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

function CommunityGuidePage({
  view,
  guide,
}: {
  view: RoyalCollectionView;
  guide: HighOctaneCommunityGuide;
}) {
  return (
    <div className={styles.page}>
      <p className={styles.pageKicker}>Communities</p>
      <h1>{guide.name}</h1>
      <p className={styles.pageLead}>{guide.overview}</p>
      <div className={styles.guideWrap}>
        <div
          className={styles.guideHero}
          style={guide.imageUrl ? { backgroundImage: `url(${guide.imageUrl})` } : undefined}
          role={guide.imageUrl ? "img" : undefined}
          aria-label={guide.imageUrl ? guide.name : undefined}
        />
        <div className={styles.guideColumns}>
          <section>
            <h2>History</h2>
            <p>{guide.history}</p>
          </section>
          <section>
            <h2>Attractions</h2>
            <ul>
              {guide.attractions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Highlights</h2>
            <ul>
              {guide.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        <RoyalCollectionCommunityListings
          city={guide.city}
          placeName={guide.name}
          searchHref={guide.searchHref}
          actionsDisabled={view.actionsDisabled}
        />
        <div className={styles.placeActions}>
          <RoyalCollectionPreviewLink
            className={`${styles.button} ${styles.buttonEmerald}`}
            href="/communities"
            disabled={view.actionsDisabled}
          >
            All communities
          </RoyalCollectionPreviewLink>
        </div>
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
          <RoyalCollectionBrokerageMark view={view} />
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
