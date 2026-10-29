import styles from "./royal-collection.module.css";

const HOUZZATPRO_HOME = "https://houzzatpro.com";

/** Discreet platform credit for every Royal Collection tenant footer. */
export function RoyalCollectionPlatformAttribution() {
  return (
    <p className={styles.platformAttribution}>
      <span className={styles.platformAttributionMuted}>Powered by </span>
      <a
        className={styles.platformAttributionLink}
        href={HOUZZATPRO_HOME}
        target="_blank"
        rel="noreferrer"
      >
        HouzzatPRO.com
      </a>
    </p>
  );
}
