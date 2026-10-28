import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import styles from "./royal-collection.module.css";

export function RoyalCollectionValuation({ view }: { view: RoyalCollectionView }) {
  return (
    <section className={styles.insight} id="rc-valuation" aria-labelledby="rc-valuation-heading">
      <RoyalCollectionReveal>
        <div className={styles.eyebrow}>A more informed move</div>
        <h2 id="rc-valuation-heading">
          Know the value.
          <br />
          <em>See the potential.</em>
        </h2>
        <p>
          Every property has a story. Understand where yours stands with a thoughtful starting point
          and local perspective.
        </p>
        <RoyalCollectionPreviewLink
          className={`${styles.button} ${styles.buttonGold}`}
          href="/home-valuation"
          disabled={view.actionsDisabled}
        >
          Discover your home&apos;s value ↗
        </RoyalCollectionPreviewLink>
        {view.actionsDisabled ? (
          <p className={styles.previewNote}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>
        ) : null}
      </RoyalCollectionReveal>
      {view.valuationImageUrl ? (
        <RoyalCollectionReveal className={styles.insightPhoto}>
          <img
            src={view.valuationImageUrl}
            alt="Luxury home in the Niagara region"
          />
          <small>The next chapter starts here</small>
        </RoyalCollectionReveal>
      ) : (
        <RoyalCollectionReveal className={styles.insightArt}>
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <path d="M13 48L50 17l37 31M22 42v42h56V42M41 84V59h20v25" />
          </svg>
          <small>THE NEXT CHAPTER STARTS HERE</small>
        </RoyalCollectionReveal>
      )}
    </section>
  );
}
