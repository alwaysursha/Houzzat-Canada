import { HomeHeroSearch } from "@/components/home/HomeHeroSearch";
import { ROYAL_COLLECTION_PREVIEW_ACTION_NOTE } from "./preview-action-note";
import styles from "./royal-collection.module.css";

export function RoyalCollectionSearch({
  actionsDisabled = false,
}: {
  heading?: string;
  actionsDisabled?: boolean;
}) {
  return (
    <section className={styles.searchStrip} id="rc-search" aria-labelledby="rc-search-heading">
      <div className={styles.searchInside}>
        <div className={styles.searchLabel}>
          <small>Your next chapter</small>
          <span id="rc-search-heading">Find your place.</span>
        </div>
        {actionsDisabled ? (
          <>
            <div className={styles.searchFields} aria-hidden="true">
              <div className={styles.searchField}>
                <small>Location</small>
                <strong>Niagara Region</strong>
              </div>
              <div className={styles.searchField}>
                <small>Property type</small>
                <strong>All properties</strong>
              </div>
              <div className={styles.searchField}>
                <small>Price range</small>
                <strong>Any budget</strong>
              </div>
            </div>
            <button type="button" className={styles.searchButton}>
              Search properties ↗
            </button>
            <p className={styles.previewNote}>{ROYAL_COLLECTION_PREVIEW_ACTION_NOTE}</p>
          </>
        ) : (
          <div className={styles.searchLive}>
            <HomeHeroSearch surface="agent" />
          </div>
        )}
      </div>
    </section>
  );
}
