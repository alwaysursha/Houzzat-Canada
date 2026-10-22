import Link from "next/link";
import { RoyalCollectionPropertyView } from "./RoyalCollectionPropertyView";
import {
  ROYAL_COLLECTION_SYNTHETIC_BANNER,
  ROYAL_COLLECTION_SYNTHETIC_CASES,
  buildRoyalCollectionSyntheticPreview,
  type RoyalCollectionSyntheticCase,
} from "@/lib/tenancy/templates/royal-collection-synthetic-preview";
import styles from "./royal-property.module.css";

const CASE_HREF: Record<RoyalCollectionSyntheticCase, string> = {
  complete: "/design/property/synthetic",
  single: "/design/property/synthetic/single",
  none: "/design/property/synthetic/none",
  sparse: "/design/property/synthetic/sparse",
};

const CASE_LABEL: Record<RoyalCollectionSyntheticCase, string> = {
  complete: "Complete sample",
  single: "One image",
  none: "No image",
  sparse: "Missing facts",
};

/**
 * Staging visual harness. It renders the property presentation from
 * in-memory samples and does not load or authorize a listing.
 */
export function RoyalCollectionSyntheticPreview({
  caseId,
}: {
  caseId: RoyalCollectionSyntheticCase;
}) {
  const model = buildRoyalCollectionSyntheticPreview(caseId);
  return (
    <RoyalCollectionPropertyView
      model={model}
      notice={
        <div className={styles.syntheticBar} data-rc-synthetic="">
          <p>{ROYAL_COLLECTION_SYNTHETIC_BANNER}</p>
          <nav className={styles.syntheticNav} aria-label="Synthetic samples">
            {ROYAL_COLLECTION_SYNTHETIC_CASES.map((item) => (
              <Link
                key={item}
                href={CASE_HREF[item]}
                aria-current={item === caseId ? "page" : undefined}
              >
                {CASE_LABEL[item]}
              </Link>
            ))}
            <Link href="/design/property">Design concept</Link>
          </nav>
        </div>
      }
      trailer={
        <nav className={styles.syntheticNavMobile} aria-label="Synthetic samples">
          {ROYAL_COLLECTION_SYNTHETIC_CASES.map((item) => (
            <Link
              key={item}
              href={CASE_HREF[item]}
              aria-current={item === caseId ? "page" : undefined}
            >
              {CASE_LABEL[item]}
            </Link>
          ))}
          <Link href="/design/property">Design concept</Link>
        </nav>
      }
    >
      <button type="button" className={styles.viewing} disabled aria-disabled="true">
        Request a private viewing
      </button>
      <p className={styles.note}>
        Viewing request disabled. This synthetic page does not create a lead.
      </p>
    </RoyalCollectionPropertyView>
  );
}
