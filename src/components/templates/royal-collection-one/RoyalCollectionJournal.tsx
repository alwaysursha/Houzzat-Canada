import type { RoyalCollectionView } from "@/lib/tenancy/templates/resolve-royal-collection-view";
import { RoyalCollectionPreviewLink } from "./RoyalCollectionPreviewLink";
import { RoyalCollectionReveal } from "./RoyalCollectionReveal";
import styles from "./royal-collection.module.css";

export function RoyalCollectionJournal({ view }: { view: RoyalCollectionView }) {
  const guides = view.displayFixtureId
    ? [
        { n: "01", title: "Buying a home in Niagara", href: "/search?transactionType=SALE" },
        { n: "02", title: "Preparing to sell with confidence", href: "/home-valuation" },
        { n: "03", title: "Discovering Niagara neighbourhoods", href: "/communities" },
      ]
    : [
        { n: "01", title: "Buying a home", href: "/search?transactionType=SALE" },
        { n: "02", title: "Preparing to sell with confidence", href: "/home-valuation" },
        { n: "03", title: "Discovering neighbourhoods", href: "/communities" },
      ];

  return (
    <section className={`${styles.section} ${styles.journal}`} aria-labelledby="rc-journal-heading">
      <RoyalCollectionReveal className={styles.sectionHead}>
        <div>
          <div className={styles.sectionMeta}>Your guide to what&apos;s next</div>
          <h2 id="rc-journal-heading">
            Good decisions start
            <br />
            with <em>perspective.</em>
          </h2>
        </div>
      </RoyalCollectionReveal>
      <div className={styles.journalRail}>
        {guides.map((guide) => (
          <RoyalCollectionPreviewLink
            key={guide.n}
            href={guide.href}
            className={styles.journalRow}
            disabled={view.actionsDisabled}
          >
            <span>{guide.n}</span>
            <h3>{guide.title}</h3>
            <small>Explore guide ↗</small>
          </RoyalCollectionPreviewLink>
        ))}
      </div>
    </section>
  );
}
