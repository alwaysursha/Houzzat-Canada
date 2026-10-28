import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import styles from "./royal-collection.module.css";

export function RoyalCollectionBrokerageMark({ view }: { view: RoyalCollectionView }) {
  const logoUrl = view.brokerage.logoUrl;
  if (!logoUrl) return null;
  const name = view.brokerage.name;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tenant brokerage mark
    <img
      className={styles.brokerageLogo}
      src={logoUrl}
      alt={name ? `${name} logo` : "Brokerage logo"}
    />
  );
}
