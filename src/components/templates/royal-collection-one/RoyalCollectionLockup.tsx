import {
  HIGH_OCTANE_LOGO_URL,
  type RoyalCollectionView,
} from "@/lib/tenancy/templates/resolve-royal-collection-view";
import styles from "./royal-collection.module.css";

export function RoyalCollectionLockup({ view }: { view: RoyalCollectionView }) {
  if (view.logoUrl === HIGH_OCTANE_LOGO_URL) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={styles.wordmarkLogo} src={HIGH_OCTANE_LOGO_URL} alt="" />
    );
  }

  return (
    <>
      <span className={styles.wordmarkMark} aria-hidden="true">
        {view.provisionalWordmark ? "H" : view.brandName.trim()[0] || "H"}
      </span>
      <span className={styles.wordmarkCopy}>
        <span className={styles.wordmarkTop}>{view.wordmarkMark || view.brandName}</span>
        <span className={styles.wordmarkSub}>{view.wordmarkSub || "REAL ESTATE"}</span>
      </span>
    </>
  );
}
