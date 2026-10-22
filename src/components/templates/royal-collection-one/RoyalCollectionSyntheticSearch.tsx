import { royalCollectionSearchCardFacts } from "@/lib/tenancy/templates/royal-collection-search-card";
import type { RoyalCollectionSearchCardSource } from "@/lib/tenancy/templates/royal-collection-search-card";
import styles from "./royal-search.module.css";

const BANNER = "SYNTHETIC TEST DATA — NOT MLS LISTINGS";

const SAMPLES: readonly {
  title: string;
  listing: RoyalCollectionSearchCardSource;
}[] = [
  {
    title: "Complete sample",
    listing: {
      addressLine: "000 Illustration Lane",
      city: "Fictional Harbour",
      province: "ON",
      postalCode: "A0A 0A0",
      listPrice: 13_500_000,
      beds: 5,
      baths: 6,
      sqft: 8400,
      propertyType: "DETACHED",
      brokerageName: "Fictional Harbour Realty",
      primaryImageUrl: "/images/home-preview/hero-luxury-residence.jpg",
      transactionType: "SALE",
    },
  },
  {
    title: "Missing photograph",
    listing: {
      addressLine: "000 Illustration Lane",
      city: "Fictional Harbour",
      province: "ON",
      listPrice: 13_500_000,
      beds: 5,
      baths: 6,
      sqft: 8400,
      propertyType: "DETACHED",
      brokerageName: "Fictional Harbour Realty",
      primaryImageUrl: null,
      transactionType: "SALE",
    },
  },
  {
    title: "Missing optional facts",
    listing: {
      addressLine: "000 Illustration Lane",
      city: "Fictional Harbour",
      province: "ON",
      beds: 4,
      baths: 3,
      propertyType: "DETACHED",
      transactionType: "SALE",
    },
  },
];

/**
 * Staging visual sample of search cards. It is not a search result set.
 */
export function RoyalCollectionSyntheticSearch() {
  return (
    <div className={styles.page}>
      <div className={`${styles.scroll} ${styles.syntheticScroll}`}>
        <div className={styles.inner}>
          <div className={styles.syntheticBar} data-rc-synthetic-search="">
            <p>{BANNER}</p>
            <p className={styles.syntheticNote}>
              Illustrative cards only. An authorized result opens the operational
              listing page. This preview does not search, save, or request a viewing.
            </p>
          </div>
          <header className={styles.intro}>
            <div>
              <p className={styles.kicker}>Illustrative sample</p>
              <h1>Search cards.</h1>
            </div>
          </header>
          <div className={styles.grid}>
            {SAMPLES.map((sample) => {
              const facts = royalCollectionSearchCardFacts(sample.listing);
              return (
                <article key={sample.title} className={`${styles.card} ${styles.liveCard}`}>
                  <div className={`${styles.media} ${styles.liveMedia}`}>
                    {facts.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={facts.photoUrl} alt="" />
                    ) : (
                      <span className={styles.photoFallback}>Photograph not on file</span>
                    )}
                    <span className={styles.badge}>Illustrative</span>
                  </div>
                  <div className={styles.body}>
                    <p className={styles.meta}>
                      {facts.beds ? <span>{facts.beds} Beds</span> : null}
                      {facts.baths ? <span>{facts.baths} Baths</span> : null}
                      {facts.sqft ? <span>{facts.sqft}</span> : null}
                    </p>
                    {facts.city ? <p className={styles.city}>{facts.city}</p> : null}
                    {facts.price ? (
                      <p className={styles.price}>{facts.price}</p>
                    ) : (
                      <p className={styles.price}>Price not on file</p>
                    )}
                    {facts.street ? <p className={styles.address}>{facts.street}</p> : null}
                    {facts.propertyType ? <p className={styles.city}>{facts.propertyType}</p> : null}
                    {facts.brokerage ? (
                      <p className={styles.brokerage}>Listed by {facts.brokerage}</p>
                    ) : null}
                    <p className={styles.city}>{sample.title}</p>
                    <button type="button" className={styles.ghost} disabled aria-disabled="true">
                      Save disabled
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          <aside className={styles.map} aria-label="Synthetic map note">
            <div className={styles.mapCanvas}>
              <p>Map services are not loaded for this synthetic preview.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
