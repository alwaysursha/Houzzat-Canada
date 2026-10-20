import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import styles from "./royal-collection.module.css";

export function RoyalCollectionCommunities({ view }: { view: RoyalCollectionView }) {
  const cards =
    view.collectionCards ??
    (view.editorialCommunities ?? view.navCommunities).slice(0, 3).map((place, index) => ({
      name: place.name,
      href: place.href,
      kicker: String(index + 1).padStart(2, "0"),
      caption: "",
      imageUrl: null,
    }));

  return (
    <section
      className={`${styles.section} ${styles.collection}`}
      id="rc-communities"
      aria-labelledby="rc-communities-heading"
    >
      <RoyalCollectionReveal className={styles.sectionHead}>
        <div>
          <div className={styles.sectionMeta}>The collection</div>
          <h2 id="rc-communities-heading">
            {view.displayFixtureId ? (
              <>
                Niagara, <em>reimagined.</em>
              </>
            ) : (
              <>
                Places, <em>considered.</em>
              </>
            )}
          </h2>
        </div>
        <p className={styles.sectionLead}>
          {view.displayFixtureId
            ? "Find the place that feels like yours. From waterfront escapes to vineyard country, explore the distinct character of Niagara."
            : "Find the place that feels like yours."}
        </p>
      </RoyalCollectionReveal>
      <div className={styles.collectionCards}>
        {cards.map((card) => (
          <RoyalCollectionPreviewLink
            key={card.name}
            href={card.href}
            className={styles.collectionCard}
            disabled={view.actionsDisabled}
          >
            <div
              className={styles.collectionImage}
              style={card.imageUrl ? { backgroundImage: `url(${card.imageUrl})` } : undefined}
            />
            <div className={styles.collectionInside}>
              <small>{card.kicker}</small>
              <h3>{card.name}</h3>
              {card.caption ? <p>{card.caption}</p> : null}
              <div className={styles.circleArrow}>↗</div>
            </div>
          </RoyalCollectionPreviewLink>
        ))}
      </div>
    </section>
  );
}
